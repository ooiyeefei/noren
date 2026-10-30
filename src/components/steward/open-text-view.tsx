"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import type { SnippetView } from "../../../convex/openText";
import type { Excerpt } from "./steward-logic";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

export type SnippetDraft = { start: number; end: number; excerpts: Excerpt[]; placeId: string };
export type LandmarkOption = { id: string; name: string; canLink: boolean };
export type OpenTextProps = ActionState & {
  locale: Locale;
  landmarks: readonly LandmarkOption[];
  placeId: string;
  onPlace: (id: string) => void;
  unlinked: readonly SnippetView[];
  linked: readonly SnippetView[];
  linkedLoading: boolean;
  drafts: Readonly<Record<string, SnippetDraft>>;
  onDraft: (id: string, draft: SnippetDraft) => void;
  onLink: (id: string) => void;
  onAdd: (id: string, kind: "story" | "fact") => void;
  onApprove: (id: string) => void;
};
export function emptySnippetDraft(): SnippetDraft {
  return { start: 0, end: 0, excerpts: [], placeId: "" };
}
function Attribution({ snippet, locale }: { snippet: SnippetView; locale: Locale }) {
  const m = messagesFor(stewardMessages, locale);
  return (
    <div className="space-y-1 break-words">
      <a
        className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
        href={snippet.sourceUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {m.sourceLink}
      </a>
      <p>
        {m.licence}: {snippet.licence}
      </p>
      <p>
        {m.revision}: {snippet.revisionRef ?? m.noRevision}
      </p>
      <p>
        {m.attribution}: {snippet.attribution}
      </p>
      {snippet.approved && <p>{m.approved}</p>}
    </div>
  );
}
export function OpenTextView(props: OpenTextProps) {
  const { locale, landmarks, pending } = props;
  const m = messagesFor(stewardMessages, locale);
  return (
    <PageContainer locale={locale} title={m.openText}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} />
        <StewardFeedback {...props} />
        <p>{m.linkRule}</p>
        <label className="block">
          {m.selectPlace}
          <select
            className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
            value={props.placeId}
            disabled={!!pending}
            onChange={(event) => props.onPlace(event.target.value)}
          >
            <option value="">{m.selectPlace}</option>
            {landmarks.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <section className="space-y-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.unlinked}</h2>
          {!props.unlinked.length && <p>{m.empty}</p>}
          {props.unlinked.map((snippet) => {
            const draft = props.drafts[snippet._id] ?? emptySnippetDraft();
            return (
              <article
                key={snippet._id}
                data-steward-card="snippet"
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <Attribution locale={locale} snippet={snippet} />
                <p lang={snippet.lang} className="whitespace-pre-wrap">
                  {snippet.text}
                </p>
                <label>
                  {m.selectPlace}
                  <select
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
                    value={draft.placeId}
                    disabled={!!pending}
                    onChange={(event) =>
                      props.onDraft(snippet._id, { ...draft, placeId: event.target.value })
                    }
                  >
                    <option value="">{m.selectPlace}</option>
                    {landmarks.map((place) => (
                      <option key={place.id} value={place.id} disabled={!place.canLink}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                  disabled={
                    !!pending ||
                    !landmarks.some((place) => place.id === draft.placeId && place.canLink)
                  }
                  onClick={() => props.onLink(snippet._id)}
                >
                  {m.link}
                </Button>
              </article>
            );
          })}
        </section>
        <section className="space-y-4">
          <h2 className="min-w-0 text-[22px] font-bold break-words">{m.linked}</h2>
          {props.linkedLoading ? (
            <p role="status">{m.loading}</p>
          ) : !props.linked.length ? (
            <p>{m.empty}</p>
          ) : null}
          {props.linked.map((snippet) => {
            const draft = props.drafts[snippet._id] ?? emptySnippetDraft();
            return (
              <article
                key={snippet._id}
                data-steward-card="snippet"
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <Attribution locale={locale} snippet={snippet} />
                <p id={`excerpt-help-${snippet._id}`}>{m.excerptRule}</p>
                <label className="block">
                  {m.openText} ({snippet.lang})
                  <Textarea
                    readOnly
                    lang={snippet.lang}
                    className="min-h-40 min-w-0 rounded-[10px]"
                    value={snippet.text}
                    disabled={!!pending}
                    aria-describedby={`excerpt-help-${snippet._id}`}
                    onSelect={(event) =>
                      props.onDraft(snippet._id, {
                        ...draft,
                        start: event.currentTarget.selectionStart,
                        end: event.currentTarget.selectionEnd,
                      })
                    }
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    {m.start}
                    <Input
                      className="min-h-11 min-w-0 rounded-[10px]"
                      type="number"
                      min={0}
                      max={snippet.text.length}
                      step={1}
                      value={Number.isFinite(draft.start) ? draft.start : ""}
                      disabled={!!pending}
                      onChange={(event) =>
                        props.onDraft(snippet._id, { ...draft, start: event.target.valueAsNumber })
                      }
                    />
                  </label>
                  <label>
                    {m.end}
                    <Input
                      className="min-h-11 min-w-0 rounded-[10px]"
                      type="number"
                      min={0}
                      max={snippet.text.length}
                      step={1}
                      value={Number.isFinite(draft.end) ? draft.end : ""}
                      disabled={!!pending}
                      onChange={(event) =>
                        props.onDraft(snippet._id, { ...draft, end: event.target.valueAsNumber })
                      }
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                    variant="outline"
                    disabled={!!pending}
                    onClick={() => props.onAdd(snippet._id, "story")}
                  >
                    {m.addStory}
                  </Button>
                  <Button
                    className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                    variant="outline"
                    disabled={!!pending}
                    onClick={() => props.onAdd(snippet._id, "fact")}
                  >
                    {m.addFact}
                  </Button>
                </div>
                <h3 className="font-semibold">{m.chosen}</h3>
                <ul className="space-y-2">
                  {draft.excerpts.map((excerpt, index) => (
                    <li key={`${excerpt.start}:${excerpt.end}`}>
                      <p lang={snippet.lang}>{snippet.text.slice(excerpt.start, excerpt.end)}</p>
                      <span>
                        {m[excerpt.kind]} ({excerpt.start}–{excerpt.end})
                      </span>
                      <Button
                        className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                        variant="ghost"
                        disabled={!!pending}
                        onClick={() =>
                          props.onDraft(snippet._id, {
                            ...draft,
                            excerpts: draft.excerpts.filter((_, i) => i !== index),
                          })
                        }
                      >
                        {m.remove}
                      </Button>
                    </li>
                  ))}
                </ul>
                <p>{m.approveRule}</p>
                <Button
                  className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                  disabled={!!pending || !draft.excerpts.length}
                  onClick={() => props.onApprove(snippet._id)}
                >
                  {m.approve}
                </Button>
              </article>
            );
          })}
        </section>
      </div>
    </PageContainer>
  );
}
