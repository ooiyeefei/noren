import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace, isStoryShown } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { readMapNames } from "./lib/mapCopies";
import { placePhotoRules, storyPhotoViews } from "./lib/storyPhotos";
import { regionConfig } from "./lib/region";
import { placeLabel } from "../src/lib/share/caption";

/** How many consenting stories the steward queue reads; newer ones come first. */
const QUEUE_LIMIT = 50;

/** What a picture of a story shows, and nothing else. */
const cardView = v.object({
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  placeSlug: v.string(),
  /** The place in English, and in Japanese when it has a Japanese name. */
  placeEnglish: v.string(),
  placeJapanese: v.union(v.string(), v.null()),
  /** The storage key of the story's first live photo, if it has one. */
  photoKey: v.union(v.string(), v.null()),
});

/**
 * The story and its place, only while a picture of it may be made: the story is live and written
 * on a real place that everyone may read. A hidden or removed story, a demo story and a place
 * that isn't public all come back as null, so no picture exists for them.
 */
async function shareable(
  ctx: QueryCtx,
  story: Doc<"story"> | null,
): Promise<{ story: Doc<"story">; place: Doc<"place"> } | null> {
  if (story === null) return null;
  const place = await ctx.db.get("place", story.placeId);
  if (place === null || place.isMock || !isPubliclyReadablePlace(place)) return null;
  if (story.isMock || !isStoryShown(place, story)) return null;
  return { story, place };
}

async function cardOf(
  ctx: QueryCtx,
  { story, place }: { story: Doc<"story">; place: Doc<"place"> },
) {
  const author = await ctx.db.get("person", story.authorPersonId);
  // Seen as a signed-out visitor sees it: no waiting photo and none the owner has asked to be without.
  const rules = await placePhotoRules(ctx, null, place);
  const photos = await storyPhotoViews(ctx, story._id, false, rules);
  const label = placeLabel(
    place.mapNames ?? (await readMapNames(ctx, place._id)),
    regionConfig(place.regionId),
  );
  return {
    body: story.body,
    lang: story.lang,
    authorName: author?.displayName ?? "",
    placeSlug: place.slug,
    placeEnglish: label.english,
    placeJapanese: label.japanese,
    photoKey: photos[0]?.key ?? null,
  };
}

/** The same for every viewer: the words of a live, shown story for the picture route to draw. */
export const card = query({
  args: { storyId: v.id("story") },
  returns: v.union(cardView, v.null()),
  handler: async (ctx, { storyId }) => {
    const found = await shareable(ctx, await ctx.db.get("story", storyId));
    return found === null ? null : await cardOf(ctx, found);
  },
});

/** Whether the viewer, as the writer, has ticked that Noren may feature this story. */
export const consentOf = query({
  args: { storyId: v.id("story") },
  returns: v.boolean(),
  handler: async (ctx, { storyId }) => {
    const viewer = await currentPerson(ctx);
    const story = await ctx.db.get("story", storyId);
    if (viewer === null || story === null || story.authorPersonId !== viewer._id) return false;
    return story.status === "live" && story.shareConsentAt !== undefined;
  },
});

/** The writer takes the tick back at any time. A copy already posted by hand stays where it is. */
export const withdraw = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    const person = await requirePerson(ctx);
    const story = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    if (story.authorPersonId !== person._id)
      throw appError("forbidden", "only the writer may withdraw this");
    if (story.shareConsentAt !== undefined)
      await ctx.db.patch("story", storyId, { shareConsentAt: undefined });
    return null;
  },
});

const queueEntry = v.object({
  storyId: v.id("story"),
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  placeSlug: v.string(),
  placeEnglish: v.string(),
  placeJapanese: v.union(v.string(), v.null()),
  hasPhoto: v.boolean(),
  consentAt: v.number(),
  postedAt: v.union(v.number(), v.null()),
});

/** Live stories whose writer ticked it, newest first, for a steward to post by hand. */
export const queue = query({
  args: { regionId: v.string() },
  returns: v.array(queueEntry),
  handler: async (ctx, { regionId }) => {
    await requireRole(ctx, ["steward"]);
    const consented = await ctx.db
      .query("story")
      .withIndex("by_status_and_shareConsentAt", (q) =>
        q.eq("status", "live").gt("shareConsentAt", 0),
      )
      .order("desc")
      .take(QUEUE_LIMIT);
    const entries = [];
    for (const story of consented) {
      const found = await shareable(ctx, story);
      if (found === null || found.place.regionId !== regionId) continue;
      const card = await cardOf(ctx, found);
      entries.push({
        storyId: story._id,
        body: card.body,
        lang: card.lang,
        authorName: card.authorName,
        placeSlug: card.placeSlug,
        placeEnglish: card.placeEnglish,
        placeJapanese: card.placeJapanese,
        hasPhoto: card.photoKey !== null,
        consentAt: story.shareConsentAt!,
        postedAt: story.sharePostedAt ?? null,
      });
    }
    return entries;
  },
});

/** A steward records that they posted the story on Noren's accounts. Noren never posts by itself. */
export const markPosted = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const story = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    if (story.status !== "live" || story.shareConsentAt === undefined)
      throw appError("conflict", "this story is not offered for sharing");
    if (story.sharePostedAt !== undefined) return null;
    await ctx.db.patch("story", storyId, { sharePostedAt: Date.now() });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "story.share_posted",
      targetType: "story",
      targetId: storyId satisfies Id<"story">,
    });
    return null;
  },
});
