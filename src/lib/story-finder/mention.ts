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
  // Checks made by code alone, whatever the model said:
  "place_not_named",
  "quote_has_contact",
  "duplicate_quote",
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
  /** A web page's or Reddit post's title, as the platform shows it. */
  title?: string;
  /** The place the post is tagged with: Google's own name for the place, an Instagram location. */
  locationName?: string;
  langGuess?: string;
  placeId: string;
  /** One run of the collect script; the per-author limit counts within it. */
  collectionId: string;
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

/** Whether a text names the place by one of its names, in any language or script (ignoring width,
 * case and spaces). Names shorter than two characters are too ambiguous to count. */
export function namesPlace(text: string, names: readonly string[]): boolean {
  const norm = (value: string) => value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
  const haystack = norm(text);
  return names.some((name) => {
    const needle = norm(name);
    return needle.length >= 2 && haystack.includes(needle);
  });
}

/** A domain label in any script, internationalised names included. */
const LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?`;
/**
 * A domain's last label in ASCII: starting with a letter and ending with one (so at least two
 * letters: "e.g", "1.5km" and "ver.2" are not domains), or punycode (xn--...). Any such label counts,
 * not a list of known ones, since new top-level domains appear all the time.
 */
const ASCII_TOP_LABEL = String.raw`(?:xn--[a-z0-9-]+|[a-z][a-z0-9-]*[a-z])`;
/** A last label in any script, as in 例え.みんな: two or more letters. */
const ANY_TOP_LABEL = String.raw`(?:${ASCII_TOP_LABEL}|\p{L}{2,})`;
/** A dot in brackets, written to get past a filter: "(dot)", "[.]", "{。}", "（ドット）". */
const BRACKETED_DOT = String.raw`\s*[(\[{<]\s*(?:\.|。|dot|ドット|点)\s*[)\]}>]\s*`;
/**
 * A dot spelled out in running text: " . ", " dot ", "ドット". These are also ordinary words (a
 * "ドット柄" cup is a polka-dot one), so the label after them must be ASCII to count.
 */
const SPELLED_DOT = String.raw`(?:\s+\.\s+|\s+dot\s+|\s*ドット\s*)`;
/** label.label, however the dot is written; the top label may be followed by any non-ASCII text. */
const DOMAIN = new RegExp(
  `${LABEL}(?:(?:\\.|${BRACKETED_DOT})${ANY_TOP_LABEL}|${SPELLED_DOT}${ASCII_TOP_LABEL})(?![a-z0-9-])`,
  "iu",
);
/** The dots IDNA treats as ".": ideographic, fullwidth and halfwidth ideographic full stops. */
const IDNA_DOTS = /[。．｡]/gu;
/**
 * One of those dots between ASCII domain characters, as in "example。com". Japanese prose ends its
 * sentences with "。" between Japanese words (「ありがとう。また来ます」), which is left alone.
 */
const ASCII_IDNA_DOT = /(?<=[a-z0-9])\s*。\s*(?=[a-z0-9])/giu;

/**
 * The copy of a quote that contact checks read: NFKC (fullwidth letters and digits become ASCII),
 * with an IDNA dot between ASCII labels read as ".". The fullwidth "．" is made "。" first, since
 * NFKC alone would make it an ASCII dot even between Japanese words, where it ends a sentence.
 */
function detectionCopy(quote: string): string {
  return quote.replace(IDNA_DOTS, "。").normalize("NFKC").replace(ASCII_IDNA_DOT, ".");
}

/**
 * What in a quote would let a post advertise or reach someone through Noren: a web address (any
 * scheme, "www.", or anything shaped like a domain name, dots spelled out included), an email
 * address, a phone number or an @handle. A shown quote must carry none of them. It errs towards
 * refusing: a quote that only looks like it has an address is dropped, which costs one quote.
 */
export function contactIn(quote: string): "url" | "email" | "phone" | "handle" | null {
  const text = detectionCopy(quote);
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(text)) return "email";
  if (/[a-z][a-z0-9+.-]*:\/\/|www\./iu.test(text) || DOMAIN.test(text)) return "url";
  if (/(?:^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.]{2,}/u.test(text)) return "handle";
  // A Japanese number starts with 0 and has 10 or 11 digits; an international one starts with +.
  // Dates and years start with 1 or 2, so "1962-1975" or "2026-10-01" are not taken for one.
  for (const match of text.matchAll(/\+?\d[\d\s\-‐‑–—―ー()]{6,}\d/gu)) {
    const digits = match[0].replace(/\D/gu, "");
    if (
      match[0].startsWith("+") ? digits.length >= 9 : digits.startsWith("0") && digits.length >= 10
    )
      return "phone";
  }
  return null;
}

/** A quote's machine translation may be at most this many times as long as the quote (by weight). */
export const TRANSLATION_RATIO = 3;

const DENSE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;

/**
 * A text's length with each Chinese, Japanese or Korean character counted three times, which is
 * closer to how much it says: a faithful English translation of a Japanese sentence runs to about
 * three letters per character, so a plain count would make it look far too long.
 */
export function textWeight(text: string): number {
  let weight = 0;
  for (const char of text) weight += DENSE.test(char) ? 3 : 1;
  return weight;
}

/**
 * Whether a machine translation of a shown quote can be shown with it, by code alone: not empty, at
 * most TRANSLATION_RATIO times the quote's weight and QUOTE_MAX * TRANSLATION_RATIO characters, and
 * with no contact details (the quote has none, so a translation that adds one is not a translation).
 */
export function translationFits(quote: string, translation: string): boolean {
  const text = translation.trim();
  return (
    text.length > 0 &&
    textWeight(text) <= textWeight(quote) * TRANSLATION_RATIO &&
    text.length <= QUOTE_MAX * TRANSLATION_RATIO &&
    contactIn(text) === null
  );
}

/** A quote reduced to its letters and digits, for comparing quotes. */
export function quoteFingerprint(quote: string): string {
  return quote
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** A fingerprint's distinct character trigrams (the whole fingerprint when it is shorter). */
export function quoteGrams(fingerprint: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= fingerprint.length; i++) grams.add(fingerprint.slice(i, i + 3));
  if (grams.size === 0 && fingerprint) grams.add(fingerprint);
  return grams;
}

/**
 * The share of the smaller trigram set that the other set holds too (containment), 0 to 1. A copy
 * keeps most of its trigrams through small edits and however much new text is put around it, so it
 * scores high; two people's own quotes about one place share its name and a few common phrases,
 * which is a small part of either.
 */
export function gramContainment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return 0;
  let shared = 0;
  for (const gram of small) if (large.has(gram)) shared++;
  return shared / small.size;
}

/** How much of the shorter quote's fingerprint the other quote holds too, 0 to 1. */
export function quoteContainment(a: string, b: string): number {
  return gramContainment(quoteGrams(quoteFingerprint(a)), quoteGrams(quoteFingerprint(b)));
}

/**
 * Quotes with at least this containment are copies: the same words posted again, edited a little
 * or wrapped in new text. Tests hold edited and wrapped copies above it, and two different quotes
 * about one shop, sharing its name, below it.
 */
export const COPY_CONTAINMENT = 0.6;

/**
 * Shown quotes indexed by trigram, so a new quote is compared with all of them in one pass over its
 * own trigrams. Containment has no bound by length (a short quote may sit wholly inside a long one),
 * so no quote can be skipped for its size; the index keeps the comparison cheap instead: one count
 * per shared trigram, then one check per indexed quote.
 */
export class CopyIndex<K> {
  private readonly gramIds = new Map<string, number>();
  /** For each trigram id, the indexed quotes holding it. */
  private readonly postings: number[][] = [];
  private readonly keys: K[] = [];
  private readonly sizes: number[] = [];

  /** Indexes a quote's fingerprint (quoteFingerprint) under its key. */
  add(key: K, fingerprint: string): void {
    const quote = this.keys.length;
    const grams = quoteGrams(fingerprint);
    this.keys.push(key);
    this.sizes.push(grams.size);
    for (const gram of grams) {
      let id = this.gramIds.get(gram);
      if (id === undefined) {
        id = this.postings.length;
        this.gramIds.set(gram, id);
        this.postings.push([]);
      }
      this.postings[id]?.push(quote);
    }
  }

  /** The key of an indexed quote, other than `except`, that this one copies or is a copy of. */
  copyOf(fingerprint: string, except?: K): K | undefined {
    const grams = quoteGrams(fingerprint);
    if (!grams.size) return undefined;
    const shared = new Int32Array(this.keys.length);
    for (const gram of grams) {
      const id = this.gramIds.get(gram);
      for (const quote of id === undefined ? [] : (this.postings[id] ?? []))
        shared[quote] = (shared[quote] ?? 0) + 1;
    }
    for (let quote = 0; quote < this.keys.length; quote++) {
      const smaller = Math.min(grams.size, this.sizes[quote] ?? 0);
      const key = this.keys[quote];
      if (smaller > 0 && key !== except && (shared[quote] ?? 0) / smaller >= COPY_CONTAINMENT)
        return key;
    }
    return undefined;
  }
}

/**
 * Second-level labels under a country code that are public, so a site's own name is one level
 * further down (example.co.jp, example.com.au). Japan's prefecture labels are public too
 * (example.nagasaki.jp). This is a short stand-in for the Public Suffix List: where it misses a
 * public label, sites under it share one host, which only makes the author limit stricter.
 */
const PUBLIC_SECOND_LEVEL = new Set(
  (
    "ac ad co com ed edu go gov gr lg ltd mil ne net or org plc sch nhs idv per asn id me nom " +
    "info biz"
  ).split(" "),
);
const JP_PREFECTURES = new Set(
  (
    "hokkaido aomori iwate miyagi akita yamagata fukushima ibaraki tochigi gunma saitama " +
    "chiba tokyo kanagawa niigata toyama ishikawa fukui yamanashi nagano gifu shizuoka aichi " +
    "mie shiga kyoto osaka hyogo nara wakayama tottori shimane okayama hiroshima yamaguchi " +
    "tokushima kagawa ehime kochi fukuoka saga nagasaki kumamoto oita miyazaki kagoshima " +
    "okinawa"
  ).split(" "),
);

/**
 * The registrable part of a host name: the name a site's owner registered, with every subdomain
 * folded in (blog.example.co.jp and www.example.co.jp are both example.co.jp). Free blog hosts fold
 * too (anyone.hatenablog.com is hatenablog.com): a new subdomain there costs nothing, so it must not
 * count as a new author.
 */
export function registrableHost(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const top = labels.at(-1)!;
  const second = labels.at(-2)!;
  const publicSecond =
    top.length === 2 &&
    (PUBLIC_SECOND_LEVEL.has(second) || (top === "jp" && JP_PREFECTURES.has(second)));
  return labels.slice(publicSecond ? -3 : -2).join(".");
}

/** A profile address as one string: no scheme, www. or m., trailing slash or fragment; lower case. */
function profileKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
    return `${host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Who wrote a post, as one key per platform, for the per-run author limit. Only identifiers the
 * platform itself vouches for count: for a web page, the registrable host it was served from (a page
 * cannot claim another site's name); elsewhere the profile address or handle the platform reports.
 * Never a free-text display name or a page's author or og: tags, which a post can set to anything:
 * a post with no verified identity shares the platform's one "unknown" key.
 */
export function authorKey(candidate: {
  platform: MentionPlatform;
  canonicalUrl: string;
  authorUrl?: string;
  authorHandle?: string;
}): string {
  if (candidate.platform === "web") {
    const parsed = parseHttpUrl(candidate.canonicalUrl);
    return `web:${parsed.ok ? registrableHost(parsed.url.hostname) : "unknown"}`.slice(0, 300);
  }
  const who = candidate.authorUrl?.trim()
    ? profileKey(candidate.authorUrl)
    : candidate.authorHandle?.trim()
      ? candidate.authorHandle.normalize("NFKC").trim().toLowerCase()
      : "unknown";
  return `${candidate.platform}:${who}`.slice(0, 300);
}
