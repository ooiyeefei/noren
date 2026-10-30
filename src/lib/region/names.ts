import type { Script } from "../domain/constants";
import type { RegionConfig } from "./schema";

export type PlaceNameLike = { lang: string; script: Script; value: string; isPrimary: boolean };

export function pickPlaceName<T extends PlaceNameLike>(
  names: readonly T[],
  locale: string,
  region: Pick<RegionConfig, "nameFallback" | "defaultLocale">,
): { primary: T | null; secondary: T | null } {
  const scripts = region.nameFallback[locale] ?? region.nameFallback[region.defaultLocale] ?? [];
  const rank = (name: T) => {
    const index = scripts.indexOf(name.script);
    return index === -1 ? scripts.length : index;
  };
  const ranked = names
    .map((name, index) => ({ name, index }))
    .sort(
      (a, b) =>
        rank(a.name) - rank(b.name) ||
        Number(b.name.lang === locale) - Number(a.name.lang === locale) ||
        Number(b.name.isPrimary) - Number(a.name.isPrimary) ||
        a.index - b.index,
    );
  const primary = ranked[0]?.name ?? null;
  const secondary =
    ranked.find(({ name }) => name.script !== primary?.script && name.value !== primary?.value)
      ?.name ?? null;
  return { primary, secondary };
}
