import { v } from "convex/values";
import {
  slotsAvailable,
  isRetryable,
  jstDayStart,
  retryDelayMs,
  MAX_ATTEMPTS,
  type FailureCode,
} from "../src/lib/share/auto-post";
import { buildCaption, placeLabel } from "../src/lib/share/caption";
import { SITE } from "../src/lib/share/card";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { readCredentials } from "./lib/instagramApi";
import { readMapNames } from "./lib/mapCopies";
import { isRegionOn, regionConfig } from "./lib/region";
import { describe, shareable, townOfPlace } from "./storyShare";

const STALE_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Why an automatic post must not go out now, or null when it may. The one place this rule lives. */
async function stopReason(ctx: QueryCtx, post: Doc<"instagramPost">): Promise<string | null> {
  const story = await ctx.db.get("story", post.storyId);
  if (story === null || story.status !== "live") return "removed";
  if (story.shareConsentAt === undefined) return "withdrawn";
  if ((await shareable(ctx, story)) === null) return "removed";
  if (story.sharePostedAt !== undefined) return "posted_by_hand";
  if (!regionConfig(post.regionId).sharing.autoPost) return "switch_off";
  return null;
}

async function fingerprintOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Records when the token now in use was first seen. Holds a hash only, never the token. */
async function noteTokenIn(ctx: MutationCtx, now: number): Promise<void> {
  const creds = readCredentials(process.env);
  if (creds === null) return;
  const fingerprint = await fingerprintOf(creds.token);
  const known = await ctx.db
    .query("instagramToken")
    .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
    .first();
  if (known === null) await ctx.db.insert("instagramToken", { fingerprint, firstSeenAt: now });
}

/** Daily: notice a new token, so its 60 days are counted from the day it was set. */
export const noteToken = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await noteTokenIn(ctx, Date.now());
    return null;
  },
});

const postView = v.object({
  postId: v.id("instagramPost"),
  storyId: v.id("story"),
  status: v.union(
    v.literal("queued"),
    v.literal("publishing"),
    v.literal("posted"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  reason: v.union(v.string(), v.null()),
  permalink: v.union(v.string(), v.null()),
  approvedAt: v.number(),
  postedAt: v.union(v.number(), v.null()),
  placeEnglish: v.string(),
  placeJapanese: v.union(v.string(), v.null()),
  /** Posted on Instagram, and the story has since gone or been withdrawn: a steward must take it down by hand. */
  needsRemoval: v.boolean(),
  removedByHandAt: v.union(v.number(), v.null()),
});

/**
 * What the steward screen shows about automatic posting: the switch, whether Instagram is connected,
 * the pacing, how old the token is, and the recent posts with their state. Stewards only.
 */
export const overview = query({
  args: { regionId: v.string() },
  returns: v.object({
    autoPost: v.boolean(),
    configured: v.boolean(),
    schedule: v.union(v.object({ perDay: v.number(), hourJst: v.number() }), v.null()),
    tokenFirstSeenAt: v.union(v.number(), v.null()),
    posts: v.array(postView),
  }),
  handler: async (ctx, { regionId }) => {
    await requireRole(ctx, ["steward"]);
    if (!isRegionOn(regionId))
      return {
        autoPost: false,
        configured: false,
        schedule: null,
        tokenFirstSeenAt: null,
        posts: [],
      };
    const sharing = regionConfig(regionId).sharing;
    const creds = readCredentials(process.env);
    let tokenFirstSeenAt: number | null = null;
    if (creds !== null) {
      const fingerprint = await fingerprintOf(creds.token);
      const row = await ctx.db
        .query("instagramToken")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .first();
      tokenFirstSeenAt = row?.firstSeenAt ?? null;
    }
    const rows = await ctx.db
      .query("instagramPost")
      .withIndex("by_regionId_and_status", (q) => q.eq("regionId", regionId))
      .order("desc")
      .take(100);
    const posts = [];
    for (const post of rows.toSorted((a, b) => b.approvedAt - a.approvedAt)) {
      const story = await ctx.db.get("story", post.storyId);
      const place = await ctx.db.get("place", post.placeId);
      if (place !== null && !isRegionOn(place.regionId)) continue;
      const label =
        place === null
          ? { english: "", japanese: null }
          : placeLabel(
              place.mapNames ?? (await readMapNames(ctx, place._id)),
              regionConfig(place.regionId),
            );
      const gone =
        story === null ||
        story.status !== "live" ||
        story.shareConsentAt === undefined ||
        (await shareable(ctx, story)) === null;
      posts.push({
        postId: post._id,
        storyId: post.storyId,
        status: post.status,
        reason: post.reason ?? null,
        permalink: post.permalink ?? null,
        approvedAt: post.approvedAt,
        postedAt: post.postedAt ?? null,
        placeEnglish: label.english,
        placeJapanese: label.japanese,
        needsRemoval: post.status === "posted" && post.removedByHandAt === undefined && gone,
        removedByHandAt: post.removedByHandAt ?? null,
      });
    }
    return {
      autoPost: sharing.autoPost,
      configured: creds !== null,
      schedule: sharing.autoPostSchedule ?? null,
      tokenFirstSeenAt,
      posts,
    };
  },
});

/**
 * A steward approves a story whose writer ticked the box, and it is queued to be posted to Noren's
 * Instagram. Refused (conflict) while the switch is off, Instagram is not connected, the story is no
 * longer shareable, it was posted by hand, or it is already queued or posted.
 */
export const approve = mutation({
  args: { storyId: v.id("story") },
  returns: v.id("instagramPost"),
  handler: async (ctx, { storyId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const story = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    const place = await ctx.db.get("place", story.placeId);
    if (place !== null && !isRegionOn(place.regionId))
      throw appError("not_found", "story not found");
    const found = await shareable(ctx, story);
    if (found === null || story.shareConsentAt === undefined)
      throw appError("conflict", "this story is not offered for sharing");
    const regionId = found.place.regionId;
    if (!regionConfig(regionId).sharing.autoPost)
      throw appError("conflict", "automatic posting is off");
    if (readCredentials(process.env) === null)
      throw appError("conflict", "Instagram is not connected");
    if (story.sharePostedAt !== undefined)
      throw appError("conflict", "this story was already posted by hand");
    const earlier = await ctx.db
      .query("instagramPost")
      .withIndex("by_storyId", (q) => q.eq("storyId", storyId))
      .take(20);
    if (earlier.some((post) => ["queued", "publishing", "posted"].includes(post.status)))
      throw appError("conflict", "this story is already approved");
    const now = Date.now();
    const postId = await ctx.db.insert("instagramPost", {
      storyId,
      placeId: story.placeId,
      regionId,
      status: "queued",
      approvedBy: steward._id,
      approvedAt: now,
      imageToken: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
      attempts: 0,
    });
    await noteTokenIn(ctx, now);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "story.share_autopost_approved",
      targetType: "story",
      targetId: storyId,
    });
    // Without pacing it goes out at once; with it, the next run inside the allowed hours takes it.
    if (regionConfig(regionId).sharing.autoPostSchedule === undefined)
      await ctx.scheduler.runAfter(0, internal.instagramPosts.dispatch, {});
    return postId;
  },
});

/** A steward stops a post that has not gone out, or tries a failed one again. */
export const cancel = mutation({
  args: { postId: v.id("instagramPost") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    await requireRole(ctx, ["steward"]);
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || !isRegionOn(post.regionId)) throw appError("not_found", "post not found");
    if (post.status !== "queued" && post.status !== "failed")
      throw appError("conflict", "this post cannot be stopped now");
    await ctx.db.patch("instagramPost", postId, { status: "cancelled", reason: "steward" });
    return null;
  },
});

export const retry = mutation({
  args: { postId: v.id("instagramPost") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    await requireRole(ctx, ["steward"]);
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || !isRegionOn(post.regionId)) throw appError("not_found", "post not found");
    if (post.status !== "failed") throw appError("conflict", "only a failed post can be retried");
    if (readCredentials(process.env) === null)
      throw appError("conflict", "Instagram is not connected");
    await ctx.db.patch("instagramPost", postId, {
      status: "queued",
      reason: undefined,
      attempts: 0,
      notBefore: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.instagramPosts.dispatch, {});
    return null;
  },
});

/** A steward records that they took the post down on Instagram themselves. */
export const markRemoved = mutation({
  args: { postId: v.id("instagramPost") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || !isRegionOn(post.regionId)) throw appError("not_found", "post not found");
    if (post.status !== "posted") throw appError("conflict", "this post is not on Instagram");
    if (post.removedByHandAt !== undefined) return null;
    await ctx.db.patch("instagramPost", postId, { removedByHandAt: Date.now() });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "story.share_autopost_removed_by_hand",
      targetType: "story",
      targetId: post.storyId,
    });
    return null;
  },
});

/**
 * The picture for Instagram to fetch, as the words to draw. Anyone holding the address may ask, so
 * it answers only while the post is queued or being sent, the address's secret matches, and the
 * story is still shown with its writer's tick on. After that, or if any of it stops being true, it
 * is null and the route answers 404. It returns the same card words as the share kit, nothing more.
 */
export const cardForPost = query({
  args: { postId: v.id("instagramPost"), token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      body: v.string(),
      lang: v.string(),
      authorName: v.string(),
      placeEnglish: v.string(),
      placeJapanese: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { postId, token }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (
      post === null ||
      !isRegionOn(post.regionId) ||
      post.status === "posted" ||
      post.status === "failed"
    )
      return null;
    if (post.status === "cancelled") return null;
    if (token.length !== post.imageToken.length) return null;
    let diff = 0;
    for (let i = 0; i < token.length; i++)
      diff |= token.charCodeAt(i) ^ post.imageToken.charCodeAt(i);
    if (diff !== 0) return null;
    if ((await stopReason(ctx, post)) !== null) return null;
    const story = await ctx.db.get("story", post.storyId);
    const found = await shareable(ctx, story);
    if (found === null) return null;
    const { body, lang, authorName, placeEnglish, placeJapanese } = await describe(ctx, found);
    return { body, lang, authorName, placeEnglish, placeJapanese };
  },
});

const forPublishResult = v.union(
  v.object({
    kind: v.literal("ready"),
    caption: v.string(),
    imageUrl: v.string(),
    containerId: v.union(v.string(), v.null()),
    publishRequested: v.boolean(),
    mediaId: v.union(v.string(), v.null()),
  }),
  v.object({ kind: v.literal("stop"), reason: v.string() }),
  v.object({ kind: v.literal("skip") }),
);

/** What the publishing action needs, checked afresh: the caption, the picture address, and any earlier progress. */
export const forPublish = internalQuery({
  args: { postId: v.id("instagramPost") },
  returns: forPublishResult,
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || post.status !== "publishing") return { kind: "skip" as const };
    const reason = await stopReason(ctx, post);
    if (reason !== null) return { kind: "stop" as const, reason };
    const story = await ctx.db.get("story", post.storyId);
    const found = await shareable(ctx, story);
    if (found === null) return { kind: "stop" as const, reason: "removed" };
    const card = await describe(ctx, found);
    const caption = buildCaption({
      body: card.body,
      lang: card.lang,
      authorName: card.authorName,
      placeEnglish: card.placeEnglish,
      placeJapanese: card.placeJapanese,
      town: await townOfPlace(ctx, found.place),
    });
    return {
      kind: "ready" as const,
      caption,
      imageUrl: `https://${SITE}/api/instagram-card/${post._id}?t=${post.imageToken}`,
      containerId: post.containerId ?? null,
      publishRequested: post.publishRequestedAt !== undefined,
      mediaId: post.mediaId ?? null,
    };
  },
});

/** Stops a post that has not gone out, with the reason. Does nothing to one that is posted. */
export const stop = internalMutation({
  args: { postId: v.id("instagramPost"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { postId, reason }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post !== null && (post.status === "queued" || post.status === "publishing"))
      await ctx.db.patch("instagramPost", postId, { status: "cancelled", reason });
    return null;
  },
});

export const recordContainer = internalMutation({
  args: { postId: v.id("instagramPost"), containerId: v.string() },
  returns: v.null(),
  handler: async (ctx, { postId, containerId }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post !== null && post.status === "publishing")
      await ctx.db.patch("instagramPost", postId, { containerId });
    return null;
  },
});

/**
 * The last check before Instagram's publish call, in one transaction with marking it requested:
 * true means go ahead. Anything that stopped being true since the post was queued cancels it.
 */
export const claimPublish = internalMutation({
  args: { postId: v.id("instagramPost") },
  returns: v.union(v.literal("go"), v.literal("stop")),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || post.status !== "publishing") return "stop" as const;
    const reason = await stopReason(ctx, post);
    if (reason !== null) {
      await ctx.db.patch("instagramPost", postId, { status: "cancelled", reason });
      return "stop" as const;
    }
    await ctx.db.patch("instagramPost", postId, { publishRequestedAt: Date.now() });
    return "go" as const;
  },
});

/** The post is on Instagram. Also accepted for a post cancelled while its publish call was in flight. */
export const recordPosted = internalMutation({
  args: {
    postId: v.id("instagramPost"),
    mediaId: v.string(),
    permalink: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { postId, mediaId, permalink }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || post.status === "posted") return null;
    const now = Date.now();
    await ctx.db.patch("instagramPost", postId, {
      status: "posted",
      reason: undefined,
      mediaId,
      ...(permalink === null ? {} : { permalink }),
      postedAt: now,
    });
    const story = await ctx.db.get("story", post.storyId);
    if (story !== null && story.sharePostedAt === undefined)
      await ctx.db.patch("story", post.storyId, { sharePostedAt: now });
    await writeAudit(ctx, {
      actorKind: "system",
      action: "story.share_autoposted",
      targetType: "story",
      targetId: post.storyId,
      diff: { mediaId },
    });
    return null;
  },
});

/** Fills in a permalink Instagram did not give at first. */
export const recordPermalink = internalMutation({
  args: { postId: v.id("instagramPost"), permalink: v.string() },
  returns: v.null(),
  handler: async (ctx, { postId, permalink }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post !== null && post.status === "posted")
      await ctx.db.patch("instagramPost", postId, { permalink });
    return null;
  },
});

/**
 * An attempt did not finish. A passing trouble (network, timeout, Instagram's own error) is tried
 * again after a pause, up to three attempts; anything else fails the post for a steward to read.
 * `clearContainer` drops Instagram's container when it was refused or ran out, so a retry makes a new one.
 */
export const settleFailure = internalMutation({
  args: { postId: v.id("instagramPost"), code: v.string(), clearContainer: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { postId, code, clearContainer }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post === null || post.status !== "publishing") return null;
    const failure = code as FailureCode;
    const attempts = post.attempts + 1;
    const clear = clearContainer ? { containerId: undefined, publishRequestedAt: undefined } : {};
    if (isRetryable(failure) && attempts < MAX_ATTEMPTS) {
      await ctx.db.patch("instagramPost", postId, {
        ...clear,
        status: "queued",
        reason: code,
        attempts,
        notBefore: Date.now() + retryDelayMs(attempts),
      });
    } else {
      await ctx.db.patch("instagramPost", postId, {
        ...clear,
        status: "failed",
        reason: code,
        attempts,
      });
    }
    return null;
  },
});

/** Instagram's daily publishing limit is full: wait an hour, without counting an attempt. */
export const deferRateLimited = internalMutation({
  args: { postId: v.id("instagramPost") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get("instagramPost", postId);
    if (post !== null && post.status === "publishing")
      await ctx.db.patch("instagramPost", postId, {
        status: "queued",
        reason: "rate_limited",
        notBefore: Date.now() + HOUR_MS,
      });
    return null;
  },
});

/**
 * Starts what is due: queued posts whose pause has passed, within the pacing. Each is moved to
 * "publishing" here, in this transaction, so two runs never start the same post, and then its
 * action is scheduled. Also frees a post whose action died mid-way, and cancels any queued post
 * whose story stopped being shareable. Run by the cron and right after an approval.
 */
export const dispatch = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("instagramPost")
      .withIndex("by_status_and_approvedAt", (q) => q.eq("status", "publishing"))
      .take(25);
    for (const post of stale) {
      if (now - (post.lastAttemptAt ?? 0) < STALE_MS) continue;
      const attempts = post.attempts + 1;
      await ctx.db.patch(
        "instagramPost",
        post._id,
        attempts < MAX_ATTEMPTS
          ? { status: "queued", attempts, reason: "timeout" }
          : { status: "failed", attempts, reason: "timeout" },
      );
    }
    const queued = await ctx.db
      .query("instagramPost")
      .withIndex("by_status_and_approvedAt", (q) => q.eq("status", "queued"))
      .take(25);
    const state = new Map<string, { posted: number; inFlight: number; run: number }>();
    for (const post of queued) {
      const reason = await stopReason(ctx, post);
      if (reason === "switch_off") continue;
      if (reason !== null) {
        await ctx.db.patch("instagramPost", post._id, { status: "cancelled", reason });
        continue;
      }
      if (post.notBefore !== undefined && post.notBefore > now) continue;
      const schedule = regionConfig(post.regionId).sharing.autoPostSchedule;
      let counts = state.get(post.regionId);
      if (counts === undefined) {
        const posted = await ctx.db
          .query("instagramPost")
          .withIndex("by_regionId_and_postedAt", (q) =>
            q.eq("regionId", post.regionId).gte("postedAt", jstDayStart(now)),
          )
          .take(100);
        const inFlight = await ctx.db
          .query("instagramPost")
          .withIndex("by_regionId_and_status", (q) =>
            q.eq("regionId", post.regionId).eq("status", "publishing"),
          )
          .take(100);
        counts = { posted: posted.length, inFlight: inFlight.length, run: 0 };
        state.set(post.regionId, counts);
      }
      // Paced: posts started today count. Unpaced: only those in flight, so a burst stays small.
      const used = (schedule === undefined ? 0 : counts.posted) + counts.inFlight + counts.run;
      if (slotsAvailable(schedule, now, used) <= 0) continue;
      counts.run += 1;
      await ctx.db.patch("instagramPost", post._id, { status: "publishing", lastAttemptAt: now });
      await ctx.scheduler.runAfter(0, internal.instagramActions.publish, { postId: post._id });
    }
    return null;
  },
});
