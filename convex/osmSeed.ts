import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { categoryForTags } from "../src/lib/osm/categories";
import { namesFromTags, pickTags } from "../src/lib/osm/tags";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
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
    const slug = await uniqueSlug(ctx, candidate.regionId, slugBase(cleanNames));
    const placeId = await ctx.db.insert(
      "place",
      withMock(steward, {
        regionId: candidate.regionId,
        slug,
        kind: "business" as const,
        visibility: "draft" as const,
        category,
        createdBy: steward._id,
      }),
    );
    for (const name of cleanNames)
      await ctx.db.insert("placeName", { ...name, placeId, confirmedBy: steward._id });
    await ctx.db.insert("pin", { placeId, ...pin, placedBy: steward._id, placedAt: Date.now() });
    await ctx.db.insert("placeExternalRef", {
      placeId,
      provider: "osm",
      ref,
      licence: "ODbL-1.0",
      attribution,
      retrievedAt: candidate.retrievedAt ?? candidate._creationTime,
    });
    await ctx.db.patch("seedOsmCandidate", candidateId, { confirmedPlaceId: placeId });
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
