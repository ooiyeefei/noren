import { v } from "convex/values";
import { checkState } from "../src/lib/domain/check-state";
import { getRegionConfig } from "../src/lib/region/registry";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { query, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace } from "./lib/access";
import { internalMutation } from "./lib/gate";
import {
  MISSION_PLACE_LIMIT,
  missionPlaces,
  missionProgress,
  readMapNames,
  readMapPin,
  readNeighbourhood,
  writeMapCopies,
} from "./lib/mapCopies";
import { isRegionOn, regionConfig } from "./lib/region";
import { scriptValidator } from "./lib/validators";
import { distanceMetres } from "../src/lib/overture/dedupe";

// Progress belongs to a neighbourhood and never looks at who checked a place (FR-015, principle I).
const NEARBY_LIMIT = 3;

const names = v.record(v.string(), v.string());
const progress = { checked: v.number(), left: v.number() };

async function publicPlacesIn(ctx: QueryCtx, regionId: string, neighbourhoodId: string) {
  const places = await missionPlaces(ctx, regionId, neighbourhoodId).take(MISSION_PLACE_LIMIT);
  if (places.length >= MISSION_PLACE_LIMIT) {
    console.warn(
      `missions: ${neighbourhoodId} in ${regionId} has over ${MISSION_PLACE_LIMIT} places`,
    );
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
    if (
      place === null ||
      !isRegionOn(place.regionId) ||
      !isPubliclyReadablePlace(place) ||
      place.visibility !== "public"
    ) {
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
    if (!isRegionOn(regionId)) return [];
    const neighbourhoods = regionConfig(regionId).neighbourhoods ?? [];
    if (neighbourhoods.length === 0) return [];
    const counts = new Map(
      (
        await ctx.db
          .query("neighbourhoodProgress")
          .withIndex("by_regionId_and_neighbourhood", (q) => q.eq("regionId", regionId))
          .take(neighbourhoods.length)
      ).map((row) => [row.neighbourhood, row]),
    );
    const views = [];
    for (const neighbourhood of neighbourhoods) {
      const row = counts.get(neighbourhood.id);
      let totals;
      if (row !== undefined && row.total <= MISSION_PLACE_LIMIT) {
        const checked = row.confirmedAt.filter((at) => checkState(at, now) === "confirmed").length;
        totals = { checked, left: row.total - checked };
      } else {
        totals = count(await publicPlacesIn(ctx, regionId, neighbourhood.id), now);
      }
      views.push({
        id: neighbourhood.id,
        names: neighbourhood.names,
        center: neighbourhood.center,
        radiusMetres: neighbourhood.radiusMetres,
        ...totals,
      });
    }
    return views;
  },
});

/** Backfills progress by paging places and scheduling each neighbourhood as a bounded transaction. */
export const backfillProgress = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ processed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("place").paginate({ numItems: 200, cursor });
    const regions = new Set(page.page.map(({ regionId }) => regionId));
    for (const regionId of regions) {
      for (const { id: neighbourhood } of getRegionConfig(regionId)?.neighbourhoods ?? []) {
        if ((await missionProgress(ctx, regionId, neighbourhood)) === null) {
          await ctx.scheduler.runAfter(0, internal.missions.seedProgress, {
            regionId,
            neighbourhood,
          });
        }
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.missions.backfillProgress, {
        cursor: page.continueCursor,
      });
    }
    return { processed: page.page.length, isDone: page.isDone };
  },
});

export const seedProgress = internalMutation({
  args: { regionId: v.string(), neighbourhood: v.string() },
  returns: v.null(),
  handler: async (ctx, { regionId, neighbourhood }) => {
    const existing = await missionProgress(ctx, regionId, neighbourhood);
    if (existing !== null) return null;
    const places = await missionPlaces(ctx, regionId, neighbourhood).take(MISSION_PLACE_LIMIT + 1);
    const overflow = places.length > MISSION_PLACE_LIMIT;
    const real = places.filter(isPubliclyReadablePlace);
    await ctx.db.insert("neighbourhoodProgress", {
      regionId,
      neighbourhood,
      total: overflow ? places.length : real.length,
      confirmedAt: overflow
        ? []
        : real.flatMap(({ confirmedAt }) => (confirmedAt === undefined ? [] : [confirmedAt])),
    });
    return null;
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
