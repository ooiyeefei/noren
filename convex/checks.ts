import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { query, type QueryCtx } from "./_generated/server";
import { isOpenListing, loadReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { readMapNames } from "./lib/mapCopies";
import { checkOutcomeValidator, checkProblemValidator, scriptValidator } from "./lib/validators";

// FR-030 and constitution principle II: a listing from open data is "Not yet confirmed" until a
// person who has been there says "Still here"; a report waits for a steward. Nothing here counts
// confirmations, so nothing can become a score (principle I).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Signed-in, and a demo account checks only demo places (principle II keeps the two apart). */
async function checkablePlace(ctx: QueryCtx, placeId: Doc<"place">["_id"]) {
  const person = await requirePerson(ctx);
  const place = await loadReadablePlace(ctx, person, placeId);
  if (person.isMock !== place.isMock) {
    throw appError(
      "forbidden",
      "a demo account checks only demo places, and a real one only real places",
    );
  }
  return { person, place };
}

export const confirm = mutation({
  args: { placeId: v.id("place") },
  returns: v.null(),
  handler: async (ctx, { placeId }) => {
    const { person, place } = await checkablePlace(ctx, placeId);
    const now = Date.now();
    // Pressing twice in a day records one confirmation.
    if (place.confirmedBy === person._id && now - (place.confirmedAt ?? 0) < DAY_MS) return null;
    await ctx.db.insert("placeCheck", {
      placeId,
      regionId: place.regionId,
      personId: person._id,
      verdict: "still_here",
      isMock: person.isMock,
    });
    await ctx.db.patch("place", placeId, { confirmedAt: now, confirmedBy: person._id });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.confirm",
      targetType: "place",
      targetId: placeId,
    });
    return null;
  },
});

export const report = mutation({
  args: { placeId: v.id("place"), problem: checkProblemValidator, note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { placeId, problem, note: input }) => {
    const { person, place } = await checkablePlace(ctx, placeId);
    const note = input?.trim() || undefined;
    if (note !== undefined && note.length > 500) {
      throw appError("invalid_input", "a note is at most 500 characters");
    }
    // One open report per person and place: sending again replaces what it says.
    const open = (
      await ctx.db
        .query("placeCheck")
        .withIndex("by_placeId_and_personId", (q) =>
          q.eq("placeId", placeId).eq("personId", person._id),
        )
        .order("desc")
        .take(50)
    ).find((check) => check.verdict === "something_wrong" && check.reviewedAt === undefined);
    if (open) {
      await ctx.db.patch("placeCheck", open._id, { problem, note });
    } else {
      await ctx.db.insert("placeCheck", {
        placeId,
        regionId: place.regionId,
        personId: person._id,
        verdict: "something_wrong",
        problem,
        note,
        isMock: person.isMock,
      });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "place.report",
      targetType: "place",
      targetId: placeId,
      diff: { problem },
    });
    return null;
  },
});

const reportView = v.object({
  _id: v.id("placeCheck"),
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
  problem: checkProblemValidator,
  note: v.optional(v.string()),
  reportedAt: v.number(),
  reporterName: v.string(),
  isMock: v.boolean(),
  confirmedAt: v.optional(v.number()),
});

export const listOpenReports = query({
  args: { regionId: v.string() },
  returns: v.array(reportView),
  handler: async (ctx, { regionId }) => {
    await requireRole(ctx, ["steward"]);
    const reports = await ctx.db
      .query("placeCheck")
      .withIndex("by_regionId_and_verdict_and_reviewedAt", (q) =>
        q.eq("regionId", regionId).eq("verdict", "something_wrong").eq("reviewedAt", undefined),
      )
      .take(100);
    const views = [];
    for (const check of reports) {
      const place = await ctx.db.get("place", check.placeId);
      const reporter = await ctx.db.get("person", check.personId);
      if (place === null || check.problem === undefined) continue;
      views.push({
        _id: check._id,
        placeId: place._id,
        slug: place.slug,
        names: place.mapNames ?? (await readMapNames(ctx, place._id)),
        problem: check.problem,
        note: check.note,
        reportedAt: check._creationTime,
        reporterName: reporter?.displayName ?? "",
        isMock: check.isMock,
        confirmedAt: place.confirmedAt,
      });
    }
    return views;
  },
});

export const resolveReport = mutation({
  args: { checkId: v.id("placeCheck"), outcome: checkOutcomeValidator },
  returns: v.null(),
  handler: async (ctx, { checkId, outcome }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const check = await ctx.db.get("placeCheck", checkId);
    if (check === null || check.verdict !== "something_wrong") {
      throw appError("not_found", "report not found");
    }
    if (check.reviewedAt !== undefined)
      throw appError("conflict", "this report was already decided");
    await ctx.db.patch("placeCheck", checkId, {
      reviewedBy: steward._id,
      reviewedAt: Date.now(),
      outcome,
    });
    const place = await ctx.db.get("place", check.placeId);
    if (outcome === "hidden" && place !== null && place.visibility !== "draft") {
      await ctx.db.patch("place", place._id, { visibility: "draft", demoPublicBasis: undefined });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "place.report_resolved",
      targetType: "place",
      targetId: check.placeId,
      diff: {
        outcome,
        problem: check.problem,
        ...(outcome === "hidden" && place
          ? { visibility: { from: place.visibility, to: "draft" } }
          : {}),
      },
    });
    return null;
  },
});

/**
 * A place a person made by hand was confirmed when they placed its pin. Run once after deploying:
 * `npx convex run checks:backfillHandMade '{"cursor":null}'`. Listings from open data stay unset.
 */
export const backfillHandMade = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ confirmed: v.number(), isDone: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("place").paginate({ numItems: 200, cursor });
    let confirmed = 0;
    for (const place of page.page) {
      if (place.confirmedAt !== undefined || (await isOpenListing(ctx, place._id))) continue;
      await ctx.db.patch("place", place._id, {
        confirmedAt: place._creationTime,
        confirmedBy: place.createdBy,
      });
      confirmed++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.checks.backfillHandMade, {
        cursor: page.continueCursor,
      });
    }
    return { confirmed, isDone: page.isDone };
  },
});
