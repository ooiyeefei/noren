"use client";

import { useId, useRef, useState } from "react";
import { useDraft, usePhotoDrafts } from "@/components/drafts/drafts";
import { ErrorMessage } from "@/components/layout/error-message";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { cn } from "@/lib/utils";
import {
  AUTHOR_LIMIT,
  BODY_LIMIT,
  NOTE_LIMIT,
  TITLE_LIMIT,
  describeStoryLink,
  toStoryArgs,
  toWrittenArgs,
  type StoryArgs,
  type StoryDraft,
  type StoryProblem,
  type StoryRegion,
  type WrittenStoryArgs,
} from "./add-story-form";
import { LinkPreview, useLinkRead, type LinkReadActions } from "./link-read";
import { PhotoPicker, type PhotoPickerActions } from "./photo-picker";
import { NO_PHOTOS, type PhotoDraft } from "./photo-upload";
import { ShownAs, type ShownAsActions } from "./shown-as";

/** What the page can do with a story; the container wires these to Convex. */
export type AddStoryActions = LinkReadActions & {
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
  /** This member already shared something here, so the form asks for another moment. */
  sharedHere?: boolean;
  /** Links a post the member made, or found, elsewhere. */
  add(args: StoryArgs): Promise<unknown>;
  /** Keeps a story the member writes here. */
  write(args: WrittenStoryArgs): Promise<unknown>;
  /** Set until the member has seen the name their story goes out under (FR-131). */
  shownAs?: ShownAsActions;
  /** Set only when this member can add photos at this place. */
  photos?: PhotoPickerActions;
};

/** The props of the form, for a wrapper that adds the open request. */
export type AddStoryProps = {
  locale: Locale;
  region: StoryRegion;
  actions?: AddStoryActions;
  draftName?: string;
  /** Opens the written form each time this number goes up (the place page's "Add your story"). */
  openWritten?: number;
};

type Mode = "write" | "link";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] px-5 py-2 font-bold disabled:opacity-50";
const FIELD = "block w-full rounded-[10px] border border-input p-3 text-[16px]";
const EMPTY: StoryDraft = { url: "", note: "", title: "", author: "", body: "" };

/**
 * FR-032, FR-033: any signed-in member shares a story about the place, either written here or as a
 * link to a post on the service they already use. Either way it is shown with their name.
 * With a `draftName`, an unshared story and its photos come back after a reload.
 */
export function AddStory({
  locale,
  region,
  actions,
  draftName,
  openWritten = 0,
}: AddStoryProps) {
  const m = messagesFor(addStoryMessages, locale);
  const id = useId();
  const [mode, setMode] = useDraft<Mode | null>(draftName && `${draftName}:mode`, null);
  const [draft, setDraft] = useDraft<StoryDraft>(draftName && `${draftName}:text`, EMPTY);
  const [problem, setProblem] = useState<StoryProblem>();
  const [pending, setPending] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [photos, setPhotos] = useState<PhotoDraft>(NO_PHOTOS);
  const keptPhotos = usePhotoDrafts(draftName);
  const busy = useRef(false);
  const [openedFor, setOpenedFor] = useState(0);
  if (openWritten > openedFor) {
    setOpenedFor(openWritten);
    setMode("write");
  }
  const reader = useLinkRead({ locale, region, actions, draft, setDraft });
  if (actions?.signedIn === undefined) return null;
  if (!actions.signedIn)
    return (
      <p>
        {m.signInToAdd}{" "}
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/sign-in")}
        >
          {m.signIn}
        </a>
      </p>
    );
  const link = describeStoryLink(draft.url, region);
  const draftedShown = reader.noteState.status === "drafted" && !!draft.note.trim();
  function prepare(current: Mode, send: AddStoryActions) {
    if (current === "write") {
      const result = toWrittenArgs(draft, region);
      if (!result.ok) return result;
      const { photoIds } = photos;
      const args = photoIds.length ? { ...result.args, photoIds } : result.args;
      return { ok: true as const, run: () => send.write(args) };
    }
    const result = toStoryArgs(draft, region);
    return result.ok ? { ok: true as const, run: () => send.add(result.args) } : result;
  }
  async function submit(current: Mode, send: AddStoryActions) {
    const prepared = prepare(current, send);
    setProblem(prepared.ok ? undefined : prepared.problem);
    if (!prepared.ok || busy.current || send.shownAs || (current === "write" && photos.busy))
      return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await prepared.run();
      setDraft(EMPTY);
      setMode(null);
      // The shared story holds them now; kept, they would come back in the next one.
      void keptPhotos?.store.save(keptPhotos.key, []);
      setAdded(true);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const choose = (next: Mode) => {
    setMode(next);
    setProblem(undefined);
    setError(null);
    setAdded(false);
  };
  const described = (field: StoryProblem, hint?: string) => ({
    "aria-invalid": problem === field || undefined,
    "aria-describedby":
      [hint, problem === field ? `${id}-${field}-problem` : undefined].filter(Boolean).join(" ") ||
      undefined,
  });
  const problemText = (field: StoryProblem, text: string) =>
    problem === field && (
      <p id={`${id}-${field}-problem`} role="alert" className="text-beni">
        {text}
      </p>
    );
  return (
    <div className="space-y-3">
      {mode === null ? (
        <div className="space-y-3">
          <p className="text-[17px]">{actions.sharedHere ? m.promptAgain : m.prompt}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={cn(BUTTON, "bg-kon text-white")}
              onClick={() => choose("write")}
            >
              {m.write}
            </button>
            <button
              type="button"
              className={cn(BUTTON, "border border-kon text-kon")}
              onClick={() => choose("link")}
            >
              {m.link}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-[14px] border border-line p-4"
          aria-label={mode === "write" ? m.write : m.link}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(mode, actions);
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            {mode === "write" ? (
              <label className="block space-y-1">
                <span className="font-bold">{m.body}</span>
                <span id={`${id}-body-hint`} className="block text-[15px] text-muted-foreground">
                  {m.bodyHint}
                </span>
                <textarea
                  value={draft.body}
                  maxLength={BODY_LIMIT}
                  rows={6}
                  {...described("body", `${id}-body-hint`)}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  className={FIELD}
                />
                {problemText("body", m.bodyProblem)}
              </label>
            ) : (
              <>
                <p className="max-w-prose text-[15px] leading-relaxed">{m.intro}</p>
                <label className="block space-y-1">
                  <span className="font-bold">{m.url}</span>
                  <input
                    type="url"
                    inputMode="url"
                    maxLength={2048}
                    value={draft.url}
                    {...described("url")}
                    onChange={(event) => reader.linkChanged(event.target.value)}
                    className={FIELD}
                  />
                  {problemText("url", m.urlProblem)}
                </label>
                {reader.shown && (
                  <LinkPreview
                    locale={locale}
                    region={region}
                    link={reader.shown.url}
                    read={reader.shown.read}
                  />
                )}
                {link?.linkCard && (
                  <label className="block space-y-1">
                    <span className="font-bold">{m.title}</span>
                    <input
                      value={draft.title}
                      maxLength={TITLE_LIMIT}
                      {...described("title")}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      className={FIELD}
                    />
                    {problemText("title", m.titleProblem)}
                  </label>
                )}
                {reader.canDraft && (
                  <div className="space-y-1">
                    <label className="flex min-h-11 items-center gap-2 font-bold">
                      <input
                        type="checkbox"
                        data-testid="own-post"
                        checked={reader.own}
                        aria-describedby={`${id}-own-hint`}
                        onChange={(event) => void reader.tick(event.target.checked)}
                        className="size-5"
                      />
                      {m.ownPost}
                    </label>
                    <p id={`${id}-own-hint`} className="text-[15px] text-muted-foreground">
                      {m.ownPostHint}
                    </p>
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="font-bold">{m.note}</span>
                  <span id={`${id}-note-hint`} className="block text-[15px] text-muted-foreground">
                    {m.noteHint}
                  </span>
                  {draftedShown && (
                    <span
                      id={`${id}-note-drafted`}
                      data-testid="note-drafted"
                      className="block text-[15px] font-bold text-ai"
                    >
                      {m.drafted}
                    </span>
                  )}
                  <textarea
                    value={draft.note}
                    maxLength={NOTE_LIMIT}
                    rows={3}
                    {...described(
                      "note",
                      draftedShown ? `${id}-note-hint ${id}-note-drafted` : `${id}-note-hint`,
                    )}
                    onChange={(event) => {
                      reader.noteTyped();
                      setDraft({ ...draft, note: event.target.value });
                    }}
                    className={FIELD}
                  />
                  {problemText("note", m.noteProblem)}
                </label>
                <p
                  role="status"
                  data-testid="note-draft-status"
                  className="text-[15px] empty:hidden"
                >
                  {reader.noteState.status === "drafting" && m.drafting}
                  {reader.noteState.status === "kept" && m.draftKept}
                  {reader.noteState.status === "failed" &&
                    `${m.draftFailed} (${reader.noteState.failure})`}
                </p>
                <label className="block space-y-1">
                  <span>{m.author}</span>
                  <input
                    value={draft.author}
                    maxLength={AUTHOR_LIMIT}
                    onChange={(event) => setDraft({ ...draft, author: event.target.value })}
                    className={FIELD}
                  />
                </label>
              </>
            )}
            {mode === "write" && actions.photos && (
              <PhotoPicker
                locale={locale}
                actions={actions.photos}
                onChange={setPhotos}
                draftName={draftName}
              />
            )}
            {actions.shownAs && (
              <ShownAs locale={locale} hintId={`${id}-name`} actions={actions.shownAs} />
            )}
            {/* Sharing is the agreement to show it; saying so beside the button is the consent. */}
            <p id={`${id}-public`} className="text-[15px]">
              {m.shownPublicly}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!!actions.shownAs || (mode === "write" && photos.busy)}
                aria-describedby={actions.shownAs ? `${id}-public ${id}-name` : `${id}-public`}
                className={cn(BUTTON, "bg-kon text-white")}
              >
                {pending ? m.sharing : m.share}
              </button>
              <button
                type="button"
                className={cn(BUTTON, "border border-input text-kon")}
                onClick={() => {
                  setMode(null);
                  setProblem(undefined);
                  setError(null);
                  // Closing the form has always let its photos go; the words stay for next time.
                  void keptPhotos?.store.save(keptPhotos.key, []);
                }}
              >
                {m.cancel}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div role="status" aria-live="polite">
        {added ? m.added : null}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </div>
  );
}
