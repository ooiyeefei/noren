import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  claimKindValidator,
  claimOriginValidator,
  claimStatusValidator,
  interviewStatusValidator,
  pageVersionStatusValidator,
  transcriptOriginValidator,
  translationOriginValidator,
} from "../lib/validators";

export const interviewTables = {
  interview: defineTable({
    placeId: v.id("place"),
    interviewerId: v.id("person"),
    ownerPersonId: v.optional(v.id("person")),
    language: v.string(),
    /** Unset before upload and after deletion. */
    audioStorageId: v.optional(v.id("_storage")),
    durationS: v.optional(v.number()),
    status: interviewStatusValidator,
    /** Why the last processing step failed, shown to the interviewer; cleared when a step succeeds. */
    processingError: v.optional(v.string()),
    isMock: v.boolean(),
  })
    .index("by_placeId", ["placeId"])
    .index("by_interviewerId", ["interviewerId"]),

  /**
   * What the owner agreed to. A consent row exists only when all four scopes are given (FR-008),
   * which the `v.literal(true)` fields enforce. "uploaded" needs one (convex/lib/rules).
   */
  consent: defineTable({
    interviewId: v.id("interview"),
    scope: v.object({
      publish: v.literal(true),
      aiProcessing: v.literal(true),
      transferAbroad: v.literal(true),
      voiceRetention: v.literal(true),
    }),
    textVersion: v.string(),
    textLang: v.string(),
    recordedAt: v.number(),
    recordedBy: v.id("person"),
    /** A steward recorded the consent in person. */
    assisted: v.boolean(),
    withdrawnAt: v.optional(v.number()),
  }).index("by_interviewId", ["interviewId"]),

  /** The latest `human_corrected` version is the record of truth (FR-009, principle III). */
  transcript: defineTable({
    interviewId: v.id("interview"),
    version: v.number(),
    lang: v.string(),
    origin: transcriptOriginValidator,
    modelVersion: v.optional(v.string()),
    segments: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        speaker: v.optional(v.string()),
        text: v.string(),
      }),
    ),
    createdBy: v.optional(v.id("person")),
  }).index("by_interviewId_and_version", ["interviewId", "version"]),

  /** One statement about a place. The rules that guard it are in convex/lib/rules/claims.ts. */
  claim: defineTable({
    placeId: v.id("place"),
    kind: claimKindValidator,
    /** Key from the region's caution vocabulary; caution claims only. */
    cautionType: v.optional(v.string()),
    textOriginal: v.string(),
    langOriginal: v.string(),
    origin: claimOriginValidator,
    sourceTranscriptId: v.optional(v.id("transcript")),
    spanStart: v.optional(v.number()),
    spanEnd: v.optional(v.number()),
    quote: v.optional(v.string()),
    sourceOpenTextId: v.optional(v.id("openTextSnippet")),
    authorId: v.optional(v.id("person")),
    status: claimStatusValidator,
    reviewerId: v.optional(v.id("person")),
    modelVersion: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    /** Set on both claims when a steward marks them as conflicting; both stay citable. */
    disputedWith: v.optional(v.id("claim")),
    isMock: v.boolean(),
  })
    .index("by_placeId_and_status", ["placeId", "status"])
    .index("by_placeId_and_origin_and_status", ["placeId", "origin", "status"])
    .index("by_sourceTranscriptId", ["sourceTranscriptId"]),

  /** Unreviewed rows show the unreviewed label (FR-016). `reviewedBy` is a named reviewer. */
  claimTranslation: defineTable({
    claimId: v.id("claim"),
    lang: v.string(),
    text: v.string(),
    origin: translationOriginValidator,
    modelVersion: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
  }).index("by_claimId_and_lang", ["claimId", "lang"]),

  pageVersion: defineTable({
    placeId: v.id("place"),
    version: v.number(),
    /** Model version that composed the page. */
    generatedBy: v.string(),
    reviewedBy: v.optional(v.id("person")),
    status: pageVersionStatusValidator,
  })
    .index("by_placeId_and_version", ["placeId", "version"])
    .index("by_placeId_and_status_and_version", ["placeId", "status", "version"]),

  /**
   * A sentence cites its claims itself (`claimIds`), so "a sentence that is not held cites at least
   * one published or disputed claim" is a rule about one row, checked when it is written (SC-003).
   * This replaces the data model's `sentence_claim` join table (research D19).
   */
  pageSentence: defineTable({
    pageVersionId: v.id("pageVersion"),
    ordinal: v.number(),
    lang: v.string(),
    text: v.string(),
    held: v.boolean(),
    claimIds: v.array(v.id("claim")),
  }).index("by_pageVersionId_and_lang_and_ordinal", ["pageVersionId", "lang", "ordinal"]),
};
