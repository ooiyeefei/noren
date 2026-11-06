import { v } from "convex/values";
import { activeRegionConfig } from "../src/lib/region/registry";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { canEditPlace, loadReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { readMapNames } from "./lib/mapCopies";
import { regionConfig } from "./lib/region";
import {
  limitPhoto,
  newMemberUntil,
  removeAllPhotosOf,
  removePhotos,
  uploadRefusal,
} from "./lib/storyPhotos";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

const HOUR_MS = 60 * 60 * 1000;
const WAITING_LIMIT = 50;
const SWEEP_BATCH = 50;
/** A failed deletion is tried again after this long. The hourly cron picks it up. */
const REMOVAL_RETRY_MS = 15 * 60 * 1000;
/** Only needs to say that something is failing; a steward doesn't need the exact count past this. */
const FAILING_LIMIT = 100;

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether this member can add photos here. The page shows no control unless they can. */
export const forPlace = query({
  args: { placeId: v.id("place") },
  returns: v.object({
    allowed: v.boolean(),
    maxPerStory: v.number(),
    /** Until when their photos wait for a steward; the page compares it with the time. */
    waitsUntil: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, { placeId }) => {
    const no = { allowed: false, maxPerStory: 0, waitsUntil: null };
    const person = await currentPerson(ctx);
    if (person === null) return no;
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, person, place))) return no;
    if ((await uploadRefusal(ctx, person, place)) !== null) return no;
    const region = regionConfig(place.regionId);
    return {
      allowed: true,
      maxPerStory: region.photos.maxPerStory,
      waitsUntil: newMemberUntil(person, region),
    };
  },
});

/** Step one of an upload. Convex chooses both keys here, and from now on they come only from this row. */
export const beginUpload = mutation({
  args: { placeId: v.id("place") },
  returns: v.object({ photoId: v.id("storyPhoto"), incomingKey: v.string() }),
  handler: async (ctx, { placeId }) => {
    const person = await requirePerson(ctx);
    const place = await loadReadablePlace(ctx, person, placeId);
    const refusal = await uploadRefusal(ctx, person, place);
    if (refusal !== null) throw appError("forbidden", refusal);
    await limitPhoto(ctx, person, regionConfig(place.regionId));
    const incomingKey = `incoming/${randomHex()}.jpg`;
    const photoId = await ctx.db.insert("storyPhoto", {
      placeId,
      uploaderPersonId: person._id,
      status: "uploading",
      incomingKey,
      key: `photos/${randomHex()}.jpg`,
    });
    return { photoId, incomingKey };
  },
});

async function ownUpload(ctx: QueryCtx, photoId: Id<"storyPhoto">) {
  const person = await requirePerson(ctx);
  const photo = await ctx.db.get("storyPhoto", photoId);
  // The same answer for a stranger and a missing row, so a photo's keys go to its uploader alone.
  if (photo === null || photo.uploaderPersonId !== person._id)
    throw appError("not_found", "upload not found");
  return { person, photo };
}

/** Tells the second route which objects belong to this upload, and only for the member who began it. */
export const uploadTicket = query({
  args: { photoId: v.id("storyPhoto") },
  returns: v.object({ incomingKey: v.string(), key: v.string() }),
  handler: async (ctx, { photoId }) => {
    const { person, photo } = await ownUpload(ctx, photoId);
    if (photo.status !== "uploading") throw appError("conflict", "this upload is finished");
    const place = await loadReadablePlace(ctx, person, photo.placeId);
    const refusal = await uploadRefusal(ctx, person, place);
    if (refusal !== null) throw appError("forbidden", refusal);
    return { incomingKey: photo.incomingKey, key: photo.key };
  },
});

/**
 * The second route calls this as the member, once the re-encoded file is written. A member could call
 * it themselves, which is why it takes no key: the row's final key is one only the server can write,
 * so this can never make unchecked bytes public. At worst their own story shows a missing image.
 */
export const completeUpload = mutation({
  args: { photoId: v.id("storyPhoto"), width: v.number(), height: v.number() },
  returns: v.null(),
  handler: async (ctx, { photoId, width, height }) => {
    const { person, photo } = await ownUpload(ctx, photoId);
    const place = await loadReadablePlace(ctx, person, photo.placeId);
    const { maxEdgePixels } = regionConfig(place.regionId).photos;
    for (const side of [width, height]) {
      if (!Number.isInteger(side) || side < 1 || side > maxEdgePixels)
        throw appError("invalid_input", `a photo is 1 to ${maxEdgePixels} pixels on each side`);
    }
    // A repeat changes nothing, so a second call can't disturb a photo already on a story.
    if (photo.status !== "uploading") return null;
    await ctx.db.patch("storyPhoto", photoId, { status: "unattached", width, height });
    return null;
  },
});

/** The writer removes their photo at any time; the place's editor or a steward may too (FR-208). */
export const remove = mutation({
  args: { photoId: v.id("storyPhoto") },
  returns: v.null(),
  handler: async (ctx, { photoId }) => {
    const person = await requirePerson(ctx);
    const photo = await ctx.db.get("storyPhoto", photoId);
    if (photo === null) throw appError("not_found", "photo not found");
    const mine = photo.uploaderPersonId === person._id;
    if (!mine) {
      const place = await loadReadablePlace(ctx, person, photo.placeId);
      if (!canEditPlace(person, place))
        throw appError(
          "forbidden",
          "only the writer, the place's editor or a steward may remove it",
        );
    }
    await removePhotos(ctx, [photo]);
    if (person.role === "steward" && !mine)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "photo.remove",
        targetType: "storyPhoto",
        targetId: photoId,
      });
    return null;
  },
});

async function requireRealSteward(ctx: QueryCtx) {
  const person = await requireRole(ctx, ["steward"]);
  if (person.isMock) throw appError("forbidden", "a demo steward can't handle real photos");
  return person;
}

/** New members' photos on stories, oldest first, and whether any removal is failing (FR-212). */
export const listWaiting = query({
  args: {},
  returns: v.object({
    photos: v.array(
      v.object({
        _id: v.id("storyPhoto"),
        key: v.string(),
        width: v.number(),
        height: v.number(),
        authorName: v.string(),
        storyBody: v.string(),
        placeSlug: v.string(),
        placeNames: v.array(
          v.object({
            lang: v.string(),
            script: scriptValidator,
            value: v.string(),
            isPrimary: v.boolean(),
          }),
        ),
        addedAt: v.number(),
      }),
    ),
    removalsFailing: v.number(),
  }),
  handler: async (ctx) => {
    await requireRealSteward(ctx);
    const rows = await ctx.db
      .query("storyPhoto")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(WAITING_LIMIT);
    const photos = [];
    for (const photo of rows) {
      const story = photo.storyId && (await ctx.db.get("story", photo.storyId));
      const place = await ctx.db.get("place", photo.placeId);
      if (!story || !place || photo.width === undefined || photo.height === undefined) continue;
      const author = await ctx.db.get("person", photo.uploaderPersonId);
      photos.push({
        _id: photo._id,
        key: photo.key,
        width: photo.width,
        height: photo.height,
        authorName: author?.displayName ?? "",
        storyBody: story.body,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        addedAt: photo._creationTime,
      });
    }
    const failing = await ctx.db
      .query("photoObjectRemoval")
      .withIndex("by_attempts", (q) => q.gt("attempts", 0))
      .take(FAILING_LIMIT);
    return { photos, removalsFailing: failing.length };
  },
});

export const approve = mutation({
  args: { photoId: v.id("storyPhoto") },
  returns: v.null(),
  handler: async (ctx, { photoId }) => {
    const person = await requireRealSteward(ctx);
    const photo = await ctx.db.get("storyPhoto", photoId);
    if (photo === null) throw appError("not_found", "photo not found");
    if (photo.status !== "waiting") throw appError("conflict", "this photo is not waiting");
    await ctx.db.patch("storyPhoto", photoId, { status: "live" });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "photo.approve",
      targetType: "storyPhoto",
      targetId: photoId,
    });
    return null;
  },
});

/** Photos whose story never came, with their objects. Bounded, and it continues itself. */
export const sweepUnattached = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - activeRegionConfig().photos.unattachedHours * HOUR_MS;
    const stale: Doc<"storyPhoto">[] = [];
    for (const status of ["uploading", "unattached"] as const) {
      stale.push(
        ...(await ctx.db
          .query("storyPhoto")
          .withIndex("by_status", (q) => q.eq("status", status).lt("_creationTime", cutoff))
          .take(SWEEP_BATCH - stale.length)),
      );
    }
    await removePhotos(ctx, stale);
    if (stale.length === SWEEP_BATCH)
      await ctx.scheduler.runAfter(0, internal.storyPhotos.sweepUnattached, {});
    return null;
  },
});

export const continueRemovingPhotosOf = internalMutation({
  args: { personId: v.id("person") },
  returns: v.null(),
  handler: async (ctx, { personId }) => {
    await removeAllPhotosOf(ctx, personId);
    return null;
  },
});

export const dueRemovals = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(v.object({ _id: v.id("photoObjectRemoval"), key: v.string() })),
  handler: async (ctx, { now, limit }) => {
    const rows = await ctx.db
      .query("photoObjectRemoval")
      .withIndex("by_nextAttemptAt", (q) => q.lte("nextAttemptAt", now))
      .take(limit);
    return rows.map(({ _id, key }) => ({ _id, key }));
  },
});

export const settleRemovals = internalMutation({
  args: {
    done: v.array(v.id("photoObjectRemoval")),
    failed: v.array(v.id("photoObjectRemoval")),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { done, failed, now }) => {
    for (const id of done) {
      if ((await ctx.db.get("photoObjectRemoval", id)) !== null)
        await ctx.db.delete("photoObjectRemoval", id);
    }
    for (const id of failed) {
      const row = await ctx.db.get("photoObjectRemoval", id);
      if (row !== null)
        await ctx.db.patch("photoObjectRemoval", id, {
          attempts: row.attempts + 1,
          nextAttemptAt: now + REMOVAL_RETRY_MS,
        });
    }
    return null;
  },
});
