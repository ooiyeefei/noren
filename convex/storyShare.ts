import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isPubliclyReadablePlace, isStoryShown, isVerifiedOwner } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { readMapNames, readMapPin } from "./lib/mapCopies";
import { regionConfig } from "./lib/region";
import { townOf } from "../src/lib/region/neighbourhoods";
import { placeLabel } from "../src/lib/share/caption";

/** How many consenting stories the steward queue reads; newer ones come first. */
const QUEUE_LIMIT = 50;

/** What a picture of a story shows, and nothing else. It never carries a photo. */
const cardView = v.object({
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  placeSlug: v.string(),
  /** The place in English, and in Japanese when it has a Japanese name. */
  placeEnglish: v.string(),
  placeJapanese: v.union(v.string(), v.null()),
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

/** The words of a story and where it was told: what both the picture and the caption are made from. */
async function describe(
  ctx: QueryCtx,
  { story, place }: { story: Doc<"story">; place: Doc<"place"> },
) {
  const author = await ctx.db.get("person", story.authorPersonId);
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
  };
}

/** The town a place is in, for the caption's hashtags: its pin's town, else the region's own name. */
async function townOfPlace(ctx: QueryCtx, place: Doc<"place">) {
  const pin = place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, place._id);
  return townOf(regionConfig(place.regionId), pin);
}

/** The same for every viewer: the words of a live, shown story for the picture route to draw. */
export const card = query({
  args: { storyId: v.id("story") },
  returns: v.union(cardView, v.null()),
  handler: async (ctx, { storyId }) => {
    const found = await shareable(ctx, await ctx.db.get("story", storyId));
    return found === null ? null : await describe(ctx, found);
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

/**
 * The writer turns the tick on or off on their own story, as they could when writing it. Each real
 * change is audited; asking for the state the story is already in changes and records nothing.
 * Turning it on needs a live story on a region that offers the tick. A copy already posted by hand
 * stays where it is.
 */
async function changeConsent(
  ctx: MutationCtx,
  person: Doc<"person">,
  storyId: Id<"story">,
  on: boolean,
): Promise<void> {
  const story = await ctx.db.get("story", storyId);
  if (story === null) throw appError("not_found", "story not found");
  if (story.authorPersonId !== person._id)
    throw appError("forbidden", "only the writer may change this");
  if (on === (story.shareConsentAt !== undefined)) return;
  if (on) {
    const place = await ctx.db.get("place", story.placeId);
    if (story.status !== "live" || place === null)
      throw appError("conflict", "only a story that is showing can be offered for sharing");
    if (!regionConfig(place.regionId).sharing.norenAccount)
      throw appError("invalid_input", "this region does not offer sharing on Instagram");
  }
  await ctx.db.patch("story", storyId, { shareConsentAt: on ? Date.now() : undefined });
  await writeAudit(ctx, {
    actorKind: "person",
    actorPersonId: person._id,
    action: on ? "story.share_consent_given" : "story.share_consent_withdrawn",
    targetType: "story",
    targetId: storyId,
    diff: { shareConsent: on },
  });
}

/** The writer turns on or off that Noren and the place may share this story on Instagram. */
export const setShareConsent = mutation({
  args: { storyId: v.id("story"), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { storyId, on }) => {
    await changeConsent(ctx, await requirePerson(ctx), storyId, on);
    return null;
  },
});

/** The older name for turning the tick off; a page opened before the change may still call it. */
export const withdraw = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    await changeConsent(ctx, await requirePerson(ctx), storyId, false);
    return null;
  },
});

const kitView = v.object({
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  placeEnglish: v.string(),
  placeJapanese: v.union(v.string(), v.null()),
  /** The town, in both languages, for the caption's hashtags. */
  town: v.object({ en: v.string(), ja: v.string() }),
  /** Who is looking: the story's writer, the place's verified owner, or a steward. */
  viewer: v.union(v.literal("writer"), v.literal("owner"), v.literal("steward")),
  /** The writer's tick is on. */
  optedIn: v.boolean(),
  /** The region offers the tick, so the writer may turn it on. */
  canOptIn: v.boolean(),
});

/**
 * Who may have the Instagram kit for a story. The writer always has it for their own story. The
 * place's verified owner and a steward have it only while the writer's tick is on. Anyone else, and
 * a signed-out visitor, has none. This is the one place that rule lives.
 */
async function kitViewer(
  ctx: QueryCtx,
  viewer: Doc<"person"> | null,
  { story, place }: { story: Doc<"story">; place: Doc<"place"> },
): Promise<"writer" | "owner" | "steward" | null> {
  if (viewer === null) return null;
  if (story.authorPersonId === viewer._id) return "writer";
  if (story.shareConsentAt === undefined) return null;
  if (viewer.role === "steward") return "steward";
  return (await isVerifiedOwner(ctx, viewer._id, place._id)) ? "owner" : null;
}

/**
 * What the kit is made from, for the people the rule above allows and null for everyone else. A
 * story found in a public post is not a story row, so it never has a kit; this reads written stories.
 */
export const kit = query({
  args: { storyId: v.id("story") },
  returns: v.union(kitView, v.null()),
  handler: async (ctx, { storyId }) => {
    const found = await shareable(ctx, await ctx.db.get("story", storyId));
    if (found === null) return null;
    const viewer = await kitViewer(ctx, await currentPerson(ctx), found);
    if (viewer === null) return null;
    const { body, lang, authorName, placeEnglish, placeJapanese } = await describe(ctx, found);
    return {
      body,
      lang,
      authorName,
      placeEnglish,
      placeJapanese,
      town: await townOfPlace(ctx, found.place),
      viewer,
      optedIn: found.story.shareConsentAt !== undefined,
      canOptIn: regionConfig(found.place.regionId).sharing.norenAccount,
    };
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
  town: v.object({ en: v.string(), ja: v.string() }),
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
      const card = await describe(ctx, found);
      entries.push({
        storyId: story._id,
        body: card.body,
        lang: card.lang,
        authorName: card.authorName,
        placeSlug: card.placeSlug,
        placeEnglish: card.placeEnglish,
        placeJapanese: card.placeJapanese,
        town: await townOfPlace(ctx, found.place),
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
