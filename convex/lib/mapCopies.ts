import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isSharedPublicly, isStoryShown } from "./access";

export type MapCopies = Required<
  Pick<Doc<"place">, "mapNames" | "mapPin" | "hasPublishedPage" | "hasPeopleStories">
>;

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
): Promise<void> {
  const place = await db.get("place", placeId);
  if (place === null) return;
  const changed = Object.fromEntries(
    Object.entries(copies).filter(
      ([key, value]) => JSON.stringify(place[key as keyof MapCopies]) !== JSON.stringify(value),
    ),
  );
  if (Object.keys(changed).length > 0) await db.patch("place", placeId, changed);
}

/** Through the gated `ctx.db`, so a backfill stops loudly at a row that breaks a place rule. */
export async function refreshMapCopies(ctx: MutationCtx, placeId: Id<"place">): Promise<void> {
  await writeMapCopies(ctx.db, placeId, {
    mapNames: await readMapNames(ctx, placeId),
    mapPin: await readMapPin(ctx, placeId),
    hasPublishedPage: await readHasPublishedPage(ctx, placeId),
    hasPeopleStories: await readHasPeopleStories(ctx, placeId),
  });
}
