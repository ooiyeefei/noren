import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isOpenListing } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { appError } from "./lib/errors";
import { internalMutation } from "./lib/gate";
import { regionConfig } from "./lib/region";

/**
 * Takes chain businesses off the public map (scripts/hide-chains.ts). The script decides which places
 * are chains from open data alone (the OSM Name Suggestion Index, a branch name shared by many places,
 * the Overture brand field) and sends each with the reasons; this mutation checks again what it can
 * and hides through the same path as an errand: the place becomes a draft marked `not_for_visitors`,
 * and a steward can put it back with setVisibility. Never a place that holds a story, a linked post
 * or a confirmed owner.
 */
const HIDE_BATCH = 100;

const signal = v.object({
  kind: v.union(v.literal("brand_list"), v.literal("branch_pattern"), v.literal("overture_brand")),
  reason: v.string(),
});

/** A steward who is a real person: a mock steward cannot take real listings off the map. */
async function realSteward(ctx: QueryCtx, personId: Id<"person">) {
  const person = await ctx.db.get("person", personId);
  if (person?.role !== "steward")
    throw appError("invalid_input", "stewardPersonId must name an existing steward");
  if (person.isMock) throw appError("invalid_input", "a mock steward cannot hide real listings");
  return person;
}

/**
 * Why a place must stay on the map whatever its name: someone wrote about it, linked a post, told its
 * story in an interview, or owns it. Null when nothing holds it.
 */
export async function whyKept(
  ctx: QueryCtx,
  place: Doc<"place">,
  { ignoreLinkedPosts = false }: { ignoreLinkedPosts?: boolean } = {},
): Promise<string | null> {
  const placeId = place._id;
  if (place.sharedAt !== undefined) return "added by a member";
  const found = async (table: "story" | "source" | "note" | "claim") =>
    (await ctx.db
      .query(table)
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId))
      .first()) !== null;
  if (await found("story")) return "has a story";
  if (!ignoreLinkedPosts && (await found("source"))) return "has a linked post";
  if (
    (await ctx.db
      .query("placeOwner")
      .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", placeId))
      .first()) !== null
  )
    return "has a confirmed owner";
  if (await found("note")) return "has a visitor note";
  if (await found("claim")) return "has a claim";
  if (
    (await ctx.db
      .query("pageVersion")
      .withIndex("by_placeId_and_version", (q) => q.eq("placeId", placeId))
      .first()) !== null
  )
    return "has a page";
  if (
    (await ctx.db
      .query("interview")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first()) !== null
  )
    return "has an interview";
  return null;
}

export const hideChains = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    /** The data the decision rests on, for the audit entry (rule set and snapshot versions). */
    basis: v.string(),
    places: v.array(v.object({ placeId: v.id("place"), signals: v.array(signal) })),
  },
  returns: v.object({
    hidden: v.number(),
    alreadyHidden: v.number(),
    skipped: v.array(v.object({ placeId: v.id("place"), reason: v.string() })),
  }),
  handler: async (ctx, { regionId, stewardPersonId, basis, places }) => {
    const steward = await realSteward(ctx, stewardPersonId);
    if (places.length > HIDE_BATCH) throw appError("invalid_input", `hide at most ${HIDE_BATCH}`);
    regionConfig(regionId);
    let hidden = 0;
    let alreadyHidden = 0;
    const skipped: { placeId: Id<"place">; reason: string }[] = [];
    for (const { placeId, signals } of places) {
      const place = await ctx.db.get("place", placeId);
      if (!place || place.regionId !== regionId) {
        skipped.push({ placeId, reason: "place not found in this region" });
        continue;
      }
      // A rerun meets the places it hid before: they are drafts already, and nothing is written twice.
      if (place.hiddenReason !== undefined) {
        alreadyHidden++;
        continue;
      }
      if (signals.length === 0) {
        skipped.push({ placeId, reason: "no reason given" });
        continue;
      }
      if (place.visibility !== "public" || place.isMock) {
        skipped.push({ placeId, reason: "not a real public place" });
        continue;
      }
      // Only a listing from open map data: a place a person made by hand is not decided by a name.
      if (!(await isOpenListing(ctx, placeId))) {
        skipped.push({ placeId, reason: "not an open-data listing" });
        continue;
      }
      const kept = await whyKept(ctx, place);
      if (kept) {
        skipped.push({ placeId, reason: kept });
        continue;
      }
      await ctx.db.patch("place", placeId, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "chain_listing.hide",
        targetType: "place",
        targetId: placeId,
        diff: {
          visibility: { from: "public", to: "draft" },
          hiddenReason: "not_for_visitors",
          chain: { basis, signals },
        },
      });
      hidden++;
    }
    return { hidden, alreadyHidden, skipped };
  },
});

/**
 * Takes listings off the map because the business has closed, on a steward's decision: nothing here
 * is decided from a name, so a place a person added can be hidden too. Same path as a chain: a draft
 * marked `not_for_visitors`, which a steward can put back with setVisibility. It still never hides a
 * place holding a story, a linked post or a confirmed owner: those come back as skipped to look at.
 */
export const hideClosed = internalMutation({
  args: {
    regionId: v.string(),
    stewardPersonId: v.id("person"),
    /** Why these places are believed closed, for the audit entry. */
    basis: v.string(),
    placeIds: v.array(v.id("place")),
    /** For a place the owner has named as closed: the posts about it don't keep it on the map. */
    evenWithPosts: v.optional(v.boolean()),
  },
  returns: v.object({
    hidden: v.number(),
    alreadyHidden: v.number(),
    skipped: v.array(v.object({ placeId: v.id("place"), reason: v.string() })),
  }),
  handler: async (ctx, { regionId, stewardPersonId, basis, placeIds, evenWithPosts }) => {
    const steward = await realSteward(ctx, stewardPersonId);
    if (placeIds.length > HIDE_BATCH) throw appError("invalid_input", `hide at most ${HIDE_BATCH}`);
    regionConfig(regionId);
    let hidden = 0;
    let alreadyHidden = 0;
    const skipped: { placeId: Id<"place">; reason: string }[] = [];
    for (const placeId of placeIds) {
      const place = await ctx.db.get("place", placeId);
      if (!place || place.regionId !== regionId) {
        skipped.push({ placeId, reason: "place not found in this region" });
        continue;
      }
      if (place.hiddenReason !== undefined) {
        alreadyHidden++;
        continue;
      }
      if (place.visibility !== "public" || place.isMock) {
        skipped.push({ placeId, reason: "not a real public place" });
        continue;
      }
      const kept = await whyKept(ctx, place, { ignoreLinkedPosts: evenWithPosts });
      if (kept) {
        skipped.push({ placeId, reason: kept });
        continue;
      }
      await ctx.db.patch("place", placeId, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: steward._id,
        action: "closed_listing.hide",
        targetType: "place",
        targetId: placeId,
        diff: {
          visibility: { from: "public", to: "draft" },
          hiddenReason: "not_for_visitors",
          closed: { basis },
        },
      });
      hidden++;
    }
    return { hidden, alreadyHidden, skipped };
  },
});
