import { badgeMessages } from "../i18n/messages/badges";
import { neighbourhoodAt } from "../region/neighbourhoods";
import { pickPlaceName, type PlaceNameLike } from "../region/names";
import type { RegionConfig } from "../region/schema";
import { fold } from "./text";
import { placeUrl, type UrlLanguage } from "./urls";

// How the tools write a place down: names in every script (English first, Japanese beside it),
// the category and neighbourhood in both languages, and the labels Noren puts on its own pages.

export type Bilingual = { en: string; ja: string };

export type NameEntry = { value: string; lang: string; script: string };

export const DEMO_LABEL = "Demo";
export const DEMO_NOTE =
  "Mock data for the demo. This is a made-up example, not a real place or person.";

/** The wording Noren's own pages use for a place no one has checked in person (Principle II). */
export const NOT_YET_CONFIRMED = badgeMessages.en.unconfirmed;

type Named = { names: readonly PlaceNameLike[] };

/** Every name Noren holds for the place, English scripts first, with no repeats. */
export function nameEntries(
  place: Named,
  region: Pick<RegionConfig, "nameFallback" | "defaultLocale">,
) {
  const order = region.nameFallback.en ?? region.nameFallback[region.defaultLocale] ?? [];
  const rank = (script: string) => {
    const index = order.indexOf(script as (typeof order)[number]);
    return index === -1 ? order.length : index;
  };
  const seen = new Set<string>();
  return [...place.names]
    .sort((a, b) => rank(a.script) - rank(b.script) || Number(b.isPrimary) - Number(a.isPrimary))
    .filter((name) => {
      const key = `${name.script}|${name.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map<NameEntry>(({ value, lang, script }) => ({ value, lang, script }));
}

/** "Dejima (出島)": English first, Japanese beside it. One name alone when that is all there is. */
export function displayName(
  place: Named,
  region: Pick<RegionConfig, "nameFallback" | "defaultLocale">,
): string {
  const english = pickPlaceName(place.names, "en", region).primary;
  const japanese = pickPlaceName(place.names, "ja", region).primary;
  if (english === null) return japanese?.value ?? "";
  if (japanese === null || japanese.value === english.value) return english.value;
  return `${english.value} (${japanese.value})`;
}

export function categoryLabel(
  region: Pick<RegionConfig, "categories">,
  key: string | undefined,
): { key: string; en: string; ja: string } | null {
  if (key === undefined) return null;
  const category = region.categories?.find((candidate) => candidate.key === key);
  if (category === undefined) return { key, en: key, ja: key };
  return {
    key,
    en: category.labels.en ?? key,
    ja: category.labels.ja ?? category.labels.en ?? key,
  };
}

export function neighbourhoodLabel(
  region: Pick<RegionConfig, "neighbourhoods">,
  id: string | undefined,
): { id: string; en: string; ja: string } | null {
  if (id === undefined) return null;
  const found = region.neighbourhoods?.find((candidate) => candidate.id === id);
  return found === undefined
    ? { id, en: id, ja: id }
    : { id, en: found.names.en ?? id, ja: found.names.ja ?? found.names.en ?? id };
}

export function neighbourhoodOfPin(
  region: Pick<RegionConfig, "neighbourhoods">,
  pin: { lat: number; lng: number } | null,
): string | undefined {
  return pin === null ? undefined : neighbourhoodAt(region, pin)?.id;
}

/** The label for a place by whether a person has confirmed it (`confirmedAt`). */
export function confirmationOf(confirmedAt: number | undefined) {
  return confirmedAt === undefined
    ? { confirmed: false as const, label: NOT_YET_CONFIRMED }
    : { confirmed: true as const, label: "Confirmed by a member who has been there" };
}

/** One place as a short row, for search results, collections and a draw. */
export type PlaceRow = {
  slug: string;
  name: string;
  names: NameEntry[];
  category: { key: string; en: string; ja: string } | null;
  neighbourhood: { id: string; en: string; ja: string } | null;
  /** Someone has written a story here, shared a post, or the owner's page is published. */
  hasStory: boolean;
  confirmation: ReturnType<typeof confirmationOf>;
  demo?: typeof DEMO_LABEL;
  url: string;
};

export function placeRow(
  place: {
    slug: string;
    names: readonly PlaceNameLike[];
    category?: string;
    confirmedAt?: number;
    hasStory: boolean;
    isMock?: boolean;
  },
  neighbourhoodId: string | undefined,
  context: { region: RegionConfig; origin: string; language: UrlLanguage },
): PlaceRow {
  return {
    slug: place.slug,
    name: displayName(place, context.region),
    names: nameEntries(place, context.region),
    category: categoryLabel(context.region, place.category),
    neighbourhood: neighbourhoodLabel(context.region, neighbourhoodId),
    hasStory: place.hasStory,
    confirmation: confirmationOf(place.confirmedAt),
    ...(place.isMock ? { demo: DEMO_LABEL } : {}),
    url: placeUrl(context.origin, context.language, place.slug),
  };
}

/** A day as YYYY-MM-DD in the region's time. */
export function dayOf(ms: number, utcOffsetHours: number): string {
  return new Date(ms + utcOffsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** Looks a category up by key, English label or Japanese label. */
export function resolveCategory(
  region: Pick<RegionConfig, "categories">,
  text: string,
): string | null {
  const wanted = fold(text);
  for (const category of region.categories ?? []) {
    if (
      fold(category.key) === wanted ||
      Object.values(category.labels).some((label) => fold(label) === wanted)
    )
      return category.key;
  }
  return null;
}

/** Looks a neighbourhood up by id or by its English or Japanese name. */
export function resolveNeighbourhood(
  region: Pick<RegionConfig, "neighbourhoods">,
  text: string,
): string | null {
  const wanted = fold(text);
  if (wanted === "") return null;
  const all = region.neighbourhoods ?? [];
  const exact = all.find(
    (n) => fold(n.id) === wanted || Object.values(n.names).some((name) => fold(name) === wanted),
  );
  if (exact !== undefined) return exact.id;
  const partial = all.filter((n) =>
    Object.values(n.names).some((name) => fold(name).includes(wanted)),
  );
  return partial.length === 1 ? partial[0]!.id : null;
}
