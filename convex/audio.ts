import { v } from "convex/values";
import { requireEditableInterview, requireLiveConsent, validateDuration } from "./interviews";
import { requireInterviewer } from "./lib/access";
import { mutation } from "./lib/gate";

export const generateUploadUrl = mutation({
  args: { interviewId: v.id("interview") },
  returns: v.string(),
  handler: async (ctx, { interviewId }) => {
    const { interview } = await requireInterviewer(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    requireEditableInterview(interview);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    interviewId: v.id("interview"),
    storageId: v.id("_storage"),
    durationS: v.optional(v.number()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), code: v.literal("invalid_input"), message: v.string() }),
  ),
  handler: async (ctx, { interviewId, storageId, durationS }) => {
    const { interview } = await requireInterviewer(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    requireEditableInterview(interview);
    validateDuration(durationS);
    const metadata = await ctx.db.system.get("_storage", storageId);
    const message =
      metadata === null
        ? "the uploaded audio file was not found"
        : !metadata.contentType?.startsWith("audio/")
          ? "the uploaded file must have an audio content type"
          : metadata.size === 0
            ? "the uploaded audio file must not be empty"
            : metadata.size > 100 * 1024 * 1024
              ? "the uploaded audio file must be at most 100 MB"
              : null;
    if (message !== null) {
      // Return so rejection cleanup commits; throwing would restore the rejected blob.
      if (metadata !== null) await ctx.storage.delete(storageId);
      return { ok: false as const, code: "invalid_input" as const, message };
    }
    if (interview.audioStorageId !== undefined && interview.audioStorageId !== storageId) {
      await ctx.storage.delete(interview.audioStorageId);
    }
    await ctx.db.patch("interview", interviewId, {
      audioStorageId: storageId,
      durationS,
      ...(interview.status === "consent_pending" ? { status: "uploaded" as const } : {}),
      processingError: undefined,
    });
    return { ok: true as const };
  },
});
