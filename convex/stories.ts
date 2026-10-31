import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  canEditPlace,
  isPubliclyReadablePlace,
  isSharedPublicly,
  isStoryShown,
  loadReadablePlace,
} from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { readMapNames } from "./lib/mapCopies";
import { limitContribution } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

const BODY_LIMIT = 1000;
/** How many of the newest stories and shared posts the home page looks through, and shows. */
const LATEST_SCAN = 40;
const LATEST_LIMIT = 8;

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
      if (!isStoryShown(place, story) && !addedByMe) continue;
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

const latestEntry = v.object({
  kind: v.union(v.literal("written"), v.literal("post")),
  id: v.string(),
  placeSlug: v.string(),
  placeNames: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  /** A written story, or the member's own line about a post they shared; never the post itself. */
  text: v.optional(v.string()),
  lang: v.optional(v.string()),
  platform: v.optional(v.string()),
  sharedBy: v.string(),
  addedAt: v.number(),
});

/**
 * The newest stories people shared about real places in the region, for the home page (FR-033):
 * written ones and linked posts together, newest first, each with the member's name. Only what
 * everyone may read, the same for every viewer; demo content stays with the walkthrough.
 */
export const latest = query({
  args: { regionId: v.string() },
  returns: v.array(latestEntry),
  handler: async (ctx, { regionId }) => {
    const places = new Map<Id<"place">, Doc<"place"> | null>();
    async function readable(placeId: Id<"place">) {
      if (!places.has(placeId)) {
        const place = await ctx.db.get("place", placeId);
        const ok =
          place !== null &&
          place.regionId === regionId &&
          isPubliclyReadablePlace(place) &&
          !place.isMock;
        places.set(placeId, ok ? place : null);
      }
      return places.get(placeId) ?? null;
    }
    async function nameOf(personId: Id<"person">) {
      return (await ctx.db.get("person", personId))?.displayName ?? "";
    }
    const entries: Infer<typeof latestEntry>[] = [];
    const written = await ctx.db
      .query("story")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .order("desc")
      .take(LATEST_SCAN);
    for (const story of written) {
      const place = await readable(story.placeId);
      if (place === null || !isStoryShown(place, story)) continue;
      entries.push({
        kind: "written",
        id: story._id,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        text: story.body,
        lang: story.lang,
        sharedBy: await nameOf(story.authorPersonId),
        addedAt: story._creationTime,
      });
    }
    const shared = await ctx.db
      .query("source")
      .withIndex("by_status_and_sharedAt", (q) => q.eq("status", "live").gte("sharedAt", 0))
      .order("desc")
      .take(LATEST_SCAN);
    for (const source of shared) {
      const place = await readable(source.placeId);
      if (place === null || !isSharedPublicly(place, source)) continue;
      entries.push({
        kind: "post",
        id: source._id,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        text: source.creatorNote,
        lang: source.noteLang,
        platform: source.platform,
        sharedBy: await nameOf(source.addedBy),
        addedAt: source.sharedAt ?? source._creationTime,
      });
    }
    return entries.sort((a, b) => b.addedAt - a.addedAt).slice(0, LATEST_LIMIT);
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
