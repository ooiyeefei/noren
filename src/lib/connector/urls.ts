/** Noren's public address. Every link the connector returns starts here. */
export const NOREN_ORIGIN = "https://noren.yooi.me";

export type UrlLanguage = "en" | "ja";

/** The page for a place, as a visitor opens it. The slug is the one the place page route uses. */
export function placeUrl(origin: string, language: UrlLanguage, slug: string): string {
  return `${origin}/${language}/places/${encodeURIComponent(slug)}`;
}

/** The same page, opened on the story form (the place page's `?tab=stories&write=1`). */
export function writeStoryUrl(origin: string, language: UrlLanguage, slug: string): string {
  return `${placeUrl(origin, language, slug)}?tab=stories&write=1`;
}

/** A neighbourhood's stamp set page. */
export function collectionUrl(
  origin: string,
  language: UrlLanguage,
  neighbourhoodId: string,
): string {
  return `${origin}/${language}/collection/${encodeURIComponent(neighbourhoodId)}`;
}
