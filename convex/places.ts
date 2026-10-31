import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  canEditPlace,
  canManagePlace,
  isOpenListing,
  isVerifiedOwner,
  placeHasOwner,
  placeKind,
  publicStoriesAllowed,
  requireEditablePlace,
  type Viewer,
} from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson, requireRole } from "./lib/auth";
import { transitionClaim } from "./lib/claimEffects";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { readHasPublishedPage, readMapNames, readMapPin } from "./lib/mapCopies";
import { withMock } from "./lib/mock";
import {
  isCategoryKey,
  isInsideRegion,
  isRegionLocale,
  regionConfig,
  regionPolicy,
} from "./lib/region";
import { slugBase, uniqueSlug } from "./lib/slug";
import { placeKindValidator, scriptValidator, visibilityValidator } from "./lib/validators";
import { canReadPlace, readablePlaces } from "./lib/visibility";

const nameInput = v.object({
  lang: v.string(),
  script: scriptValidator,
  value: v.string(),
  isPrimary: v.optional(v.boolean()),
});
const nameView = nameInput.extend({ isPrimary: v.boolean() });
const pinView = v.object({ lat: v.number(), lng: v.number() });
const placeSummary = v.object({
  _id: v.id("place"),
  regionId: v.string(),
  slug: v.string(),
  kind: placeKindValidator,
  visibility: visibilityValidator,
  demoPublicBasis: v.optional(v.literal("fictional")),
  category: v.optional(v.string()),
  isMock: v.boolean(),
  names: v.array(nameView),
  pin: v.union(pinView, v.null()),
  /** When a person last confirmed the place in person; unset is "Not yet confirmed" (FR-030). */
  confirmedAt: v.optional(v.number()),
});
const mapPlace = placeSummary.extend({ hasStory: v.boolean() });
const placeDetail = placeSummary.extend({
  canEdit: v.boolean(),
  canManage: v.boolean(),
  hasOwner: v.boolean(),
  isOwner: v.boolean(),
  dataSources: v.array(
    v.object({
      provider: v.string(),
      ref: v.string(),
      licence: v.optional(v.string()),
      attribution: v.optional(v.string()),
    }),
  ),
});
export type PlaceSummary = Infer<typeof placeSummary>;
export type PlaceDetail = Infer<typeof placeDetail>;

function checkCategory(regionId: string, category: string) {
  const region = regionConfig(regionId);
  if (!isCategoryKey(region, category)) {
    throw appError(
      "invalid_input",
      `unknown category "${category}"; allowed keys: ${(region.categories ?? []).map(({ key }) => key).join(", ") || "none"}`,
    );
  }
}

function checkedNames(
  regionId: string,
  names: Infer<typeof nameInput>[],
): Infer<typeof nameView>[] {
  const region = regionConfig(regionId);
  if (names.length < 1 || names.length > 12) {
    throw appError("invalid_input", "provide 1 to 12 names");
  }
  const seen = new Set<string>();
  const primaryLanguages = new Set<string>();
  const result = names.map((name) => {
    const value = name.value.trim();
    if (!value || value.length > 120) {
      throw appError("invalid_input", "a name must be nonblank and at most 120 characters");
    }
    if (!isRegionLocale(region, name.lang)) {
      throw appError("invalid_input", `name language ${name.lang} is not a region locale`);
    }
    const key = JSON.stringify([name.lang, name.script, value]);
    if (seen.has(key)) throw appError("invalid_input", "duplicate name (language, script, value)");
    seen.add(key);
    if (name.isPrimary) {
      if (primaryLanguages.has(name.lang)) {
        throw appError("invalid_input", `more than one primary name in ${name.lang}`);
      }
      primaryLanguages.add(name.lang);
    }
    return { ...name, value, isPrimary: name.isPrimary ?? false };
  });
  for (const name of result) {
    if (!primaryLanguages.has(name.lang)) {
      name.isPrimary = true;
      primaryLanguages.add(name.lang);
    }
  }
  return result;
}

function checkPin(regionId: string, pin: Infer<typeof pinView>) {
  if (!isInsideRegion(regionConfig(regionId), pin)) {
    throw appError("invalid_input", "pin must have finite coordinates inside the region's bbox");
  }
}

async function namesFor(ctx: QueryCtx, placeId: Id<"place">) {
  return await ctx.db
    .query("placeName")
    .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
    .take(12);
}

async function summary(ctx: QueryCtx, place: Doc<"place">): Promise<Infer<typeof placeSummary>> {
  const names = await namesFor(ctx, place._id);
  const pin = await ctx.db
    .query("pin")
    .withIndex("by_placeId", (q) => q.eq("placeId", place._id))
    .unique();
  return {
    _id: place._id,
    regionId: place.regionId,
    slug: place.slug,
    kind: placeKind(place),
    visibility: place.visibility,
    demoPublicBasis: place.demoPublicBasis,
    category: place.category,
    isMock: place.isMock,
    names: names.map(({ lang, script, value, isPrimary }) => ({ lang, script, value, isPrimary })),
    pin: pin === null ? null : { lat: pin.lat, lng: pin.lng },
    confirmedAt: place.confirmedAt,
  };
}

async function detail(ctx: QueryCtx, viewer: Viewer, place: Doc<"place"> | null) {
  if (place === null || !(await canReadPlace(ctx, viewer, place))) return null;
  const refs = await ctx.db
    .query("placeExternalRef")
    .withIndex("by_placeId_and_provider_and_ref", (q) => q.eq("placeId", place._id))
    .take(5);
  return {
    ...(await summary(ctx, place)),
    canEdit: canEditPlace(viewer, place),
    canManage: await canManagePlace(ctx, viewer, place),
    hasOwner: await placeHasOwner(ctx, place._id),
    isOwner: viewer !== null && (await isVerifiedOwner(ctx, viewer._id, place._id)),
    dataSources: refs.map(({ provider, ref, licence, attribution }) => ({
      provider,
      ref,
      licence,
      attribution,
    })),
  };
}

const MAP_PLACE_LIMIT = 4000;

export const listForMap = query({
  args: { regionId: v.string(), category: v.optional(v.string()) },
  returns: v.array(mapPlace),
  handler: async (ctx, { regionId, category }) => {
    const viewer = await currentPerson(ctx);
    // A query may run at most 4,096 index ranges, 32,000 documents and 16 MiB. Each place row
    // carries copies of its names, pin and published page (lib/mapCopies.ts), so a place costs one
    // document and no ranges; a row not copied yet costs up to three lookups. readablePlaces limits
    // each visibility separately; the map's contract caps the total.
    const places = await readablePlaces(ctx, viewer, { regionId, limit: MAP_PLACE_LIMIT });
    if (places.length >= MAP_PLACE_LIMIT) {
      console.warn(
        `listForMap: ${places.length} places in ${regionId}, showing ${MAP_PLACE_LIMIT}`,
      );
    }
    const owned =
      viewer?.role === "business_owner"
        ? new Set(
            (
              await ctx.db
                .query("placeOwner")
                .withIndex("by_personId", (q) => q.eq("personId", viewer._id))
                .take(200)
            ).map(({ placeId }) => placeId),
          )
        : new Set<Id<"place">>();
    // canManagePlace without a lookup per place.
    const canManage = (place: Doc<"place">) =>
      viewer !== null &&
      (viewer.role === "steward" || viewer._id === place.createdBy || owned.has(place._id));
    return await Promise.all(
      places
        .filter((place) => category === undefined || place.category === category)
        .slice(0, MAP_PLACE_LIMIT)
        .map(async (place) => ({
          _id: place._id,
          regionId: place.regionId,
          slug: place.slug,
          kind: placeKind(place),
          visibility: place.visibility,
          demoPublicBasis: place.demoPublicBasis,
          category: place.category,
          isMock: place.isMock,
          names: place.mapNames ?? (await readMapNames(ctx, place._id)),
          pin: place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id),
          confirmedAt: place.confirmedAt,
          hasStory:
            (publicStoriesAllowed(place) || canManage(place)) &&
            (place.hasPublishedPage ?? (await readHasPublishedPage(ctx, place._id))),
        })),
    );
  },
});

export const getBySlug = query({
  args: { regionId: v.string(), slug: v.string() },
  returns: v.union(placeDetail, v.null()),
  handler: async (ctx, { regionId, slug }) => {
    const place = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId).eq("slug", slug))
      .unique();
    return await detail(ctx, await currentPerson(ctx), place);
  },
});

export const get = query({
  args: { placeId: v.id("place") },
  returns: v.union(placeDetail, v.null()),
  handler: async (ctx, { placeId }) =>
    await detail(ctx, await currentPerson(ctx), await ctx.db.get("place", placeId)),
});

export const listMine = query({
  args: { regionId: v.string() },
  returns: v.array(placeSummary),
  handler: async (ctx, { regionId }) => {
    const person = await requireRole(ctx, ["creator"]);
    const places = await ctx.db
      .query("place")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", person._id))
      .take(200);
    return await Promise.all(
      places.filter((place) => place.regionId === regionId).map((place) => summary(ctx, place)),
    );
  },
});

export const listOwned = query({
  args: {},
  returns: v.array(placeSummary),
  handler: async (ctx) => {
    const person = await requirePerson(ctx);
    if (person.role !== "business_owner") return [];
    const owners = await ctx.db
      .query("placeOwner")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(200);
    const places = [];
    for (const owner of owners) {
      const place = await ctx.db.get("place", owner.placeId);
      if (place !== null && (await canReadPlace(ctx, person, place))) {
        places.push(await summary(ctx, place));
      }
    }
    return places;
  },
});

export const listAll = query({
  args: { regionId: v.string() },
  returns: v.array(placeSummary.extend({ ownerCount: v.number() })),
  handler: async (ctx, { regionId }) => {
    await requireRole(ctx, ["steward"]);
    const places = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId))
      .take(200);
    return await Promise.all(
      places.map(async (place) => {
        const owners = await ctx.db
          .query("placeOwner")
          .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", place._id))
          .take(200);
        return { ...(await summary(ctx, place)), ownerCount: owners.length };
      }),
    );
  },
});

export const create = mutation({
  args: {
    regionId: v.string(),
    kind: placeKindValidator,
    names: v.array(nameInput),
    pin: pinView,
    category: v.optional(v.string()),
  },
  returns: v.object({ placeId: v.id("place"), slug: v.string() }),
  handler: async (ctx, args) => {
    const person = await requireRole(ctx, ["creator"]);
    if (args.kind === "landmark" && person.role !== "steward") {
      throw appError("forbidden", "only a steward may mark a place as a landmark");
    }
    const names = checkedNames(args.regionId, args.names);
    checkPin(args.regionId, args.pin);
    if (args.category !== undefined) checkCategory(args.regionId, args.category);
    const slug = await uniqueSlug(ctx, args.regionId, slugBase(names));
    const placeId = await ctx.db.insert(
      "place",
      withMock(person, {
        regionId: args.regionId,
        kind: args.kind,
        category: args.category,
        slug,
        visibility: "draft" as const,
        createdBy: person._id,
        // The person who placed the pin is the first to confirm the place (FR-030).
        confirmedAt: Date.now(),
        confirmedBy: person._id,
      }),
    );
    for (const name of names) {
      await ctx.db.insert("placeName", { placeId, ...name, confirmedBy: person._id });
    }
    await ctx.db.insert("pin", {
      placeId,
      ...args.pin,
      placedBy: person._id,
      placedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.create",
      targetType: "place",
      targetId: placeId,
    });
    return { placeId, slug };
  },
});

export const updateNames = mutation({
  args: { placeId: v.id("place"), names: v.array(nameInput) },
  returns: v.null(),
  handler: async (ctx, { placeId, names: input }) => {
    const { person, place } = await requireEditablePlace(ctx, placeId);
    const names = checkedNames(place.regionId, input);
    for (const old of await namesFor(ctx, placeId)) await ctx.db.delete("placeName", old._id);
    for (const name of names) {
      await ctx.db.insert("placeName", { placeId, ...name, confirmedBy: person._id });
    }
    return null;
  },
});

export const movePin = mutation({
  args: { placeId: v.id("place"), lat: v.number(), lng: v.number() },
  returns: v.null(),
  handler: async (ctx, { placeId, lat, lng }) => {
    const { person, place } = await requireEditablePlace(ctx, placeId);
    checkPin(place.regionId, { lat, lng });
    const pin = await ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .unique();
    const values = { lat, lng, placedBy: person._id, placedAt: Date.now() };
    if (pin === null) await ctx.db.insert("pin", { placeId, ...values });
    else await ctx.db.patch("pin", pin._id, values);
    return null;
  },
});

export const setKind = mutation({
  args: { placeId: v.id("place"), kind: placeKindValidator },
  returns: v.null(),
  handler: async (ctx, { placeId, kind }) => {
    const person = await requireRole(ctx, ["steward"]);
    const place = await ctx.db.get("place", placeId);
    if (place === null) throw appError("not_found", "place not found");
    if (place.kind === kind) return null;
    await ctx.db.patch("place", placeId, { kind });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.set_kind",
      targetType: "place",
      targetId: placeId,
      diff: { kind: { from: placeKind(place), to: kind } },
    });
    return null;
  },
});

export const setCategory = mutation({
  args: {
    placeId: v.id("place"),
    category: v.optional(v.string()),
    clear: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { placeId, category, clear }) => {
    const { person, place } = await requireEditablePlace(ctx, placeId);
    if (clear === true ? category !== undefined : category === undefined) {
      throw appError("invalid_input", "provide a category or clear: true, but not both");
    }
    if (category !== undefined) checkCategory(place.regionId, category);
    if (place.category === category) return null;
    await ctx.db.patch("place", placeId, { category });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.set_category",
      targetType: "place",
      targetId: placeId,
      diff: { category: { from: place.category ?? null, to: category ?? null } },
    });
    return null;
  },
});

export const setVisibility = mutation({
  args: {
    placeId: v.id("place"),
    visibility: visibilityValidator,
    agreementRecorded: v.optional(v.boolean()),
    confirmFictional: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { placeId, visibility, agreementRecorded, confirmFictional }) => {
    const person = await requireRole(ctx, ["steward"]);
    const place = await ctx.db.get("place", placeId);
    if (place === null) throw appError("not_found", "place not found");
    if (visibility === "public") {
      if (place.isMock !== false) {
        throw appError("conflict", "a mock place can only be demo_public, with confirmFictional");
      }
      if (!(await namesFor(ctx, placeId)).some((name) => name.confirmedBy !== undefined)) {
        throw appError("conflict", "a confirmed name is required before leaving draft");
      }
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .unique();
      if (pin === null) throw appError("conflict", "a pin is required before a place goes public");
      if (
        regionPolicy(place.regionId).realBusinessesDraftOnly &&
        !(await isOpenListing(ctx, placeId))
      ) {
        throw appError(
          "conflict",
          "complete the launch pack (operator and takedown contact) before a place goes public",
        );
      }
    }
    if (visibility === "demo_public" && !(place.isMock === true && confirmFictional === true)) {
      throw appError(
        "conflict",
        "only explicitly confirmed fictional mock places may be demo_public; a real place is published with the public visibility after a steward confirms it",
      );
    }
    if (visibility !== "draft" && visibility !== "public") {
      if (!(await namesFor(ctx, placeId)).some((name) => name.confirmedBy !== undefined)) {
        throw appError("conflict", "a confirmed name is required before leaving draft");
      }
      const region = regionConfig(place.regionId);
      const policy = regionPolicy(place.regionId);
      if (visibility === "demo_public" && !region.demo.publicDemoEnabled) {
        throw appError("conflict", "the region's public demo is disabled");
      }
      if (visibility === "pilot" && !policy.allowPilotVisibility) {
        throw appError("conflict", "pilot visibility requires a complete region launch pack");
      }
      if (!place.isMock) {
        if (policy.realBusinessesDraftOnly) {
          throw appError(
            "conflict",
            "real businesses must stay in draft until the launch pack is complete",
          );
        }
        if (agreementRecorded !== true) {
          throw appError("conflict", "record the real business owner's agreement first");
        }
      }
    }
    const demoPublicBasis = visibility === "demo_public" ? ("fictional" as const) : undefined;
    if (place.visibility === visibility && place.demoPublicBasis === demoPublicBasis) return null;
    await ctx.db.patch("place", placeId, { visibility, demoPublicBasis });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.set_visibility",
      targetType: "place",
      targetId: placeId,
      diff: {
        visibility: { from: place.visibility, to: visibility },
        agreementRecorded: agreementRecorded ?? false,
        ...(visibility === "demo_public"
          ? {
              demoPublicBasis,
            }
          : {}),
      },
    });
    return null;
  },
});

export const attachOwner = mutation({
  args: { placeId: v.id("place"), personId: v.id("person") },
  returns: v.null(),
  handler: async (ctx, { placeId, personId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    if ((await ctx.db.get("place", placeId)) === null)
      throw appError("not_found", "place not found");
    const person = await ctx.db.get("person", personId);
    if (person === null) throw appError("not_found", "person not found");
    if (person.role !== "business_owner") {
      throw appError("conflict", "set the role to business_owner first");
    }
    if (await isVerifiedOwner(ctx, personId, placeId)) return null;
    const now = Date.now();
    const claims = [];
    for (const status of ["owner_confirmed", "published", "disputed"] as const) {
      const batch = await ctx.db
        .query("claim")
        .withIndex("by_placeId_and_origin_and_status", (q) =>
          q.eq("placeId", placeId).eq("origin", "open_text").eq("status", status),
        )
        .take(201);
      if (batch.length > 200)
        throw appError(
          "conflict",
          "too many open-text claims to attach an owner in one transaction",
        );
      claims.push(...batch);
    }
    // Snapshot every status before reopening: a disputed partner can become published in the cascade.
    for (const claim of claims) {
      await transitionClaim(ctx, claim._id, "reopen", { actor: "steward", by: steward._id, now });
    }
    await ctx.db.insert("placeOwner", {
      placeId,
      personId,
      verifiedBy: steward._id,
      verifiedAt: now,
    });
    await ctx.db.patch("person", personId, {
      verifiedAt: person.verifiedAt ?? now,
      verifiedBy: person.verifiedBy ?? steward._id,
    });
    const interviews = await ctx.db
      .query("interview")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .take(100);
    for (const interview of interviews) {
      if (interview.ownerPersonId === undefined) {
        await ctx.db.patch("interview", interview._id, { ownerPersonId: personId });
      }
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "place.attach_owner",
      targetType: "place",
      targetId: placeId,
      diff: { personId },
    });
    return null;
  },
});
