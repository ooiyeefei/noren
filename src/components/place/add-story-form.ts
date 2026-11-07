import { describeSource, type DescribedSource } from "@/lib/adapters";
import type { SourceAdapterId } from "@/lib/domain/constants";
import type { LinkRead } from "@/lib/link-read/types";

export type StoryDraft = { url: string; note: string; title: string; author: string; body: string };
export type StoryProblem = "url" | "note" | "title" | "body";
export type StoryArgs = {
  url: string;
  note: string;
  noteLang: string;
  title?: string;
  authorHandle?: string;
};
export type WrittenStoryArgs = {
  body: string;
  lang: string;
  photoIds?: string[];
  /** The writer's tick that Noren may feature the story on its own accounts. */
  shareConsent?: boolean;
};
export type StoryRegion = {
  sourceAdapters: readonly SourceAdapterId[];
  locales: readonly string[];
  defaultLocale: string;
  scriptOrigins: readonly string[];
  frameOrigins: readonly string[];
  /** The region offers the tick that lets Noren share a story on its own accounts. */
  shareToNoren?: boolean;
};

export const NOTE_LIMIT = 1000;
export const TITLE_LIMIT = 200;
export const AUTHOR_LIMIT = 100;
export const BODY_LIMIT = 1000;

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** People write the note in their own words; its script says which language it is. */
export function noteLanguage(note: string, region: StoryRegion): string {
  const guess = JAPANESE.test(note) ? "ja" : "en";
  return region.locales.includes(guess) ? guess : region.defaultLocale;
}

/** A story written here, in the member's own words; it is shown with their name (FR-033). */
export function toWrittenArgs(
  draft: StoryDraft,
  region: StoryRegion,
): { ok: true; args: WrittenStoryArgs } | { ok: false; problem: "body" } {
  const body = draft.body.trim();
  if (!body || body.length > BODY_LIMIT) return { ok: false, problem: "body" };
  return { ok: true, args: { body, lang: noteLanguage(body, region) } };
}

/** The pasted link's platform and official embed, which need no fetching. */
export function storyLinkSource(url: string, region: StoryRegion): DescribedSource | null {
  if (!url.trim()) return null;
  const described = describeSource(url.trim(), region.sourceAdapters);
  return described.ok ? described.source : null;
}

/** What the pasted link is, as far as the form needs to know: a link card needs a typed title. */
export function describeStoryLink(
  url: string,
  region: StoryRegion,
): { linkCard: boolean; suggestedAuthor?: string } | null {
  const source = storyLinkSource(url, region);
  if (!source) return null;
  return {
    linkCard: source.adapter === "link_card",
    ...(source.author ? { suggestedAuthor: source.author.handle } : {}),
  };
}

/** What Noren put in a field itself. A field still holding it is one the member has not typed in. */
export type Filled = { author: string; title: string };
export const NOTHING_FILLED: Filled = { author: "", title: "" };

/**
 * A new link replaces what Noren filled in for the last one: its credit and title, and `drafted`, a
 * line the model wrote from the last post. What the member typed stays.
 */
export function followLink(
  draft: StoryDraft,
  url: string,
  region: StoryRegion,
  filled: Filled,
  drafted: string,
): { draft: StoryDraft; filled: Filled } {
  const suggested = describeStoryLink(url, region)?.suggestedAuthor ?? "";
  const previous = describeStoryLink(draft.url, region)?.suggestedAuthor ?? "";
  return {
    draft: {
      ...draft,
      url,
      // Follow the link's own credit until the member types a different one.
      author:
        draft.author === previous || draft.author === filled.author ? suggested : draft.author,
      title: draft.title === filled.title ? "" : draft.title,
      note: drafted && draft.note === drafted ? "" : draft.note,
    },
    filled: { author: suggested, title: "" },
  };
}

/** The link's own details go in any field the member has left alone. */
export function fillFromRead(draft: StoryDraft, read: LinkRead, filled: Filled): StoryDraft {
  const fill = (field: string, was: string, value: string | undefined, limit: number) =>
    value && (!field.trim() || field === was) ? value.slice(0, limit) : field;
  return {
    ...draft,
    author: fill(draft.author, filled.author, read.author, AUTHOR_LIMIT),
    title: fill(draft.title, filled.title, read.title, TITLE_LIMIT),
  };
}

/** An error's name for the log and the form, with its code if the server gave one. */
export function failureName(error: unknown): string {
  if (!(error instanceof Error)) return `NonError: ${typeof error}`;
  const data: unknown = "data" in error ? error.data : undefined;
  const code =
    typeof data === "object" && data !== null && "code" in data && typeof data.code === "string"
      ? `: ${data.code}`
      : "";
  return `${error.name || "Error"}${code}`;
}

/**
 * A story is a link to a post someone else made, plus a line in the member's own words about what
 * it tells. The line is required: it is what makes this a story rather than a bare link.
 */
export function toStoryArgs(
  draft: StoryDraft,
  region: StoryRegion,
): { ok: true; args: StoryArgs } | { ok: false; problem: StoryProblem } {
  const link = describeStoryLink(draft.url, region);
  if (!link) return { ok: false, problem: "url" };
  const note = draft.note.trim();
  if (!note || note.length > NOTE_LIMIT) return { ok: false, problem: "note" };
  const title = draft.title.trim();
  if (link.linkCard && (!title || title.length > TITLE_LIMIT))
    return { ok: false, problem: "title" };
  const author = draft.author.trim().slice(0, AUTHOR_LIMIT);
  return {
    ok: true,
    args: {
      url: draft.url.trim(),
      note,
      noteLang: noteLanguage(note, region),
      ...(link.linkCard ? { title } : {}),
      ...(author ? { authorHandle: author } : {}),
    },
  };
}
