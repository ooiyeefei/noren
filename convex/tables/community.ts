import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  actorKindValidator,
  noteStatusValidator,
  takedownStatusValidator,
  visibilityValidator,
  takedownTargetTypeValidator,
  translationOriginValidator,
} from "../lib/validators";

export const communityTables = {
  /** Visitor notes and owner replies (FR-017). Notes with personal information are held. */
  note: defineTable({
    placeId: v.id("place"),
    parentId: v.optional(v.id("note")),
    authorPersonId: v.id("person"),
    body: v.string(),
    lang: v.string(),
    status: noteStatusValidator,
    isMock: v.boolean(),
  }).index("by_placeId_and_status", ["placeId", "status"]),

  noteTranslation: defineTable({
    noteId: v.id("note"),
    lang: v.string(),
    text: v.string(),
    origin: translationOriginValidator,
    modelVersion: v.optional(v.string()),
  }).index("by_noteId_and_lang", ["noteId", "lang"]),

  /** Cards without a reviewer show the unreviewed label (FR-018). `reviewedBy` is a named reviewer. */
  phraseCard: defineTable({
    regionId: v.string(),
    key: v.string(),
    textJa: v.string(),
    textEn: v.string(),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
  }).index("by_regionId_and_key", ["regionId", "key"]),

  /**
   * Totals only: a count per source per day. No IP address, no cookie, nothing that identifies a
   * visitor (FR-024). Mock sources are tagged so every statistic can exclude them (FR-022).
   */
  linkCountDaily: defineTable({
    sourceId: v.id("source"),
    /** Calendar day as YYYY-MM-DD. */
    day: v.string(),
    count: v.number(),
    isMock: v.boolean(),
  }).index("by_sourceId_and_day", ["sourceId", "day"]),

  takedownRequest: defineTable({
    targetType: takedownTargetTypeValidator,
    /** The target's id as a string, because the target can be in any of several tables. */
    targetId: v.string(),
    reason: v.string(),
    /** Hides the target immediately while a steward reviews (FR-025). */
    privacyOrMinor: v.boolean(),
    requesterContact: v.string(),
    status: takedownStatusValidator,
    outcome: v.optional(v.string()),
    receivedAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    /** Shown once to the requester, who uses it to check the outcome and to appeal; no account or email is needed. */
    code: v.optional(v.string()),
    locale: v.optional(v.string()),
    appealNote: v.optional(v.string()),
    appealedAt: v.optional(v.number()),
    /** Set when a privacy or minor request hid a place at once; a steward publishes it again through the normal route. */
    hiddenPlaceId: v.optional(v.id("place")),
    previousVisibility: v.optional(visibilityValidator),
  })
    .index("by_status", ["status"])
    .index("by_code", ["code"])
    .index("by_status_and_receivedAt", ["status", "receivedAt"]),

  /** A fixed-window counter for the few public write paths (the takedown form); one row per key. */
  rateLimit: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  /** Moderation actions and AI edits (FR-026). The time of an entry is its `_creationTime`. */
  auditLog: defineTable({
    actorKind: actorKindValidator,
    actorPersonId: v.optional(v.id("person")),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    diff: v.optional(v.record(v.string(), v.any())),
    modelVersion: v.optional(v.string()),
  }),
};
