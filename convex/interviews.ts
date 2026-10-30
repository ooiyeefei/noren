import { v, type Infer } from "convex/values";
import { transcriptText } from "../src/lib/claims/transcript-text";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import {
  canManagePlace,
  isVerifiedOwner,
  loadReadablePlace,
  requireInterviewer,
  requireInterviewReader,
} from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requirePerson, requireRole } from "./lib/auth";
import { hideClaims } from "./lib/claimEffects";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { isRegionLocale, regionConfig } from "./lib/region";
import { interviewStatusValidator, transcriptOriginValidator } from "./lib/validators";

const segmentValidator = v.object({
  start: v.number(),
  end: v.number(),
  speaker: v.optional(v.string()),
  text: v.string(),
});
export type Segment = Infer<typeof segmentValidator>;

const interviewSummaryValidator = v.object({
  _id: v.id("interview"),
  placeId: v.id("place"),
  language: v.string(),
  status: interviewStatusValidator,
  isMock: v.boolean(),
  createdAt: v.number(),
});
export type InterviewSummary = Infer<typeof interviewSummaryValidator>;

const interviewViewValidator = v.object({
  _id: v.id("interview"),
  placeId: v.id("place"),
  placeSlug: v.string(),
  language: v.string(),
  status: interviewStatusValidator,
  processingError: v.optional(v.string()),
  hasAudio: v.boolean(),
  audioUrl: v.union(v.string(), v.null()),
  durationS: v.optional(v.number()),
  isMock: v.boolean(),
  consent: v.union(
    v.null(),
    v.object({
      textVersion: v.string(),
      textLang: v.string(),
      recordedAt: v.number(),
      assisted: v.boolean(),
      withdrawn: v.boolean(),
    }),
  ),
  latestTranscript: v.union(
    v.null(),
    v.object({
      _id: v.id("transcript"),
      version: v.number(),
      origin: transcriptOriginValidator,
      lang: v.string(),
      segments: v.array(segmentValidator),
      modelVersion: v.optional(v.string()),
    }),
  ),
  canWithdraw: v.boolean(),
});
export type InterviewView = Infer<typeof interviewViewValidator>;

export async function requireLiveConsent(ctx: QueryCtx, interviewId: Id<"interview">) {
  const consent = await ctx.db
    .query("consent")
    .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
    .first();
  if (consent === null || consent.withdrawnAt !== undefined) {
    throw appError("conflict", "record the owner's consent first");
  }
  return consent;
}

async function loadInterview(ctx: QueryCtx, interviewId: Id<"interview">) {
  const interview = await ctx.db.get("interview", interviewId);
  if (interview === null) throw appError("not_found", "interview not found");
  return interview;
}

async function latestTranscript(ctx: QueryCtx, interviewId: Id<"interview">) {
  return await ctx.db
    .query("transcript")
    .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", interviewId))
    .order("desc")
    .first();
}

export function requireEditableInterview(interview: Doc<"interview">) {
  if (interview.status === "withdrawn" || interview.status === "done") {
    throw appError("conflict", "the interview is withdrawn or done");
  }
}

function validateSegments(segments: Segment[]) {
  if (
    segments.length < 1 ||
    segments.length > 2000 ||
    segments.some(
      ({ start, end, text }) =>
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        text.length > 5000,
    )
  ) {
    throw appError("invalid_input", "provide 1 to 2000 segments with valid times and text");
  }
}

export function validateDuration(durationS: number | undefined) {
  if (durationS !== undefined && (!Number.isFinite(durationS) || durationS < 0)) {
    throw appError("invalid_input", "duration must be finite and nonnegative");
  }
}

function summary(interview: Doc<"interview">): InterviewSummary {
  return {
    _id: interview._id,
    placeId: interview.placeId,
    language: interview.language,
    status: interview.status,
    isMock: interview.isMock,
    createdAt: interview._creationTime,
  };
}

export const create = mutation({
  args: { placeId: v.id("place"), language: v.string() },
  returns: v.id("interview"),
  handler: async (ctx, { placeId, language }) => {
    const person = await requireRole(ctx, ["creator"]);
    const place = await loadReadablePlace(ctx, person, placeId);
    if (!isRegionLocale(regionConfig(place.regionId), language)) {
      throw appError("invalid_input", "the region does not serve this language");
    }
    const owner = await ctx.db
      .query("placeOwner")
      .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", placeId))
      .first();
    const interviewId = await ctx.db.insert(
      "interview",
      withMock(person, {
        placeId,
        interviewerId: person._id,
        ownerPersonId: owner?.personId,
        language,
        status: "consent_pending" as const,
      }),
    );
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "interview.create",
      targetType: "interview",
      targetId: interviewId,
    });
    return interviewId;
  },
});

export const recordConsent = mutation({
  args: {
    interviewId: v.id("interview"),
    scope: v.object({
      publish: v.boolean(),
      aiProcessing: v.boolean(),
      transferAbroad: v.boolean(),
      voiceRetention: v.boolean(),
    }),
    textVersion: v.string(),
    textLang: v.string(),
    assisted: v.boolean(),
  },
  returns: v.id("consent"),
  handler: async (ctx, args) => {
    const { person, interview, place } = await requireInterviewer(ctx, args.interviewId);
    if (interview.status === "withdrawn") throw appError("conflict", "interview withdrawn");
    if (Object.values(args.scope).some((scope) => !scope)) {
      throw appError("conflict", "all four scopes are required");
    }
    const region = regionConfig(place.regionId);
    if (args.textVersion !== region.consent.textVersion) {
      throw appError("conflict", "the consent text is stale");
    }
    if (!isRegionLocale(region, args.textLang)) {
      throw appError("invalid_input", "the region does not serve this consent language");
    }
    if (args.assisted && person.role !== "steward") {
      throw appError("forbidden", "only a steward may record assisted consent");
    }
    const existing = await ctx.db
      .query("consent")
      .withIndex("by_interviewId", (q) => q.eq("interviewId", interview._id))
      .first();
    if (existing !== null) throw appError("conflict", "consent has already been recorded");
    const consentId = await ctx.db.insert("consent", {
      interviewId: interview._id,
      scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
      textVersion: args.textVersion,
      textLang: args.textLang,
      assisted: args.assisted,
      recordedAt: Date.now(),
      recordedBy: person._id,
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "consent.record",
      targetType: "consent",
      targetId: consentId,
    });
    return consentId;
  },
});

export const get = query({
  args: { interviewId: v.id("interview") },
  returns: interviewViewValidator,
  handler: async (ctx, { interviewId }): Promise<InterviewView> => {
    const { person, interview, place } = await requireInterviewReader(ctx, interviewId);
    const consent = await ctx.db
      .query("consent")
      .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
      .first();
    const hidden = interview.status === "withdrawn" || consent?.withdrawnAt !== undefined;
    const transcript = hidden ? null : await latestTranscript(ctx, interviewId);
    const storageId = hidden ? undefined : interview.audioStorageId;
    return {
      _id: interviewId,
      placeId: place._id,
      placeSlug: place.slug,
      language: interview.language,
      status: interview.status,
      processingError: interview.processingError,
      hasAudio: storageId !== undefined,
      audioUrl: storageId === undefined ? null : await ctx.storage.getUrl(storageId),
      durationS: interview.durationS,
      isMock: interview.isMock,
      consent:
        consent === null
          ? null
          : {
              textVersion: consent.textVersion,
              textLang: consent.textLang,
              recordedAt: consent.recordedAt,
              assisted: consent.assisted,
              withdrawn: consent.withdrawnAt !== undefined,
            },
      latestTranscript:
        transcript === null
          ? null
          : {
              _id: transcript._id,
              version: transcript.version,
              origin: transcript.origin,
              lang: transcript.lang,
              segments: transcript.segments,
              modelVersion: transcript.modelVersion,
            },
      canWithdraw: person.role === "steward" || (await isVerifiedOwner(ctx, person._id, place._id)),
    };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(interviewSummaryValidator),
  handler: async (ctx) => {
    const person = await requireRole(ctx, ["creator"]);
    const interviews = await ctx.db
      .query("interview")
      .withIndex("by_interviewerId", (q) => q.eq("interviewerId", person._id))
      .order("desc")
      .take(100);
    return interviews.map(summary);
  },
});

export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(interviewSummaryValidator),
  handler: async (ctx, { placeId }) => {
    const person = await requirePerson(ctx);
    const place = await loadReadablePlace(ctx, person, placeId);
    if (!(await canManagePlace(ctx, person, place))) {
      throw appError("forbidden", "only the place's managers may list its interviews");
    }
    const interviews = await ctx.db
      .query("interview")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .order("desc")
      .take(50);
    return interviews.map(summary);
  },
});

export const saveCorrection = mutation({
  args: { interviewId: v.id("interview"), segments: v.array(segmentValidator) },
  returns: v.id("transcript"),
  handler: async (ctx, { interviewId, segments }) => {
    const { person, interview } = await requireInterviewer(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    requireEditableInterview(interview);
    validateSegments(segments);
    const latest = await latestTranscript(ctx, interviewId);
    const transcriptId = await ctx.db.insert("transcript", {
      interviewId,
      version: (latest?.version ?? 0) + 1,
      origin: "human_corrected",
      lang: interview.language,
      segments,
      createdBy: person._id,
    });
    if (
      ["consent_pending", "uploaded", "transcribing", "transcript_ready", "correcting"].includes(
        interview.status,
      )
    ) {
      await ctx.db.patch("interview", interviewId, {
        status: "correcting",
        processingError: undefined,
      });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "transcript.correct",
      targetType: "transcript",
      targetId: transcriptId,
    });
    return transcriptId;
  },
});

export const withdraw = mutation({
  args: { interviewId: v.id("interview") },
  returns: v.null(),
  handler: async (ctx, { interviewId }) => {
    const interview = await loadInterview(ctx, interviewId);
    const person = await requireRole(ctx, ["business_owner", "steward"], {
      placeId: interview.placeId,
    });
    if (interview.status === "withdrawn") return null;
    const now = Date.now();
    // Clear audio and change status together so the consent gate cannot block withdrawal.
    await ctx.db.patch("interview", interviewId, {
      status: "withdrawn",
      audioStorageId: undefined,
    });
    if (interview.audioStorageId !== undefined) {
      await ctx.storage.delete(interview.audioStorageId);
    }
    const consent = await ctx.db
      .query("consent")
      .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
      .first();
    if (consent !== null && consent.withdrawnAt === undefined) {
      await ctx.db.patch("consent", consent._id, { withdrawnAt: now });
    }
    const transcripts = ctx.db
      .query("transcript")
      .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", interviewId));
    const claimIds: Id<"claim">[] = [];
    for await (const transcript of transcripts) {
      const claims = ctx.db
        .query("claim")
        .withIndex("by_sourceTranscriptId", (q) => q.eq("sourceTranscriptId", transcript._id));
      for await (const claim of claims) claimIds.push(claim._id);
    }
    const { hidden, sentencesHeld } = await hideClaims(ctx, claimIds, { by: person._id, now });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "interview.withdraw",
      targetType: "interview",
      targetId: interviewId,
      diff: {
        claimsHidden: hidden,
        sentencesHeld,
        audioDeleted: interview.audioStorageId !== undefined,
      },
    });
    return null;
  },
});

export const beginTranscription = internalMutation({
  args: { interviewId: v.id("interview") },
  returns: v.object({ storageId: v.id("_storage"), language: v.string() }),
  handler: async (ctx, { interviewId }) => {
    const interview = await loadInterview(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    if (
      interview.audioStorageId === undefined ||
      !["uploaded", "transcript_ready"].includes(interview.status)
    ) {
      throw appError("conflict", "the interview is not ready for transcription");
    }
    await ctx.db.patch("interview", interviewId, {
      status: "transcribing",
      processingError: undefined,
    });
    return { storageId: interview.audioStorageId, language: interview.language };
  },
});

export const saveMachineTranscript = internalMutation({
  args: {
    interviewId: v.id("interview"),
    segments: v.array(segmentValidator),
    lang: v.string(),
    modelVersion: v.string(),
    durationS: v.optional(v.number()),
  },
  returns: v.union(v.id("transcript"), v.null()),
  handler: async (ctx, { interviewId, segments, lang, modelVersion, durationS }) => {
    const interview = await loadInterview(ctx, interviewId);
    if (interview.status === "withdrawn") return null;
    await requireLiveConsent(ctx, interviewId);
    validateSegments(segments);
    validateDuration(durationS);
    const latest = await latestTranscript(ctx, interviewId);
    const transcriptId = await ctx.db.insert("transcript", {
      interviewId,
      version: (latest?.version ?? 0) + 1,
      origin: "machine",
      lang,
      segments,
      modelVersion,
    });
    await ctx.db.patch("interview", interviewId, {
      ...(interview.status === "transcribing" ? { status: "transcript_ready" as const } : {}),
      ...(durationS === undefined ? {} : { durationS }),
      processingError: undefined,
    });
    await writeAudit(ctx, {
      actorKind: "ai",
      modelVersion,
      action: "transcript.machine",
      targetType: "transcript",
      targetId: transcriptId,
    });
    return transcriptId;
  },
});

export const recordProcessingError = internalMutation({
  args: { interviewId: v.id("interview"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, { interviewId, message }) => {
    const interview = await loadInterview(ctx, interviewId);
    if (interview.status === "withdrawn") return null;
    await requireLiveConsent(ctx, interviewId);
    await ctx.db.patch("interview", interviewId, {
      processingError: message.trim().slice(0, 500) || "unknown error",
      ...(interview.status === "transcribing" ? { status: "uploaded" as const } : {}),
    });
    return null;
  },
});

export const loadForExtraction = internalQuery({
  args: { interviewId: v.id("interview") },
  returns: v.object({
    transcriptId: v.id("transcript"),
    text: v.string(),
    language: v.string(),
    regionId: v.string(),
  }),
  handler: async (ctx, { interviewId }) => {
    const interview = await loadInterview(ctx, interviewId);
    await requireLiveConsent(ctx, interviewId);
    if (interview.status === "withdrawn") throw appError("conflict", "interview withdrawn");
    const transcript = await latestTranscript(ctx, interviewId);
    if (transcript?.origin !== "human_corrected") {
      throw appError("conflict", "correct the latest transcript before extracting claims");
    }
    const place = await ctx.db.get("place", interview.placeId);
    if (place === null) throw appError("not_found", "place not found");
    return {
      transcriptId: transcript._id,
      text: transcriptText(transcript.segments),
      language: interview.language,
      regionId: place.regionId,
    };
  },
});
