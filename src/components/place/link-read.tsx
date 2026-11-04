"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { EmbedView } from "@/components/embeds/embed-view";
import { platformName } from "@/components/embeds/platform-name";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { EMBED_ONLY_ADAPTERS, type LinkRead, type NoteDraft } from "@/lib/link-read/types";
import {
  NOTHING_FILLED,
  failureName,
  fillFromRead,
  followLink,
  storyLinkSource,
  type StoryDraft,
  type StoryRegion,
} from "./add-story-form";

/** Both are optional comforts: without them, or when they fail, the form works as it always has. */
export type LinkReadActions = {
  /** Reads what is public about a pasted link. */
  preview?(url: string): Promise<LinkRead>;
  /** Drafts the member's line from a post they ticked as their own. */
  draftNote?(args: { url: string; lang: string }): Promise<NoteDraft>;
};

/** Long enough for a paste to settle and for typing to pause. */
export const READ_DELAY_MS = 500;

type NoteState =
  { status: "idle" | "drafting" | "drafted" | "kept" } | { status: "failed"; failure: string };
const IDLE: NoteState = { status: "idle" };

/**
 * Reading a pasted link and drafting from it. Everything hangs off the link in the field: a new link
 * drops the preview and the tick, because "this is my own post" was said about the last one, and a
 * late answer about an old link is ignored. Form handlers drive it, so nothing runs on render.
 */
export function useLinkRead({
  locale,
  region,
  actions,
  draft,
  setDraft,
}: {
  locale: Locale;
  region: StoryRegion;
  actions?: LinkReadActions;
  draft: StoryDraft;
  setDraft: Dispatch<SetStateAction<StoryDraft>>;
}) {
  const [state, setState] = useState<{ url: string; read: LinkRead | null } | null>(null);
  const [own, setOwn] = useState(false);
  const [noteState, setNoteState] = useState<NoteState>(IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reading = useRef(0);
  const drafting = useRef(0);
  const filled = useRef(NOTHING_FILLED);
  const drafted = useRef("");

  async function readNow(link: string, preview: NonNullable<LinkReadActions["preview"]>) {
    const ticket = reading.current;
    setState({ url: link, read: null });
    let read: LinkRead;
    try {
      read = await preview(link);
    } catch (caught) {
      read = { outcome: "unread", failure: failureName(caught) };
      console.error(`link preview failed: ${read.failure}`);
    }
    if (reading.current !== ticket) return;
    setState({ url: link, read });
    const before = filled.current;
    filled.current = {
      author: read.author ?? before.author,
      title: read.title ?? before.title,
    };
    setDraft((current) =>
      current.url.trim() === link ? fillFromRead(current, read, before) : current,
    );
  }

  function linkChanged(url: string) {
    const link = url.trim();
    if (link === draft.url.trim()) {
      setDraft({ ...draft, url });
      return;
    }
    clearTimeout(timer.current);
    reading.current += 1;
    drafting.current += 1;
    setState(null);
    setOwn(false);
    setNoteState(IDLE);
    const followed = followLink(draft, url, region, filled.current, drafted.current);
    filled.current = followed.filled;
    drafted.current = "";
    setDraft(followed.draft);
    const source = storyLinkSource(link, region);
    const preview = actions?.preview;
    if (!source || !preview) return;
    timer.current = setTimeout(() => {
      if (EMBED_ONLY_ADAPTERS.includes(source.adapter))
        setState({ url: link, read: { outcome: "embed_only" } });
      else void readNow(link, preview);
    }, READ_DELAY_MS);
  }

  async function tick(checked: boolean) {
    const link = draft.url.trim();
    drafting.current += 1;
    const ticket = drafting.current;
    setOwn(checked);
    if (!checked) {
      setNoteState(IDLE);
      // Unticked, the post is not theirs: a draft of it they left as it was goes too.
      if (drafted.current && draft.note === drafted.current) setDraft({ ...draft, note: "" });
      drafted.current = "";
      return;
    }
    if (draft.note.trim()) {
      setNoteState({ status: "kept" });
      return;
    }
    if (!actions?.draftNote) return;
    setNoteState({ status: "drafting" });
    try {
      const { note, failure } = await actions.draftNote({ url: link, lang: locale });
      if (drafting.current !== ticket) return;
      if (!note) {
        console.error(`note draft failed: ${failure ?? "NoUsableDraft"}`);
        setNoteState({ status: "failed", failure: failure ?? "NoUsableDraft" });
        return;
      }
      drafted.current = note;
      setDraft((current) => (current.url.trim() === link ? { ...current, note } : current));
      setNoteState({ status: "drafted" });
    } catch (caught) {
      if (drafting.current !== ticket) return;
      const failure = failureName(caught);
      console.error(`note draft failed: ${failure}`);
      setNoteState({ status: "failed", failure });
    }
  }

  /** Typing while the model works means the member's words win: its answer is dropped. */
  function noteTyped() {
    if (noteState.status !== "drafting") return;
    drafting.current += 1;
    setNoteState({ status: "kept" });
  }

  const shown = state?.url === draft.url.trim() ? state : null;
  return {
    shown,
    own,
    noteState,
    canDraft: !!actions?.draftNote && !!(shown?.read?.caption || shown?.read?.title),
    linkChanged,
    tick,
    noteTyped,
  };
}

/** The post as the member will recognise it: its platform, author, words and official embed. */
export function LinkPreview({
  locale,
  region,
  link,
  read,
}: {
  locale: Locale;
  region: StoryRegion;
  link: string;
  read: LinkRead | null;
}) {
  const m = messagesFor(addStoryMessages, locale);
  const source = storyLinkSource(link, region);
  if (!source) return null;
  const platform =
    platformName(source.platform) ?? read?.siteName ?? new URL(source.canonicalUrl).hostname;
  const author = read?.author ?? source.author?.handle;
  const authorUrl = read?.authorUrl ?? source.author?.url;
  return (
    <section aria-label={m.previewLabel} data-testid="link-preview" className="space-y-2">
      <EmbedView
        locale={locale}
        source={{
          id: source.canonicalUrl,
          platform: source.platform,
          canonicalUrl: source.canonicalUrl,
          embed: source.embed,
          isMock: false,
          ...(read?.title ? { title: read.title } : {}),
          ...(author ? { authorHandle: author } : {}),
          ...(authorUrl ? { authorUrl } : {}),
        }}
        scriptOrigins={region.scriptOrigins}
        frameOrigins={region.frameOrigins}
        preview={{ caption: read?.caption, siteName: platform }}
      />
      <p role="status" data-testid="link-preview-status" className="text-[15px] empty:hidden">
        {read === null && m.previewReading}
        {read?.outcome === "embed_only" && format(m.previewEmbedOnly, { platform })}
        {read?.outcome === "unread" && `${m.previewFailed} (${read.failure ?? "Error"})`}
      </p>
    </section>
  );
}
