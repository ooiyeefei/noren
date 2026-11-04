import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { describeSource } from "../src/lib/adapters";
import { aiConfig } from "../src/lib/ai/config";
import { decideMention, reportMentionSchema } from "../src/lib/story-finder/decide";
import {
  ABOUT_ANSWERS,
  guessLang,
  MENTION_KINDS,
  mentionCanonicalUrl,
  TEXT_MAX,
} from "../src/lib/story-finder/mention";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { readMapNames, readMapPin } from "./lib/mapCopies";
import { withMock } from "./lib/mock";
import { regionConfig } from "./lib/region";
import { literals, scriptValidator, sourceStatusValidator } from "./lib/validators";
import {
  mentionPlatformValidator,
  mentionStatusValidator,
  mentionVerdictValidator,
  rejectReasonValidator,
} from "./tables/storyFinder";

/** How long a check holds a candidate before another check may take it (an action runs ≤ 10 min). */
const LEASE_MS = 12 * 60 * 1000;
/** A candidate whose check failed this often is rejected as check_failed. */
const MAX_ATTEMPTS = 3;
/** The most candidates one claim takes (storyFinderActions.checkBatch asks for a dozen). */
const MAX_CLAIM = 24;
/** At most this many found posts are linked to one place, so they never crowd out members' own. */
const MAX_FOUND_PER_PLACE = 12;
const INGEST_MAX = 100;

/** The steward a script names must be a real (not demo) steward: found posts go public in their name. */
async function finderSteward(ctx: QueryCtx, personId: Id<"person">): Promise<Doc<"person">> {
  const person = await ctx.db.get("person", personId);
  if (person === null || person.role !== "steward" || person.isMock)
    throw appError(
      "invalid_input",
      "stewardPersonId must name an existing steward who is not a demo account",
    );
  return person;
}

/** A real place anyone may read: never a mock place, never a draft or a place taken off the map. */
function isFinderPlace(place: Doc<"place"> | null): place is Doc<"place"> {
  return (
    place !== null &&
    place.visibility === "public" &&
    !place.isMock &&
    place.hiddenReason === undefined &&
    isPubliclyReadablePlace(place)
  );
}

function requireCheckConfig() {
  const result = aiConfig("check_mention", process.env);
  if (!result.ok) throw appError("conflict", result.reason);
}

function cap(value: string | undefined, max: number): string | undefined {
  const text = value?.replace(/[\r\n\t]+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 500) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Collection (called by scripts/story-finder.ts with admin credentials)
// ---------------------------------------------------------------------------------------------

const finderPlace = v.object({
  placeId: v.id("place"),
  slug: v.string(),
  category: v.string(),
  names: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  pin: v.union(v.object({ lat: v.number(), lng: v.number() }), v.null()),
});
export type FinderPlace = Infer<typeof finderPlace>;

/**
 * The places to search for: public, real places in a places-to-visit category (the region's focus
 * categories unless `categories` narrows them) that have a name, one page at a time.
 */
export const placesToSearch = internalQuery({
  args: {
    regionId: v.string(),
    paginationOpts: paginationOptsValidator,
    categories: v.optional(v.array(v.string())),
    /** [west, south, east, north] */
    bbox: v.optional(v.array(v.number())),
  },
  returns: v.object({
    page: v.array(finderPlace),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { regionId, paginationOpts, categories, bbox }) => {
    const region = regionConfig(regionId);
    const focus = (region.categories ?? []).filter((c) => c.focus).map((c) => c.key);
    const allowed = new Set(
      categories?.length ? categories.filter((c) => focus.includes(c)) : focus,
    );
    if (bbox !== undefined && bbox.length !== 4)
      throw appError("invalid_input", "bbox is [west, south, east, north]");
    const result = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_visibility", (q) =>
        q.eq("regionId", regionId).eq("visibility", "public"),
      )
      .paginate(paginationOpts);
    const page: FinderPlace[] = [];
    for (const place of result.page) {
      if (!isFinderPlace(place) || !place.category || !allowed.has(place.category)) continue;
      const names = place.mapNames ?? (await readMapNames(ctx, place._id));
      if (!names.length) continue;
      const pin = place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id);
      if (bbox !== undefined) {
        const [west, south, east, north] = bbox as [number, number, number, number];
        if (!pin || pin.lng < west || pin.lng > east || pin.lat < south || pin.lat > north)
          continue;
      }
      page.push({ placeId: place._id, slug: place.slug, category: place.category, names, pin });
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

const candidateInput = v.object({
  placeId: v.id("place"),
  platform: mentionPlatformValidator,
  url: v.string(),
  /** Recomputed here; the script's value is only used for its own scratch files. */
  canonicalUrl: v.optional(v.string()),
  authorName: v.optional(v.string()),
  authorHandle: v.optional(v.string()),
  authorUrl: v.optional(v.string()),
  postedAt: v.optional(v.number()),
  text: v.string(),
  langGuess: v.optional(v.string()),
  searchedFor: v.string(),
  query: v.string(),
  actorId: v.string(),
  runId: v.string(),
});

/**
 * Stores found posts as pending candidates. A post already found for the place, or already linked to
 * it as a source, is skipped, so a rerun adds only what is new.
 */
export const ingest = internalMutation({
  args: { stewardPersonId: v.id("person"), candidates: v.array(candidateInput) },
  returns: v.object({
    inserted: v.number(),
    duplicate: v.number(),
    alreadyLinked: v.number(),
    skipped: v.array(v.object({ index: v.number(), reason: v.string() })),
  }),
  handler: async (ctx, { stewardPersonId, candidates }) => {
    const steward = await finderSteward(ctx, stewardPersonId);
    if (candidates.length > INGEST_MAX)
      throw appError("invalid_input", `send at most ${INGEST_MAX} candidates at a time`);
    const totals = { inserted: 0, duplicate: 0, alreadyLinked: 0 };
    const skipped: { index: number; reason: string }[] = [];
    const places = new Map<Id<"place">, Doc<"place"> | null>();
    for (const [index, candidate] of candidates.entries()) {
      if (!places.has(candidate.placeId))
        places.set(candidate.placeId, await ctx.db.get("place", candidate.placeId));
      const place = places.get(candidate.placeId) ?? null;
      if (!isFinderPlace(place)) {
        skipped.push({ index, reason: "place_not_public" });
        continue;
      }
      const canonicalUrl = mentionCanonicalUrl(
        candidate.url,
        regionConfig(place.regionId).enabledSourceAdapters,
      );
      const text = candidate.text.trim().slice(0, TEXT_MAX);
      if (canonicalUrl === null || candidate.url.length > 2048) {
        skipped.push({ index, reason: "invalid_url" });
        continue;
      }
      if (!text) {
        skipped.push({ index, reason: "no_text" });
        continue;
      }
      const found = await ctx.db
        .query("mentionCandidate")
        .withIndex("by_placeId_and_canonicalUrl", (q) =>
          q.eq("placeId", place._id).eq("canonicalUrl", canonicalUrl),
        )
        .first();
      if (found !== null) {
        totals.duplicate++;
        continue;
      }
      const linked = await ctx.db
        .query("source")
        .withIndex("by_placeId_and_canonicalUrl", (q) =>
          q.eq("placeId", place._id).eq("canonicalUrl", canonicalUrl),
        )
        .first();
      if (linked !== null) {
        totals.alreadyLinked++;
        continue;
      }
      await ctx.db.insert("mentionCandidate", {
        placeId: place._id,
        regionId: place.regionId,
        platform: candidate.platform,
        url: candidate.url.trim(),
        canonicalUrl,
        authorName: cap(candidate.authorName, 100),
        authorHandle: cap(candidate.authorHandle, 100),
        authorUrl: httpsUrl(candidate.authorUrl),
        postedAt:
          candidate.postedAt !== undefined && Number.isFinite(candidate.postedAt)
            ? candidate.postedAt
            : undefined,
        text,
        langGuess: cap(candidate.langGuess, 12) ?? guessLang(text),
        searchedFor: cap(candidate.searchedFor, 300) ?? "",
        query: cap(candidate.query, 300) ?? "",
        actorId: cap(candidate.actorId, 100) ?? "",
        runId: cap(candidate.runId, 100) ?? "",
        collectedBy: steward._id,
        status: "pending",
      });
      totals.inserted++;
    }
    if (totals.inserted > 0)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "story_finder.collected",
        targetType: "mentionCandidate",
        diff: { ...totals, skipped: skipped.length },
      });
    return { ...totals, skipped };
  },
});

// ---------------------------------------------------------------------------------------------
// The check (storyFinderActions.checkBatch runs it where the model keys live)
// ---------------------------------------------------------------------------------------------

async function pendingCount(ctx: QueryCtx): Promise<number> {
  const rows = await ctx.db
    .query("mentionCount")
    .withIndex("by_status_and_platform", (q) => q.eq("status", "pending"))
    .take(20);
  return rows.reduce((sum, row) => sum + row.count, 0);
}

async function scheduleCheck(
  ctx: MutationCtx,
  steward: Doc<"person">,
  limit: number,
  attach: boolean,
): Promise<{ pending: number; scheduled: number }> {
  requireCheckConfig();
  const pending = await pendingCount(ctx);
  const scheduled = Math.max(0, Math.min(Math.floor(limit), 2000, pending));
  if (scheduled > 0)
    await ctx.scheduler.runAfter(0, internal.storyFinderActions.checkBatch, {
      stewardPersonId: steward._id,
      remaining: scheduled,
      attach,
    });
  await writeAudit(ctx, {
    actorKind: "person",
    actorPersonId: steward._id,
    action: "story_finder.check_requested",
    targetType: "mentionCandidate",
    diff: { scheduled, attach },
  });
  return { pending, scheduled };
}

/** Starts checking up to `limit` pending candidates, a batch at a time (for the script). */
export const startCheck = internalMutation({
  args: { stewardPersonId: v.id("person"), limit: v.number(), attach: v.boolean() },
  returns: v.object({ pending: v.number(), scheduled: v.number() }),
  handler: async (ctx, { stewardPersonId, limit, attach }) =>
    await scheduleCheck(ctx, await finderSteward(ctx, stewardPersonId), limit, attach),
});

/** The same from the steward's page: check what is pending and link what passes. */
export const requestCheck = mutation({
  args: {},
  returns: v.object({ pending: v.number(), scheduled: v.number() }),
  handler: async (ctx) => {
    const steward = await requireRole(ctx, ["steward"]);
    if (steward.isMock) throw appError("forbidden", "a demo account may not run the story finder");
    return await scheduleCheck(ctx, steward, 500, true);
  },
});

const claimed = v.object({
  candidateId: v.id("mentionCandidate"),
  placeId: v.id("place"),
  platform: mentionPlatformValidator,
  text: v.string(),
  author: v.optional(v.string()),
  placeNames: v.array(v.object({ lang: v.string(), value: v.string() })),
  category: v.optional(v.string()),
});

/**
 * Takes up to `limit` pending candidates for a check and holds them for LEASE_MS, so two checks
 * never send the same post. A candidate that failed MAX_ATTEMPTS times is rejected instead.
 */
export const claimForCheck = internalMutation({
  args: { limit: v.number(), now: v.number() },
  returns: v.array(claimed),
  handler: async (ctx, { limit, now }) => {
    const max = Math.max(0, Math.min(MAX_CLAIM, Math.floor(limit)));
    // Unheld candidates (no checkStartedAt) sort first, then the oldest holds.
    const rows = await ctx.db
      .query("mentionCandidate")
      .withIndex("by_status_and_checkStartedAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(max);
    const taken: Infer<typeof claimed>[] = [];
    for (const row of rows) {
      if (row.checkStartedAt !== undefined && row.checkStartedAt > now - LEASE_MS) break;
      if ((row.checkAttempts ?? 0) >= MAX_ATTEMPTS) {
        await ctx.db.patch("mentionCandidate", row._id, {
          status: "rejected",
          reason: "check_failed",
          checkStartedAt: undefined,
          checkedAt: now,
        });
        continue;
      }
      const place = await ctx.db.get("place", row.placeId);
      const names = place ? (place.mapNames ?? (await readMapNames(ctx, place._id))) : [];
      await ctx.db.patch("mentionCandidate", row._id, {
        checkStartedAt: now,
        checkAttempts: (row.checkAttempts ?? 0) + 1,
      });
      taken.push({
        candidateId: row._id,
        placeId: row.placeId,
        platform: row.platform,
        text: row.text,
        author: row.authorHandle ?? row.authorName,
        placeNames: names.map(({ lang, value }) => ({ lang, value })),
        category: place?.category,
      });
    }
    return taken;
  },
});

const reportedValidator = v.object({
  aboutThisPlace: literals(ABOUT_ANSWERS),
  evidence: v.string(),
  kind: literals(MENTION_KINDS),
  namesPrivatePeople: v.boolean(),
  quote: v.string(),
  topics: v.array(v.string()),
});

type AttachResult =
  { ok: true; sourceId: Id<"source">; excerpt: boolean } | { ok: false; error: string };

/**
 * Links an accepted candidate to its place as a source, in the name of the steward who ran the
 * finder, who agreed to show it (FR-033). Embeddable posts appear through the platform's official
 * embed, credited and linked; any other post shows its verbatim quote as a link card.
 */
async function attachCandidate(
  ctx: MutationCtx,
  candidate: Doc<"mentionCandidate">,
  steward: Doc<"person">,
  now: number,
): Promise<AttachResult> {
  const fail = async (error: string): Promise<AttachResult> => {
    await ctx.db.patch("mentionCandidate", candidate._id, { attachError: error });
    return { ok: false, error };
  };
  if (candidate.status !== "accepted" || !candidate.verdict?.quote)
    return await fail("not_accepted");
  if (steward.role !== "steward" || steward.isMock) return await fail("not_a_real_steward");
  const place = await ctx.db.get("place", candidate.placeId);
  if (!isFinderPlace(place)) return await fail("place_not_public");
  const region = regionConfig(place.regionId);
  const described = describeSource(candidate.url, region.enabledSourceAdapters);
  if (!described.ok) return await fail(`invalid_url:${described.reason}`);
  const source = described.source;
  const existing = await ctx.db
    .query("source")
    .withIndex("by_placeId_and_canonicalUrl", (q) =>
      q.eq("placeId", place._id).eq("canonicalUrl", source.canonicalUrl),
    )
    .first();
  if (existing !== null) return await fail("already_linked");
  const live = await ctx.db
    .query("source")
    .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", "live"))
    .take(100);
  if (live.filter((row) => row.origin === "story_finder").length >= MAX_FOUND_PER_PLACE)
    return await fail("place_full");
  // A post with no official embed is shown by its quote; an embed shows the post itself.
  const quote = candidate.verdict.quote;
  const withExcerpt = source.embed.kind === "link";
  const excerptLang = guessLang(quote) ?? candidate.langGuess ?? region.defaultLocale;
  const sourceId = await ctx.db.insert(
    "source",
    withMock(steward, {
      placeId: place._id,
      adapter: source.adapter,
      platform:
        source.adapter === "link_card"
          ? candidate.platform === "reddit"
            ? "reddit"
            : "web"
          : source.platform,
      url: source.adapter === "google_maps_link" ? source.canonicalUrl : candidate.url,
      canonicalUrl: source.canonicalUrl,
      authorHandle: candidate.authorHandle ?? candidate.authorName ?? source.author?.handle,
      authorUrl: candidate.authorUrl ?? source.author?.url,
      postedAt: candidate.postedAt,
      addedBy: steward._id,
      status: "live" as const,
      sharedAt: now,
      origin: "story_finder" as const,
      ...(withExcerpt ? { excerpt: quote, excerptLang } : {}),
    }),
  );
  await ctx.db.patch("mentionCandidate", candidate._id, {
    status: "attached",
    sourceId,
    attachError: undefined,
  });
  await writeAudit(ctx, {
    actorKind: "person",
    actorPersonId: steward._id,
    action: "source.found_attached",
    targetType: "source",
    targetId: sourceId,
    diff: { candidateId: candidate._id, platform: candidate.platform },
  });
  return { ok: true, sourceId, excerpt: withExcerpt };
}

/**
 * Records one check. Code decides from what the model reported (lib/story-finder/decide.ts), here
 * where it is written, so nothing reaches the table that the post does not bear out.
 */
export const recordCheck = internalMutation({
  args: {
    candidateId: v.id("mentionCandidate"),
    stewardPersonId: v.id("person"),
    attach: v.boolean(),
    modelSetting: v.string(),
    latencyMs: v.number(),
    result: v.union(
      v.object({ ok: v.literal(true), reported: reportedValidator }),
      v.object({ ok: v.literal(false), error: v.string() }),
    ),
  },
  returns: v.object({
    status: v.string(),
    sourceId: v.optional(v.id("source")),
    excerptPlaceId: v.optional(v.id("place")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; sourceId?: Id<"source">; excerptPlaceId?: Id<"place"> }> => {
    const candidate = await ctx.db.get("mentionCandidate", args.candidateId);
    if (candidate === null) return { status: "missing" };
    if (candidate.status !== "pending") return { status: candidate.status };
    const now = Date.now();
    if (!args.result.ok) {
      const failed = (candidate.checkAttempts ?? 0) >= MAX_ATTEMPTS;
      await ctx.db.patch("mentionCandidate", candidate._id, {
        lastCheckError: args.result.error.slice(0, 200),
        ...(failed
          ? { status: "rejected" as const, reason: "check_failed" as const, checkedAt: now }
          : {}),
      });
      return { status: failed ? "rejected" : "pending" };
    }
    const reported = reportMentionSchema.parse(args.result.reported);
    const decision = decideMention(candidate.text, reported);
    await ctx.db.patch("mentionCandidate", candidate._id, {
      status: decision.status,
      reason: decision.status === "rejected" ? decision.reason : undefined,
      verdict: decision.verdict,
      modelSetting: args.modelSetting,
      latencyMs: Math.max(0, Math.round(args.latencyMs)),
      checkedAt: now,
      checkStartedAt: undefined,
      lastCheckError: undefined,
    });
    await writeAudit(ctx, {
      actorKind: "ai",
      modelVersion: args.modelSetting,
      action: "mention.check",
      targetType: "mentionCandidate",
      targetId: candidate._id,
      diff: {
        status: decision.status,
        ...(decision.status === "rejected" ? { reason: decision.reason } : {}),
        kind: decision.verdict.kind,
      },
    });
    if (decision.status !== "accepted" || !args.attach) return { status: decision.status };
    const steward = await ctx.db.get("person", args.stewardPersonId);
    const fresh = await ctx.db.get("mentionCandidate", candidate._id);
    if (steward === null || fresh === null) return { status: decision.status };
    const attached = await attachCandidate(ctx, fresh, steward, now);
    if (!attached.ok) return { status: "accepted" };
    return {
      status: "attached",
      sourceId: attached.sourceId,
      ...(attached.excerpt ? { excerptPlaceId: candidate.placeId } : {}),
    };
  },
});

/** The excerpt translation job, enqueued the way translatePlace enqueues claims (aiRequests.ts). */
async function enqueueExcerptTranslations(ctx: MutationCtx, placeIds: Iterable<Id<"place">>) {
  if (!aiConfig("translate", process.env).ok) return;
  for (const placeId of new Set(placeIds))
    await ctx.scheduler.runAfter(0, internal.storyFinderActions.translateExcerpts, { placeId });
}

async function attachAccepted(ctx: MutationCtx, steward: Doc<"person">, limit: number) {
  const accepted = await ctx.db
    .query("mentionCandidate")
    .withIndex("by_status_and_checkedAt", (q) => q.eq("status", "accepted"))
    .take(Math.max(0, Math.min(100, Math.floor(limit))));
  const places: Id<"place">[] = [];
  let attached = 0;
  for (const candidate of accepted) {
    if (candidate.attachError === "place_full" || candidate.attachError === "already_linked")
      continue;
    const result = await attachCandidate(ctx, candidate, steward, Date.now());
    if (!result.ok) continue;
    attached++;
    if (result.excerpt) places.push(candidate.placeId);
  }
  await enqueueExcerptTranslations(ctx, places);
  return { attached, considered: accepted.length };
}

/** Links candidates the check accepted while it ran without linking (`--no-attach`). */
export const attachAcceptedBatch = internalMutation({
  args: { stewardPersonId: v.id("person"), limit: v.number() },
  returns: v.object({ attached: v.number(), considered: v.number() }),
  handler: async (ctx, { stewardPersonId, limit }) =>
    await attachAccepted(ctx, await finderSteward(ctx, stewardPersonId), limit),
});

export const attachAcceptedNow = mutation({
  args: {},
  returns: v.object({ attached: v.number(), considered: v.number() }),
  handler: async (ctx) => {
    const steward = await requireRole(ctx, ["steward"]);
    if (steward.isMock) throw appError("forbidden", "a demo account may not run the story finder");
    return await attachAccepted(ctx, steward, 100);
  },
});

/** Called by checkBatch once per place whose new found posts have quotes to translate. */
export const enqueueTranslations = internalMutation({
  args: { placeIds: v.array(v.id("place")) },
  returns: v.null(),
  handler: async (ctx, { placeIds }) => {
    await enqueueExcerptTranslations(ctx, placeIds.slice(0, 50));
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// Translating quotes (through the claims' translation job, src/lib/ai/jobs.ts)
// ---------------------------------------------------------------------------------------------

export const untranslatedExcerpts = internalQuery({
  args: { placeId: v.id("place"), limit: v.number() },
  returns: v.array(
    v.object({ sourceId: v.id("source"), text: v.string(), from: v.string(), to: v.string() }),
  ),
  handler: async (ctx, { placeId, limit }) => {
    const max = Math.max(0, Math.min(50, Math.floor(limit)));
    const place = await ctx.db.get("place", placeId);
    if (place === null || max === 0) return [];
    const locales = regionConfig(place.regionId).locales;
    const sources = await ctx.db
      .query("source")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
      .take(100);
    const result: { sourceId: Id<"source">; text: string; from: string; to: string }[] = [];
    for (const source of sources) {
      if (source.origin !== "story_finder" || !source.excerpt || !source.excerptLang) continue;
      for (const lang of locales) {
        if (lang === source.excerptLang) continue;
        const existing = await ctx.db
          .query("sourceExcerptTranslation")
          .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", source._id).eq("lang", lang))
          .unique();
        if (existing?.sourceText === source.excerpt) continue;
        result.push({
          sourceId: source._id,
          text: source.excerpt,
          from: source.excerptLang,
          to: lang,
        });
        if (result.length === max) return result;
      }
    }
    return result;
  },
});

export const saveExcerptTranslation = internalMutation({
  args: {
    sourceId: v.id("source"),
    lang: v.string(),
    sourceText: v.string(),
    text: v.string(),
    modelVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { sourceId, lang, sourceText, text, modelVersion }) => {
    const source = await ctx.db.get("source", sourceId);
    if (
      source === null ||
      source.status !== "live" ||
      source.origin !== "story_finder" ||
      source.excerpt !== sourceText ||
      source.excerptLang === lang
    )
      return null;
    const place = await ctx.db.get("place", source.placeId);
    if (place === null || !regionConfig(place.regionId).locales.includes(lang)) return null;
    const translated = text.trim();
    if (!translated || translated.length > 1000)
      throw appError("invalid_input", "a translation is 1 to 1000 characters");
    const existing = await ctx.db
      .query("sourceExcerptTranslation")
      .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", sourceId).eq("lang", lang))
      .unique();
    const row = {
      sourceId,
      lang,
      text: translated,
      sourceText,
      origin: "machine" as const,
      modelVersion,
    };
    if (existing === null) await ctx.db.insert("sourceExcerptTranslation", row);
    else await ctx.db.patch("sourceExcerptTranslation", existing._id, row);
    await writeAudit(ctx, {
      actorKind: "ai",
      modelVersion,
      action: "source.translate_machine",
      targetType: "source",
      targetId: sourceId,
      diff: { lang },
    });
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// The steward's view
// ---------------------------------------------------------------------------------------------

const candidateRow = v.object({
  candidateId: v.id("mentionCandidate"),
  placeId: v.id("place"),
  placeSlug: v.string(),
  placeNames: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  platform: mentionPlatformValidator,
  url: v.string(),
  author: v.optional(v.string()),
  postedAt: v.optional(v.number()),
  status: mentionStatusValidator,
  reason: v.optional(rejectReasonValidator),
  attachError: v.optional(v.string()),
  verdict: v.optional(mentionVerdictValidator),
  modelSetting: v.optional(v.string()),
  checkedAt: v.optional(v.number()),
  sourceStatus: v.optional(sourceStatusValidator),
});
type CandidateRow = Infer<typeof candidateRow>;

const LIST_LIMIT = 50;

/**
 * Counts by status and platform, and the newest attached, accepted and rejected candidates with the
 * model's verdict, for a steward to spot-check. Never the post's full text.
 */
export const stewardOverview = query({
  args: {},
  returns: v.object({
    counts: v.array(
      v.object({
        status: mentionStatusValidator,
        platform: mentionPlatformValidator,
        count: v.number(),
      }),
    ),
    attached: v.array(candidateRow),
    accepted: v.array(candidateRow),
    rejected: v.array(candidateRow),
  }),
  handler: async (ctx) => {
    await requireRole(ctx, ["steward"]);
    const counts = (await ctx.db.query("mentionCount").take(100))
      .filter((row) => row.count > 0)
      .map(({ status, platform, count }) => ({ status, platform, count }));
    const places = new Map<Id<"place">, Doc<"place"> | null>();
    async function rows(status: "attached" | "accepted" | "rejected"): Promise<CandidateRow[]> {
      const candidates = await ctx.db
        .query("mentionCandidate")
        .withIndex("by_status_and_checkedAt", (q) => q.eq("status", status))
        .order("desc")
        .take(LIST_LIMIT);
      const result: CandidateRow[] = [];
      for (const candidate of candidates) {
        if (!places.has(candidate.placeId))
          places.set(candidate.placeId, await ctx.db.get("place", candidate.placeId));
        const place = places.get(candidate.placeId);
        if (!place) continue;
        const source = candidate.sourceId ? await ctx.db.get("source", candidate.sourceId) : null;
        result.push({
          candidateId: candidate._id,
          placeId: place._id,
          placeSlug: place.slug,
          placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
          platform: candidate.platform,
          url: candidate.url,
          author: candidate.authorHandle ?? candidate.authorName,
          postedAt: candidate.postedAt,
          status: candidate.status,
          reason: candidate.reason,
          attachError: candidate.attachError,
          verdict: candidate.verdict,
          modelSetting: candidate.modelSetting,
          checkedAt: candidate.checkedAt,
          sourceStatus: source?.status,
        });
      }
      return result;
    }
    return {
      counts,
      attached: await rows("attached"),
      accepted: await rows("accepted"),
      rejected: await rows("rejected"),
    };
  },
});

/**
 * One click takes a found post down: its source is hidden through the same change `sources.remove`
 * makes, and the candidate is never linked again.
 */
export const hide = mutation({
  args: { candidateId: v.id("mentionCandidate") },
  returns: v.null(),
  handler: async (ctx, { candidateId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    if (steward.isMock) throw appError("forbidden", "a demo account may not change found posts");
    const candidate = await ctx.db.get("mentionCandidate", candidateId);
    if (candidate === null) throw appError("not_found", "candidate not found");
    if (candidate.status === "hidden") return null;
    if (candidate.sourceId !== undefined) {
      const source = await ctx.db.get("source", candidate.sourceId);
      if (source !== null && source.status === "live") {
        await ctx.db.patch("source", source._id, { status: "hidden" });
        await writeAudit(ctx, {
          actorKind: "person",
          actorPersonId: steward._id,
          action: "source.remove",
          targetType: "source",
          targetId: source._id,
        });
      }
    }
    await ctx.db.patch("mentionCandidate", candidateId, {
      status: "hidden",
      hiddenAt: Date.now(),
      hiddenBy: steward._id,
      checkStartedAt: undefined,
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "mention.hide",
      targetType: "mentionCandidate",
      targetId: candidateId,
    });
    return null;
  },
});
