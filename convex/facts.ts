import { v } from "convex/values";
import { dayAt, dayToTime } from "../src/lib/collection/reach";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canSeeSource } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireConfirmedName, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { consumeRateLimit } from "./lib/rateLimit";
import { isRegionOn, factsOn, isFactKey, regionConfig } from "./lib/region";
import { canReadPlace, type Viewer } from "./lib/visibility";
import { factValue } from "./tables/facts";

const DAY_MS = 24 * 60 * 60 * 1000;

async function readablePlace(ctx: QueryCtx, viewer: Viewer, placeId: Id<"place">) {
  const place = await ctx.db.get("place", placeId);
  if (!place) return null;
  return (await canReadPlace(ctx, viewer, place)) ? place : null;
}

const factDetails = {
  _id: v.id("placeFact"),
  key: v.string(),
  value: factValue,
  day: v.string(),
  isOld: v.boolean(),
  isMock: v.boolean(),
};

export const forPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(
    v.union(
      v.object({
        ...factDetails,
        basis: v.literal("member"),
        reporterName: v.string(),
        addedByMe: v.boolean(),
      }),
      v.object({
        ...factDetails,
        basis: v.literal("post"),
        source: v.object({
          _id: v.id("source"),
          url: v.string(),
          platform: v.string(),
          authorHandle: v.optional(v.string()),
          authorUrl: v.optional(v.string()),
        }),
        quote: v.string(),
      }),
    ),
  ),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await readablePlace(ctx, viewer, placeId);
    if (!place) return [];
    const region = regionConfig(place.regionId);
    // Age is measured in whole local dates, the precision stored on each report.
    const today = dayToTime(dayAt(Date.now(), region.collection.utcOffsetHours));
    const facts = await ctx.db
      .query("placeFact")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
      .order("desc")
      .take(60);
    const shown = [];
    for (const fact of facts) {
      const { _id, key, value, day, isMock, basis, personId, sourceId, quote } = fact;
      if (isMock !== place.isMock) continue;
      const isOld =
        region.factMaxAgeDays !== undefined &&
        today - dayToTime(day) > region.factMaxAgeDays * DAY_MS;
      const details = { _id, key, value, day, isOld, isMock };
      if (basis === "member" && personId !== undefined) {
        const person = await ctx.db.get("person", personId);
        shown.push({
          ...details,
          basis,
          reporterName: person?.displayName ?? "",
          addedByMe: viewer?._id === personId,
        });
      } else if (basis === "post" && sourceId !== undefined && quote) {
        const source = await ctx.db.get("source", sourceId);
        if (
          source?.origin !== "story_finder" ||
          source.isMock !== isMock ||
          !(await canSeeSource(ctx, viewer, place, source))
        )
          continue;
        shown.push({
          ...details,
          basis,
          source: {
            _id: source._id,
            url: source.canonicalUrl,
            platform: source.platform,
            authorHandle: source.authorHandle,
            authorUrl: source.authorUrl,
          },
          quote,
        });
      }
    }
    return shown;
  },
});

export const report = mutation({
  args: { placeId: v.id("place"), key: v.string(), value: factValue },
  returns: v.id("placeFact"),
  handler: async (ctx, { placeId, key, value }) => {
    if (!factsOn()) throw appError("not_found", "Practical facts are turned off.");
    const person = await requirePerson(ctx);
    const place = await readablePlace(ctx, person, placeId);
    if (!place) throw appError("not_found", "Place not found.");
    if (person.isMock !== place.isMock)
      throw appError("forbidden", "Demo reports stay on demo places.");
    const region = regionConfig(place.regionId);
    if (!isFactKey(region, key)) throw appError("invalid_input", "Unknown practical fact.");
    requireConfirmedName(person);

    const now = Date.now();
    const limit = await consumeRateLimit(ctx, {
      key: `contribution:fact:${person._id}`,
      limit: 30,
      windowMs: DAY_MS,
      now,
    });
    if (!limit.ok) throw appError("rate_limited", "Too many practical facts reported today.");

    const day = dayAt(now, region.collection.utcOffsetHours);
    const previous = await ctx.db
      .query("placeFact")
      .withIndex("by_personId_and_placeId_and_key", (q) =>
        q.eq("personId", person._id).eq("placeId", placeId).eq("key", key),
      )
      .order("desc")
      .first();
    let factId;
    if (previous?.status === "live") {
      factId = previous._id;
      await ctx.db.patch("placeFact", factId, { value, day });
    } else {
      factId = await ctx.db.insert("placeFact", {
        placeId,
        regionId: place.regionId,
        key,
        value,
        basis: "member",
        personId: person._id,
        day,
        status: "live",
        isMock: person.isMock,
      });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "fact.report",
      targetType: "fact",
      targetId: factId,
      diff: { value },
    });
    return factId;
  },
});

export const remove = mutation({
  args: { factId: v.id("placeFact") },
  returns: v.null(),
  handler: async (ctx, { factId }) => {
    const person = await requirePerson(ctx);
    const fact = await ctx.db.get("placeFact", factId);
    if (
      !fact ||
      !isRegionOn(fact.regionId) ||
      fact.basis !== "member" ||
      fact.personId !== person._id
    )
      throw appError("not_found", "Report not found.");
    if (fact.status === "live") await ctx.db.patch("placeFact", factId, { status: "removed" });
    return null;
  },
});

/** The steward entry points share the status transition and its audit entry. */
export async function hideFact(
  ctx: MutationCtx,
  steward: Doc<"person">,
  factId: Id<"placeFact">,
  input: string,
) {
  const reason = input.trim();
  if (!reason || reason.length > 2000)
    throw appError("invalid_input", "A reason must be 1 to 2000 characters.");
  const fact = await ctx.db.get("placeFact", factId);
  if (!fact || !isRegionOn(fact.regionId)) throw appError("not_found", "Practical fact not found.");
  if (fact.status !== "live") return;
  await ctx.db.patch("placeFact", factId, { status: "hidden" });
  await writeAudit(ctx, {
    actorKind: "person",
    actorPersonId: steward._id,
    action: "fact.hide",
    targetType: "fact",
    targetId: factId,
    diff: { reason },
  });
}

export const hide = mutation({
  args: { factId: v.id("placeFact"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { factId, reason }) => {
    const steward = await requireRole(ctx, ["steward"]);
    await hideFact(ctx, steward, factId, reason);
    return null;
  },
});
