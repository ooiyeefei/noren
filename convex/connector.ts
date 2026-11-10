import { v, type Infer } from "convex/values";
import { MAP_PLACE_LIMIT } from "../src/lib/domain/constants";
import {
  ADVENTUROUSNESS,
  chooseOmikuji,
  drawStops,
  interestsFor,
  isoWeekKey,
  isoWeekday,
  legsOf,
  localDay,
  needsCautions,
  omikujiSeed,
  orderAsWalk,
  passesAvoid,
  previousWeekKey,
  recentSuggestions,
  resolveAvoid,
  withoutCautionRules,
  resolveInterests,
  WALK_RADIUS_METRES,
  type Rng,
} from "../src/lib/draw";
import { distanceMetres } from "../src/lib/overture/dedupe";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { type MutationCtx } from "./_generated/server";
import { isPublicSafeClaim, publicStoriesAllowed } from "./lib/access";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { consumeRateLimit } from "./lib/rateLimit";
import { nameView, publicPool, type Pin, type PoolPlace } from "./lib/publicPool";
import { regionConfig, regionPolicy } from "./lib/region";

// The draws behind the connector's suggest_walk and draw_omikuji tools.
//
// Each draw is one mutation, so the exposure ledger is written in the same transaction that returns
// the stops. There is no function that adds to the ledger on its own: the only way to move a
// count is to ask for a draw and be given those stops. A global rate limit bounds how often anyone
// can ask, and the limit keys hold no person, device or address.
//
// The functions are public because the connector runs outside Convex, but they read only what any
// signed-out visitor can read (readablePlaces with no viewer) and take no coordinates: a start is
// a neighbourhood or a place, and the pin comes from Noren's own data (privacy notice: a person's
// location is never sent to Noren).

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Draws allowed across everyone, per minute and per hour. A walk is cheap; a flood is not. */
const DRAWS_PER_MINUTE = 60;
const DRAWS_PER_HOUR = 1000;
/** Weeks of the ledger kept. The draw reads two; the rest is only history. */
const LEDGER_WEEKS_KEPT = 8;
const PRUNE_BATCH = 200;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 40;
const MAX_STOPS = 5;
/** Published cautions read for one place when a rule asks for them; a place has a handful. */
const CAUTIONS_READ = 50;

/** What a draw says about a place it picked. No weight, score or rank is ever in here. */
const pickedPlace = v.object({
  slug: v.string(),
  names: v.array(nameView),
  category: v.optional(v.string()),
  neighbourhoodId: v.optional(v.string()),
  /** When a person last confirmed the place in person; unset is "Not yet confirmed". */
  confirmedAt: v.optional(v.number()),
  /** Whether anyone has written a story here or shared a post (what the map's dot shows). */
  hasStory: v.boolean(),
});

const walkStop = pickedPlace.extend({
  /** A wild card: drawn ignoring interests. The tool says "Wild card — not picked for you". */
  wildCard: v.boolean(),
  /** The traveller's own words for the interests this place fits; empty when none. */
  matchedInterests: v.array(v.string()),
  /** The leg that reaches this stop from the one before (or from the start). */
  leg: v.object({ metres: v.number(), minutes: v.number() }),
});

const startView = v.object({
  kind: v.union(v.literal("neighbourhood"), v.literal("place")),
  neighbourhoodId: v.optional(v.string()),
  slug: v.optional(v.string()),
  names: v.array(nameView),
});

const walkResult = v.union(
  v.object({
    ok: v.literal(true),
    start: startView,
    stops: v.array(walkStop),
    rulesApplied: v.array(v.object({ tag: v.string(), checks: v.string(), limit: v.string() })),
    rulesNotChecked: v.array(v.object({ tag: v.string(), reason: v.string() })),
    interestsNotMatched: v.array(v.string()),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("unknown_neighbourhood"), v.literal("unknown_place")),
  }),
);

const omikujiResult = v.union(
  v.object({
    ok: v.literal(true),
    /** The date in the region's time that the slip belongs to, YYYY-MM-DD. */
    day: v.string(),
    neighbourhoodId: v.optional(v.string()),
    place: pickedPlace,
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("unknown_neighbourhood"), v.literal("no_places")),
  }),
);

/** One day's slips for walk mode: a slip per neighbourhood, and one for the whole region. */
const todaysSlips = v.object({
  /** The date in the region's time that the slips belong to, YYYY-MM-DD. */
  day: v.string(),
  slips: v.array(
    v.object({
      /** Unset for the slip drawn from the whole region. */
      neighbourhoodId: v.optional(v.string()),
      /** The pin is Noren's public map pin; the phone works out the distance and direction. */
      place: pickedPlace.extend({ pin: v.object({ lat: v.number(), lng: v.number() }) }),
    }),
  ),
});

export type WalkResult = Infer<typeof walkResult>;
export type OmikujiResult = Infer<typeof omikujiResult>;
export type TodaysSlips = Infer<typeof todaysSlips>;

const picked = (place: PoolPlace) => ({
  slug: place.slug,
  names: place.names,
  ...(place.category === undefined ? {} : { category: place.category }),
  ...(place.neighbourhoodId === undefined ? {} : { neighbourhoodId: place.neighbourhoodId }),
  ...(place.confirmedAt === undefined ? {} : { confirmedAt: place.confirmedAt }),
  hasStory: place.hasStory,
});

/**
 * The cautions the owner confirmed and published: the ones a place's page shows a signed-out
 * visitor. Before the launch pack is complete a real place's page shows none of its owner's
 * statements (pages.getPublished), so none is used here either.
 */
async function publishedCautionKeys(ctx: MutationCtx, place: Doc<"place">): Promise<string[]> {
  if (!publicStoriesAllowed(place)) return [];
  const claims = await ctx.db
    .query("claim")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "published"))
    .take(CAUTIONS_READ);
  return claims
    .filter(
      (claim) =>
        claim.kind === "caution" &&
        claim.cautionType !== undefined &&
        isPublicSafeClaim(claim, place),
    )
    .map((claim) => claim.cautionType!);
}

/** Each place's suggestions in the last 7 days, from this week's and last week's counts. */
async function recentCounts(
  ctx: MutationCtx,
  now: number,
  offsetHours: number,
): Promise<Map<Id<"place">, number>> {
  const read = async (weekKey: string) => {
    const rows = await ctx.db
      .query("placeExposure")
      .withIndex("by_weekKey_and_placeId", (q) => q.eq("weekKey", weekKey))
      .take(MAP_PLACE_LIMIT);
    return new Map(rows.map((row) => [row.placeId, row.count]));
  };
  const thisWeek = await read(isoWeekKey(now, offsetHours));
  const lastWeek = await read(previousWeekKey(now, offsetHours));
  const weekday = isoWeekday(now, offsetHours);
  const recent = new Map<Id<"place">, number>();
  for (const placeId of new Set([...thisWeek.keys(), ...lastWeek.keys()])) {
    recent.set(
      placeId,
      recentSuggestions(
        { thisWeek: thisWeek.get(placeId) ?? 0, lastWeek: lastWeek.get(placeId) ?? 0 },
        weekday,
      ),
    );
  }
  return recent;
}

/**
 * Adds one to this week's count for each place the draw returned. For the omikuji, `omikujiDay`
 * makes a place count once per day however many people ask for the same slip.
 */
async function recordExposure(
  ctx: MutationCtx,
  placeIds: readonly Id<"place">[],
  now: number,
  offsetHours: number,
  omikujiDay?: string,
): Promise<void> {
  const weekKey = isoWeekKey(now, offsetHours);
  for (const placeId of placeIds) {
    const row = await ctx.db
      .query("placeExposure")
      .withIndex("by_weekKey_and_placeId", (q) => q.eq("weekKey", weekKey).eq("placeId", placeId))
      .first();
    if (omikujiDay !== undefined && row?.lastOmikujiDay === omikujiDay) continue;
    const lastOmikujiDay = omikujiDay === undefined ? row?.lastOmikujiDay : omikujiDay;
    if (row === null) {
      await ctx.db.insert("placeExposure", {
        placeId,
        weekKey,
        count: 1,
        ...(lastOmikujiDay === undefined ? {} : { lastOmikujiDay }),
      });
    } else {
      await ctx.db.patch("placeExposure", row._id, {
        count: row.count + 1,
        ...(lastOmikujiDay === undefined ? {} : { lastOmikujiDay }),
      });
    }
  }
}

async function limitDraws(ctx: MutationCtx, now: number): Promise<void> {
  for (const [key, limit, windowMs] of [
    ["connector:draw:minute", DRAWS_PER_MINUTE, MINUTE_MS],
    ["connector:draw:hour", DRAWS_PER_HOUR, HOUR_MS],
  ] as const) {
    const result = await consumeRateLimit(ctx, { key, limit, windowMs, now });
    if (!result.ok)
      throw appError("rate_limited", "Too many suggestions just now. Try again soon.");
  }
}

function checkTags(name: string, tags: readonly string[]): void {
  if (tags.length > MAX_TAGS || tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    throw appError(
      "invalid_input",
      `${name}: at most ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters`,
    );
  }
}

type WalkRequest = {
  regionId: string;
  start: { kind: "neighbourhood"; id: string } | { kind: "place"; slug: string };
  count: number;
  avoid: string[];
  interests: string[];
  adventurousness: (typeof ADVENTUROUSNESS)[number];
};

/**
 * The whole walk draw. `rng` and `now` come in so a test can replay it; the public mutation passes
 * Math.random and the clock. Exported for tests; not registered, so it is not callable from outside.
 */
export async function runWalk(
  ctx: MutationCtx,
  args: WalkRequest,
  rng: Rng,
  now: number,
): Promise<WalkResult> {
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > MAX_STOPS) {
    throw appError("invalid_input", `count is a whole number from 1 to ${MAX_STOPS}`);
  }
  checkTags("avoid", args.avoid);
  checkTags("interests", args.interests);
  const region = regionConfig(args.regionId);
  const offsetHours = region.collection.utcOffsetHours;
  await limitDraws(ctx, now);

  const pool = await publicPool(ctx, args.regionId);
  let start: { pin: Pin; view: Infer<typeof startView>; excluding?: Id<"place"> };
  if (args.start.kind === "neighbourhood") {
    const id = args.start.id;
    const neighbourhood = region.neighbourhoods?.find((candidate) => candidate.id === id);
    if (neighbourhood === undefined) return { ok: false, reason: "unknown_neighbourhood" };
    start = {
      pin: neighbourhood.center,
      view: {
        kind: "neighbourhood",
        neighbourhoodId: neighbourhood.id,
        names: Object.entries(neighbourhood.names).map(([lang, value]) => ({
          lang,
          script: lang === "ja" ? ("kanji" as const) : ("latin" as const),
          value,
          isPrimary: true,
        })),
      },
    };
  } else {
    const slug = args.start.slug;
    const found = pool.find((place) => place.slug === slug);
    if (found === undefined) return { ok: false, reason: "unknown_place" };
    start = {
      pin: found.pin,
      view: { kind: "place", slug: found.slug, names: found.names },
      excluding: found.id,
    };
  }

  const resolvedAvoid = resolveAvoid(args.avoid, region);
  // Before launch a real place's page shows none of its owner's statements, so no rule may filter
  // on one. Those rules are reported as not checked.
  const avoid = regionPolicy(args.regionId).realBusinessesDraftOnly
    ? withoutCautionRules(
        resolvedAvoid,
        "Owners' statements are not shown on Noren yet, so this cannot be checked.",
      )
    : resolvedAvoid;
  const interests = resolveInterests(args.interests, region);
  const recent = await recentCounts(ctx, now, offsetHours);

  const nearby = pool.filter(
    (place) =>
      place.id !== start.excluding &&
      distanceMetres(start.pin, place.pin) <= WALK_RADIUS_METRES &&
      !(place.category !== undefined && avoid.excludedCategories.has(place.category)),
  );
  const candidates = [];
  for (const place of nearby) {
    if (needsCautions(avoid)) {
      const row = await ctx.db.get("place", place.id);
      const cautions = row === null ? [] : await publishedCautionKeys(ctx, row);
      if (!passesAvoid(avoid, { category: place.category, cautions })) continue;
    }
    const matched = interestsFor(interests, place.category);
    candidates.push({
      place,
      matchedInterests: matched,
      matchesInterest: matched.length > 0,
      hasStory: place.hasStory,
      recentSuggestions: recent.get(place.id) ?? 0,
    });
  }

  const drawn = drawStops(candidates, {
    count: args.count,
    adventurousness: args.adventurousness,
    rng,
  });
  const ordered = orderAsWalk(
    start.pin,
    drawn.map((stop) => ({ ...stop, pin: stop.candidate.place.pin })),
  );
  const legs = legsOf(start.pin, ordered);
  const stops = ordered.map((stop, index) => ({
    ...picked(stop.candidate.place),
    wildCard: stop.wildCard,
    matchedInterests: stop.wildCard ? [] : stop.candidate.matchedInterests,
    leg: legs[index]!,
  }));

  await recordExposure(
    ctx,
    ordered.map((stop) => stop.candidate.place.id),
    now,
    offsetHours,
  );
  return {
    ok: true,
    start: start.view,
    stops,
    rulesApplied: avoid.applied.map(({ tag, checks, limit }) => ({ tag, checks, limit })),
    rulesNotChecked: avoid.notChecked,
    interestsNotMatched: interests.unmatched,
  };
}

/**
 * The daily slip. The day and the neighbourhood fix the seed, and each place's number comes from
 * that seed and its own id (keyedUniform), so everyone gets the same place all day and another
 * listing appearing does not change it. The odds ignore the exposure ledger on purpose: asking
 * must not change the answer. Exported for tests; not registered.
 */
export async function runOmikuji(
  ctx: MutationCtx,
  args: { regionId: string; neighbourhoodId?: string },
  now: number,
): Promise<OmikujiResult> {
  const region = regionConfig(args.regionId);
  const offsetHours = region.collection.utcOffsetHours;
  const { neighbourhoodId } = args;
  if (
    neighbourhoodId !== undefined &&
    !region.neighbourhoods?.some((candidate) => candidate.id === neighbourhoodId)
  ) {
    return { ok: false, reason: "unknown_neighbourhood" };
  }
  await limitDraws(ctx, now);

  const day = localDay(now, offsetHours);
  const seed = omikujiSeed(args.regionId, day, neighbourhoodId);
  const pool = (await publicPool(ctx, args.regionId)).filter(
    (place) => neighbourhoodId === undefined || place.neighbourhoodId === neighbourhoodId,
  );
  const chosen = chooseOmikuji(pool, seed);
  if (chosen === undefined) return { ok: false, reason: "no_places" };
  await recordExposure(ctx, [chosen.id], now, offsetHours, day);
  return {
    ok: true,
    day,
    ...(neighbourhoodId === undefined ? {} : { neighbourhoodId }),
    place: picked(chosen),
  };
}

/**
 * Today's slip for every neighbourhood at once, and for the whole region, for walk mode. A phone
 * must not tell Noren where it is, so it cannot ask for "the slip near me": it asks once for all of
 * them and picks on the phone. Each slip is the one runOmikuji gives for that neighbourhood on the
 * same day (the same seed and the same draw). A neighbourhood with no place has no slip.
 *
 * It records nothing in the exposure ledger: the ledger would have to learn which slip the person
 * took, and that would say where they are. The ledger only tilts suggest_walk, never the omikuji.
 * Exported for tests; not registered.
 */
export async function runOmikujiToday(
  ctx: MutationCtx,
  args: { regionId: string },
  now: number,
): Promise<TodaysSlips> {
  const region = regionConfig(args.regionId);
  await limitDraws(ctx, now);
  const day = localDay(now, region.collection.utcOffsetHours);
  const pool = await publicPool(ctx, args.regionId);
  const slips: TodaysSlips["slips"] = [];
  for (const neighbourhoodId of [...(region.neighbourhoods ?? []).map(({ id }) => id), undefined]) {
    const chosen = chooseOmikuji(
      pool.filter(
        (place) => neighbourhoodId === undefined || place.neighbourhoodId === neighbourhoodId,
      ),
      omikujiSeed(args.regionId, day, neighbourhoodId),
    );
    if (chosen === undefined) continue;
    slips.push({
      ...(neighbourhoodId === undefined ? {} : { neighbourhoodId }),
      place: { ...picked(chosen), pin: chosen.pin },
    });
  }
  return { day, slips };
}

const tags = v.array(v.string());

/**
 * The draws answer only while a feature that uses them is switched on in the region's file. Dark,
 * they behave as if they did not exist, like the /api/mcp route, so nothing can reach them through
 * the Convex URL before the privacy notice names them.
 */
export function drawsEnabled(regionId: string): boolean {
  const { connector, planner, walk } = regionConfig(regionId).features;
  return connector || planner || walk;
}

function requireDraws(regionId: string): void {
  if (!drawsEnabled(regionId)) throw appError("not_found", "Not found");
}

export const walk = mutation({
  args: {
    regionId: v.string(),
    start: v.union(
      v.object({ kind: v.literal("neighbourhood"), id: v.string() }),
      v.object({ kind: v.literal("place"), slug: v.string() }),
    ),
    count: v.number(),
    avoid: tags,
    interests: tags,
    adventurousness: v.union(v.literal("familiar"), v.literal("mixed"), v.literal("surprise")),
  },
  returns: walkResult,
  handler: async (ctx, args) => {
    requireDraws(args.regionId);
    return await runWalk(ctx, args, Math.random, Date.now());
  },
});

export const omikuji = mutation({
  args: { regionId: v.string(), neighbourhoodId: v.optional(v.string()) },
  returns: omikujiResult,
  handler: async (ctx, args) => {
    requireDraws(args.regionId);
    return await runOmikuji(ctx, args, Date.now());
  },
});

export const omikujiToday = mutation({
  args: { regionId: v.string() },
  returns: todaysSlips,
  handler: async (ctx, args) => {
    requireDraws(args.regionId);
    return await runOmikujiToday(ctx, args, Date.now());
  },
});

/**
 * Removes ledger rows older than the weeks kept, a batch at a time. Run weekly by a cron. The
 * cut-off is a whole week away from anything a draw reads, so UTC week boundaries are close enough.
 */
export const pruneExposure = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const oldest = isoWeekKey(Date.now() - LEDGER_WEEKS_KEPT * WEEK_MS, 0);
    const old = await ctx.db
      .query("placeExposure")
      .withIndex("by_weekKey_and_placeId", (q) => q.lt("weekKey", oldest))
      .take(PRUNE_BATCH);
    for (const row of old) await ctx.db.delete("placeExposure", row._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.connector.pruneExposure, {});
    }
    return null;
  },
});
