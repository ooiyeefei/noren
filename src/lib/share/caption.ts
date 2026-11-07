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

const HASHTAGS = "#Nagasaki #長崎 #LocalStories #Noren";
const LINE_LIMIT = 140;

/** The story's opening, cut at a sentence end if one fits, else at the limit. */
export function captionLine(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  if (text.length <= LINE_LIMIT) return text;
  const head = text.slice(0, LINE_LIMIT);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("。"), head.lastIndexOf("! "));
  if (stop > 40) return head.slice(0, stop + 1).trim();
  return `${head.trimEnd()}…`;
}

export function placeAddress(origin: string | undefined, locale: string, slug: string): string {
  return `${origin ?? `https://${SITE}`}/${locale}/places/${slug}`;
}

/**
 * The words that go with the picture: the line, the place in both languages, hashtags in both, and
 * the link. A steward's caption for Noren's own account credits the writer by name.
 */
export function buildCaption(input: {
  body: string;
  /** The place as `placeLabel` gives it. */
  place: string;
  slug: string;
  locale: string;
  origin?: string;
  credit?: { prefix: string; name: string };
}): string {
  const credit =
    input.credit && input.credit.name ? `${input.credit.prefix} ${input.credit.name}` : "";
  return [
    `“${captionLine(input.body)}”`,
    credit,
    input.place,
    HASHTAGS,
    placeAddress(input.origin, input.locale, input.slug),
  ]
    .filter(Boolean)
    .join("\n\n");
}
