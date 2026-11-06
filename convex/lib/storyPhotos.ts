import { v } from "convex/values";
import { photoObjectSettings } from "../../src/lib/photos/settings";
import type { RegionConfig } from "../../src/lib/region/schema";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canEditPlace, type Viewer } from "./access";
import { appError } from "./errors";
import { consumeRateLimit } from "./rateLimit";
import { regionConfig } from "./region";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A story holds few photos; this bound outlasts lowering the region's number later. */
const STORY_PHOTOS_READ = 20;
const PERSON_BATCH = 50;
/** An owner's word counts from the moment they confirmed it, before any steward publishes it. */
const OWNER_SAID = ["owner_confirmed", "published", "disputed"] as const;

export const storyPhotoView = v.object({
  _id: v.id("storyPhoto"),
  key: v.string(),
  width: v.number(),
  height: v.number(),
  waiting: v.boolean(),
  canRemove: v.boolean(),
});

/**
 * Convex needs the storage settings to delete objects, so a photo is never taken that could not be
 * removed again (FR-216).
 */
function photosUsable(region: RegionConfig): boolean {
  return region.photos.enabled && photoObjectSettings(process.env) !== null;
}

/** A caution is a claim, and a demo interview's claim says nothing about a real place. */
export async function ownerRefusesPhotos(ctx: QueryCtx, place: Doc<"place">): Promise<boolean> {
  const { refusingCaution } = regionConfig(place.regionId).photos;
  for (const status of OWNER_SAID) {
    const said = await ctx.db
      .query("claim")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", place._id).eq("status", status))
      .filter((q) =>
        q.and(
          q.eq(q.field("kind"), "caution"),
          q.eq(q.field("cautionType"), refusingCaution),
          q.eq(q.field("isMock"), place.isMock),
        ),
      )
      .first();
    if (said !== null) return true;
  }
  return false;
}

/** Why this member may not add a photo to this place, or null when they may. */
export async function uploadRefusal(
  ctx: QueryCtx,
  person: Doc<"person">,
  place: Doc<"place">,
): Promise<string | null> {
  if (!photosUsable(regionConfig(place.regionId))) return "photos are switched off";
  if (person.isMock) return "a demo account can't add photos";
  if (place.isMock) return "a demo place takes no photos";
  if (await ownerRefusesPhotos(ctx, place)) return "the owner asks for no photography";
  return null;
}

/**
 * When a `user`'s first days end, as in T050 for the other new-account limits. Others have none: a
 * creator or owner was checked by a steward. A query can't read the clock, so the caller compares.
 */
export function newMemberUntil(person: Doc<"person">, region: RegionConfig): number | null {
  return person.role === "user"
    ? person._creationTime + region.collection.newAccount.days * DAY_MS
    : null;
}

function isNewMember(person: Doc<"person">, region: RegionConfig, now: number): boolean {
  const until = newMemberUntil(person, region);
  return until !== null && now < until;
}

/** Counted when the upload begins, because storage is spent from there on. A steward has no limit. */
export async function limitPhoto(
  ctx: MutationCtx,
  person: Doc<"person">,
  region: RegionConfig,
): Promise<void> {
  if (person.role === "steward") return;
  const now = Date.now();
  const result = await consumeRateLimit(ctx, {
    key: `contribution:photo:${person._id}`,
    limit: isNewMember(person, region, now)
      ? region.collection.newAccount.perDay.photo
      : region.photos.perDay,
    windowMs: DAY_MS,
    now,
  });
  if (!result.ok) throw appError("rate_limited", "too many photos added today");
}

/** Attaches finished photos to a new story, in the order given. Throwing also undoes the story. */
export async function attachPhotos(
  ctx: MutationCtx,
  {
    person,
    place,
    storyId,
    photoIds,
  }: {
    person: Doc<"person">;
    place: Doc<"place">;
    storyId: Id<"story">;
    photoIds: readonly Id<"storyPhoto">[];
  },
): Promise<void> {
  if (photoIds.length === 0) return;
  const refusal = await uploadRefusal(ctx, person, place);
  if (refusal !== null) throw appError("forbidden", refusal);
  const region = regionConfig(place.regionId);
  if (photoIds.length > region.photos.maxPerStory)
    throw appError("invalid_input", `a story holds at most ${region.photos.maxPerStory} photos`);
  if (new Set(photoIds).size !== photoIds.length)
    throw appError("invalid_input", "the same photo was given twice");
  const status = isNewMember(person, region, Date.now()) ? "waiting" : "live";
  for (const [position, photoId] of photoIds.entries()) {
    const photo = await ctx.db.get("storyPhoto", photoId);
    if (
      photo === null ||
      photo.uploaderPersonId !== person._id ||
      photo.placeId !== place._id ||
      photo.status !== "unattached"
    )
      throw appError("invalid_input", "that photo can't go on this story");
    await ctx.db.patch("storyPhoto", photoId, { storyId, position, status });
  }
}

export type PlacePhotoRules = {
  on: boolean;
  ownerRefuses: boolean;
  isSteward: boolean;
  canEdit: boolean;
};

/** What decides who sees which photo on one place's page; read once per page. */
export async function placePhotoRules(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
): Promise<PlacePhotoRules> {
  const on = regionConfig(place.regionId).photos.enabled;
  return {
    on,
    ownerRefuses: on && (await ownerRefusesPhotos(ctx, place)),
    isSteward: viewer?.role === "steward" && !viewer.isMock,
    canEdit: canEditPlace(viewer, place),
  };
}

/**
 * A live photo shows to whoever can read the story, until the owner says no photography. A waiting
 * photo, or one the owner's word has covered, shows only to its writer and stewards, who can remove it.
 */
export async function storyPhotoViews(
  ctx: QueryCtx,
  storyId: Id<"story">,
  addedByMe: boolean,
  rules: PlacePhotoRules,
) {
  if (!rules.on) return [];
  const rows = await ctx.db
    .query("storyPhoto")
    .withIndex("by_storyId", (q) => q.eq("storyId", storyId))
    .take(STORY_PHOTOS_READ);
  const trusted = addedByMe || rules.isSteward;
  const views = [];
  for (const photo of rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (photo.width === undefined || photo.height === undefined) continue;
    if (!trusted && (photo.status !== "live" || rules.ownerRefuses)) continue;
    views.push({
      _id: photo._id,
      key: photo.key,
      width: photo.width,
      height: photo.height,
      waiting: photo.status === "waiting",
      canRemove: addedByMe || rules.canEdit,
    });
  }
  return views;
}

/**
 * Each row goes now, so the photo leaves the page in this transaction, and its objects are queued
 * for deletion. Both keys are queued whatever the status, because S3 ignores a key it doesn't have.
 */
export async function removePhotos(
  ctx: MutationCtx,
  photos: readonly Doc<"storyPhoto">[],
): Promise<void> {
  if (photos.length === 0) return;
  for (const photo of photos) {
    await ctx.db.delete("storyPhoto", photo._id);
    for (const key of [photo.key, photo.incomingKey])
      await ctx.db.insert("photoObjectRemoval", { key, attempts: 0, nextAttemptAt: 0 });
  }
  await ctx.scheduler.runAfter(0, internal.storyPhotoActions.removeObjects, {});
}

export async function removeStoryPhotos(ctx: MutationCtx, storyId: Id<"story">): Promise<void> {
  await removePhotos(
    ctx,
    await ctx.db
      .query("storyPhoto")
      .withIndex("by_storyId", (q) => q.eq("storyId", storyId))
      .take(STORY_PHOTOS_READ),
  );
}

/**
 * Removes every photo one person added, for account deletion. A person with many finishes by itself
 * in later transactions, so a caller needs only this one call and can check `more` if it cares.
 */
export async function removeAllPhotosOf(
  ctx: MutationCtx,
  personId: Id<"person">,
): Promise<{ removed: number; more: boolean }> {
  const photos = await ctx.db
    .query("storyPhoto")
    .withIndex("by_uploaderPersonId", (q) => q.eq("uploaderPersonId", personId))
    .take(PERSON_BATCH);
  await removePhotos(ctx, photos);
  const more = photos.length === PERSON_BATCH;
  if (more)
    await ctx.scheduler.runAfter(0, internal.storyPhotos.continueRemovingPhotosOf, { personId });
  return { removed: photos.length, more };
}
