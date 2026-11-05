import { v } from "convex/values";
import { dayToTime } from "../src/lib/collection/reach";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { currentPerson, requirePerson } from "./lib/auth";
import { readMapNames } from "./lib/mapCopies";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

// A person's stamps are worked out from what they already did, so there is no table to keep in step.
// The book belongs to its owner alone and has no total: nothing here takes a person as an argument
// or returns a count, so it cannot become a score or a comparison (FR-015, principle I).

/**
 * Rows read from each of the three activity tables, newest first. Past this a person's oldest rows go unread:
 * a new stamp still appears, and an old one may show a later date.
 */
const ROW_LIMIT = 500;
/** The newest stamps a book shows. Each costs a place read and at most two more lookups. */
const STAMP_LIMIT = 300;

const stampView = v.object({
  placeId: v.id("place"),
  slug: v.string(),
  names: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  stampedAt: v.number(),
});

/**
 * Each place the person said "Still here" about, shared a story or link about or checked in at, with
 * the earliest time they did. A check-in keeps only its date, so it counts from midnight of that day. Something they or a steward took down no longer earns a stamp, and a post the story
 * finder found is not the steward's own (its origin is set), so it never does.
 */
async function earliestByPlace(ctx: QueryCtx, person: Doc<"person">) {
  const earliest = new Map<Id<"place">, number>();
  const note = (placeId: Id<"place">, at: number) => {
    const seen = earliest.get(placeId);
    if (seen === undefined || at < seen) earliest.set(placeId, at);
  };
  const checks = await ctx.db
    .query("placeCheck")
    .withIndex("by_personId_and_verdict", (q) =>
      q.eq("personId", person._id).eq("verdict", "still_here"),
    )
    .order("desc")
    .take(ROW_LIMIT);
  for (const check of checks) note(check.placeId, check._creationTime);
  const stories = await ctx.db
    .query("story")
    .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", person._id))
    .order("desc")
    .take(ROW_LIMIT);
  for (const story of stories)
    if (story.status === "live") note(story.placeId, story._creationTime);
  const sources = await ctx.db
    .query("source")
    .withIndex("by_addedBy_and_origin", (q) => q.eq("addedBy", person._id).eq("origin", undefined))
    .order("desc")
    .take(ROW_LIMIT);
  for (const source of sources)
    if (source.status !== "hidden") note(source.placeId, source._creationTime);
  const collection = await ctx.db
    .query("personCollection")
    .withIndex("by_personId", (q) => q.eq("personId", person._id))
    .unique();
  for (const visit of collection?.visits ?? []) note(visit.placeId, dayToTime(visit.day));
  return earliest;
}

/** The caller's own stamps, newest first. A place they can no longer read drops out. */
export const mine = query({
  args: {},
  returns: v.array(stampView),
  handler: async (ctx) => {
    const person = await requirePerson(ctx);
    const newestFirst = [...(await earliestByPlace(ctx, person))]
      .sort(([, a], [, b]) => b - a)
      .slice(0, STAMP_LIMIT);
    const stamps = [];
    for (const [placeId, stampedAt] of newestFirst) {
      const place = await ctx.db.get("place", placeId);
      if (place === null || !(await canReadPlace(ctx, person, place))) continue;
      stamps.push({
        placeId,
        slug: place.slug,
        names: place.mapNames ?? (await readMapNames(ctx, placeId)),
        stampedAt,
      });
    }
    return stamps;
  },
});

/** Whether the caller holds this place's stamp, and since when. Null for anyone signed out. */
export const forPlace = query({
  args: { placeId: v.id("place") },
  returns: v.union(v.object({ stampedAt: v.number() }), v.null()),
  handler: async (ctx, { placeId }) => {
    const person = await currentPerson(ctx);
    if (person === null) return null;
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, person, place))) return null;
    const stampedAt = (await earliestByPlace(ctx, person)).get(placeId);
    return stampedAt === undefined ? null : { stampedAt };
  },
});
