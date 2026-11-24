import { v, type Infer } from "convex/values";
import { MAP_PLACE_LIMIT } from "../../src/lib/domain/constants";
import { neighbourhoodAt } from "../../src/lib/region/neighbourhoods";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPubliclyReadablePlace, publicStoriesAllowed } from "./access";
import { readHasPublishedPage, readMapNames, readMapPin } from "./mapCopies";
import type { RegionConfig } from "../../src/lib/region/schema";
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

type DrawPlace = Pick<PoolPlace, "id" | "pin" | "hasStory"> & { neighbourhoodId?: string };

/** The bounded pool needed to choose a slip, without reading display names for every place. */
export async function publicDrawPool(ctx: QueryCtx, region: RegionConfig): Promise<DrawPlace[]> {
  const places = await readablePlaces(ctx, null, { regionId: region.id, limit: MAP_PLACE_LIMIT });
  const pool: DrawPlace[] = [];
  for (const place of places) {
    const fields = await drawFields(ctx, region, place);
    if (fields !== null) pool.push(fields);
  }
  return pool;
}

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
    const poolPlace = await toPoolPlace(ctx, region, place);
    if (poolPlace !== null) pool.push(poolPlace);
  }
  return pool;
}

/**
 * The one rule for a single place: real (not demo), not taken off the map, readable by a signed-out
 * visitor. The pool and the check that a question may be carried to a place both use it.
 */
export function isPublicRealPlace(place: Doc<"place">): boolean {
  return !place.isMock && place.hiddenReason === undefined && isPubliclyReadablePlace(place);
}

/** A place's pin as the map reads it (the copy, else the pin row); null when it has none. */
export async function pinOf(ctx: QueryCtx, place: Doc<"place">): Promise<Pin | null> {
  return place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id);
}

/** The place as the pool offers it, or null when it is not a public real place with a pin. */
export async function toPoolPlace(
  ctx: QueryCtx,
  region: RegionConfig,
  place: Doc<"place">,
): Promise<PoolPlace | null> {
  const fields = await drawFields(ctx, region, place);
  if (fields === null) return null;
  return {
    ...fields,
    neighbourhoodId: fields.neighbourhoodId,
    slug: place.slug,
    category: place.category,
    names: place.mapNames ?? (await readMapNames(ctx, place._id)),
    confirmedAt: place.confirmedAt,
  };
}

async function drawFields(
  ctx: QueryCtx,
  region: RegionConfig,
  place: Doc<"place">,
): Promise<DrawPlace | null> {
  if (!isPublicRealPlace(place)) return null;
  const pin = await pinOf(ctx, place);
  if (pin === null) return null;
  const neighbourhoodId = neighbourhoodAt(region, pin)?.id;
  return {
    id: place._id,
    pin,
    hasStory:
      (publicStoriesAllowed(place) &&
        (place.hasPublishedPage ?? (await readHasPublishedPage(ctx, place._id)))) ||
      place.hasPeopleStories === true,
    ...(neighbourhoodId === undefined ? {} : { neighbourhoodId }),
  };
}
