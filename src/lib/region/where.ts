import type { RegionConfig } from "./schema";
import { townOf } from "./neighbourhoods";

type Pin = { lat: number; lng: number };
type Locale = "en" | "ja";

/** What a place page needs to say where a place is: its own region's towns and names. */
export type WhereRegion = {
  towns?: RegionConfig["towns"];
  /** The region's name in each language it has one. */
  regionNames?: RegionConfig["name"];
  /** The region's name in the reader's language, for a caller that was given only that. */
  regionName?: string;
};

/**
 * The town a place is in, in the reader's language: the nearest of its region's towns whose circle
 * holds the pin, else the region's own name. English stands in where a name has no Japanese.
 */
export function townFor(region: WhereRegion, pin: Pin | null | undefined, locale: Locale): string {
  const names = region.regionNames ?? (region.regionName ? { en: region.regionName } : {});
  const town = townOf({ towns: region.towns, name: names }, pin);
  return locale === "ja" ? town.ja : town.en;
}
