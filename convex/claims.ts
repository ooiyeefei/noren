import { paginator } from "convex-helpers/server/pagination";
import { v, type Infer } from "convex/values";
import { quoteAt, quoteMatches, transcriptText } from "../src/lib/claims/transcript-text";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canManagePlace, loadReadablePlace, requireInterviewer } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireRole } from "./lib/auth";
import { disputeClaims, transitionClaim } from "./lib/claimEffects";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { isCautionKey, isRegionLocale, regionConfig } from "./lib/region";
import {
  claimKindValidator,
  claimOriginValidator,
  claimStatusValidator,
  translationOriginValidator,
} from "./lib/validators";
import schema from "./schema";

const translationView = v.object({
  lang: v.string(),
  text: v.string(),
  origin: translationOriginValidator,
  modelVersion: v.optional(v.string()),
  reviewedBy: v.optional(v.string()),
});
const claimView = v.object({
  _id: v.id("claim"),
  placeId: v.id("place"),
  kind: claimKindValidator,
  cautionType: v.optional(v.string()),
  textOriginal: v.string(),
  langOriginal: v.string(),
  origin: claimOriginValidator,
  quote: v.optional(v.string()),
  spanStart: v.optional(v.number()),
  spanEnd: v.optional(v.number()),
  sourceTranscriptId: v.optional(v.id("transcript")),
  status: claimStatusValidator,
  confirmedAt: v.optional(v.number()),
  disputedWith: v.optional(v.id("claim")),
  modelVersion: v.optional(v.string()),
  aiAssisted: v.boolean(),
  isMock: v.boolean(),
  translations: v.array(translationView),
});
const extractedItem = v.object({
  kind: claimKindValidator,
  cautionType: v.optional(v.string()),
  textOriginal: v.string(),
  quote: v.string(),
  spanStart: v.number(),
  spanEnd: v.number(),
});
export type ClaimTranslationView = Infer<typeof translationView>;
export type ClaimView = Infer<typeof claimView>;
export type ExtractedItem = Infer<typeof extractedItem>;

const confirmedStatuses = ["owner_confirmed", "published", "disputed"] as const;

function checkedText(text: string | undefined): string {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length > 1000) {
    throw appError("invalid_input", "Text must contain 1 to 1000 characters");
  }
  return trimmed;
}

async function getClaim(ctx: QueryCtx, claimId: Id<"claim">): Promise<Doc<"claim">> {
  const claim = await ctx.db.get("claim", claimId);
  if (claim === null) throw appError("not_found", "claim not found");
  return claim;
}

async function requireLatestCorrected(ctx: QueryCtx, transcript: Doc<"transcript">) {
  const latest = await ctx.db
    .query("transcript")
    .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", transcript.interviewId))
    .order("desc")
    .first();
  if (transcript.origin !== "human_corrected" || latest?._id !== transcript._id) {
    throw appError("conflict", "Claims require the latest, person-corrected transcript");
  }
}

function validCaution(
  region: ReturnType<typeof regionConfig>,
  item: Pick<ExtractedItem, "kind" | "cautionType">,
) {
  return item.kind === "caution"
    ? item.cautionType !== undefined && isCautionKey(region, item.cautionType)
    : item.cautionType === undefined;
}

async function insertProposal(
  ctx: MutationCtx,
  interview: Doc<"interview">,
  transcript: Doc<"transcript">,
  item: ExtractedItem,
  modelVersion?: string,
) {
  return await ctx.db.insert("claim", {
    ...item,
    textOriginal: item.textOriginal.trim(),
    placeId: interview.placeId,
    origin: "interview",
    langOriginal: transcript.lang,
    sourceTranscriptId: transcript._id,
    authorId:
      item.kind === "caution" ? (interview.ownerPersonId ?? interview.interviewerId) : undefined,
    status: "proposed",
    modelVersion,
    isMock: interview.isMock,
  });
}

async function finishInterviewReview(ctx: MutationCtx, transcriptId: Id<"transcript">) {
  const transcript = await ctx.db.get("transcript", transcriptId);
  if (transcript === null) return;
  const interview = await ctx.db.get("interview", transcript.interviewId);
  if (interview === null || interview.status === "withdrawn") return;
  if (interview.status === "claims_proposed") {
    await ctx.db.patch("interview", interview._id, { status: "owner_review" });
  }

  // Check every version before deleting audio; an older version can still have pending claims.
  let transcriptCursor: string | null = null;
  do {
    const versions = await ctx.db
      .query("transcript")
      .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", interview._id))
      .paginate({ numItems: 100, cursor: transcriptCursor });
    for (const version of versions.page) {
      let claimCursor: string | null = null;
      do {
        const claims = await ctx.db
          .query("claim")
          .withIndex("by_sourceTranscriptId", (q) => q.eq("sourceTranscriptId", version._id))
          .paginate({ numItems: 100, cursor: claimCursor });
        if (claims.page.some((claim) => claim.status === "proposed")) return;
        claimCursor = claims.isDone ? null : claims.continueCursor;
      } while (claimCursor !== null);
    }
    transcriptCursor = versions.isDone ? null : versions.continueCursor;
  } while (transcriptCursor !== null);

  const place = await ctx.db.get("place", interview.placeId);
  if (place === null) throw appError("not_found", "place not found");
  const deleteAudio = regionConfig(place.regionId).retention.audioDays === null;
  if (deleteAudio && interview.audioStorageId !== undefined) {
    await ctx.storage.delete(interview.audioStorageId);
  }
  await ctx.db.patch("interview", interview._id, {
    status: "done",
    ...(deleteAudio ? { audioStorageId: undefined } : {}),
  });
}

export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(claimView),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await loadReadablePlace(ctx, viewer, placeId);
    if (!(await canManagePlace(ctx, viewer, place))) {
      throw appError("forbidden", "only place managers may review claims");
    }
    const claims = (
      await Promise.all(
        (["proposed", ...confirmedStatuses] as const).map((status) =>
          ctx.db
            .query("claim")
            .withIndex("by_placeId_and_status", (q) =>
              q.eq("placeId", placeId).eq("status", status),
            )
            .take(100),
        ),
      )
    ).flat();
    return await Promise.all(
      claims.map(async (claim) => {
        const translations = await ctx.db
          .query("claimTranslation")
          .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claim._id))
          .take(20);
        return {
          _id: claim._id,
          placeId: claim.placeId,
          kind: claim.kind,
          cautionType: claim.cautionType,
          textOriginal: claim.textOriginal,
          langOriginal: claim.langOriginal,
          origin: claim.origin,
          quote: claim.quote,
          spanStart: claim.spanStart,
          spanEnd: claim.spanEnd,
          sourceTranscriptId: claim.sourceTranscriptId,
          status: claim.status,
          confirmedAt: claim.confirmedAt,
          disputedWith: claim.disputedWith,
          modelVersion: claim.modelVersion,
          aiAssisted: claim.modelVersion !== undefined,
          isMock: claim.isMock,
          translations: translations.map(({ lang, text, origin, modelVersion, reviewedBy }) => ({
            lang,
            text,
            origin,
            modelVersion,
            reviewedBy,
          })),
        };
      }),
    );
  },
});

export const review = mutation({
  args: {
    claimId: v.id("claim"),
    action: v.union(v.literal("confirm"), v.literal("edit"), v.literal("remove")),
    text: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { claimId, action, text }) => {
    const claim = await getClaim(ctx, claimId);
    const owner = await requireRole(ctx, ["business_owner"], { placeId: claim.placeId });
    await transitionClaim(ctx, claimId, action, {
      actor: "owner",
      by: owner._id,
      now: Date.now(),
      textOriginal: action === "edit" ? checkedText(text) : undefined,
    });
    if (claim.origin === "interview" && claim.sourceTranscriptId !== undefined) {
      await finishInterviewReview(ctx, claim.sourceTranscriptId);
    }
    return null;
  },
});

export const proposeFromSpan = mutation({
  args: {
    transcriptId: v.id("transcript"),
    spanStart: v.number(),
    spanEnd: v.number(),
    textOriginal: v.string(),
    kind: claimKindValidator,
    cautionType: v.optional(v.string()),
  },
  returns: v.id("claim"),
  handler: async (ctx, { transcriptId, ...item }) => {
    const transcript = await ctx.db.get("transcript", transcriptId);
    if (transcript === null) throw appError("not_found", "transcript not found");
    const { person, interview, place } = await requireInterviewer(ctx, transcript.interviewId);
    if (interview.status === "withdrawn") throw appError("conflict", "interview was withdrawn");
    await requireLatestCorrected(ctx, transcript);
    const quote = quoteAt(transcriptText(transcript.segments), item.spanStart, item.spanEnd);
    if (!quote?.trim()) throw appError("invalid_input", "Select a nonblank transcript span");
    const textOriginal = checkedText(item.textOriginal);
    if (!validCaution(regionConfig(place.regionId), item)) {
      throw appError("invalid_input", "Only cautions have a region caution key, which is required");
    }
    const claimId = await insertProposal(ctx, interview, transcript, {
      ...item,
      textOriginal,
      quote,
    });
    if (interview.status === "transcript_ready" || interview.status === "correcting") {
      await ctx.db.patch("interview", interview._id, { status: "claims_proposed" });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "claim.propose",
      targetType: "claim",
      targetId: claimId,
    });
    return claimId;
  },
});

export const insertExtracted = internalMutation({
  args: {
    interviewId: v.id("interview"),
    transcriptId: v.id("transcript"),
    modelVersion: v.string(),
    items: v.array(extractedItem),
  },
  returns: v.object({ inserted: v.number(), dropped: v.number() }),
  handler: async (ctx, { interviewId, transcriptId, modelVersion, items }) => {
    const interview = await ctx.db.get("interview", interviewId);
    if (interview === null) throw appError("not_found", "interview not found");
    if (interview.status === "withdrawn") return { inserted: 0, dropped: items.length };
    if (items.length > 100) throw appError("invalid_input", "Extract at most 100 claims per call");
    const transcript = await ctx.db.get("transcript", transcriptId);
    if (transcript === null) throw appError("not_found", "transcript not found");
    if (transcript.interviewId !== interviewId)
      throw appError("conflict", "transcript is from another interview");
    await requireLatestCorrected(ctx, transcript);
    const place = await ctx.db.get("place", interview.placeId);
    if (place === null) throw appError("not_found", "place not found");
    const region = regionConfig(place.regionId);
    const text = transcriptText(transcript.segments);
    // C6 derives UTF-16 spans with text.indexOf(quote); model offsets are not evidence.
    let inserted = 0;
    for (const item of items) {
      const length = item.textOriginal.trim().length;
      if (
        length < 1 ||
        length > 1000 ||
        !validCaution(region, item) ||
        !quoteMatches(text, item.spanStart, item.spanEnd, item.quote)
      )
        continue;
      await insertProposal(ctx, interview, transcript, item, modelVersion);
      inserted += 1;
    }
    const result = { inserted, dropped: items.length - inserted };
    if (inserted > 0) await ctx.db.patch("interview", interviewId, { status: "claims_proposed" });
    await writeAudit(ctx, {
      actorKind: "ai",
      modelVersion,
      action: "claims.extract",
      targetType: "interview",
      targetId: interviewId,
      diff: result,
    });
    return result;
  },
});

async function translationLanguage(ctx: QueryCtx, claim: Doc<"claim">, lang: string) {
  const place = await ctx.db.get("place", claim.placeId);
  if (place === null) throw appError("not_found", "place not found");
  if (lang === claim.langOriginal || !isRegionLocale(regionConfig(place.regionId), lang)) {
    throw appError("invalid_input", "Translate into a different region language");
  }
}

export const setHumanTranslation = mutation({
  args: { claimId: v.id("claim"), lang: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, lang, text }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const claim = await getClaim(ctx, claimId);
    await translationLanguage(ctx, claim, lang);
    const translatedText = checkedText(text);
    if (!confirmedStatuses.some((status) => status === claim.status)) {
      throw appError("conflict", "Only reviewed claims can be translated");
    }
    const existing = await ctx.db
      .query("claimTranslation")
      .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId).eq("lang", lang))
      .unique();
    const row = {
      claimId,
      lang,
      text: translatedText,
      origin: "human" as const,
      reviewedBy: steward.displayName,
      reviewedAt: Date.now(),
      modelVersion: undefined,
    };
    if (existing === null) await ctx.db.insert("claimTranslation", row);
    else await ctx.db.patch("claimTranslation", existing._id, row);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "claim.translate_human",
      targetType: "claim",
      targetId: claimId,
      diff: { lang },
    });
    return null;
  },
});

export const markDisputed = mutation({
  args: { claimIdA: v.id("claim"), claimIdB: v.id("claim") },
  returns: v.null(),
  handler: async (ctx, { claimIdA, claimIdB }) => {
    const steward = await requireRole(ctx, ["steward"]);
    await disputeClaims(ctx, claimIdA, claimIdB, { by: steward._id, now: Date.now() });
    return null;
  },
});

export const listUntranslated = internalQuery({
  args: { placeId: v.id("place"), limit: v.number() },
  returns: v.array(
    v.object({ claimId: v.id("claim"), text: v.string(), from: v.string(), to: v.string() }),
  ),
  handler: async (ctx, { placeId, limit }) => {
    const max = Number.isFinite(limit) ? Math.min(50, Math.max(0, Math.floor(limit))) : 0;
    if (max === 0) return [];
    const place = await ctx.db.get("place", placeId);
    if (place === null) throw appError("not_found", "place not found");
    const locales = regionConfig(place.regionId).locales;
    const candidates = paginator(ctx.db, schema);
    const result: { claimId: Id<"claim">; text: string; from: string; to: string }[] = [];
    for (const status of confirmedStatuses) {
      let cursor: string | null = null;
      do {
        const claims = await candidates
          .query("claim")
          .withIndex("by_placeId_and_origin_and_status", (q) =>
            q.eq("placeId", placeId).eq("origin", "interview").eq("status", status),
          )
          .paginate({ numItems: 100, cursor });
        for (const claim of claims.page) {
          if (claim.confirmedAt === undefined) continue;
          for (const lang of locales) {
            if (lang === claim.langOriginal) continue;
            const existing = await ctx.db
              .query("claimTranslation")
              .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claim._id).eq("lang", lang))
              .unique();
            if (existing === null)
              result.push({
                claimId: claim._id,
                text: claim.textOriginal,
                from: claim.langOriginal,
                to: lang,
              });
            if (result.length === max) return result;
          }
        }
        cursor = claims.isDone ? null : claims.continueCursor;
      } while (cursor !== null);
    }
    return result;
  },
});

export const saveMachineTranslation = internalMutation({
  args: {
    claimId: v.id("claim"),
    lang: v.string(),
    sourceText: v.string(),
    text: v.string(),
    modelVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { claimId, lang, sourceText, text, modelVersion }) => {
    const claim = await getClaim(ctx, claimId);
    if (
      claim.textOriginal !== sourceText ||
      claim.status === "hidden" ||
      claim.status === "proposed" ||
      claim.origin !== "interview" ||
      claim.confirmedAt === undefined
    )
      return null;
    const existing = await ctx.db
      .query("claimTranslation")
      .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId).eq("lang", lang))
      .unique();
    if (existing?.origin === "human") return null;
    await translationLanguage(ctx, claim, lang);
    const row = {
      claimId,
      lang,
      text: checkedText(text),
      origin: "machine" as const,
      modelVersion,
    };
    if (existing === null) await ctx.db.insert("claimTranslation", row);
    else await ctx.db.patch("claimTranslation", existing._id, row);
    await writeAudit(ctx, {
      actorKind: "ai",
      modelVersion,
      action: "claim.translate_machine",
      targetType: "claim",
      targetId: claimId,
      diff: { lang },
    });
    return null;
  },
});
