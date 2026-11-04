import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Licence } from "../src/lib/domain/constants";
import { distanceMetres } from "../src/lib/overture/dedupe";
import {
  GERS_ID,
  OVERTURE_DATASET,
  OVERTURE_RELEASE,
  OVERTURE_STORED_LICENCES,
  overtureAttribution,
} from "../src/lib/overture/place";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { internalMutation } from "./lib/gate";
import { readMapNames, readMapPin } from "./lib/mapCopies";
import { withMock } from "./lib/mock";
import { isInsideRegion, isRegionLocale, regionConfig } from "./lib/region";
import { slugBase, uniqueSlug } from "./lib/slug";
import { licenceValidator, scriptValidator } from "./lib/validators";

/**
 * Overture Maps places (scripts/import-overture-places.ts), the second open source after OSM. The
 * importer reads the local snapshot, compares it with the places read through `existingPlaces`,
 * and sends two kinds of change: a place that is new, or a reference added to a place Noren already
 * has. Each reference keeps the record's own licence and a credit line; the importer decides, and
 * these functions check each item again so a caller cannot write anything else.
 */

/** A reference is only ever added to a place within this distance of the Overture point. */
const LINK_MAX_METRES = 180;
const PUBLISH_BATCH = 50;
const LINK_BATCH = 100;

const confirmedName = v.object({
  lang: v.string(),
  script: scriptValidator,
  value: v.string(),
  isPrimary: v.boolean(),
});
const record = {
  gers: v.string(),
  lat: v.number(),
  lng: v.number(),
  dataset: v.string(),
  licence: licenceValidator,
};
const provenance = { release: v.string(), retrievedAt: v.number() };

async function steward(ctx: QueryCtx, personId: Id<"person">) {
  const person = await ctx.db.get("person", personId);
  if (person?.role !== "steward")
    throw appError("invalid_input", "stewardPersonId must name an existing steward");
  if (person.isMock) throw appError("invalid_input", "a mock steward cannot publish real listings");
  return person;
}

function checkProvenance(release: string, retrievedAt: number) {
  if (!OVERTURE_RELEASE.test(release))
    throw appError("invalid_input", "release must look like 2026-10-21.0");
  if (!Number.isFinite(retrievedAt) || retrievedAt < 0)
    throw appError("invalid_input", "retrievedAt must be a valid time");
}

/** Why an Overture record cannot be stored, or null. */
function recordProblem(item: { gers: string; dataset: string; licence: Licence }): string | null {
  if (!GERS_ID.test(item.gers)) return "not a GERS identifier";
  if (!OVERTURE_DATASET.test(item.dataset)) return "unexpected dataset name";
  if (!OVERTURE_STORED_LICENCES.includes(item.licence)) return "licence not accepted";
  return null;
}

async function hasOvertureRef(ctx: QueryCtx, gers: string): Promise<boolean> {
  return (
    (await ctx.db
      .query("placeExternalRef")
      .withIndex("by_provider_and_ref", (q) => q.eq("provider", "overture").eq("ref", gers))
      .first()) !== null
  );
}

async function insertRef(
  ctx: MutationCtx,
  placeId: Id<"place">,
  item: { gers: string; dataset: string; licence: Licence },
  release: string,
  retrievedAt: number,
) {
  await ctx.db.insert("placeExternalRef", {
    placeId,
    provider: "overture",
    ref: item.gers,
    licence: item.licence,
    attribution: overtureAttribution(item.dataset, item.licence, release),
    retrievedAt,
  });
}

/**
 * Every place of a region with what the importer needs to find doubles: names, pin, whether it is
 * on the public map, and its references. Drafts are included: a place a steward took off the map as
 * an errand or after a report must not come back as a new place.
 */
export const existingPlaces = internalQuery({
  args: { regionId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("place"),
      category: v.optional(v.string()),
      onMap: v.boolean(),
      names: v.array(v.string()),
      pin: v.union(v.object({ lat: v.number(), lng: v.number() }), v.null()),
      refs: v.array(v.object({ provider: v.string(), ref: v.string() })),
    }),
  ),
  handler: async (ctx, { regionId, paginationOpts }) => {
    regionConfig(regionId);
    const result = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId))
      .paginate(paginationOpts);
    const page = [];
    for (const place of result.page) {
      const names = place.mapNames ?? (await readMapNames(ctx, place._id));
      const refs = await ctx.db
        .query("placeExternalRef")
        .withIndex("by_placeId_and_provider_and_ref", (q) => q.eq("placeId", place._id))
        .take(20);
      page.push({
        _id: place._id,
        category: place.category,
        onMap: isPubliclyReadablePlace(place) && place.hiddenReason === undefined,
        names: names.map((name) => name.value),
        pin: place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id),
        refs: refs.map(({ provider, ref }) => ({ provider, ref })),
      });
    }
    return { ...result, page };
  },
});

/**
 * Names (name, name:ja, name:en) of the OSM candidates marked as part of a brand. OSM tags brands more
 * completely than Overture does, so the importer also uses these names to find chain branches.
 */
export const osmChainTags = internalQuery({
  args: { regionId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.record(v.string(), v.string())),
  handler: async (ctx, { regionId, paginationOpts }) => {
    regionConfig(regionId);
    const result = await ctx.db
      .query("seedOsmCandidate")
      .withIndex("by_regionId", (q) => q.eq("regionId", regionId))
      .paginate(paginationOpts);
    const page: Record<string, string>[] = [];
    for (const candidate of result.page) {
      if (candidate.isChain !== true) continue;
      const names: Record<string, string> = {};
      for (const key of ["name", "name:ja", "name:en"])
        if (candidate.tags[key]) names[key] = candidate.tags[key];
      page.push(names);
    }
    return { ...result, page };
  },
});

/**
 * Publishes places that are new to Noren, as the OSM listings are: public, in a category, "Not yet
 * confirmed" (confirmedAt unset), with the steward as the person who confirmed the name and pin.
 */
export const publishPlaces = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    ...provenance,
    places: v.array(
      v.object({
        ...record,
        category: v.string(),
        names: v.array(confirmedName),
      }),
    ),
  },
  returns: v.object({
    published: v.array(v.object({ gers: v.string(), placeId: v.id("place"), slug: v.string() })),
    skipped: v.array(v.object({ gers: v.string(), reason: v.string() })),
  }),
  handler: async (ctx, { regionId, stewardPersonId, release, retrievedAt, places }) => {
    const person = await steward(ctx, stewardPersonId);
    checkProvenance(release, retrievedAt);
    if (places.length > PUBLISH_BATCH)
      throw appError("invalid_input", `publish at most ${PUBLISH_BATCH} places`);
    const region = regionConfig(regionId);
    const focus = region.categories?.filter((item) => item.focus).map((item) => item.key) ?? [];
    const published: { gers: string; placeId: Id<"place">; slug: string }[] = [];
    const skipped: { gers: string; reason: string }[] = [];
    for (const item of places) {
      const seen = new Set<string>();
      const primaries = new Set<string>();
      let reason =
        recordProblem(item) ??
        (!isInsideRegion(region, item) ? "outside region bbox" : null) ??
        (!focus.includes(item.category) ? "not a focus category" : null);
      if (!reason && (!item.names.length || item.names.length > 12))
        reason = "needs one to twelve names";
      for (const name of item.names) {
        const key = JSON.stringify([name.lang, name.script, name.value]);
        if (
          !reason &&
          (!name.value.trim() ||
            name.value.length > 120 ||
            !isRegionLocale(region, name.lang) ||
            seen.has(key) ||
            (name.isPrimary && primaries.has(name.lang)))
        )
          reason = "invalid or duplicate name";
        seen.add(key);
        if (name.isPrimary) primaries.add(name.lang);
      }
      if (!reason && !item.names.some((name) => name.isPrimary)) reason = "no primary name";
      if (!reason && (await hasOvertureRef(ctx, item.gers)))
        reason = "Overture reference already used";
      if (reason) {
        skipped.push({ gers: item.gers, reason });
        continue;
      }
      const base = slugBase(item.names);
      const slug = await uniqueSlug(
        ctx,
        regionId,
        base === "place" ? `overture-${item.gers.slice(-12)}` : base,
      );
      const placeId = await ctx.db.insert(
        "place",
        withMock(person, {
          regionId,
          slug,
          kind: "business" as const,
          visibility: "public" as const,
          category: item.category,
          createdBy: person._id,
        }),
      );
      for (const name of item.names)
        await ctx.db.insert("placeName", { ...name, placeId, confirmedBy: person._id });
      await ctx.db.insert("pin", {
        placeId,
        lat: item.lat,
        lng: item.lng,
        placedBy: person._id,
        placedAt: Date.now(),
      });
      await insertRef(ctx, placeId, item, release, retrievedAt);
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "overture_listing.publish",
        targetType: "place",
        targetId: placeId,
        diff: { overtureRef: item.gers, release, category: item.category },
      });
      published.push({ gers: item.gers, placeId, slug });
    }
    return { published, skipped };
  },
});

/**
 * Adds an Overture reference to a place Noren already has: the same place under another source, so
 * no second place is made. The place keeps its names, pin, category and visibility; a place a
 * steward hid stays hidden.
 */
export const linkDuplicates = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    ...provenance,
    links: v.array(v.object({ ...record, placeId: v.id("place") })),
  },
  returns: v.object({
    linked: v.number(),
    skipped: v.array(v.object({ gers: v.string(), reason: v.string() })),
  }),
  handler: async (ctx, { regionId, stewardPersonId, release, retrievedAt, links }) => {
    const person = await steward(ctx, stewardPersonId);
    checkProvenance(release, retrievedAt);
    if (links.length > LINK_BATCH) throw appError("invalid_input", `link at most ${LINK_BATCH}`);
    regionConfig(regionId);
    let linked = 0;
    const skipped: { gers: string; reason: string }[] = [];
    for (const item of links) {
      const place = await ctx.db.get("place", item.placeId);
      const pin = place ? await readMapPin(ctx, place._id) : null;
      const reason =
        recordProblem(item) ??
        (!place || place.regionId !== regionId ? "place not found in this region" : null) ??
        (!pin || distanceMetres(pin, item) > LINK_MAX_METRES
          ? "place is not near the record"
          : null) ??
        ((await hasOvertureRef(ctx, item.gers)) ? "Overture reference already used" : null);
      if (reason) {
        skipped.push({ gers: item.gers, reason });
        continue;
      }
      await insertRef(ctx, item.placeId, item, release, retrievedAt);
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "overture_listing.link",
        targetType: "place",
        targetId: item.placeId,
        diff: { overtureRef: item.gers, release },
      });
      linked++;
    }
    return { linked, skipped };
  },
});
