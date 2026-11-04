import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  ABOUT_ANSWERS,
  MENTION_KINDS,
  MENTION_PLATFORMS,
  MENTION_STATUSES,
  REJECT_REASONS,
} from "../../src/lib/story-finder/mention";
import { STORY_RUN_STATUSES, STORY_STEP_KINDS } from "../../src/lib/story-agent/agent";
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

export const storyRunStatusValidator = literals(STORY_RUN_STATUSES);
export const storyStepValidator = v.object({
  at: v.number(),
  kind: literals(STORY_STEP_KINDS),
  count: v.optional(v.number()),
  detail: v.optional(v.string()),
  sentence: v.optional(v.string()),
  words: v.optional(v.string()),
  added: v.optional(v.array(v.string())),
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
    /** A web page's or Reddit post's title; untrusted, like the text. */
    title: v.optional(v.string()),
    /** The place the post is tagged with: Google's own name for it, an Instagram location. */
    locationName: v.optional(v.string()),
    langGuess: v.optional(v.string()),
    /**
     * True when the whole post carried an ad label, found by the collector before the text was cut
     * to the stored window (which can leave a page's top or bottom label out). The check and the
     * attach reject a flagged post as sponsored.
     */
    adMarker: v.optional(v.boolean()),
    searchedFor: v.string(),
    query: v.string(),
    actorId: v.string(),
    runId: v.string(),
    /** One run of the collect script; at most a few posts per author are attached from one. */
    collectionId: v.string(),
    /**
     * Who wrote it, from identifiers the platform vouches for: a web page's registrable host, or a
     * profile address or handle; never a display name (authorKey in lib/story-finder/mention.ts).
     */
    authorKey: v.string(),
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
    attachedAt: v.optional(v.number()),
    hiddenAt: v.optional(v.number()),
    hiddenBy: v.optional(v.id("person")),
  })
    .index("by_placeId_and_canonicalUrl", ["placeId", "canonicalUrl"])
    .index("by_status_and_checkStartedAt", ["status", "checkStartedAt"])
    .index("by_status_and_checkedAt", ["status", "checkedAt"])
    .index("by_status_and_attachedAt", ["status", "attachedAt"])
    .index("by_collectionId_and_authorKey_and_status", ["collectionId", "authorKey", "status"])
    .index("by_sourceId", ["sourceId"]),

  /** How many candidates there are per status and platform, kept by a trigger (lib/rules/storyFinder). */
  mentionCount: defineTable({
    status: mentionStatusValidator,
    platform: mentionPlatformValidator,
    count: v.number(),
  }).index("by_status_and_platform", ["status", "platform"]),

  /**
   * The quote of every found post that is shown or was hidden, kept small so the copy check can read
   * all of a region's at once (copiesShownQuote in convex/storyFinder.ts). A trigger on
   * mentionCandidate writes it (lib/rules/storyFinder.ts); a hidden post's quote stays, so hiding a
   * post does not let a copy of it in.
   */
  shownQuote: defineTable({
    regionId: v.string(),
    candidateId: v.id("mentionCandidate"),
    status: v.union(v.literal("attached"), v.literal("hidden")),
    /** The quote reduced to its letters and digits (quoteFingerprint). */
    fingerprint: v.string(),
  })
    .index("by_regionId_and_status", ["regionId", "status"])
    .index("by_candidateId", ["candidateId"]),

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

  /**
   * A place's story as the story agent wrote it from the posts about it. Public, labelled as written
   * by AI. Every sentence cites live found posts with words code found in them (lib/story-agent);
   * erasing a post takes out every sentence citing it (lib/foundPosts).
   */
  placeStory: defineTable({
    placeId: v.id("place"),
    sentences: v.array(
      v.object({
        en: v.string(),
        ja: v.string(),
        citations: v.array(v.object({ sourceId: v.id("source"), words: v.string() })),
      }),
    ),
    postsRead: v.number(),
    /** The model settings, such as meta:muse-spark-1.3 and modal:noren-glimmer. */
    writer: v.string(),
    checker: v.string(),
    publishedAt: v.number(),
    /** A person read it, or the place, and decided it stays off the page. A later run replaces this. */
    withdrawnAt: v.optional(v.number()),
  }).index("by_placeId", ["placeId"]),

  /** One run of the story agent and what it did, step by step. Steward-only. */
  placeStoryRun: defineTable({
    placeId: v.id("place"),
    requestedBy: v.id("person"),
    status: storyRunStatusValidator,
    platforms: v.array(mentionPlatformValidator),
    steps: v.array(storyStepValidator),
    /** How many times this run found the second reader asleep and came back later. */
    wakeAttempts: v.number(),
    writer: v.optional(v.string()),
    checker: v.optional(v.string()),
    published: v.optional(v.number()),
    error: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
  }).index("by_placeId", ["placeId"]),
};
