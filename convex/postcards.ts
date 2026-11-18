import { v, type Infer } from "convex/values";
import {
  CARDS_KEPT,
  CARDS_PER_DAY,
  EXCERPT_MAX,
  FRONT_PHOTOS,
  MAX_PLACES,
  MESSAGE_MAX,
  NOTE_MAX,
  RECIPIENT_MAX,
  cut,
  isPostcardCode,
  lengthOf,
  newPostcardCode,
  tidyLine,
  tidyText,
} from "../src/lib/postcard/rules";
import type { DraftPlace } from "../src/lib/postcard/draft";
import { aiConfig } from "../src/lib/ai/config";
import { activeRegionConfig } from "../src/lib/region/registry";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { isStoryShown } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requireConfirmedName, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { readMapNames } from "./lib/mapCopies";
import { isPublicRealPlace, nameView } from "./lib/publicPool";
import { consumeRateLimit, limitContribution } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";
import { placePhotoRules, storyPhotoViews } from "./lib/storyPhotos";
import { earliestByPlace } from "./stampBook";
import { postcardItem } from "./tables/postcard";

// The trip postcard (specs/004-trip-postcard), behind features.postcard in the region file: off, every
// function here answers "not found" to everyone, signed in or not.
//
// A card holds a member's own moments (stories they wrote and places they hold a stamp for), a message
// in their own words and a private link. It copies nothing: each read works out what still shows.

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
/** Help-me-write requests one member may make a minute. Each is a model call. */
export const DRAFTS_PER_MINUTE = 5;
/** Rows read to find a member's own stories for the picker. */
const STORY_SCAN = 200;
/** Moments the picker offers, newest first. */
const MOMENT_LIMIT = 120;

/** Whether the postcard is switched on for this region. */
export function postcardOn(regionId: string): boolean {
  return regionConfig(regionId).features.postcard;
}

/** The switch, before anything else: off is "not found" for everyone. */
function requireOn(): string {
  const regionId = activeRegionConfig().id;
  if (!postcardOn(regionId)) throw appError("not_found", "Not found");
  return regionId;
}

const itemArg = v.union(
  v.object({ kind: v.literal("story"), storyId: v.id("story") }),
  v.object({ kind: v.literal("stamp"), placeId: v.id("place") }),
);
type ItemArg = Infer<typeof itemArg>;

type Resolved = {
  item: Infer<typeof postcardItem>;
  place: Doc<"place">;
  story: Doc<"story"> | null;
};

/**
 * The caller's own moments, checked one by one. A story must be theirs and still showing on a real
 * public place; a stamp must be one they hold. One moment per place, one to MAX_PLACES in all. Another
 * member's story is refused as forbidden, and nothing else about it is said.
 */
async function resolveItems(
  ctx: QueryCtx,
  person: Doc<"person">,
  regionId: string,
  items: readonly ItemArg[],
): Promise<Resolved[]> {
  if (items.length < 1 || items.length > MAX_PLACES)
    throw appError("invalid_input", `a postcard holds one to ${MAX_PLACES} places`);
  const stamps = items.some((item) => item.kind === "stamp")
    ? await earliestByPlace(ctx, person)
    : null;
  const resolved: Resolved[] = [];
  const seen = new Set<Id<"place">>();
  for (const item of items) {
    let story: Doc<"story"> | null = null;
    let placeId: Id<"place">;
    if (item.kind === "story") {
      story = await ctx.db.get("story", item.storyId);
      if (story === null) throw appError("not_found", "story not found");
      if (story.authorPersonId !== person._id)
        throw appError("forbidden", "a postcard can hold only your own stories");
      placeId = story.placeId;
    } else {
      placeId = item.placeId;
    }
    const place = await ctx.db.get("place", placeId);
    if (place === null || place.regionId !== regionId || !isPublicRealPlace(place))
      throw appError("invalid_input", "that place can't go on a postcard");
    if (story !== null && !isStoryShown(place, story))
      throw appError("invalid_input", "that story is not showing, so it can't go on a postcard");
    if (stamps !== null && story === null && !stamps.has(placeId))
      throw appError("forbidden", "a postcard can hold only places you have a stamp for");
    if (seen.has(placeId)) throw appError("invalid_input", "each place can be on a postcard once");
    seen.add(placeId);
    resolved.push({
      item:
        story === null
          ? { kind: "stamp", placeId }
          : { kind: "story", storyId: story._id, placeId },
      place,
      story,
    });
  }
  return resolved;
}

const namesOf = async (ctx: QueryCtx, place: Doc<"place">) =>
  place.mapNames ?? (await readMapNames(ctx, place._id));

// ---------------------------------------------------------------------------------------------
// The sender's side
// ---------------------------------------------------------------------------------------------

const momentView = v.object({
  kind: v.union(v.literal("story"), v.literal("stamp")),
  storyId: v.optional(v.id("story")),
  placeId: v.id("place"),
  slug: v.string(),
  names: v.array(nameView),
  at: v.number(),
  /** The start of the member's own story, for them to recognise it. */
  excerpt: v.optional(v.string()),
  /** Photos that would show on the card: live ones, to anyone who opens the link. */
  photoCount: v.number(),
  /** The writer ticked that AI may read this story, so the writing helper may use its words. */
  aiMayRead: v.boolean(),
});

/**
 * What the caller can put on a card: their own live stories on real public places, and the places
 * they hold a stamp for that have no such story. Newest first. Only their own, only to them.
 */
export const moments = query({
  args: {},
  returns: v.array(momentView),
  handler: async (ctx) => {
    const regionId = requireOn();
    const person = await requirePerson(ctx);
    const stories = await ctx.db
      .query("story")
      .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", person._id))
      .order("desc")
      .take(STORY_SCAN);
    const out: Infer<typeof momentView>[] = [];
    const withStory = new Set<Id<"place">>();
    for (const story of stories) {
      const place = await ctx.db.get("place", story.placeId);
      if (
        place === null ||
        place.regionId !== regionId ||
        !isPublicRealPlace(place) ||
        !isStoryShown(place, story)
      )
        continue;
      withStory.add(place._id);
      const photos = await storyPhotoViews(
        ctx,
        story._id,
        false,
        await placePhotoRules(ctx, null, place),
      );
      out.push({
        kind: "story",
        storyId: story._id,
        placeId: place._id,
        slug: place.slug,
        names: await namesOf(ctx, place),
        at: story._creationTime,
        excerpt: cut(story.body.replace(/\s+/g, " ").trim(), EXCERPT_MAX),
        photoCount: photos.length,
        aiMayRead: story.connectorAllowedAt !== undefined,
      });
    }
    for (const [placeId, at] of await earliestByPlace(ctx, person)) {
      if (withStory.has(placeId)) continue;
      const place = await ctx.db.get("place", placeId);
      if (place === null || place.regionId !== regionId || !isPublicRealPlace(place)) continue;
      out.push({
        kind: "stamp",
        placeId,
        slug: place.slug,
        names: await namesOf(ctx, place),
        at,
        photoCount: 0,
        aiMayRead: false,
      });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, MOMENT_LIMIT);
  },
});

const mineView = v.object({
  _id: v.id("postcard"),
  code: v.string(),
  recipientName: v.string(),
  messageStart: v.string(),
  messageLang: v.string(),
  aiAssisted: v.boolean(),
  sentAt: v.number(),
  places: v.array(
    v.object({
      slug: v.string(),
      names: v.array(nameView),
      /** False once the story on the card has been removed: the card no longer shows its words or photo. */
      showing: v.boolean(),
    }),
  ),
});

/** The caller's own cards, newest first. Each carries the code that is its link. */
export const mine = query({
  args: {},
  returns: v.array(mineView),
  handler: async (ctx) => {
    requireOn();
    const person = await requirePerson(ctx);
    const cards = await ctx.db
      .query("postcard")
      .withIndex("by_senderPersonId", (q) => q.eq("senderPersonId", person._id))
      .order("desc")
      .take(CARDS_KEPT);
    const views = [];
    for (const card of cards) {
      const places = [];
      for (const item of card.items) {
        const place = await ctx.db.get("place", item.placeId);
        if (place === null) continue;
        const story = item.kind === "story" ? await ctx.db.get("story", item.storyId) : null;
        places.push({
          slug: place.slug,
          names: await namesOf(ctx, place),
          showing: item.kind === "stamp" || (story !== null && isStoryShown(place, story)),
        });
      }
      views.push({
        _id: card._id,
        code: card.code,
        recipientName: card.recipientName,
        messageStart: cut(card.message.replace(/\s+/g, " "), 120),
        messageLang: card.messageLang,
        aiAssisted: card.aiAssisted,
        sentAt: card._creationTime,
        places,
      });
    }
    return views;
  },
});

/**
 * Makes the card and returns its code, which is the whole of its link. `aiAssisted` says the member's
 * message began as a draft from the writing helper; the card then says so.
 */
export const create = mutation({
  args: {
    items: v.array(itemArg),
    recipientName: v.string(),
    message: v.string(),
    messageLang: v.string(),
    aiAssisted: v.boolean(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    const regionId = requireOn();
    const person = await requirePerson(ctx);
    // The card shows the member's name, so they must have seen it first (FR-131), as for a story.
    requireConfirmedName(person);
    if (person.isMock) throw appError("forbidden", "a demo account can't send postcards");
    const region = regionConfig(regionId);
    if (!isRegionLocale(region, args.messageLang))
      throw appError("invalid_input", "that language is not offered");
    const recipientName = tidyLine(args.recipientName);
    if (lengthOf(recipientName) < 1 || lengthOf(recipientName) > RECIPIENT_MAX)
      throw appError("invalid_input", `say who it is for in 1 to ${RECIPIENT_MAX} characters`);
    const message = tidyText(args.message);
    if (lengthOf(message) < 1 || lengthOf(message) > MESSAGE_MAX)
      throw appError("invalid_input", `the message must be 1 to ${MESSAGE_MAX} characters`);
    const resolved = await resolveItems(ctx, person, regionId, args.items);
    const kept = await ctx.db
      .query("postcard")
      .withIndex("by_senderPersonId", (q) => q.eq("senderPersonId", person._id))
      .take(CARDS_KEPT + 1);
    if (kept.length >= CARDS_KEPT)
      throw appError("conflict", "delete an old postcard before making another");
    const now = Date.now();
    const limit = await consumeRateLimit(ctx, {
      key: `postcard:create:${person._id}`,
      limit: CARDS_PER_DAY,
      windowMs: DAY_MS,
      now,
    });
    if (!limit.ok) throw appError("rate_limited", "too many postcards today");
    let code = newPostcardCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await ctx.db
        .query("postcard")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (clash === null) break;
      code = newPostcardCode();
    }
    await ctx.db.insert("postcard", {
      code,
      senderPersonId: person._id,
      regionId,
      recipientName,
      message,
      messageLang: args.messageLang,
      aiAssisted: args.aiAssisted,
      items: resolved.map(({ item }) => item),
    });
    return { code };
  },
});

/** The sender takes a card down. The row goes, so its link stops working in this transaction. */
export const remove = mutation({
  args: { postcardId: v.id("postcard") },
  returns: v.null(),
  handler: async (ctx, { postcardId }) => {
    requireOn();
    const person = await requirePerson(ctx);
    const card = await ctx.db.get("postcard", postcardId);
    if (card === null) throw appError("not_found", "postcard not found");
    if (card.senderPersonId !== person._id)
      throw appError("forbidden", "only the sender may delete a postcard");
    await ctx.db.delete("postcard", postcardId);
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// The recipient's side
// ---------------------------------------------------------------------------------------------

const cardPlace = v.object({
  slug: v.string(),
  names: v.array(nameView),
  /** The start of the sender's story here. Absent for a stamp, and once the story is removed. */
  excerpt: v.optional(v.object({ text: v.string(), lang: v.string() })),
  /** Live photos of the story, as storage keys. Gone with the story or the photo. */
  photos: v.array(v.object({ key: v.string(), width: v.number(), height: v.number() })),
});

export const cardView = v.object({
  recipientName: v.string(),
  message: v.string(),
  messageLang: v.string(),
  aiAssisted: v.boolean(),
  fromName: v.string(),
  sentAt: v.number(),
  regionId: v.string(),
  places: v.array(cardPlace),
});

/**
 * What the person with the link sees. No sign-in: the code is the key. Null for a wrong code, a
 * deleted card and a sender who left, and for everyone while the switch is off. A place that has left
 * the public map drops off the card; a story that is no longer showing leaves its place with no words
 * and no photo. It reads the sender's name as it is now.
 */
export const view = query({
  args: { code: v.string() },
  returns: v.union(cardView, v.null()),
  handler: async (ctx, { code }) => {
    const regionId = activeRegionConfig().id;
    if (!postcardOn(regionId) || !isPostcardCode(code)) return null;
    const card = await ctx.db
      .query("postcard")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (card === null || card.regionId !== regionId) return null;
    const sender = await ctx.db.get("person", card.senderPersonId);
    // A member who has begun deleting their account is already "Former member": the card goes at once,
    // before the deletion's later steps reach the row itself.
    if (sender === null || sender.isMock || sender.tokenIdentifier.startsWith("deleted:"))
      return null;
    const places = [];
    let photoStories = 0;
    for (const item of card.items) {
      const place = await ctx.db.get("place", item.placeId);
      if (place === null || !isPublicRealPlace(place)) continue;
      let excerpt: { text: string; lang: string } | undefined;
      let photos: { key: string; width: number; height: number }[] = [];
      if (item.kind === "story") {
        const story = await ctx.db.get("story", item.storyId);
        if (story !== null && story.authorPersonId === sender._id && isStoryShown(place, story)) {
          excerpt = {
            text: cut(story.body.replace(/\s+/g, " ").trim(), EXCERPT_MAX),
            lang: story.lang,
          };
          if (photoStories < FRONT_PHOTOS) {
            const shown = await storyPhotoViews(
              ctx,
              story._id,
              false,
              await placePhotoRules(ctx, null, place),
            );
            const first = shown[0];
            if (first !== undefined) {
              photos = [{ key: first.key, width: first.width, height: first.height }];
              photoStories++;
            }
          }
        }
      }
      places.push({
        slug: place.slug,
        names: await namesOf(ctx, place),
        ...(excerpt === undefined ? {} : { excerpt }),
        photos,
      });
    }
    return {
      recipientName: card.recipientName,
      message: card.message,
      messageLang: card.messageLang,
      aiAssisted: card.aiAssisted,
      fromName: sender.displayName,
      sentAt: card._creationTime,
      regionId: card.regionId,
      places,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// The writing helper's gate
// ---------------------------------------------------------------------------------------------

/**
 * Called by the draft action with the caller's sign-in. In this order, so a stranger learns nothing:
 * the switch, sign-in, a real (not demo) account, whether AI is set up, the moments, then the limits.
 * A request that cannot run because AI is not set up costs nobody a slot.
 *
 * What it hands back is all the model is given. A story's words go only if its writer ticked that AI
 * may read it (the same tick the planner and the connector honour); for any other story the model
 * gets the place's name and nothing of what the member wrote there.
 */
export const beginDraft = internalMutation({
  args: {
    items: v.array(itemArg),
    recipientName: v.string(),
    note: v.optional(v.string()),
    lang: v.string(),
  },
  returns: v.object({
    language: v.string(),
    recipient: v.string(),
    note: v.optional(v.string()),
    places: v.array(
      v.object({ name: v.string(), nameJa: v.optional(v.string()), story: v.optional(v.string()) }),
    ),
    /** Stories on the card whose words were not sent, because the writer has not allowed AI to read them. */
    withheld: v.number(),
  }),
  handler: async (ctx, args) => {
    const regionId = requireOn();
    const person = await requirePerson(ctx);
    if (person.isMock) throw appError("forbidden", "a demo account can't use the writing helper");
    const config = aiConfig("write_story", process.env);
    if (!config.ok) throw appError("conflict", config.reason);
    const region = regionConfig(regionId);
    if (!isRegionLocale(region, args.lang))
      throw appError("invalid_input", "that language is not offered");
    const recipient = tidyLine(args.recipientName);
    if (lengthOf(recipient) < 1 || lengthOf(recipient) > RECIPIENT_MAX)
      throw appError("invalid_input", `say who it is for in 1 to ${RECIPIENT_MAX} characters`);
    const note = tidyText(args.note ?? "");
    if (lengthOf(note) > NOTE_MAX)
      throw appError("invalid_input", `your own words can be up to ${NOTE_MAX} characters`);
    const resolved = await resolveItems(ctx, person, regionId, args.items);
    const now = Date.now();
    const limit = await consumeRateLimit(ctx, {
      key: `postcard:draft:${person._id}`,
      limit: DRAFTS_PER_MINUTE,
      windowMs: MINUTE_MS,
      now,
    });
    if (!limit.ok) throw appError("rate_limited", "too many drafts just now");
    // The same daily pool as the other "write it for me" drafts.
    await limitContribution(ctx, person, "draft", regionId);
    const places: DraftPlace[] = [];
    let withheld = 0;
    for (const { place, story } of resolved) {
      const names = await namesOf(ctx, place);
      const english =
        names.find((n) => n.lang === "en" && n.isPrimary) ?? names.find((n) => n.lang === "en");
      const japanese =
        names.find((n) => n.lang === "ja" && n.isPrimary) ?? names.find((n) => n.lang === "ja");
      const first = english ?? japanese ?? names[0];
      if (first === undefined) continue;
      const allowed = story !== null && story.connectorAllowedAt !== undefined;
      if (story !== null && !allowed) withheld++;
      places.push({
        name: first.value,
        ...(english !== undefined && japanese !== undefined ? { nameJa: japanese.value } : {}),
        ...(allowed ? { story: story.body } : {}),
      });
    }
    // An audit entry says that a draft was asked for, never what was in it.
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "ai.postcard_draft_requested",
      targetType: "person",
      targetId: person._id,
      diff: { places: places.length, withheld },
    });
    return {
      language: args.lang,
      recipient,
      ...(note === "" ? {} : { note }),
      places,
      withheld,
    };
  },
});
