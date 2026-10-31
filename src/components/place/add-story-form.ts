import { describeSource } from "@/lib/adapters";
import type { SourceAdapterId } from "@/lib/domain/constants";

export type StoryDraft = { url: string; note: string; title: string; author: string };
export type StoryProblem = "url" | "note" | "title";
export type StoryArgs = {
  url: string;
  note: string;
  noteLang: string;
  title?: string;
  authorHandle?: string;
};
export type StoryRegion = {
  sourceAdapters: readonly SourceAdapterId[];
  locales: readonly string[];
  defaultLocale: string;
};

export const NOTE_LIMIT = 1000;
export const TITLE_LIMIT = 200;
export const AUTHOR_LIMIT = 100;

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** People write the note in their own words; its script says which language it is. */
export function noteLanguage(note: string, region: StoryRegion): string {
  const guess = JAPANESE.test(note) ? "ja" : "en";
  return region.locales.includes(guess) ? guess : region.defaultLocale;
}

/** What the pasted link is, as far as the form needs to know: a link card needs a typed title. */
export function describeStoryLink(
  url: string,
  region: StoryRegion,
): { linkCard: boolean; suggestedAuthor?: string } | null {
  if (!url.trim()) return null;
  const described = describeSource(url.trim(), region.sourceAdapters);
  if (!described.ok) return null;
  return {
    linkCard: described.source.adapter === "link_card",
    ...(described.source.author ? { suggestedAuthor: described.source.author.handle } : {}),
  };
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
