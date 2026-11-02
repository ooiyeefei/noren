import { v } from "convex/values";
import { aiConfig, type AiCapability } from "../src/lib/ai/config";
import { transcriptText } from "../src/lib/claims/transcript-text";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";
import { requireLiveConsent } from "./interviews";
import { canManagePlace, loadReadablePlace, requireInterviewer } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { consumeRateLimit } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";

function requireConfig(capability: AiCapability) {
  const result = aiConfig(capability, process.env);
  if (!result.ok) throw appError("conflict", result.reason);
}

// The recorder converts to WAV only for a transcription service that cannot decode browser audio,
// so other services keep the smaller compressed recording.
export const audioFormat = query({
  args: {},
  returns: v.union(v.literal("wav"), v.literal("original")),
  handler: async () => (process.env.TRANSCRIBE_PROVIDER?.trim() === "meta" ? "wav" : "original"),
});

export const transcribe = mutation({
  args: { interviewId: v.id("interview") },
  returns: v.null(),
  handler: async (ctx, { interviewId }) => {
    const { person } = await requireInterviewer(ctx, interviewId);
    requireConfig("transcribe");
    const audio = await ctx.runMutation(internal.interviews.beginTranscription, { interviewId });
    await ctx.scheduler.runAfter(0, internal.aiActions.transcribeInterview, {
      interviewId,
      ...audio,
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "ai.transcribe_requested",
      targetType: "interview",
      targetId: interviewId,
    });
    return null;
  },
});

export const proposeClaims = mutation({
  args: { interviewId: v.id("interview") },
  returns: v.null(),
  handler: async (ctx, { interviewId }) => {
    const { person } = await requireInterviewer(ctx, interviewId);
    requireConfig("extract");
    const transcript = await ctx.runQuery(internal.interviews.loadForExtraction, { interviewId });
    const claims = await ctx.db
      .query("claim")
      .withIndex("by_sourceTranscriptId", (q) =>
        q.eq("sourceTranscriptId", transcript.transcriptId),
      )
      .take(200);
    if (claims.some((claim) => claim.modelVersion !== undefined)) {
      throw appError("conflict", "AI claims were already proposed for this transcript version");
    }
    await ctx.db.patch("interview", interviewId, { processingError: undefined });
    await ctx.scheduler.runAfter(0, internal.aiActions.extractClaims, { interviewId });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "ai.claims_requested",
      targetType: "interview",
      targetId: interviewId,
    });
    return null;
  },
});

export const translatePlace = mutation({
  args: { placeId: v.id("place") },
  returns: v.object({ pending: v.number() }),
  handler: async (ctx, { placeId }): Promise<{ pending: number }> => {
    const person = await requirePerson(ctx);
    const place = await loadReadablePlace(ctx, person, placeId);
    if (!(await canManagePlace(ctx, person, place)))
      throw appError("forbidden", "only place managers may request translations");
    requireConfig("translate");
    const items: { claimId: Id<"claim">; text: string; from: string; to: string }[] =
      await ctx.runQuery(internal.claims.listUntranslated, { placeId, limit: 50 });
    if (items.length)
      await ctx.scheduler.runAfter(0, internal.aiActions.translateClaims, { placeId });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "ai.translate_requested",
      targetType: "place",
      targetId: placeId,
    });
    return { pending: items.length };
  },
});

const FOLLOW_UPS_PER_HOUR = 20;

/**
 * Checks access and consent for the follow-up agent and hands it the owner's words. Called by the
 * suggestFollowUps action with the caller's identity; the suggestions are never stored.
 */
export const beginFollowUps = internalMutation({
  args: { interviewId: v.id("interview"), readerLanguage: v.string() },
  returns: v.object({
    transcript: v.string(),
    language: v.string(),
    readerLanguage: v.string(),
    regionId: v.string(),
    recorded: v.array(
      v.object({
        kind: v.string(),
        cautionType: v.optional(v.string()),
        textOriginal: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { interviewId, readerLanguage }) => {
    const { person, interview, place } = await requireInterviewer(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    if (interview.status === "withdrawn") throw appError("conflict", "interview withdrawn");
    const transcript = await ctx.db
      .query("transcript")
      .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", interviewId))
      .order("desc")
      .first();
    const text = transcript ? transcriptText(transcript.segments) : "";
    if (!text.trim()) throw appError("conflict", "transcribe or type the interview first");
    const limit = await consumeRateLimit(ctx, {
      key: `ai:followups:${person._id}`,
      limit: FOLLOW_UPS_PER_HOUR,
      windowMs: 60 * 60 * 1000,
      now: Date.now(),
    });
    if (!limit.ok) throw appError("rate_limited", "too many follow-up requests this hour");
    // The agent sees only what the caller may already read: an interviewer who does not manage
    // the place sees published statements, never ones still waiting for an owner's approval.
    const statuses = (await canManagePlace(ctx, person, place))
      ? (["proposed", "owner_confirmed", "published", "disputed"] as const)
      : (["published"] as const);
    const recorded = (
      await Promise.all(
        statuses.map((status) =>
          ctx.db
            .query("claim")
            .withIndex("by_placeId_and_status", (q) =>
              q.eq("placeId", place._id).eq("status", status),
            )
            .take(50),
        ),
      )
    )
      .flat()
      .slice(0, 50);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "ai.followups_requested",
      targetType: "interview",
      targetId: interviewId,
    });
    return {
      transcript: text,
      language: interview.language,
      readerLanguage: isRegionLocale(regionConfig(place.regionId), readerLanguage)
        ? readerLanguage
        : interview.language,
      regionId: place.regionId,
      recorded: recorded.map(({ kind, cautionType, textOriginal }) => ({
        kind,
        ...(cautionType === undefined ? {} : { cautionType }),
        textOriginal,
      })),
    };
  },
});

export const placeNames = internalQuery({
  args: { placeId: v.id("place") },
  returns: v.array(v.object({ lang: v.string(), value: v.string(), isPrimary: v.boolean() })),
  handler: async (ctx, { placeId }) => {
    const names = await ctx.db
      .query("placeName")
      .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
      .take(24);
    return names.map(({ lang, value, isPrimary }) => ({ lang, value, isPrimary }));
  },
});

export const transcriptionContext = internalQuery({
  args: { interviewId: v.id("interview") },
  returns: v.object({ vocabularyHint: v.string(), durationSeconds: v.optional(v.number()) }),
  handler: async (ctx, { interviewId }) => {
    const interview = await ctx.db.get("interview", interviewId);
    if (!interview) throw appError("not_found", "interview not found");
    const names = await ctx.db
      .query("placeName")
      .withIndex("by_placeId_and_lang", (q) =>
        q.eq("placeId", interview.placeId).eq("lang", interview.language),
      )
      .take(24);
    // Only this place's own names enter Whisper's prompt; no person or interview text is read.
    return {
      vocabularyHint: [...new Set(names.map(({ value }) => value.trim()).filter(Boolean))]
        .join("、")
        .slice(0, 200),
      ...(interview.durationS === undefined ? {} : { durationSeconds: interview.durationS }),
    };
  },
});
