import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { categoryForTags, isForVisitors } from "../src/lib/osm/categories";
import { listingNames, selectListings } from "../src/lib/osm/listings";
import { branchOf, chainNames, namesFromTags, pickTags } from "../src/lib/osm/tags";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { isInsideRegion, isRegionLocale, regionConfig } from "./lib/region";
import { slugBase, uniqueSlug } from "./lib/slug";
import { scriptValidator } from "./lib/validators";

const attribution = "© OpenStreetMap contributors";
const osmType = v.union(v.literal("node"), v.literal("way"), v.literal("relation"));
const candidateInput = v.object({
  osmType,
  osmId: v.number(),
  tags: v.record(v.string(), v.string()),
  lat: v.number(),
  lng: v.number(),
  osmVersion: v.optional(v.number()),
  osmTimestamp: v.optional(v.string()),
  isChain: v.optional(v.boolean()),
});
const candidateView = v.object({
  _id: v.id("seedOsmCandidate"),
  osmType,
  osmId: v.number(),
  names: v.object({
    ja: v.optional(v.string()),
    en: v.optional(v.string()),
    primary: v.optional(v.string()),
  }),
  category: v.string(),
  lat: v.number(),
  lng: v.number(),
  attribution: v.string(),
  isChain: v.boolean(),
});
const confirmedName = v.object({
  lang: v.string(),
  script: scriptValidator,
  value: v.string(),
  isPrimary: v.boolean(),
});

const listingCandidate = v.object({
  _id: v.id("seedOsmCandidate"),
  osmType,
  osmId: v.number(),
  tags: v.record(v.string(), v.string()),
  lat: v.number(),
  lng: v.number(),
  category: v.optional(v.string()),
  isChain: v.optional(v.boolean()),
  confirmedPlaceId: v.optional(v.id("place")),
  dismissedAt: v.optional(v.number()),
});

async function listingSteward(ctx: QueryCtx, personId: Id<"person">) {
  const person = await ctx.db.get("person", personId);
  if (person?.role !== "steward")
    throw appError("invalid_input", "stewardPersonId must name an existing steward");
  return person;
}

async function insertCandidatePlace(
  ctx: MutationCtx,
  steward: Doc<"person">,
  candidate: Doc<"seedOsmCandidate">,
  names: Infer<typeof confirmedName>[],
  pin: { lat: number; lng: number },
  category: string,
  visibility: "draft" | "public",
) {
  const base = slugBase(names);
  // An OSM identifier is a slug fallback, never a fabricated translation of a Japanese name.
  const slug = await uniqueSlug(
    ctx,
    candidate.regionId,
    base === "place" ? `osm-${candidate.osmType}-${candidate.osmId}` : base,
  );
  const placeId = await ctx.db.insert(
    "place",
    withMock(steward, {
      regionId: candidate.regionId,
      slug,
      kind: "business" as const,
      visibility,
      category,
      createdBy: steward._id,
    }),
  );
  for (const name of names)
    await ctx.db.insert("placeName", { ...name, placeId, confirmedBy: steward._id });
  await ctx.db.insert("pin", { placeId, ...pin, placedBy: steward._id, placedAt: Date.now() });
  await ctx.db.insert("placeExternalRef", {
    placeId,
    provider: "osm",
    ref: `${candidate.osmType}/${candidate.osmId}`,
    licence: "ODbL-1.0",
    attribution,
    retrievedAt: candidate.retrievedAt ?? candidate._creationTime,
  });
  await ctx.db.patch("seedOsmCandidate", candidate._id, { confirmedPlaceId: placeId });
  return { placeId, slug };
}

function checkCategory(regionId: string, category: string) {
  if (!regionConfig(regionId).categories?.some((item) => item.key === category))
    throw appError("invalid_input", "unknown category for this region");
}

async function hasExternalRef(ctx: QueryCtx, ref: string): Promise<boolean> {
  return (
    (await ctx.db
      .query("placeExternalRef")
      .withIndex("by_provider_and_ref", (q) => q.eq("provider", "osm").eq("ref", ref))
      .first()) !== null
  );
}

async function availableCandidate(ctx: QueryCtx, candidateId: Id<"seedOsmCandidate">) {
  const candidate = await ctx.db.get("seedOsmCandidate", candidateId);
  if (!candidate) throw appError("not_found", "candidate not found");
  if (candidate.confirmedPlaceId || candidate.dismissedAt !== undefined)
    throw appError("conflict", "candidate is already confirmed or dismissed");
  return candidate;
}

export const importCandidates = internalMutation({
  args: { regionId: v.string(), retrievedAt: v.number(), candidates: v.array(candidateInput) },
  returns: v.object({ inserted: v.number(), updated: v.number(), skipped: v.number() }),
  handler: async (ctx, { regionId, retrievedAt, candidates }) => {
    const region = regionConfig(regionId);
    if (candidates.length > 100 || !Number.isFinite(retrievedAt) || retrievedAt < 0)
      throw appError(
        "invalid_input",
        "import requires at most 100 candidates and a valid retrieval time",
      );
    const result = { inserted: 0, updated: 0, skipped: 0 };
    for (const candidate of candidates) {
      const tags = pickTags(candidate.tags);
      if (
        !isInsideRegion(region, candidate) ||
        !Number.isSafeInteger(candidate.osmId) ||
        candidate.osmId <= 0 ||
        !namesFromTags(tags).primary
      ) {
        result.skipped++;
        continue;
      }
      const existing = await ctx.db
        .query("seedOsmCandidate")
        .withIndex("by_osmType_and_osmId", (q) =>
          q.eq("osmType", candidate.osmType).eq("osmId", candidate.osmId),
        )
        .unique();
      if (existing?.confirmedPlaceId) {
        result.skipped++;
        continue;
      }
      const category = categoryForTags(tags);
      checkCategory(regionId, category);
      const values = {
        ...candidate,
        isChain: candidate.isChain ?? false,
        tags,
        regionId,
        retrievedAt,
        category,
        licence: "ODbL-1.0" as const,
      };
      if (existing) {
        await ctx.db.patch("seedOsmCandidate", existing._id, values);
        result.updated++;
      } else {
        await ctx.db.insert("seedOsmCandidate", values);
        result.inserted++;
      }
    }
    return result;
  },
});

export const listCandidates = query({
  args: {
    regionId: v.string(),
    category: v.optional(v.string()),
    focusOnly: v.optional(v.boolean()),
    includeChains: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(candidateView),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["steward"]);
    const region = regionConfig(args.regionId);
    if (args.category !== undefined) checkCategory(args.regionId, args.category);
    const focus = region.categories?.filter((item) => item.focus).map((item) => item.key) ?? [];
    // Paginate the indexed candidates first; ref joins may yield a short or empty page. Clients
    // must follow continueCursor until isDone, including when a whole page was already linked.
    const base =
      args.category !== undefined
        ? ctx.db
            .query("seedOsmCandidate")
            .withIndex("by_regionId_and_category", (q) =>
              q.eq("regionId", args.regionId).eq("category", args.category),
            )
        : ctx.db
            .query("seedOsmCandidate")
            .withIndex("by_regionId_and_confirmedPlaceId", (q) =>
              q.eq("regionId", args.regionId).eq("confirmedPlaceId", undefined),
            );
    const result = await base.paginate(args.paginationOpts);
    const page = [];
    for (const candidate of result.page) {
      const category = candidate.category ?? categoryForTags(candidate.tags);
      if (
        candidate.confirmedPlaceId ||
        candidate.dismissedAt !== undefined ||
        (!args.includeChains && candidate.isChain === true) ||
        (args.focusOnly && !focus.includes(category))
      )
        continue;
      if (await hasExternalRef(ctx, `${candidate.osmType}/${candidate.osmId}`)) continue;
      page.push({
        _id: candidate._id,
        osmType: candidate.osmType,
        osmId: candidate.osmId,
        names: namesFromTags(candidate.tags),
        category,
        lat: candidate.lat,
        lng: candidate.lng,
        attribution,
        isChain: candidate.isChain ?? false,
      });
    }
    return { ...result, page };
  },
});

export const confirmCandidate = mutation({
  args: {
    candidateId: v.id("seedOsmCandidate"),
    names: v.array(confirmedName),
    pin: v.object({ lat: v.number(), lng: v.number() }),
    category: v.string(),
  },
  returns: v.object({ placeId: v.id("place"), slug: v.string() }),
  handler: async (ctx, { candidateId, names, pin, category }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const candidate = await availableCandidate(ctx, candidateId);
    const region = regionConfig(candidate.regionId);
    checkCategory(candidate.regionId, category);
    if (!isInsideRegion(region, pin))
      throw appError("invalid_input", "pin must be inside the region bbox");
    if (!names.length || names.length > 12 || !names.some((name) => name.isPrimary))
      throw appError("invalid_input", "provide 1–12 confirmed names including a primary name");
    const seen = new Set<string>();
    const primaries = new Set<string>();
    const cleanNames = names.map((name) => {
      const value = name.value.trim();
      const key = JSON.stringify([name.lang, name.script, value]);
      if (
        !value ||
        value.length > 120 ||
        !isRegionLocale(region, name.lang) ||
        seen.has(key) ||
        (name.isPrimary && primaries.has(name.lang))
      )
        throw appError("invalid_input", "invalid or duplicate confirmed name");
      seen.add(key);
      if (name.isPrimary) primaries.add(name.lang);
      return { ...name, value };
    });
    const ref = `${candidate.osmType}/${candidate.osmId}`;
    if (await hasExternalRef(ctx, ref))
      throw appError("conflict", "OSM reference already belongs to a place");
    const { placeId, slug } = await insertCandidatePlace(
      ctx,
      steward,
      candidate,
      cleanNames,
      pin,
      category,
      "draft",
    );
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "osm_candidate.confirm",
      targetType: "seedOsmCandidate",
      targetId: candidateId,
      diff: { placeId, category },
    });
    return { placeId, slug };
  },
});

export const dismissCandidate = mutation({
  args: { candidateId: v.id("seedOsmCandidate") },
  returns: v.null(),
  handler: async (ctx, { candidateId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    await availableCandidate(ctx, candidateId);
    const dismissedAt = Date.now();
    await ctx.db.patch("seedOsmCandidate", candidateId, { dismissedAt });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "osm_candidate.dismiss",
      targetType: "seedOsmCandidate",
      targetId: candidateId,
      diff: { dismissedAt },
    });
    return null;
  },
});

export const listingCandidates = internalQuery({
  args: { regionId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(listingCandidate),
  handler: async (ctx, { regionId, paginationOpts }) => {
    regionConfig(regionId);
    const result = await ctx.db
      .query("seedOsmCandidate")
      .withIndex("by_regionId", (q) => q.eq("regionId", regionId))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((candidate) => ({
        _id: candidate._id,
        osmType: candidate.osmType,
        osmId: candidate.osmId,
        tags: candidate.tags,
        lat: candidate.lat,
        lng: candidate.lng,
        category: candidate.category,
        isChain: candidate.isChain,
        confirmedPlaceId: candidate.confirmedPlaceId,
        dismissedAt: candidate.dismissedAt,
      })),
    };
  },
});

export const publishListings = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    candidateIds: v.array(v.id("seedOsmCandidate")),
  },
  returns: v.object({
    published: v.array(
      v.object({ candidateId: v.id("seedOsmCandidate"), placeId: v.id("place"), slug: v.string() }),
    ),
    skipped: v.array(v.object({ candidateId: v.id("seedOsmCandidate"), reason: v.string() })),
  }),
  handler: async (ctx, { regionId, stewardPersonId, candidateIds }) => {
    const steward = await listingSteward(ctx, stewardPersonId);
    if (steward.isMock)
      throw appError("invalid_input", "a mock steward cannot publish real listings");
    if (candidateIds.length > 50) throw appError("invalid_input", "publish at most 50 candidates");
    const region = regionConfig(regionId);
    const focusCategories =
      region.categories?.filter((item) => item.focus).map((item) => item.key) ?? [];
    const published: { candidateId: Id<"seedOsmCandidate">; placeId: Id<"place">; slug: string }[] =
      [];
    const skipped: { candidateId: Id<"seedOsmCandidate">; reason: string }[] = [];
    for (const candidateId of candidateIds) {
      const candidate = await ctx.db.get("seedOsmCandidate", candidateId);
      let reason = !candidate
        ? "candidate not found"
        : candidate.regionId !== regionId
          ? "wrong region"
          : null;
      if (!candidate || reason) {
        skipped.push({ candidateId, reason: reason! });
        continue;
      }
      const selection = selectListings([candidate], { focusCategories });
      reason = selection.skipped[0]?.reason ?? null;
      const category = candidate.category ?? categoryForTags(candidate.tags);
      const names = listingNames(candidate.tags, region.locales);
      const ref = `${candidate.osmType}/${candidate.osmId}`;
      if (!reason && !isInsideRegion(region, candidate)) reason = "outside region bbox";
      if (!reason && (!names.length || names.some((name) => name.value.length > 120)))
        reason = "no valid listing names in region locales";
      if (!reason && (await hasExternalRef(ctx, ref))) reason = "OSM reference already used";
      if (reason) {
        skipped.push({ candidateId, reason });
        continue;
      }
      const result = await insertCandidatePlace(
        ctx,
        steward,
        candidate,
        names,
        { lat: candidate.lat, lng: candidate.lng },
        category,
        "public",
      );
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "osm_listing.publish",
        targetType: "place",
        targetId: result.placeId,
        diff: { candidateId, osmRef: ref, category },
      });
      published.push({ candidateId, ...result });
    }
    return { published, skipped };
  },
});

/**
 * Marks listings named as branches of a branded chain (chainBranches) as chains, since OSM often tags
 * the brand on only some branches. Each pair is checked again here; a re-import resets the flag on an
 * unpublished listing, and the publish run marks it again before it selects anything.
 */
export const markChainBranches = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    pairs: v.array(v.object({ branch: v.id("seedOsmCandidate"), chain: v.id("seedOsmCandidate") })),
  },
  returns: v.object({ marked: v.number(), skipped: v.number() }),
  handler: async (ctx, { regionId, stewardPersonId, pairs }) => {
    const steward = await listingSteward(ctx, stewardPersonId);
    if (pairs.length > 100) throw appError("invalid_input", "mark at most 100 branches");
    regionConfig(regionId);
    const result = { marked: 0, skipped: 0 };
    for (const pair of pairs) {
      const branch = await ctx.db.get("seedOsmCandidate", pair.branch);
      const chain = await ctx.db.get("seedOsmCandidate", pair.chain);
      if (
        !branch ||
        !chain ||
        branch.regionId !== regionId ||
        chain.regionId !== regionId ||
        branch.isChain === true ||
        chain.isChain !== true ||
        branchOf(branch.tags, chainNames(chain.tags)) === undefined
      ) {
        result.skipped++;
        continue;
      }
      await ctx.db.patch("seedOsmCandidate", branch._id, { isChain: true });
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "osm_candidate.mark_chain",
        targetType: "seedOsmCandidate",
        targetId: branch._id,
        diff: { isChain: { from: false, to: true }, sameChainAs: chain._id },
      });
      result.marked++;
    }
    return result;
  },
});

/**
 * Takes published listings that are errands (convenience stores, supermarkets, chains: see
 * isForVisitors) off the map. Each place becomes a draft marked `not_for_visitors`; a steward can put
 * one back with setVisibility. The rule is checked here again, so a caller cannot hide anything else.
 */
export const hideListings = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    candidateIds: v.array(v.id("seedOsmCandidate")),
  },
  returns: v.object({ hidden: v.number(), skipped: v.number() }),
  handler: async (ctx, { regionId, stewardPersonId, candidateIds }) => {
    const steward = await listingSteward(ctx, stewardPersonId);
    if (candidateIds.length > 100) throw appError("invalid_input", "hide at most 100 listings");
    regionConfig(regionId);
    const result = { hidden: 0, skipped: 0 };
    for (const candidateId of candidateIds) {
      const candidate = await ctx.db.get("seedOsmCandidate", candidateId);
      const place = candidate?.confirmedPlaceId
        ? await ctx.db.get("place", candidate.confirmedPlaceId)
        : null;
      if (
        !candidate ||
        !place ||
        candidate.regionId !== regionId ||
        isForVisitors(candidate.tags, candidate.isChain === true) ||
        place.visibility !== "public" ||
        place.isMock
      ) {
        result.skipped++;
        continue;
      }
      await ctx.db.patch("place", place._id, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "osm_listing.hide",
        targetType: "place",
        targetId: place._id,
        diff: {
          candidateId,
          visibility: { from: "public", to: "draft" },
          hiddenReason: "not_for_visitors",
        },
      });
      result.hidden++;
    }
    return result;
  },
});

export const dismissDuplicates = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    pairs: v.array(v.object({ keep: v.id("seedOsmCandidate"), drop: v.id("seedOsmCandidate") })),
  },
  returns: v.object({ dismissed: v.number(), skipped: v.number() }),
  handler: async (ctx, { regionId, stewardPersonId, pairs }) => {
    const steward = await listingSteward(ctx, stewardPersonId);
    if (pairs.length > 100) throw appError("invalid_input", "dismiss at most 100 duplicates");
    const region = regionConfig(regionId);
    const focusCategories =
      region.categories?.filter((item) => item.focus).map((item) => item.key) ?? [];
    const result = { dismissed: 0, skipped: 0 };
    for (const { keep, drop } of pairs) {
      const keeper = await ctx.db.get("seedOsmCandidate", keep);
      const candidate = await ctx.db.get("seedOsmCandidate", drop);
      if (
        !keeper ||
        !candidate ||
        keep === drop ||
        keeper.regionId !== regionId ||
        candidate.regionId !== regionId ||
        keeper.confirmedPlaceId ||
        keeper.dismissedAt !== undefined ||
        candidate.confirmedPlaceId ||
        candidate.dismissedAt !== undefined ||
        !selectListings([keeper, candidate], { focusCategories }).duplicates.some(
          (pair) => pair.keep === keep && pair.drop === drop,
        )
      ) {
        result.skipped++;
        continue;
      }
      const dismissedAt = Date.now();
      await ctx.db.patch("seedOsmCandidate", drop, { dismissedAt });
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "osm_candidate.dismiss",
        targetType: "seedOsmCandidate",
        targetId: drop,
        diff: { reason: "duplicate", keep, dismissedAt },
      });
      result.dismissed++;
    }
    return result;
  },
});
