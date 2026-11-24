import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { displayName } from "../connector/present";
import type { RegionConfig } from "../region/schema";

export type StoriedPlace = { slug: string; name: string };

/**
 * The real, public places somebody has told a story about, read as a signed-out visitor. These are
 * the place pages worth sending a search engine to; a listing with no story is left out.
 */
export async function regionPlaces(region: RegionConfig): Promise<StoriedPlace[]> {
  const places = await fetchQuery(api.places.listForMap, { regionId: region.id });
  return places
    .filter((place) => place.hasStory && !place.isMock && place.visibility === "public")
    .map((place) => ({ slug: place.slug, name: displayName(place, region) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function storiedPlaces(regions: readonly RegionConfig[]): Promise<StoriedPlace[]> {
  return (await Promise.all(regions.map(regionPlaces)))
    .flat()
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
