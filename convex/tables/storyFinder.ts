import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  ABOUT_ANSWERS,
  MENTION_KINDS,
  MENTION_PLATFORMS,
  MENTION_STATUSES,
  REJECT_REASONS,
} from "../../src/lib/story-finder/mention";
import { literals } from "../lib/validators";

export const mentionPlatformValidator = literals(MENTION_PLATFORMS);
export const mentionStatusValidator = literals(MENTION_STATUSES);
export const mentionKindValidator = literals(MENTION_KINDS);
export const rejectReasonValidator = literals(REJECT_REASONS);

/** What the model reported, after code checked the evidence and the quote against the post. */
export const mentionVerdictValidator = v.object({
  aboutThisPlace: literals(ABOUT_ANSWERS),
  evidence: v.string(),
  kind: mentionKindValidator,
  namesPrivatePeople: v.boolean(),
  quote: v.string(),
  topics: v.array(v.string()),
  adMarker: v.optional(v.boolean()),
});

export const storyFinderTables = {
  /**
   * A public post the story finder found for a place, waiting for or past its check. Steward-only:
   * no public function reads this table. `text` is the post's full text, kept only for the check;
   * what may become public is the short verbatim quote, and only once the post is attached.
   */
  mentionCandidate: defineTable({
    placeId: v.id("place"),
    regionId: v.string(),
    platform: mentionPlatformValidator,
    url: v.string(),
    canonicalUrl: v.string(),
    authorName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    authorUrl: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    text: v.string(),
    langGuess: v.optional(v.string()),
    searchedFor: v.string(),
    query: v.string(),
    actorId: v.string(),
    runId: v.string(),
    /** The steward who ran the finder; an attached post is linked in their name. */
    collectedBy: v.id("person"),
    status: mentionStatusValidator,
    reason: v.optional(rejectReasonValidator),
    /** Why an accepted post could not be attached yet (the place left the map, a bad address). */
    attachError: v.optional(v.string()),
    /** When a check took the candidate; another check may take it again after the lease ends. */
    checkStartedAt: v.optional(v.number()),
    checkAttempts: v.optional(v.number()),
    lastCheckError: v.optional(v.string()),
    checkedAt: v.optional(v.number()),
    /** The model setting that checked it, such as meta:muse-spark-1.3. */
    modelSetting: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    verdict: v.optional(mentionVerdictValidator),
    sourceId: v.optional(v.id("source")),
    hiddenAt: v.optional(v.number()),
    hiddenBy: v.optional(v.id("person")),
  })
    .index("by_placeId_and_canonicalUrl", ["placeId", "canonicalUrl"])
    .index("by_status_and_checkStartedAt", ["status", "checkStartedAt"])
    .index("by_status_and_checkedAt", ["status", "checkedAt"])
    .index("by_sourceId", ["sourceId"]),

  /** How many candidates there are per status and platform, kept by a trigger (lib/rules/storyFinder). */
  mentionCount: defineTable({
    status: mentionStatusValidator,
    platform: mentionPlatformValidator,
    count: v.number(),
  }).index("by_status_and_platform", ["status", "platform"]),

  /** A machine translation of a found post's quote, made by the translation job (labelled machine). */
  sourceExcerptTranslation: defineTable({
    sourceId: v.id("source"),
    lang: v.string(),
    text: v.string(),
    /** The quote it translates, so a changed quote is not shown with an old translation. */
    sourceText: v.string(),
    origin: v.literal("machine"),
    modelVersion: v.string(),
  }).index("by_sourceId_and_lang", ["sourceId", "lang"]),
};
