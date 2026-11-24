import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { neighbourhoodAt } from "../../src/lib/region/neighbourhoods";
import { getRegionConfig } from "../../src/lib/region/registry";
import { isPubliclyReadablePlace, isSharedPublicly, isStoryShown } from "./access";

export const MISSION_PLACE_LIMIT = 1000;

export function missionPlaces(ctx: Pick<QueryCtx, "db">, regionId: string, neighbourhood: string) {
  return ctx.db
    .query("place")
    .withIndex("by_regionId_and_neighbourhood_and_visibility", (q) =>
      q.eq("regionId", regionId).eq("neighbourhood", neighbourhood).eq("visibility", "public"),
    );
}

export function missionProgress(
  ctx: Pick<QueryCtx, "db">,
  regionId: string,
  neighbourhood: string,
) {
  return ctx.db
    .query("neighbourhoodProgress")
    .withIndex("by_regionId_and_neighbourhood", (q) =>
      q.eq("regionId", regionId).eq("neighbourhood", neighbourhood),
    )
    .unique();
}

const missionPlace = (place: Doc<"place"> | null) =>
  place?.visibility === "public" &&
  isPubliclyReadablePlace(place) &&
  place.neighbourhood !== undefined
    ? {
        regionId: place.regionId,
        neighbourhood: place.neighbourhood,
        confirmedAt: place.confirmedAt,
      }
    : null;

const sameMission = (a: ReturnType<typeof missionPlace>, b: ReturnType<typeof missionPlace>) =>
  a?.regionId === b?.regionId && a?.neighbourhood === b?.neighbourhood;

async function updateMissionProgress(
  ctx: Pick<MutationCtx, "db">,
  before: Doc<"place"> | null,
  after: Doc<"place"> | null,
) {
  const was = missionPlace(before);
  const now = missionPlace(after);
  if (sameMission(was, now) && was?.confirmedAt === now?.confirmedAt) return;

  const update = async (key: NonNullable<typeof was>, remove: boolean, add: boolean) => {
    const row = await missionProgress(ctx, key.regionId, key.neighbourhood);
    // Missing rows use the original read until backfill. Big neighbourhoods keep its capped order.
    if (row === null || row.total > MISSION_PLACE_LIMIT) return;
    const total = row.total + Number(add) - Number(remove);
    const confirmedAt = [...row.confirmedAt];
    if (remove && was?.confirmedAt !== undefined) {
      const index = confirmedAt.indexOf(was.confirmedAt);
      if (index >= 0) confirmedAt.splice(index, 1);
    }
    if (add && now?.confirmedAt !== undefined) confirmedAt.push(now.confirmedAt);
    await ctx.db.patch("neighbourhoodProgress", row._id, {
      total,
      confirmedAt: total > MISSION_PLACE_LIMIT ? [] : confirmedAt,
    });
  };
  if (was !== null) await update(was, true, sameMission(was, now));
  if (now !== null && !sameMission(was, now)) await update(now, false, true);
}

function drawPlace(place: Doc<"place"> | null) {
  if (
    place?.visibility !== "public" ||
    !isPubliclyReadablePlace(place) ||
    place.hiddenReason !== undefined
  )
    return null;
  return place;
}

/** Only changes to membership or draw weights invalidate the day's pool. */
async function invalidateOmikujiPool(
  ctx: Pick<MutationCtx, "db">,
  before: Doc<"place"> | null,
  after: Doc<"place"> | null,
) {
  const was = drawPlace(before);
  const now = drawPlace(after);
  if (
    was?.regionId === now?.regionId &&
    was?.mapPin?.lat === now?.mapPin?.lat &&
    was?.mapPin?.lng === now?.mapPin?.lng &&
    (was?.mapPin === null) === (now?.mapPin === null) &&
    was?.hasPublishedPage === now?.hasPublishedPage &&
    was?.hasPeopleStories === now?.hasPeopleStories
  )
    return;
  const regions = new Set([was?.regionId, now?.regionId]);
  for (const regionId of regions) {
    if (regionId === undefined) continue;
    const pool = await ctx.db
      .query("omikujiPool")
      .withIndex("by_regionId_and_day", (q) => q.eq("regionId", regionId))
      .unique();
    if (pool !== null) await ctx.db.delete("omikujiPool", pool._id);
  }
}

export async function syncPlaceCopies(
  db: MutationCtx["db"],
  before: Doc<"place"> | null,
  after: Doc<"place"> | null,
) {
  await updateMissionProgress({ db }, before, after);
  await invalidateOmikujiPool({ db }, before, after);
}

export type MapCopies = Required<
  Pick<Doc<"place">, "mapNames" | "mapPin" | "hasPublishedPage" | "hasPeopleStories">
> & { neighbourhood: string | undefined };

/** The neighbourhood a pin falls in. Undefined clears the copy, as for a place with no pin. */
export function readNeighbourhood(
  regionId: string,
  pin: { lat: number; lng: number } | null,
): string | undefined {
  return pin === null ? undefined : neighbourhoodAt(getRegionConfig(regionId), pin)?.id;
}

export async function readMapNames(ctx: QueryCtx, placeId: Id<"place">) {
  const names = await ctx.db
    .query("placeName")
    .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
    .take(12);
  return names.map(({ lang, script, value, isPrimary }) => ({ lang, script, value, isPrimary }));
}

export async function readMapPin(ctx: QueryCtx, placeId: Id<"place">) {
  const pin = await ctx.db
    .query("pin")
    .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
    .unique();
  return pin === null ? null : { lat: pin.lat, lng: pin.lng };
}

export async function readHasPublishedPage(ctx: QueryCtx, placeId: Id<"place">) {
  const page = await ctx.db
    .query("pageVersion")
    .withIndex("by_placeId_and_status_and_version", (q) =>
      q.eq("placeId", placeId).eq("status", "published"),
    )
    .first();
  return page !== null;
}

/** Whether a story a member wrote, or a post a member shared, shows to everyone here (FR-033). */
export async function readHasPeopleStories(ctx: QueryCtx, placeId: Id<"place">) {
  const place = await ctx.db.get("place", placeId);
  if (place === null) return false;
  const stories = await ctx.db
    .query("story")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
    .take(50);
  if (stories.some((story) => isStoryShown(place, story))) return true;
  const sources = await ctx.db
    .query("source")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
    .take(50);
  return sources.some((source) => isSharedPublicly(place, source));
}

/**
 * Writes the copies that differ from what the place row holds; a deleted place is left alone.
 * Triggers pass their unwrapped `innerDb`: no place rule reads a copy, so writing one cannot break
 * a rule, and a row stored before a rule existed must not block its names or pin from changing.
 */
export async function writeMapCopies(
  db: MutationCtx["db"],
  placeId: Id<"place">,
  copies: Partial<MapCopies>,
  syncRawPlace = false,
): Promise<void> {
  const place = await db.get("place", placeId);
  if (place === null) return;
  const changed = Object.fromEntries(
    Object.entries(copies).filter(
      ([key, value]) => JSON.stringify(place[key as keyof MapCopies]) !== JSON.stringify(value),
    ),
  );
  if (Object.keys(changed).length === 0) return;
  await db.patch("place", placeId, changed);
  if (syncRawPlace) await syncPlaceCopies(db, place, { ...place, ...copies });
}

/** Through the gated `ctx.db`, so a backfill stops loudly at a row that breaks a place rule. */
export async function refreshMapCopies(ctx: MutationCtx, placeId: Id<"place">): Promise<void> {
  const place = await ctx.db.get("place", placeId);
  if (place === null) return;
  const mapPin = await readMapPin(ctx, placeId);
  await writeMapCopies(ctx.db, placeId, {
    mapNames: await readMapNames(ctx, placeId),
    mapPin,
    neighbourhood: readNeighbourhood(place.regionId, mapPin),
    hasPublishedPage: await readHasPublishedPage(ctx, placeId),
    hasPeopleStories: await readHasPeopleStories(ctx, placeId),
  });
}
