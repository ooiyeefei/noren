import { defineTable } from "convex/server";
import { v } from "convex/values";

export const storyPhotoTables = {
  /**
   * A photo on a written story (specs/003-story-photos). The file lives in S3, and this row chooses
   * both its keys, so no key ever comes from a client.
   * - `uploading`: a permit was given. Nothing has checked what arrived.
   * - `unattached`: re-encoded under `key`, waiting for its story. The cron removes it after a day.
   * - `waiting`: on a story, seen only by its writer and stewards until a steward approves.
   * - `live`: on a story, seen by anyone who can read it.
   */
  storyPhoto: defineTable({
    placeId: v.id("place"),
    uploaderPersonId: v.id("person"),
    storyId: v.optional(v.id("story")),
    /** Where the member put it among the story's photos. */
    position: v.optional(v.number()),
    status: v.union(
      v.literal("uploading"),
      v.literal("unattached"),
      v.literal("waiting"),
      v.literal("live"),
    ),
    incomingKey: v.string(),
    key: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_storyId", ["storyId"])
    .index("by_uploaderPersonId", ["uploaderPersonId"]),

  /**
   * One object still to delete from S3. It outlives the photo's row, so a removal is never lost when
   * S3 is down or a setting is wrong: the row stays until S3 confirms (FR-212).
   */
  photoObjectRemoval: defineTable({
    key: v.string(),
    attempts: v.number(),
    nextAttemptAt: v.number(),
  })
    .index("by_nextAttemptAt", ["nextAttemptAt"])
    .index("by_attempts", ["attempts"]),
};
