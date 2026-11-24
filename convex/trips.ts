import { v } from "convex/values";
import { aiConfig } from "../src/lib/ai/config";
import { isoWeekKey, previousWeekKey } from "../src/lib/draw";
import { MAP_PLACE_LIMIT } from "../src/lib/domain/constants";
import { cellsAround } from "../src/lib/geo/geohash";
import { distanceMetres } from "../src/lib/overture/dedupe";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { isPublicSafeClaim, publicStoriesAllowed } from "./lib/access";
import { currentPerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation } from "./lib/gate";
import { readHasPublishedPage } from "./lib/mapCopies";
import { isPublicRealPlace, pinOf } from "./lib/publicPool";
import { consumeRateLimit } from "./lib/rateLimit";
import { enabledRegionIds, regionConfig, tripSwitch } from "./lib/region";
import { readTripStops, tripFactsFor, tripStopDetails } from "./lib/tripStops";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const limits = { plan: [30, 300], interpret: [5, 40] } as const;

export function canOpenTrips(person: Pick<Doc<"person">, "trials">, mode = tripSwitch()): boolean {
  return mode === "open" || (mode === "trial" && person.trials?.includes("trip") === true);
}

export async function requireTrip(ctx: QueryCtx): Promise<Doc<"person">> {
  const mode = tripSwitch();
  if (mode === "off") throw appError("not_found", "Not found");
  const person = await currentPerson(ctx);
  if (person === null && mode === "open") throw appError("unauthenticated", "sign in to continue");
  if (person === null || !canOpenTrips(person, mode)) throw appError("not_found", "Not found");
  return person;
}

export const begin = internalMutation({
  args: { kind: v.union(v.literal("plan"), v.literal("interpret")) },
  returns: v.null(),
  handler: async (ctx, { kind }) => {
    const person = await requireTrip(ctx);
    if (kind === "interpret" && !aiConfig("plan", process.env).ok) {
      throw appError("conflict", "trip interpretation is unavailable");
    }
    const now = Date.now();
    const [minute, day] = limits[kind];
    for (const [window, limit, windowMs] of [
      ["minute", minute, MINUTE_MS],
      ["day", day, DAY_MS],
    ] as const) {
      const result = await consumeRateLimit(ctx, {
        key: `trip:${kind}:${window}:${person._id}`,
        limit,
        windowMs,
        now,
      });
      if (!result.ok) throw appError("rate_limited", "too many trip requests just now");
    }
    return null;
  },
});

const CANDIDATES_PER_ANCHOR = 400;
const CANDIDATES_PER_QUERY = 50;

const coordinates = v.object({ lat: v.number(), lng: v.number() });
const anchorValidator = v.object({ near: coordinates, withinMetres: v.number() });
const candidateDetails = v.object({
  placeId: v.id("place"),
  slug: v.string(),
  category: v.optional(v.string()),
  pin: coordinates,
  confirmed: v.boolean(),
  hasStory: v.boolean(),
  cautions: v.array(v.string()),
  facts: v.array(
    v.object({
      key: v.string(),
      value: v.union(v.literal("yes"), v.literal("no")),
      basis: v.union(v.literal("member"), v.literal("post")),
      day: v.string(),
      factId: v.string(),
    }),
  ),
});

const exposureRow = v.object({ placeId: v.id("place"), count: v.number() });

export const candidateExposure = internalQuery({
  args: { regionId: v.string(), now: v.number() },
  returns: v.object({ thisWeek: v.array(exposureRow), lastWeek: v.array(exposureRow) }),
  handler: async (ctx, { regionId, now }) => {
    const offsetHours = regionConfig(regionId).collection.utcOffsetHours;
    const read = async (week: string) => {
      const rows = await ctx.db
        .query("placeExposure")
        .withIndex("by_weekKey_and_placeId", (q) => q.eq("weekKey", week))
        .take(MAP_PLACE_LIMIT);
      return rows.map(({ placeId, count }) => ({ placeId, count }));
    };
    const [thisWeek, lastWeek] = await Promise.all([
      read(isoWeekKey(now, offsetHours)),
      read(previousWeekKey(now, offsetHours)),
    ]);
    return { thisWeek, lastWeek };
  },
});

// Match the public caution checks in the connector. The trip lane cannot change that module.
async function cautionsFor(ctx: QueryCtx, place: Doc<"place">): Promise<string[]> {
  const claims = await ctx.db
    .query("claim")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "published"))
    .take(50);
  return claims.flatMap((claim) =>
    claim.kind === "caution" &&
    claim.origin !== "open_text" &&
    claim.confirmedAt !== undefined &&
    claim.cautionType !== undefined &&
    isPublicSafeClaim(claim, place)
      ? [claim.cautionType]
      : [],
  );
}

/** Find one anchor's nearby public places before loading their reports in separate queries. */
export const candidatePlaces = internalQuery({
  args: { regionId: v.string(), anchor: anchorValidator },
  returns: v.array(v.id("place")),
  handler: async (ctx, { regionId, anchor: { near, withinMetres } }) => {
    if (
      !Number.isFinite(near.lat) ||
      Math.abs(near.lat) > 90 ||
      !Number.isFinite(near.lng) ||
      Math.abs(near.lng) > 180 ||
      !Number.isFinite(withinMetres) ||
      withinMetres < 0 ||
      withinMetres > 100_000
    )
      throw appError("invalid_input", "invalid trip anchor");
    if (!enabledRegionIds().includes(regionId)) return [];

    const ids: Id<"place">[] = [];
    for (const cell of cellsAround(near, withinMetres)) {
      const places = ctx.db
        .query("place")
        .withIndex("by_visibility_and_mapCell", (q) =>
          q.eq("visibility", "public").eq("mapCell", cell),
        );
      for await (const place of places) {
        if (place.regionId !== regionId || !isPublicRealPlace(place)) continue;
        const pin = await pinOf(ctx, place);
        if (pin === null || distanceMetres(near, pin) > withinMetres) continue;
        ids.push(place._id);
        if (ids.length === CANDIDATES_PER_ANCHOR) return ids;
      }
    }
    return ids;
  },
});

export const candidates = internalQuery({
  args: { regionId: v.string(), placeIds: v.array(v.id("place")) },
  returns: v.array(candidateDetails),
  handler: async (ctx, { regionId, placeIds }) => {
    if (placeIds.length > CANDIDATES_PER_QUERY)
      throw appError("invalid_input", "too many trip candidate places");
    if (!enabledRegionIds().includes(regionId)) return [];

    const result = [];
    for (const id of placeIds) {
      const place = await ctx.db.get("place", id);
      if (place === null || place.regionId !== regionId || !isPublicRealPlace(place)) continue;
      const pin = await pinOf(ctx, place);
      if (pin === null) continue;
      const ownerClaimsVisible = publicStoriesAllowed(place);
      result.push({
        placeId: place._id,
        slug: place.slug,
        category: place.category,
        pin,
        confirmed: place.confirmedAt !== undefined,
        hasStory:
          place.hasPeopleStories === true ||
          (ownerClaimsVisible &&
            (place.hasPublishedPage ?? (await readHasPublishedPage(ctx, place._id)))),
        cautions: ownerClaimsVisible ? await cautionsFor(ctx, place) : [],
        facts: (await tripFactsFor(ctx, place)).map(({ key, value, basis, day, factId }) => ({
          key,
          value,
          basis,
          day,
          factId,
        })),
      });
    }
    return result;
  },
});

export const stopDetails = internalQuery({
  args: { placeIds: v.array(v.string()) },
  returns: v.array(v.union(tripStopDetails, v.null())),
  handler: async (ctx, { placeIds }) => readTripStops(ctx, placeIds),
});

export const stops = query({
  args: { placeIds: v.array(v.string()) },
  returns: v.array(v.union(tripStopDetails, v.null())),
  handler: async (ctx, { placeIds }) => {
    await requireTrip(ctx);
    return readTripStops(ctx, placeIds);
  },
});
