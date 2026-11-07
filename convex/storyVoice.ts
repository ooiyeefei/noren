import { v } from "convex/values";
import { activeRegionConfig } from "../src/lib/region/registry";
import { internal } from "./_generated/api";
import { action, type MutationCtx } from "./_generated/server";
import { requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { limitContribution } from "./lib/rateLimit";
import { regionConfig } from "./lib/region";

function settings() {
  const region = regionConfig(activeRegionConfig().id);
  if (!region.voice.enabled) throw appError("forbidden", "speech input is switched off");
  return region;
}

/**
 * A browser closed between its upload and `transcribe` leaves a recording no permit has claimed, and
 * Noren cannot learn its ID. The digest declared with the permit finds it. Files go through a window
 * of this many at most, far more than an hour's recordings.
 */
const SWEEP_SCAN = 1000;
/** Convex keeps an upload URL working for an hour, so a slow upload can land long after its permit. */
const UPLOAD_URL_LIFE_MS = 60 * 60_000;

async function deleteUnclaimed(ctx: MutationCtx, sha256: string, after: number): Promise<void> {
  const files = await ctx.db.system
    .query("_storage")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", after))
    .take(SWEEP_SCAN);
  for (const file of files) {
    if (file.sha256 === sha256) await ctx.storage.delete(file._id);
  }
}

export const generateUploadUrl = mutation({
  args: { sha256: v.string() },
  returns: v.object({ uploadId: v.id("voiceUpload"), url: v.string() }),
  handler: async (ctx, { sha256 }) => {
    // No confirmed name is needed: this only fills the box, and sharing still asks for one.
    const person = await requirePerson(ctx);
    const region = settings();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(sha256))
      throw appError("invalid_input", "invalid recording digest");
    await limitContribution(ctx, person, "voice", region.id);
    const uploadId = await ctx.db.insert("voiceUpload", {
      personId: person._id,
      sha256,
      expiresAt: Date.now() + 10 * 60_000,
      used: false,
    });
    await ctx.scheduler.runAfter(15 * 60_000, internal.storyVoice.expire, { uploadId });
    await ctx.scheduler.runAfter(UPLOAD_URL_LIFE_MS + 60_000, internal.storyVoice.sweep, {
      sha256,
      after: Date.now(),
    });
    return { uploadId, url: await ctx.storage.generateUploadUrl() };
  },
});

export const claim = internalMutation({
  args: { uploadId: v.id("voiceUpload"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { uploadId, storageId }) => {
    const person = await requirePerson(ctx);
    const permit = await ctx.db.get("voiceUpload", uploadId);
    const file = await ctx.db.system.get("_storage", storageId);
    if (
      !permit ||
      permit.personId !== person._id ||
      permit.used ||
      permit.expiresAt < Date.now() ||
      !file ||
      file.sha256 !== permit.sha256 ||
      file._creationTime < permit._creationTime
    )
      throw appError("forbidden", "recording upload is unavailable");
    await ctx.db.patch("voiceUpload", uploadId, { used: true, storageId });
    return null;
  },
});

export const gate = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requirePerson(ctx);
    return settings().voice.maxSeconds;
  },
});

export const expire = internalMutation({
  args: { uploadId: v.id("voiceUpload") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const permit = await ctx.db.get("voiceUpload", uploadId);
    if (permit?.storageId && (await ctx.db.system.get("_storage", permit.storageId)))
      await ctx.storage.delete(permit.storageId);
    if (permit) {
      await deleteUnclaimed(ctx, permit.sha256, permit._creationTime);
      await ctx.db.delete("voiceUpload", uploadId);
    }
    return null;
  },
});

/** The last look, once the upload URL can no longer work. The permit is gone by now. */
export const sweep = internalMutation({
  args: { sha256: v.string(), after: v.number() },
  returns: v.null(),
  handler: async (ctx, { sha256, after }) => {
    await deleteUnclaimed(ctx, sha256, after);
    return null;
  },
});

export const transcribe = action({
  args: {
    uploadId: v.id("voiceUpload"),
    storageId: v.id("_storage"),
    language: v.union(v.literal("en"), v.literal("ja")),
  },
  returns: v.string(),
  handler: async (ctx, { uploadId, storageId, language }): Promise<string> => {
    // Do not delete a caller-supplied file until its digest and upload permit match.
    await ctx.runMutation(internal.storyVoice.claim, { uploadId, storageId });
    try {
      const maxSeconds: number = await ctx.runMutation(internal.storyVoice.gate, {});
      return await ctx.runAction(internal.aiActions.transcribeStoryAudio, {
        storageId,
        language,
        maxSeconds,
      });
    } finally {
      await ctx.storage.delete(storageId);
    }
  },
});
