import { v } from "convex/values";
import { checkState } from "../src/lib/domain/check-state";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { query, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace } from "./lib/access";
import { internalMutation } from "./lib/gate";
import { readMapNames, readMapPin, readNeighbourhood, writeMapCopies } from "./lib/mapCopies";
import { regionConfig } from "./lib/region";
import { scriptValidator } from "./lib/validators";
import { distanceMetres } from "../src/lib/overture/dedupe";

// Progress belongs to a neighbourhood. These count places a person has checked, read from each
// place's own row, and never look at who checked one, so no number here can become a person's score
// or a comparison between people (FR-015, principle I).

/**
 * Public places read per neighbourhood. The busiest holds about 300 today and a place row is about
 * 450 bytes, so forRegion, the largest read, stays under 8,000 documents and 4 MB at this cap.
 */
const PLACE_LIMIT = 1000;
const NEARBY_LIMIT = 3;

const names = v.record(v.string(), v.string());
const progress = { checked: v.number(), left: v.number() };

async function publicPlacesIn(ctx: QueryCtx, regionId: string, neighbourhoodId: string) {
  const places = await ctx.db
    .query("place")
    .withIndex("by_regionId_and_neighbourhood_and_visibility", (q) =>
      q.eq("regionId", regionId).eq("neighbourhood", neighbourhoodId).eq("visibility", "public"),
    )
    .take(PLACE_LIMIT);
  if (places.length >= PLACE_LIMIT) {
    console.warn(`missions: ${neighbourhoodId} in ${regionId} has over ${PLACE_LIMIT} places`);
  }
  return places.filter(isPubliclyReadablePlace);
}

/** A check past STALE_AFTER_MS no longer counts: someone needs to look again. */
const isChecked = (place: Doc<"place">, now: number) =>
  checkState(place.confirmedAt, now) === "confirmed";

function count(places: Doc<"place">[], now: number) {
  const checked = places.filter((place) => isChecked(place, now)).length;
  return { checked, left: places.length - checked };
}

/**
 * The neighbourhood a public place is in, how far along it is, and the nearest places still waiting
 * for someone. Null for anything else. `now` comes from the caller because a query may not read the
 * clock; a wrong one changes only what that caller sees. The answer is the same for every viewer.
 */
export const forPlace = query({
  args: { placeId: v.id("place"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.string(),
      names,
      ...progress,
      nearby: v.array(
        v.object({
          slug: v.string(),
          names: v.array(
            v.object({
              lang: v.string(),
              script: scriptValidator,
              value: v.string(),
              isPrimary: v.boolean(),
            }),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx, { placeId, now }) => {
    const place = await ctx.db.get("place", placeId);
    if (place === null || !isPubliclyReadablePlace(place) || place.visibility !== "public") {
      return null;
    }
    const neighbourhood = regionConfig(place.regionId).neighbourhoods?.find(
      ({ id }) => id === place.neighbourhood,
    );
    if (neighbourhood === undefined) return null;
    const places = await publicPlacesIn(ctx, place.regionId, neighbourhood.id);
    const pin = place.mapPin ?? neighbourhood.center;
    const nearest = places
      .flatMap((other) =>
        other._id === place._id || isChecked(other, now) || !other.mapPin
          ? []
          : [{ other, metres: distanceMetres(pin, other.mapPin) }],
      )
      .sort((a, b) => a.metres - b.metres)
      .slice(0, NEARBY_LIMIT);
    return {
      id: neighbourhood.id,
      names: neighbourhood.names,
      ...count(places, now),
      nearby: await Promise.all(
        nearest.map(async ({ other }) => ({
          slug: other.slug,
          names: other.mapNames ?? (await readMapNames(ctx, other._id)),
        })),
      ),
    };
  },
});

/** Every neighbourhood's progress, in the order the region lists them, for the map's side panel. */
export const forRegion = query({
  args: { regionId: v.string(), now: v.number() },
  returns: v.array(
    v.object({
      id: v.string(),
      names,
      center: v.object({ lat: v.number(), lng: v.number() }),
      radiusMetres: v.number(),
      ...progress,
    }),
  ),
  handler: async (ctx, { regionId, now }) => {
    const views = [];
    for (const neighbourhood of regionConfig(regionId).neighbourhoods ?? []) {
      views.push({
        id: neighbourhood.id,
        names: neighbourhood.names,
        center: neighbourhood.center,
        radiusMetres: neighbourhood.radiusMetres,
        ...count(await publicPlacesIn(ctx, regionId, neighbourhood.id), now),
      });
    }
    return views;
  },
});

/**
 * Copies each place's neighbourhood onto its row, one page of places at a time. Run once after
 * deploying: `npx convex run missions:backfillNeighbourhoods '{"cursor":null}'`. Safe to run again,
 * and to run after changing the region's neighbourhoods.
 */
export const backfillNeighbourhoods = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("place").paginate({ numItems: 200, cursor });
    for (const place of page.page) {
      const pin = place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id);
      await writeMapCopies(ctx.db, place._id, {
        neighbourhood: readNeighbourhood(place.regionId, pin),
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.missions.backfillNeighbourhoods, {
        cursor: page.continueCursor,
      });
    }
    return { processed: page.page.length, isDone: page.isDone };
  },
});
