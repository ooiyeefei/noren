import { pickPlaceName, type PlaceNameLike } from "../region/names";
import type { RegionConfig } from "../region/schema";
import { SITE } from "./card";

type NameRegion = Pick<RegionConfig, "nameFallback" | "defaultLocale">;

/** The place's name in English with the Japanese beside it, as every share shows it. */
export function placeLabel(
  names: readonly PlaceNameLike[],
  region: NameRegion,
): { english: string; japanese: string | null; text: string } {
  const english = pickPlaceName(names, "en", region).primary?.value ?? "";
  const japanese = pickPlaceName(names, "ja", region).primary;
  const beside =
    japanese &&
    (japanese.script === "kanji" || japanese.script === "kana") &&
    japanese.value !== english
      ? japanese.value
      : null;
  return { english, japanese: beside, text: beside ? `${english} ${beside}` : english };
}

/** What Instagram takes in one caption. */
export const CAPTION_LIMIT = 2200;
export const HASHTAG_LIMIT = 30;
/** A name longer than this makes a hashtag nobody would tap, so the place goes without one. */
const HASHTAG_LENGTH = 50;

const WORD = /[\p{L}\p{N}\p{M}_]+/gu;

/**
 * A name as one hashtag: letters, digits and marks in any script, nothing else. "Café Dejima & Bar"
 * becomes #CaféDejimaBar and "大浦・南山手" becomes #大浦南山手. A word written all in lowercase gets a
 * capital so the tag reads as words. Null where nothing usable is left: no letter in it, or too long.
 */
export function hashtagFor(name: string): string | null {
  const words = name.normalize("NFKC").replace(/['’`]/g, "").match(WORD);
  if (!words) return null;
  const tag = words
    .map((word) =>
      word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join("");
  if (!/\p{L}/u.test(tag) || [...tag].length > HASHTAG_LENGTH) return null;
  return `#${tag}`;
}

/** The town in both languages, then the place's name, then #Noren: never repeated, never over the limit. */
export function captionHashtags(input: {
  town: { en: string; ja: string };
  placeEnglish: string;
  placeJapanese: string | null;
}): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const name of [
    input.town.ja,
    input.town.en,
    input.placeEnglish,
    input.placeJapanese ?? "",
    "Noren",
  ]) {
    const tag = hashtagFor(name);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags.slice(0, HASHTAG_LIMIT);
}

/** The line that says whose words these are, in the language of the story. */
export function creditLine(lang: string, name: string): string {
  return lang === "ja" ? `${name} さんの物語（Noren より）` : `Story by ${name} on Noren`;
}

/** What marks words as a machine's translation, in the language they are written in. */
function translationLabel(lang: string): string {
  return lang === "ja" ? "日本語（機械翻訳）" : "English (machine translation)";
}

export type CaptionInput = {
  /** The story in the language it was written in. */
  body: string;
  /** That language. */
  lang: string;
  authorName: string;
  placeEnglish: string;
  placeJapanese: string | null;
  /** The town, in both languages, for the hashtags. */
  town: { en: string; ja: string };
  /** The story in the other language, only where a translation passed its check. */
  translation?: { lang: string; text: string } | null;
};

/**
 * The caption that goes with the picture on Instagram: the story in its own language, and in the
 * other where a checked translation exists; who wrote it; the place in English with the Japanese
 * beside it; the site as plain text, since links in a caption are not clickable; and hashtags.
 * It stays under Instagram's 2,200 characters: the translation goes first if the room runs out,
 * then the end of the story, so the credit and the hashtags always stay.
 */
export function buildCaption(input: CaptionInput): string {
  const place = input.placeJapanese
    ? `${input.placeEnglish} ${input.placeJapanese}`
    : input.placeEnglish;
  const tail = [
    creditLine(input.lang, input.authorName.trim()),
    place,
    SITE,
    "",
    captionHashtags(input).join(" "),
  ].join("\n");
  const translation =
    input.translation && input.translation.text.trim()
      ? `${translationLabel(input.translation.lang)}\n${input.translation.text.trim()}`
      : "";
  const assemble = (story: string, withTranslation: boolean) =>
    [story, withTranslation ? translation : "", tail].filter(Boolean).join("\n\n");
  const story = input.body.trim();
  for (const withTranslation of translation ? [true, false] : [false]) {
    const caption = assemble(story, withTranslation);
    if (caption.length <= CAPTION_LIMIT) return caption;
  }
  // A story is at most 1,000 characters, so this only runs for a name or a credit that is far too long.
  const kept = [...story];
  while (kept.length > 0) {
    kept.pop();
    const caption = assemble(`${kept.join("").trimEnd()}…`, false);
    if (caption.length <= CAPTION_LIMIT) return caption;
  }
  return assemble("", false).slice(0, CAPTION_LIMIT);
}
