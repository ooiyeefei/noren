import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { canEditPlace, loadReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { limitContribution } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";
import { canReadPlace } from "./lib/visibility";

const BODY_LIMIT = 1000;

const storyView = v.object({
  _id: v.id("story"),
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  addedAt: v.number(),
  isMock: v.boolean(),
  addedByMe: v.boolean(),
  canRemove: v.boolean(),
});

/**
 * Any signed-in member writes what they heard, saw or tasted at a place they can read (FR-033). The
 * form says the story is shown in public with their name; writing it is the agreement.
 */
export const add = mutation({
  args: { placeId: v.id("place"), body: v.string(), lang: v.string() },
  returns: v.id("story"),
  handler: async (ctx, { placeId, body, lang }) => {
    const person = await requirePerson(ctx);
    const place = await loadReadablePlace(ctx, person, placeId);
    const text = body.trim();
    if (!text || text.length > BODY_LIMIT)
      throw appError("invalid_input", `a story is 1 to ${BODY_LIMIT} characters`);
    if (!isRegionLocale(regionConfig(place.regionId), lang))
      throw appError("invalid_input", "lang must be a region locale");
    await limitContribution(ctx, person, "story");
    return await ctx.db.insert(
      "story",
      withMock(person, {
        placeId,
        authorPersonId: person._id,
        body: text,
        lang,
        status: "live" as const,
      }),
    );
  },
});

/** Live stories, newest first. A demo account's story shows on a real place only to its writer. */
export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(storyView),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return [];
    const stories = await ctx.db
      .query("story")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
      .order("desc")
      .take(50);
    const views = [];
    for (const story of stories) {
      const addedByMe = viewer !== null && story.authorPersonId === viewer._id;
      if (story.isMock !== place.isMock && !addedByMe) continue;
      const author = await ctx.db.get("person", story.authorPersonId);
      views.push({
        _id: story._id,
        body: story.body,
        lang: story.lang,
        authorName: author?.displayName ?? "",
        addedAt: story._creationTime,
        isMock: story.isMock,
        addedByMe,
        canRemove: addedByMe || canEditPlace(viewer, place),
      });
    }
    return views;
  },
});

/** The writer takes their story down at any time; the place's editor or a steward may too. */
export const remove = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    const person = await requirePerson(ctx);
    const story: Doc<"story"> | null = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    if (story.authorPersonId !== person._id) {
      const place = await loadReadablePlace(ctx, person, story.placeId);
      if (!canEditPlace(person, place))
        throw appError(
          "forbidden",
          "only the writer, the place's editor or a steward may remove it",
        );
    }
    if (story.status === "hidden") return null;
    await ctx.db.patch("story", storyId, { status: "hidden" });
    if (person.role === "steward" && story.authorPersonId !== person._id)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "story.remove",
        targetType: "story",
        targetId: storyId,
      });
    return null;
  },
});
