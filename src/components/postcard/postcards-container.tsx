"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useDraft } from "@/components/drafts/drafts";
import { ErrorMessage } from "@/components/layout/error-message";
import { placeHeading, type NameLike } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { publicMessages } from "@/lib/i18n/messages/public";
import {
  EMPTY_FORM,
  canPick,
  codeOf,
  itemsOf,
  mayReplace,
  momentKey,
  postcardUrl,
  type FormState,
} from "@/lib/postcard/form";
import {
  MAX_PLACES,
  MESSAGE_MAX,
  NOTE_MAX,
  RECIPIENT_MAX,
  cardDate,
  lengthOf,
} from "@/lib/postcard/rules";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PostcardCard, type CardRegion } from "./postcard-card";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-5 py-2 font-bold disabled:opacity-50";
const FIELD =
  "block min-h-11 w-full rounded-[10px] border border-input bg-white p-3 text-[16px] text-kon";

export type PostcardsRegion = CardRegion & { locales: readonly string[] };

const noChanges = () => () => {};

export function PostcardsContainer({
  locale,
  region,
}: {
  locale: Locale;
  region: PostcardsRegion;
}) {
  const m = messagesFor(postcardMessages, locale);
  const { isAuthenticated } = useConvexAuth();
  const moments = useQuery(api.postcards.moments, isAuthenticated ? {} : "skip");
  const mine = useQuery(api.postcards.mine, isAuthenticated ? {} : "skip");
  const me = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const create = useMutation(api.postcards.create);
  const remove = useMutation(api.postcards.remove);
  const draftWith = useAction(api.postcardActions.draft);

  const [form, setForm] = useDraft<FormState>("postcard", EMPTY_FORM);
  const lang = region.locales.includes(form.lang)
    ? form.lang
    : region.locales.includes(locale)
      ? locale
      : region.defaultLocale;
  const patch = useCallback(
    (changes: Partial<FormState>) => setForm((was) => ({ ...was, ...changes })),
    [setForm],
  );

  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [withheld, setWithheld] = useState(0);
  const [made, setMade] = useState<{ code: string; lang: string; recipient: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const working = useRef(false);
  // The preview's date: fixed for the visit, so the page stays pure.
  const [today] = useState(() => Date.now());

  const shareable = useSyncExternalStore(
    noChanges,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  const heading = (names: readonly NameLike[]) => placeHeading(names, locale, region);
  const pickedMoments = (moments ?? []).filter((moment) => form.picked.includes(momentKey(moment)));
  const items = itemsOf(pickedMoments);
  const ready = items.length > 0 && form.recipient.trim() !== "";

  function toggle(moment: NonNullable<typeof moments>[number]) {
    const key = momentKey(moment);
    patch({
      picked: form.picked.includes(key)
        ? form.picked.filter((each) => each !== key)
        : [...form.picked, key],
    });
  }

  function apply(text: string) {
    patch({ message: text, lastDraft: text, aiUsed: true });
    setPending(null);
    setStatus(m.draftReady);
  }

  async function help() {
    if (working.current) return;
    if (!ready) {
      setStatus(m.needForAndPlaces);
      return;
    }
    working.current = true;
    setBusy("draft");
    setError(null);
    setStatus(m.helping);
    setPending(null);
    try {
      const result = await draftWith({
        items,
        recipientName: form.recipient,
        ...(form.note.trim() === "" ? {} : { note: form.note }),
        lang,
      });
      setWithheld(result.withheld);
      if (result.message === null) setStatus(m.draftFailed);
      else if (mayReplace(form)) apply(result.message);
      else {
        setPending(result.message);
        setStatus(null);
      }
    } catch (caught) {
      const code = codeOf(caught);
      setStatus(
        code === "rate_limited"
          ? m.draftBusy
          : code === "conflict" || code === "not_found"
            ? m.draftUnavailable
            : m.draftFailed,
      );
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function send() {
    if (working.current) return;
    working.current = true;
    setBusy("send");
    setError(null);
    setStatus(null);
    try {
      const { code } = await create({
        items,
        recipientName: form.recipient,
        message: form.message,
        messageLang: lang,
        aiAssisted: form.aiUsed && form.message.trim() !== "",
      });
      setMade({ code, lang, recipient: form.recipient.trim() });
      setDeleted(false);
      setForm(EMPTY_FORM);
      setWithheld(0);
    } catch (caught) {
      const code = codeOf(caught);
      if (code === "rate_limited") setStatus(m.sendLimit);
      else if (code === "conflict") setStatus(m.sendFull);
      else if (code === "name_not_confirmed") setStatus(m.sendNeedsName);
      else setError(caught);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setStatus(m.copied);
    } catch {
      setStatus(m.copyFailed);
    }
  }

  async function share(url: string, name: string) {
    try {
      await navigator.share({ title: m.cardTitle, text: format(m.shareText, { name }), url });
    } catch (caught) {
      // Closing the sheet is a choice, not a failure.
      if (!(caught instanceof DOMException && caught.name === "AbortError"))
        setStatus(m.copyFailed);
    }
  }

  async function erase(id: Id<"postcard">, code: string) {
    setError(null);
    try {
      await remove({ postcardId: id });
      setAsking(null);
      if (made?.code === code) setDeleted(true);
      setStatus(m.deleted);
    } catch (caught) {
      setError(caught);
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const madeUrl = made ? postcardUrl(origin, made.lang, made.code) : null;
  const previewCard = {
    recipientName: form.recipient.trim() || "…",
    message: form.message,
    messageLang: lang,
    aiAssisted: form.aiUsed && form.message.trim() !== "",
    fromName: me?.displayName ?? "",
    sentAt: today,
    places: pickedMoments.map((moment) => ({
      slug: moment.slug,
      names: moment.names,
      photos: [],
      ...(moment.excerpt ? { excerpt: { text: moment.excerpt, lang: locale } } : {}),
    })),
  };

  return (
    <div lang={locale} className="space-y-10 text-kon" data-postcards="">
      <p className="max-w-prose text-[17px]">{m.intro}</p>
      <div role="status" aria-live="polite" className="min-h-6 text-[15px]">
        {status}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}

      {madeUrl && made && (
        <section
          aria-labelledby="postcard-ready"
          data-postcard-ready=""
          className="max-w-[720px] space-y-4 rounded-[14px] border border-line bg-white p-4 sm:p-6"
        >
          <h2 id="postcard-ready" className="text-[20px] font-bold">
            {m.ready}
          </h2>
          {deleted ? (
            <p>{m.deleted}</p>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="font-bold">{m.linkLabel}</span>
                <input
                  readOnly
                  value={madeUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className={cn(FIELD, "font-mono text-[15px]")}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={cn(BUTTON, "bg-kon text-white")}
                  onClick={() => void copy(madeUrl)}
                >
                  {m.copy}
                </button>
                {shareable && (
                  <button
                    type="button"
                    className={cn(BUTTON, "border border-kon text-kon")}
                    onClick={() => void share(madeUrl, made.recipient)}
                  >
                    {m.share}
                  </button>
                )}
                <a
                  className={cn(BUTTON, "border border-kon text-kon")}
                  href={postcardUrl("", made.lang, made.code)}
                  target="_blank"
                  rel="noopener"
                >
                  {m.open}
                </a>
              </div>
              <p className="max-w-prose text-[15px] text-muted-foreground">{m.linkWarning}</p>
            </>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-ai underline"
            onClick={() => setMade(null)}
          >
            {m.another}
          </button>
        </section>
      )}

      {!made && (
        <>
          <fieldset className="space-y-3" data-postcard-step="pick">
            <legend className="text-[20px] font-bold">{m.stepPick}</legend>
            <p className="max-w-prose text-[15px] text-muted-foreground">
              {format(m.pickHint, { max: MAX_PLACES })}
            </p>
            {moments === undefined && (
              <p role="status">{messagesFor(publicMessages, locale).loading}</p>
            )}
            {moments?.length === 0 && (
              <div className="space-y-3 rounded-[14px] border border-dashed border-line p-6">
                <p className="max-w-prose text-[17px]">{m.pickEmpty}</p>
                <a
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={localePath(locale, "/map")}
                >
                  {m.goToMap}
                </a>
              </div>
            )}
            <ul className="space-y-2">
              {moments?.map((moment) => {
                const key = momentKey(moment);
                const on = form.picked.includes(key);
                const allowed = canPick(moment, pickedMoments);
                const name = heading(moment.names);
                return (
                  <li key={key}>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border p-3",
                        on ? "border-kon bg-kamenozoki" : "border-line bg-white",
                        !allowed.ok && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!allowed.ok}
                        onChange={() => toggle(moment)}
                        className="mt-1 size-5 shrink-0"
                      />
                      <span className="min-w-0 space-y-1">
                        <span className="block">
                          <span
                            lang={name.primary.lang}
                            className="font-bold [overflow-wrap:anywhere]"
                          >
                            {name.primary.text}
                          </span>
                          {name.secondary && (
                            <span lang={name.secondary.lang} className="ml-2 text-[15px]">
                              {name.secondary.text}
                            </span>
                          )}
                        </span>
                        <span className="block text-[14px] text-muted-foreground">
                          {moment.kind === "story" ? m.momentStory : m.momentStamp}
                          {" · "}
                          {cardDate(moment.at, region.utcOffsetHours, locale)}
                          {moment.photoCount > 0 &&
                            ` · ${format(m.photos, { n: moment.photoCount })}`}
                        </span>
                        {moment.excerpt && (
                          <span className="block text-[15px] [overflow-wrap:anywhere]">
                            {moment.excerpt}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p role="status" className="text-[15px]">
              {pickedMoments.length > 0 && format(m.selectedCount, { n: pickedMoments.length })}
            </p>
          </fieldset>

          <section className="max-w-[720px] space-y-4" data-postcard-step="for">
            <h2 className="text-[20px] font-bold">{m.stepFor}</h2>
            <label className="block space-y-1">
              <span className="font-bold">{m.recipientLabel}</span>
              <input
                value={form.recipient}
                maxLength={RECIPIENT_MAX}
                onChange={(event) => patch({ recipient: event.target.value })}
                aria-describedby="postcard-recipient-hint"
                className={FIELD}
              />
              <span
                id="postcard-recipient-hint"
                className="block text-[14px] text-muted-foreground"
              >
                {m.recipientHint}
              </span>
            </label>
            <label className="block space-y-1">
              <span className="font-bold">{m.noteLabel}</span>
              <textarea
                value={form.note}
                maxLength={NOTE_MAX}
                rows={3}
                onChange={(event) => patch({ note: event.target.value })}
                aria-describedby="postcard-note-hint"
                className={FIELD}
              />
              <span id="postcard-note-hint" className="block text-[14px] text-muted-foreground">
                {m.noteHint}
              </span>
            </label>
          </section>

          <section className="max-w-[720px] space-y-4" data-postcard-step="write">
            <h2 className="text-[20px] font-bold">{m.stepWrite}</h2>
            <fieldset className="flex flex-wrap items-center gap-x-5">
              <legend className="sr-only">{m.langLabel}</legend>
              {region.locales.map((each) => (
                <label key={each} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="postcard-lang"
                    checked={lang === each}
                    onChange={() => patch({ lang: each })}
                    className="size-5"
                  />
                  {each === "ja" ? m.languageJa : m.languageEn}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-1">
              <span className="font-bold">{m.messageLabel}</span>
              <textarea
                value={form.message}
                maxLength={MESSAGE_MAX}
                rows={9}
                lang={lang}
                onChange={(event) =>
                  patch({
                    message: event.target.value,
                    ...(event.target.value.trim() === "" ? { aiUsed: false, lastDraft: "" } : {}),
                  })
                }
                aria-describedby="postcard-message-hint"
                className={FIELD}
              />
              <span id="postcard-message-hint" className="block text-[14px] text-muted-foreground">
                {m.messageHint} ({lengthOf(form.message)}/{MESSAGE_MAX})
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void help()}
                className={cn(BUTTON, "border border-kon text-kon")}
              >
                {busy === "draft" ? m.helping : form.aiUsed ? m.helpAgain : m.help}
              </button>
            </div>
            <p className="text-[14px] text-muted-foreground">{m.aiNotice}</p>
            {withheld > 0 && (
              <p role="note" className="text-[15px]">
                {format(m.withheld, { n: withheld })}
              </p>
            )}
            {pending !== null && (
              <div
                className="space-y-3 rounded-[14px] border border-line bg-white p-4"
                data-postcard-pending=""
              >
                <p lang={lang} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {pending}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={cn(BUTTON, "bg-kon text-white")}
                    onClick={() => apply(pending)}
                  >
                    {m.useDraft}
                  </button>
                  <button
                    type="button"
                    className={cn(BUTTON, "border border-kon text-kon")}
                    onClick={() => setPending(null)}
                  >
                    {m.keepMine}
                  </button>
                </div>
              </div>
            )}
          </section>

          {pickedMoments.length > 0 && form.message.trim() !== "" && (
            <section aria-labelledby="postcard-preview" className="space-y-3">
              <h2 id="postcard-preview" className="text-[20px] font-bold">
                {m.preview}
              </h2>
              <PostcardCard locale={locale} card={previewCard} region={region} preview />
            </section>
          )}

          <div>
            <button
              type="button"
              disabled={busy !== null || !ready || form.message.trim() === ""}
              onClick={() => void send()}
              className={cn(BUTTON, "bg-kon text-white")}
            >
              {busy === "send" ? m.sending : m.send}
            </button>
          </div>
        </>
      )}

      <section aria-labelledby="postcards-yours" className="max-w-[720px] space-y-3">
        <h2 id="postcards-yours" className="text-[20px] font-bold">
          {m.yoursHeading}
        </h2>
        {mine?.length === 0 && <p>{m.yoursEmpty}</p>}
        <ul className="space-y-3">
          {mine?.map((card) => {
            const url = postcardUrl(origin, card.messageLang, card.code);
            return (
              <li
                key={card._id}
                className="space-y-2 rounded-[14px] border border-line bg-white p-4"
                data-postcard-row=""
              >
                <p className="font-bold [overflow-wrap:anywhere]">
                  {format(m.to, { name: card.recipientName })}
                </p>
                <p className="text-[14px] text-muted-foreground">
                  {format(m.sentOn, { date: cardDate(card.sentAt, region.utcOffsetHours, locale) })}
                </p>
                <p lang={card.messageLang} className="text-[15px] [overflow-wrap:anywhere]">
                  {card.messageStart}
                </p>
                <p className="text-[15px]">
                  {card.places.map((place, index) => (
                    <span key={place.slug}>
                      {index > 0 && "、"}
                      <span lang={heading(place.names).primary.lang}>
                        {heading(place.names).primary.text}
                      </span>
                    </span>
                  ))}
                </p>
                {card.places.some((place) => !place.showing) && (
                  <p role="note" className="text-[14px] text-muted-foreground">
                    {m.removedStory}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a
                    className="inline-flex min-h-11 items-center text-ai underline"
                    href={postcardUrl("", card.messageLang, card.code)}
                    target="_blank"
                    rel="noopener"
                  >
                    {m.open}
                  </a>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-ai underline"
                    onClick={() => void copy(url)}
                  >
                    {m.copyLink}
                  </button>
                  {asking === card._id ? (
                    <span className="flex flex-wrap items-center gap-x-3">
                      <span className="text-[15px]">
                        {format(m.deleteAsk, { name: card.recipientName })}
                      </span>
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center font-bold text-beni underline"
                        onClick={() => void erase(card._id, card.code)}
                      >
                        {m.deleteConfirm}
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center text-ai underline"
                        onClick={() => setAsking(null)}
                      >
                        {m.deleteCancel}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-beni underline"
                      onClick={() => setAsking(card._id)}
                    >
                      {m.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
