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
  })
    .index("by_placeId_and_status", ["placeId", "status"])
    .index("by_authorPersonId", ["authorPersonId"]),

  /**
   * A story a member wrote in Noren about a place: what they heard, saw or tasted there, shown in
   * public with their name (FR-033). Unlike a visitor note it is not a message to the owner.
   */
  story: defineTable({
    placeId: v.id("place"),
    authorPersonId: v.id("person"),
    body: v.string(),
    lang: v.string(),
    status: v.union(v.literal("live"), v.literal("hidden")),
    isMock: v.boolean(),
    /**
     * When the writer ticked that Noren and the place may share the story on Instagram, with their
     * name; absent when not ticked, or turned off since. Stories written before the tick have none.
     */
    shareConsentAt: v.optional(v.number()),
    /** When a steward marked it as posted on Noren's accounts, by hand. */
    sharePostedAt: v.optional(v.number()),
    /**
     * When the writer allowed AI to read this story, with their name: Noren's in-app planner, and
     * assistants such as Claude or ChatGPT through the connector (src/lib/connector/policy.ts).
     * Absent means not allowed, as for every story written before the tick exists. Stories show on
     * Noren, to people, regardless.
     */
    connectorAllowedAt: v.optional(v.number()),
    /**
     * A question the writer leaves for the next visitor to ask at this place: one line, 1 to 140
     * characters, in the story's own language (src/lib/slip/question.ts). Never translated and never
     * sent to any AI service. Only written while walk mode is on; stories before it have none.
     */
    nextQuestion: v.optional(v.string()),
    /**
     * The place the question is carried to ("three doors"): another place nearby, in the same region,
     * that a signed-out visitor can see. Unset means the question is for the next visitor of this
     * same place. Only written while features.thread is on; while it is off, a question carried
     * elsewhere is nobody's open question (a clean rollback). Always with `nextQuestion`.
     */
    nextQuestionFor: v.optional(v.id("place")),
    /**
     * What this story answers: another story's question at the same place, or a starter question
     * (src/lib/slip/starter-questions.ts). Absent for stories that answer nothing.
     */
    answers: v.optional(
      v.union(
        v.object({ kind: v.literal("story"), storyId: v.id("story") }),
        v.object({ kind: v.literal("starter"), key: v.string() }),
      ),
    ),
  })
    .index("by_placeId_and_status", ["placeId", "status"])
    .index("by_status", ["status"])
    .index("by_nextQuestionFor_and_status", ["nextQuestionFor", "status"])
    .index("by_status_and_shareConsentAt", ["status", "shareConsentAt"])
    .index("by_authorPersonId", ["authorPersonId"]),

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

  /**
   * A bug report from a visitor, no account needed. It holds what they wrote, the page they came
   * from and their browser, never who is signed in. The contact detail is erased when it closes.
   */
  problemReport: defineTable({
    details: v.string(),
    /** A same-site path only, without query or fragment ("" when none was usable). */
    pagePath: v.string(),
    device: v.string(),
    contact: v.string(),
    locale: v.union(v.literal("ja"), v.literal("en")),
    status: v.union(v.literal("open"), v.literal("done")),
    receivedAt: v.number(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("person")),
  }).index("by_status_and_receivedAt", ["status", "receivedAt"]),

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
  }).index("by_targetType_and_targetId", ["targetType", "targetId"]),
};
