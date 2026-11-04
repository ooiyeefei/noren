import { describeSource } from "../adapters";
import { cleanUrl, parseHttpUrl } from "../adapters/url";
import type { SourceAdapterId } from "../domain/constants";

/**
 * The story finder looks for public posts in which people talk about a place, checks each one with
 * a model and code, and links the ones that carry a story or a tip to the place (owner, 2026-11-04).
 * This module is shared by the local collector scripts and the Convex functions.
 */

/** Where a post was found. A Google review lives on Google Maps; a blog is any other web page. */
export const MENTION_PLATFORMS = [
  "google_reviews",
  "instagram",
  "facebook",
  "tiktok",
  "reddit",
  "web",
] as const;
export type MentionPlatform = (typeof MENTION_PLATFORMS)[number];

/**
 * pending: waiting for the check. accepted: passed the check, not linked yet. rejected: failed it
 * (`reason` says why). attached: linked to the place as a source. hidden: a steward took it down.
 */
export const MENTION_STATUSES = ["pending", "accepted", "rejected", "attached", "hidden"] as const;
export type MentionStatus = (typeof MENTION_STATUSES)[number];

export const MENTION_KINDS = [
  "story",
  "tip",
  "rating_only",
  "ad_or_sponsored",
  "unrelated",
] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export const ABOUT_ANSWERS = ["yes", "no", "unsure"] as const;

/** Why a candidate was rejected. `unverifiable`: the model quoted words the post does not contain. */
export const REJECT_REASONS = [
  "unverifiable",
  "sponsored",
  "not_about_place",
  "unsure_about_place",
  "rating_only",
  "unrelated",
  "names_private_people",
  "no_evidence",
  "no_quote",
  "quote_too_long",
  "check_failed",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** The longest quote shown on a card, in characters. */
export const QUOTE_MAX = 280;
/** The longest evidence excerpt kept, in characters (stewards read it; it is never public). */
export const EVIDENCE_MAX = 300;
/** The longest post text kept for the check. Longer pages keep the part around the place's name. */
export const TEXT_MAX = 8000;

/**
 * One public post found for one place, in the same shape whichever service it came from. The full
 * text is kept only for the check and is never shown; the author fields are what the platform
 * itself shows in public.
 */
export type MentionCandidate = {
  platform: MentionPlatform;
  url: string;
  canonicalUrl: string;
  authorName?: string;
  authorHandle?: string;
  authorUrl?: string;
  /** Milliseconds since the epoch. */
  postedAt?: number;
  text: string;
  langGuess?: string;
  placeId: string;
  /** The place name the search used. */
  searchedFor: string;
  query: string;
  actorId: string;
  runId: string;
};

/** Collapses every run of whitespace (including full-width and no-break spaces) to one space. */
export function normaliseWhitespace(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Whether `fragment` appears in `text` character for character, apart from whitespace. */
export function isVerbatim(text: string, fragment: string): boolean {
  const needle = normaliseWhitespace(fragment);
  return needle.length > 0 && normaliseWhitespace(text).includes(needle);
}

const SENTENCE_END = /[。！？!?.．」』)）]/u;

/**
 * A verbatim quote cut to at most `max` characters at the end of a sentence, so it stays a
 * substring of the post; null when no sentence ends early enough to leave a useful quote.
 */
export function capQuote(quote: string, max = QUOTE_MAX, minimum = 40): string | null {
  const text = normaliseWhitespace(quote);
  if (text.length <= max) return text;
  for (let end = max; end >= minimum; end--) {
    if (SENTENCE_END.test(text[end - 1]!)) return text.slice(0, end).trim();
  }
  return null;
}

/** A best guess from the script: kana means Japanese, hangul Korean, Latin letters English. */
export function guessLang(text: string): string | undefined {
  const sample = text.slice(0, 2000);
  const count = (pattern: RegExp) => sample.match(pattern)?.length ?? 0;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  const hangul = count(/\p{Script=Hangul}/gu);
  const latin = count(/[A-Za-z]/g);
  if (kana > 0 && kana + han >= hangul) return "ja";
  if (hangul > 0) return "ko";
  if (han > 0 && han >= latin / 4) return "zh";
  if (latin > 0) return "en";
  return undefined;
}

/**
 * The address used to tell candidates apart: the adapter's canonical form when one matches (the
 * form a source linked by a member has too), so a post found twice, or already linked, is
 * recognised.
 */
export function mentionCanonicalUrl(
  url: string,
  enabledAdapters: readonly SourceAdapterId[],
): string | null {
  const described = describeSource(url, enabledAdapters);
  if (described.ok) return described.source.canonicalUrl;
  const parsed = parseHttpUrl(url);
  return parsed.ok ? cleanUrl(parsed.url) : null;
}

/**
 * Words that mark a post as an advert or a sponsored visit. Japan's rules on stealth marketing
 * (2023) make "PR" and "広告" the usual labels; the model is asked too, and either one rejects.
 */
const AD_MARKERS = [
  /[#＃](?:ad|ads|pr|sponsored|promotion|promo|gifted|提供|案件|タイアップ|プロモーション|広告)(?![\p{L}\p{N}_])/iu,
  /[【[(（〔](?:PR|ＰＲ|AD|広告|Sponsored|プロモーション|タイアップ)[】\])）〕]/iu,
  /paid partnership|sponsored by|有料パートナーシップ|商品提供|ご招待いただ/iu,
];

export function hasAdMarker(text: string): boolean {
  return AD_MARKERS.some((pattern) => pattern.test(text));
}
