import { v } from "convex/values";
import { activeRegionConfig } from "../src/lib/region/registry";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireConfirmedName, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { limitContribution } from "./lib/rateLimit";
import { regionConfig } from "./lib/region";

async function member(ctx: Parameters<typeof requirePerson>[0]) {
  const person = await requirePerson(ctx);
  requireConfirmedName(person);
  return person;
}
function settings() {
  const region = regionConfig(activeRegionConfig().id);
  if (!region.voice.enabled) throw appError("forbidden", "speech input is switched off");
  return region;
}

export const generateUploadUrl = mutation({
  args: { sha256: v.string() },
  returns: v.object({ uploadId: v.id("voiceUpload"), url: v.string() }),
  handler: async (ctx, { sha256 }) => {
    const person = await member(ctx);
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
    await member(ctx);
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
    if (permit) await ctx.db.delete("voiceUpload", uploadId);
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
