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
  "bare_fact",
  "check_failed",
  // Set by the repair replay on a row whose Google listing is not this place, or is permanently
  // closed (the collector leaves such reviews out, so new ones never get this far):
  "wrong_listing",
  "closed_listing",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** What a line of opening hours is made of, once its times are gone. */
const HOURS_WORDS =
  /営業時間|営業|定休日|定休|休業|年中無休|無休|ランチ|ディナー|モーニング|最終入店|入店|ラストオーダー|オーダーストップ|平日|祝前日|祝日|土日|[月火水木金土日]曜日?|[朝昼夜]|open|closed?|hours?|l\.?o\.?/giu;
const HOUR_MARK = /\d{1,2}:\d{2}|\d{1,2}時半?|\d{1,2}分/gu;
/** Japanese address: prefecture, city, then block numbers, and perhaps a building and its floor. */
const BARE_ADDRESS =
  /^(?:\d{3}-?\d{4})?(?:\p{L}{1,6}[都道府県])?\p{L}{1,10}[市区町村郡]\p{L}{0,12}\d[\d\-−ー‐丁目番地号の]*(?:\p{L}{0,15}\d+(?:F|階))?$/iu;

/**
 * Whether a quote only repeats what the map already holds: an address, or opening hours, which go
 * stale besides. The model is told so too, but it took "長崎市…6-17" for a tip, so code decides.
 * Labels and emoji don't count: "📍住所：…" is as bare as the address alone.
 */
export function isBareFact(quote: string): boolean {
  const folded = quote.normalize("NFKC");
  const hasHour = /\d{1,2}:\d{2}|\d{1,2}時/u.test(folded);
  if (hasHour && !/[\p{L}\p{N}]/u.test(folded.replace(HOUR_MARK, "").replace(HOURS_WORDS, "")))
    return true;
  const line = folded.replace(/住所|所在地/gu, "").replace(/[^\p{L}\p{N}\-−ー‐]/gu, "");
  return BARE_ADDRESS.test(line);
}

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
  /**
   * True when the whole post, before its text was cut to the stored window, carried an ad label
   * (postHasAdMarker). Set by the collector, which sees the whole page; the check and the attach
   * reject a flagged post as sponsored.
   */
  adMarker?: boolean;
  placeId: string;
  /** One run of the collect script; the per-author limit counts within it. */
  collectionId: string;
  /** The place name the search used. */
  searchedFor: string;
  query: string;
  actorId: string;
  runId: string;
};

/**
 * Collapses every run of whitespace (including full-width and no-break spaces) to one space. A
 * line-break tag (<br>, <br/>, <br />) counts as whitespace: Google's review text carries them, and
 * a quote must pass the verbatim check against the text without showing them.
 */
export function normaliseWhitespace(text: string): string {
  return text
    .normalize("NFC")
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
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
 * A letter that, directly before a label, makes a compound word instead of a label: "自己PR" (a
 * personal pitch), "看板広告" (a signboard), "ネット広告". Hiragana is not in it: "記事は広告です" and
 * "この記事はPRです" have a particle there.
 */
const NOT_COMPOUND = String.raw`(?<![\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9])`;

/** The polite ways a disclosure says "contains": 含みます, 含んでいます, 含まれています ... (not 含みません). */
const CONTAINS = String.raw`含(?:みます|む|んでいます|んでおります|んでいる|まれています|まれております|まれます|まれる)`;
const CONTAINS_POLITE = String.raw`含(?:みます|んでいます|んでおります|まれています|まれております|まれます)`;

/**
 * Words that mark a post as an advert or a sponsored visit. Japan's rules on stealth marketing
 * (2023) make "PR", "広告", "宣伝" and "プロモーション" the usual labels; the model is asked too, and
 * either one rejects. Text is compared in NFKC (see hasAdMarker), so full-width "ＰＲ", "［PR］",
 * "＃ＰＲ" and "：" are read as their plain forms. Every pattern asks for a label or a disclosure, not
 * the bare word: "広告", "提供", "タイアップ" and "PR" are all ordinary words too ("看板広告",
 * "コーヒーを提供しています", "ドラマとのタイアップ", "自己PR"), and a false match costs a story.
 */
const AD_LABELS = [
  // A hashtag: #PR, #広告, #提供 ... (a tag that only starts with one, such as #prague, is not one).
  /[#＃](?:ad|ads|pr|sponsored|promotion|promo|gifted|affiliate|提供|商品提供|無償提供|案件|タイアップ|プロモーション|広告|宣伝|アフィリエイト|スポンサード|協賛|モニター)(?![\p{L}\p{N}_])/iu,
  // A label in brackets: 【PR】, [広告], (宣伝), 【提供】, 【案件】 ... The whole bracket is the label.
  /[【[(〔]\s*(?:PR|AD|ADS|Advertisement|Sponsored(?: post| content)?|Affiliate|広告|宣伝|プロモーション|タイアップ|スポンサード|アフィリエイト|提供|商品提供|案件|協賛)\s*[】\])〕]/iu,
  // A label that is a line of its own, or starts one with a colon: "PR", "※広告", "PR：株式会社テスト".
  // Only spaces and tabs may come before or after it, never a line break: with \s the leading run
  // could cross lines, and a page of "-\n" lines took quadratic time (every line start scanned on to
  // the end). Each attempt now ends with its line.
  /^[ \t\u3000※*■□◆◇●○▼▽★☆▶►・\-–—]*(?:PR|広告|宣伝|プロモーション|タイアップ|スポンサード|アフィリエイト|Sponsored|Advertisement)(?:記事|広告|投稿)?[ \t\u3000]*(?:[:|]|$)/imu,
  /sponsored by|sponsored (?:post|content)/iu,
  // "提供" as a credit line: "提供：株式会社テスト", "提供 by". Not "写真提供：長崎市" (a photo credit:
  // a letter before it) and not "コーヒーを提供しています" (no colon).
  /(?<![\p{L}\p{N}])提供\s*(?::|by\b)/iu,
  // A named kind of post: PR記事, 広告記事, プロモーション記事, タイアップ記事, PR案件, 企業案件.
  // Not スポンサードリンク, the usual label on an ad slot in an ordinary blog.
  new RegExp(
    String.raw`${NOT_COMPOUND}(?:PR|広告|プロモーション|アフィリエイト)(?:記事|案件|投稿|表記)|タイアップ(?:記事|広告|案件|投稿)|(?:PR|企業|スポンサー|広告)案件|案件(?:記事|投稿)|スポンサード(?!リンク)`,
    "iu",
  ),
];

/** Sentences that say what the post itself is. Unlike a label, they don't name an ad slot beside it. */
const AD_DISCLOSURES = [
  // English disclosures.
  /paid partnership|affiliate links?/iu,
  // A sponsored visit or product: 商品提供, 商品をご提供いただき, 無償でご提供いただき, ご招待いただき.
  /有料パートナーシップ|商品提供|ご招待(?:いただ|頂)/u,
  /(?:商品|製品|サンプル|試供品|無償|無料)(?:を|で|の)?(?:ご)?提供(?:いただ|頂|を受け|して(?:いただ|頂|もら))/u,
  // The usual disclosure sentence: 「※この記事はプロモーションを含みます」, 「本記事には広告を含む」,
  // 「このページは広告です」. A subject noun comes first, so "広告を含みません" (no ads) never matches.
  new RegExp(
    String.raw`(?:記事|ページ|投稿|ブログ|サイト|動画|コンテンツ|レビュー|内容|本稿)(?:は|には|では|内には|にも)?[^。\n]{0,12}?(?:プロモーション|広告|PR|宣伝|アフィリエイト(?:広告|リンク)?|タイアップ)(?:(?:を|が|も)?${CONTAINS}|(?:記事|投稿)?(?:です|になります|となります))`,
    "iu",
  ),
  // The same without a subject, in the polite form only: 「※プロモーションを含みます」.
  new RegExp(
    String.raw`${NOT_COMPOUND}(?:プロモーション|広告|PR|宣伝|アフィリエイト(?:広告|リンク)?)(?:を|が)${CONTAINS_POLITE}`,
    "iu",
  ),
  // Affiliate disclosures: 「アフィリエイト広告を利用しています」.
  /アフィリエイト(?:広告|リンク)?(?:を|が)(?:利用|使用|使って|用いて|貼って|掲載|含)/u,
];

/**
 * Whether a post's own text carries an advertising label or disclosure. Run it on the whole post:
 * sponsored posts put theirs at the top or the bottom, which a long post's stored window
 * (storedPostText) cuts off.
 */
export function hasAdMarker(text: string): boolean {
  const folded = text.normalize("NFKC");
  return [...AD_LABELS, ...AD_DISCLOSURES].some((pattern) => pattern.test(folded));
}

/**
 * Whether a whole web page, menus and side bars included, discloses that it is sponsored. Only
 * disclosure sentences count here: "広告", "PR", "【PR】" and "スポンサードリンク" label ad slots on
 * ordinary blogs, and would reject most of them. Labels still count in the article's own text, which
 * postHasAdMarker reads from the stored window.
 */
export function hasPageDisclosure(text: string): boolean {
  const folded = text.normalize("NFKC");
  return AD_DISCLOSURES.some((pattern) => pattern.test(folded));
}

/**
 * Whether a post carries an ad label: its flag, set by the collector from the whole page before the
 * text was cut to a window, or a label in the text, title or location tag it still has. The one test
 * the collector, the check and the attach all use, so they agree.
 */
export function postHasAdMarker(post: {
  text: string;
  title?: string;
  locationName?: string;
  adMarker?: boolean;
}): boolean {
  return (
    post.adMarker === true ||
    hasAdMarker([post.text, post.title, post.locationName].filter(Boolean).join("\n"))
  );
}

/**
 * Old-form kanji and the forms used now, folded together when names are compared (四海樓 is 四海楼).
 * A small list on purpose: each pair is one the map's names are known to mix.
 */
const OLD_KANJI: Readonly<Record<string, string>> = {
  樓: "楼",
  國: "国",
  澤: "沢",
  濱: "浜",
  廣: "広",
  齋: "斎",
  眞: "真",
};
const OLD_KANJI_PATTERN = /[樓國澤濱廣齋眞]/gu;

/** Text as names are compared: NFKC, no spaces or middle dots, lower case, current-form kanji. */
function foldForNames(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s・·]+/gu, "")
    .toLowerCase()
    .replace(OLD_KANJI_PATTERN, (kanji) => OLD_KANJI[kanji] ?? kanji);
}

/**
 * Words a name part may not be, because they say what kind of place it is and not which one
 * (compared folded, whole): a part like these would match any post about any restaurant. A small
 * list; names that are only such words still match as a whole name.
 */
const GENERIC_NAME_WORDS = new Set(
  [
    // Japanese
    "専門店",
    "専門",
    "本店",
    "支店",
    "総本店",
    "本館",
    "別館",
    "長崎",
    "長崎市",
    "ラーメン",
    "中華料理",
    "中華",
    "中華街",
    "食堂",
    "喫茶",
    "喫茶店",
    "カフェ",
    "レストラン",
    "ホテル",
    "居酒屋",
    "割烹",
    "料理",
    "ダイニング",
    "ダイニングバー",
    "ベーカリー",
    "ショップ",
    "ちゃんぽん",
    "皿うどん",
    // English
    "the",
    "and",
    "for",
    "new",
    "old",
    "bar",
    "inn",
    "cafe",
    "coffee",
    "ramen",
    "sushi",
    "bakery",
    "bistro",
    "hotel",
    "shop",
    "store",
    "house",
    "kitchen",
    "dining",
    "restaurant",
    "nagasaki",
    "japan",
  ].map(foldForNames),
);

/** A name part is at least this long, and a katakana run inside a part at least NAME_RUN_MIN. */
const NAME_PART_MIN = 3;
const NAME_RUN_MIN = 4;
const KATAKANA_RUN = new RegExp(String.raw`[\p{Script=Katakana}ー]{${NAME_RUN_MIN},}`, "gu");
/** Where a name splits into parts: spaces, brackets and middle dots (NFKC has made brackets plain). */
const NAME_SEPARATORS = /[\s()[\]{}<>「」『』【】〈〉《》〔〕・·/|,、:;]+/u;

/**
 * The parts of a place's name that may stand for it in a post: the pieces between brackets, middle
 * dots and spaces, the pieces either side of a change between Latin and Japanese script, and katakana
 * runs of four or more characters. 「一口餃子専門店 トラの門 Toranomon」 gives 一口餃子専門店,
 * トラの門 and toranomon; 「レモンラメン・麺やオールウェイズ」 gives レモンラメン, 麺やオールウェイズ and
 * オールウェイズ. A part has at least three characters and is not a generic word. Folded.
 */
export function namePartsOf(name: string): string[] {
  const parts = new Set<string>();
  for (const piece of name.normalize("NFKC").split(NAME_SEPARATORS)) {
    const tokens = piece.match(/[\p{Script=Latin}\p{N}]+|[^\p{Script=Latin}\p{N}]+/gu) ?? [];
    const candidates = [...tokens];
    for (const token of tokens) candidates.push(...(token.match(KATAKANA_RUN) ?? []));
    for (const candidate of candidates) {
      const folded = foldForNames(candidate);
      if (folded.length >= NAME_PART_MIN && !GENERIC_NAME_WORDS.has(folded)) parts.add(folded);
    }
  }
  return [...parts];
}

/** What a post may name the place by: each whole name of two or more characters, and its parts. */
function nameTerms(names: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const name of names) {
    const whole = foldForNames(name);
    if (whole.length >= 2) terms.add(whole);
    for (const part of namePartsOf(name)) terms.add(part);
  }
  return [...terms];
}

/**
 * Whether a text names the place, in any language or script (ignoring width, case, spaces and
 * old-form kanji): by one of its whole names, or by a part of one (namePartsOf), so a post that says
 * 朝日屋 matches the place 朝日屋（屋台）. Names shorter than two characters are too ambiguous to
 * count. This is a sanity check: the model still has to say the post is about the place.
 */
export function namesPlace(text: string, names: readonly string[]): boolean {
  const haystack = foldForNames(text);
  return nameTerms(names).some((term) => haystack.includes(term));
}

/** Whether a map listing's name fits a place's names: namesPlace, or a name too short to compare. */
export function listingNamesPlace(listing: string, names: readonly string[]): boolean {
  // A one-character name (椿) cannot be found in a listing, so the listing's position decides.
  return namesPlace(listing, names) || names.some((name) => foldForNames(name).length === 1);
}

/**
 * Whether a listing's name and a place's name share what makes them that name, when neither holds
 * the other's whole name: the listing's whole name is inside ours (ばんくう in 居酒屋ばんくう), or both
 * have the same word (架空 in 「中華菜館 架空」 and 「架空 本店」). Two characters count here, and do not in
 * namesPlace, because this is read only against a listing's own name, never a post's running text.
 * Generic words never count.
 */
export function listingSharesName(listing: string, names: readonly string[]): boolean {
  const words = (name: string) =>
    name
      .normalize("NFKC")
      .split(NAME_SEPARATORS)
      .map(foldForNames)
      .filter((word) => word.length >= 2 && !GENERIC_NAME_WORDS.has(word));
  const whole = foldForNames(listing);
  const wholeCounts = whole.length >= 2 && !GENERIC_NAME_WORDS.has(whole);
  const listingWords = new Set(words(listing));
  return names.some(
    (name) =>
      (wholeCounts && foldForNames(name).includes(whole)) ||
      words(name).some((word) => listingWords.has(word)),
  );
}

/**
 * Where the place is first named in `text`, matched as namesPlace matches (width, case, spaces and
 * old-form kanji ignored, each character folded on its own, whole names and their parts); -1 when
 * nothing of two or more characters is found.
 */
export function firstMention(text: string, names: readonly string[]): number {
  const needles = nameTerms(names);
  if (!needles.length) return -1;
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = foldForNames(char);
    for (let i = 0; i < part.length; i++) origin.push(index);
    folded += part;
    index += char.length;
  }
  let first = -1;
  for (const needle of needles) {
    const at = folded.indexOf(needle);
    const start = at === -1 ? -1 : (origin[at] ?? -1);
    if (start !== -1 && (first === -1 || start < first)) first = start;
  }
  return first;
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * A post's text as it is stored and checked: trimmed, at most `max` characters. A longer text keeps
 * a window around the first mention of the place (a third of the window before it), so the mention
 * is never cut off; one that never names the place keeps its start. Its result is returned unchanged
 * when passed in again, so the collector and storyFinder.ingest both apply it and agree: the
 * collector to keep each candidate small enough to send, the server to bound what it stores. The
 * check reads the stored text, so a quote must be in this window to pass.
 */
export function storedPostText(text: string, names: readonly string[], max = TEXT_MAX): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const mention = firstMention(trimmed, names);
  let start =
    mention === -1 ? 0 : Math.min(Math.max(0, mention - Math.floor(max / 3)), trimmed.length - max);
  let end = start + max;
  // Never split a character outside the Basic Multilingual Plane (an emoji, a rare kanji).
  if (isLowSurrogate(trimmed.charCodeAt(start))) start++;
  if (isHighSurrogate(trimmed.charCodeAt(end - 1))) end--;
  return trimmed.slice(start, end).trim();
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
/**
 * The fullwidth "．" and halfwidth "｡" full stops, which IDNA reads as ".": a dot wherever they are,
 * since prose almost never ends a sentence with them.
 */
const HARD_IDNA_DOTS = /[．｡]/gu;
/**
 * The ideographic full stop "。", which IDNA also reads as ".", where it joins a label (letters or
 * digits in any script) to an ASCII one, as in "example。com" or "長崎カフェ。jp". Between Japanese
 * words it ends a sentence (「ありがとう。また来ます」) and is left alone.
 */
const IDEOGRAPHIC_DOT_BEFORE_ASCII = /(?<=[\p{L}\p{N}])\s*。\s*(?=[a-z0-9])/giu;

/**
 * The copy of a quote that contact checks read: NFKC (fullwidth letters and digits become ASCII),
 * with the IDNA dots above read as ".". "｡" is made "." before NFKC, which would make it "。".
 */
function detectionCopy(quote: string): string {
  return quote
    .replace(HARD_IDNA_DOTS, ".")
    .normalize("NFKC")
    .replace(IDEOGRAPHIC_DOT_BEFORE_ASCII, ".");
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

/** Copies by containment: at least this share of the smaller quote's trigrams in the other. */
export const COPY_CONTAINMENT = 0.6;
/** Copies by the Jaccard index (shared over all distinct trigrams of both). */
export const COPY_JACCARD = 0.8;
/** Containment is used only when the smaller quote has at least this many trigrams ... */
export const CONTAINMENT_MIN_GRAMS = 20;
/** ... and at least this share of the larger one's. */
export const CONTAINMENT_MIN_RATIO = 0.5;

/**
 * Whether two quotes with these trigram counts, sharing `shared` trigrams, are copies. Containment
 * (shared over the smaller set) catches a copy edited a little or with some new text around it, but
 * a short quote, or one much shorter than the other, sits inside genuine longer stories too (a shown
 * 「架空楼のちゃんぽん」 is in every story that mentions the dish), so for those only the Jaccard index
 * counts: nearly the same words, nearly the same length. Either way the smaller must be at least
 * half the larger, so a pair further apart is never a copy.
 */
export function isCopy(shared: number, sizeA: number, sizeB: number): boolean {
  const small = Math.min(sizeA, sizeB);
  const large = Math.max(sizeA, sizeB);
  if (small === 0) return false;
  if (small >= CONTAINMENT_MIN_GRAMS && small / large >= CONTAINMENT_MIN_RATIO)
    return shared / small >= COPY_CONTAINMENT;
  return shared / (sizeA + sizeB - shared) >= COPY_JACCARD;
}

/** Whether two quotes are copies (isCopy on their fingerprints' trigrams). */
export function quotesAreCopies(a: string, b: string): boolean {
  const gramsA = quoteGrams(quoteFingerprint(a));
  const gramsB = quoteGrams(quoteFingerprint(b));
  let shared = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) shared++;
  return isCopy(shared, gramsA.size, gramsB.size);
}

/**
 * Shown quotes indexed by trigram, so a new quote is compared with all of them in one pass over its
 * own trigrams (isCopy): one count per shared trigram, then one check per indexed quote.
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
      const key = this.keys[quote];
      if (key !== except && isCopy(shared[quote] ?? 0, grams.size, this.sizes[quote] ?? 0))
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
 * folded in (blog.example.co.jp and www.example.co.jp are both example.co.jp).
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

/** Free blog hosts where the first path segment is the blogger's account (ameblo.jp/someone/...). */
const BLOGS_BY_PATH = new Set([
  "ameblo.jp",
  "note.com",
  "blog.goo.ne.jp",
  "blog.livedoor.jp",
  "plaza.rakuten.co.jp",
]);
/** Free blog hosts where the subdomain is the blogger's account (someone.hatenablog.com). */
const BLOGS_BY_SUBDOMAIN = new Set([
  "hatenablog.com",
  "hatenablog.jp",
  "hateblo.jp",
  "hatenadiary.jp",
  "hatenadiary.com",
  "seesaa.net",
  "fc2.com",
  "exblog.jp",
  "jugem.jp",
  "livedoor.blog",
  "blog.jp",
  "blogspot.com",
  "wordpress.com",
  "cocolog-nifty.com",
]);

/**
 * Who wrote a web page: the site, or on a free blog host the blogger's account. Folding a host's
 * bloggers into one author left all of ameblo.jp, a third of the first run's blogs, three posts a
 * run. A new account there costs nothing, so one person could pose as several; the per-place cap,
 * the copy check and a steward's read still stand in the way of a flood.
 */
function webAuthor(url: URL): string {
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (BLOGS_BY_PATH.has(host)) {
    const account = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return account ? `${host}/${account}` : host;
  }
  const site = registrableHost(host);
  return BLOGS_BY_SUBDOMAIN.has(site) ? host : site;
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
 * platform itself vouches for count: for a web page, where it was served from (webAuthor; a page
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
    return `web:${parsed.ok ? webAuthor(parsed.url) : "unknown"}`.slice(0, 300);
  }
  const who = candidate.authorUrl?.trim()
    ? profileKey(candidate.authorUrl)
    : candidate.authorHandle?.trim()
      ? candidate.authorHandle.normalize("NFKC").trim().toLowerCase()
      : "unknown";
  return `${candidate.platform}:${who}`.slice(0, 300);
}
