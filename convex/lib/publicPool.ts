import { v, type Infer } from "convex/values";
import { MAP_PLACE_LIMIT } from "../../src/lib/domain/constants";
import { neighbourhoodAt } from "../../src/lib/region/neighbourhoods";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { publicStoriesAllowed } from "./access";
import { readHasPublishedPage, readMapNames, readMapPin } from "./mapCopies";
import { regionConfig } from "./region";
import { scriptValidator } from "./validators";
import { readablePlaces } from "./visibility";

export const nameView = v.object({
  lang: v.string(),
  script: scriptValidator,
  value: v.string(),
  isPrimary: v.boolean(),
});

export type Pin = { lat: number; lng: number };

/** A place the draws and walk mode may offer: real, on the public map, with a pin. */
export type PoolPlace = {
  id: Id<"place">;
  slug: string;
  category: string | undefined;
  names: Infer<typeof nameView>[];
  pin: Pin;
  confirmedAt: number | undefined;
  hasStory: boolean;
  neighbourhoodId: string | undefined;
};

/**
 * The places a signed-out visitor can see on the map, which are the only places a draw (or walk
 * mode) may offer. Demo (fictional) places are left out: a suggestion is for a real walk. A place a
 * steward took off the map is left out, as the map leaves it out. `hasStory` follows the map's dot
 * (places.listForMap). It reads no viewer, so everyone gets the same pool.
 */
export async function publicPool(ctx: QueryCtx, regionId: string): Promise<PoolPlace[]> {
  const region = regionConfig(regionId);
  const places = await readablePlaces(ctx, null, { regionId, limit: MAP_PLACE_LIMIT });
  const pool: PoolPlace[] = [];
  for (const place of places) {
    if (place.isMock || place.hiddenReason !== undefined) continue;
    const pin = place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id);
    if (pin === null) continue;
    pool.push({
      id: place._id,
      slug: place.slug,
      category: place.category,
      names: place.mapNames ?? (await readMapNames(ctx, place._id)),
      pin,
      confirmedAt: place.confirmedAt,
      hasStory:
        (publicStoriesAllowed(place) &&
          (place.hasPublishedPage ?? (await readHasPublishedPage(ctx, place._id)))) ||
        place.hasPeopleStories === true,
      neighbourhoodId: neighbourhoodAt(region, pin)?.id,
    });
  }
  return pool;
}
