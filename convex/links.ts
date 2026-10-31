import { v } from "convex/values";
import { SHARED_POSTS_LISTED } from "../src/lib/domain/constants";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { countsVisits, isSourceShownToEveryone } from "./lib/access";
import { requirePerson } from "./lib/auth";
import { mutation } from "./lib/gate";
import { readMapNames } from "./lib/mapCopies";
import { scriptValidator } from "./lib/validators";

/**
 * A member's totals cover the past year and the last 30 days. A post has at most one row a day, so
 * the year's rows for every listed post stay well inside a query's read limit.
 */
const YEAR_DAYS = 365;
const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Counts are kept per calendar day in UTC, which needs no region setting. */
export function countDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Where a link out of Noren goes: the original of a platform post everyone may see; otherwise
 * nowhere. The caller is never known, so nothing a signed-in member alone may see is sent on.
 */
async function destination(ctx: QueryCtx, sourceId: string) {
  const id = ctx.db.normalizeId("source", sourceId);
  if (id === null) return null;
  const source = await ctx.db.get("source", id);
  if (source === null) return null;
  const place = await ctx.db.get("place", source.placeId);
  if (place === null || !countsVisits(place, source)) return null;
  return source;
}

/** For a crawler or a prefetch: where the link goes, without counting it (FR-024). */
export const peek = query({
  args: { sourceId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { sourceId }) => (await destination(ctx, sourceId))?.canonicalUrl ?? null,
});

/**
 * A visitor followed a shared post's link to its original (FR-024): adds one to the post's total for
 * the day and says where to send them. Nothing about the visitor is stored; a demo account's post
 * keeps its demo tag on the count so statistics can leave it out (FR-022).
 */
export const follow = mutation({
  args: { sourceId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { sourceId }) => {
    const source = await destination(ctx, sourceId);
    if (source === null) return null;
    const day = countDay(Date.now());
    const row = await ctx.db
      .query("linkCountDaily")
      .withIndex("by_sourceId_and_day", (q) => q.eq("sourceId", source._id).eq("day", day))
      .unique();
    if (row === null)
      await ctx.db.insert("linkCountDaily", {
        sourceId: source._id,
        day,
        count: 1,
        isMock: source.isMock,
      });
    else await ctx.db.patch("linkCountDaily", row._id, { count: row.count + 1 });
    return source.canonicalUrl;
  },
});

const sharedPost = v.object({
  sourceId: v.id("source"),
  placeSlug: v.string(),
  placeNames: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  platform: v.string(),
  note: v.optional(v.string()),
  noteLang: v.optional(v.string()),
  title: v.optional(v.string()),
  status: v.string(),
  shownToEveryone: v.boolean(),
  /** Whether its link goes through /out; a web page is linked to directly and never counted. */
  countsVisits: v.boolean(),
  /** Visits Noren sent to the original in the past year and in the last 30 days. Totals only. */
  visits: v.number(),
  recentVisits: v.number(),
  addedAt: v.number(),
});

/** The first day of a window of `days` days ending today. */
const windowStart = (now: number, days: number) => countDay(now - (days - 1) * DAY_MS);

async function visitsTo(ctx: QueryCtx, sourceId: Id<"source">, now: number) {
  const recent = windowStart(now, RECENT_DAYS);
  const rows = await ctx.db
    .query("linkCountDaily")
    .withIndex("by_sourceId_and_day", (q) =>
      q.eq("sourceId", sourceId).gte("day", windowStart(now, YEAR_DAYS)),
    )
    .take(YEAR_DAYS);
  return {
    visits: rows.reduce((sum, row) => sum + row.count, 0),
    recentVisits: rows.filter((row) => row.day >= recent).reduce((sum, row) => sum + row.count, 0),
  };
}

/**
 * The member's newest linked posts, with the visits Noren sent to each original. Only the member
 * who linked a post sees its totals; they are never ranked or shown to others (Principle I).
 */
export const mine = query({
  args: {},
  returns: v.array(sharedPost),
  handler: async (ctx) => {
    const person = await requirePerson(ctx);
    const sources = await ctx.db
      .query("source")
      .withIndex("by_addedBy", (q) => q.eq("addedBy", person._id))
      .order("desc")
      .take(SHARED_POSTS_LISTED);
    const now = Date.now();
    const posts = [];
    for (const source of sources) {
      const place = await ctx.db.get("place", source.placeId);
      if (place === null) continue;
      posts.push({
        sourceId: source._id,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        platform: source.platform,
        note: source.creatorNote,
        noteLang: source.noteLang,
        title: source.title,
        status: source.status,
        shownToEveryone: isSourceShownToEveryone(place, source),
        countsVisits: countsVisits(place, source),
        ...(await visitsTo(ctx, source._id, now)),
        addedAt: source._creationTime,
      });
    }
    return posts;
  },
});
