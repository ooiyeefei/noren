"use node";

import { v } from "convex/values";
import { createS3PhotoStore } from "../src/lib/photos/s3-store";
import { photoObjectSettings } from "../src/lib/photos/settings";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const BATCH = 25;

function failureName(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : `NonError: ${typeof error}`;
}

/**
 * Deletes queued objects from S3 (FR-212). Every removal schedules this and an hourly cron retries,
 * so a failure waits rather than disappears. S3 ignores a key it doesn't have, so running twice is safe.
 */
export const removeObjects = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.runQuery(internal.storyPhotos.dueRemovals, { now, limit: BATCH });
    if (due.length === 0) return null;
    const ids = due.map((row) => row._id);
    const settings = photoObjectSettings(process.env);
    if (settings === null) {
      console.error("story photo removals are waiting: storage settings are missing on Convex");
      await ctx.runMutation(internal.storyPhotos.settleRemovals, { done: [], failed: ids, now });
      return null;
    }
    const store = createS3PhotoStore(settings);
    const done: typeof ids = [];
    const failed: typeof ids = [];
    for (const { _id, key } of due) {
      try {
        await store.remove(key);
        done.push(_id);
      } catch (error) {
        console.error(`story photo removal failed: ${failureName(error)}`);
        failed.push(_id);
      }
    }
    await ctx.runMutation(internal.storyPhotos.settleRemovals, { done, failed, now });
    // A full batch may mean more are due. Failed rows have moved on, so this can't spin.
    if (due.length === BATCH)
      await ctx.scheduler.runAfter(0, internal.storyPhotoActions.removeObjects, {});
    return null;
  },
});
