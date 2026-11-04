import type { Triggers } from "convex-helpers/server/triggers";
import {
  QUOTE_MAX,
  type MentionPlatform,
  type MentionStatus,
} from "../../../src/lib/story-finder/mention";
import type { DataModel } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { mustBeUnique, violation } from "./shared";

async function bump(
  db: MutationCtx["db"],
  status: MentionStatus,
  platform: MentionPlatform,
  delta: number,
) {
  const row = await db
    .query("mentionCount")
    .withIndex("by_status_and_platform", (q) => q.eq("status", status).eq("platform", platform))
    .unique();
  if (row === null)
    await db.insert("mentionCount", { status, platform, count: Math.max(0, delta) });
  else await db.patch("mentionCount", row._id, { count: Math.max(0, row.count + delta) });
}

/** Rules for the story finder's candidates and the posts it links. */
export function registerStoryFinderRules(triggers: Triggers<DataModel>) {
  mustBeUnique(
    triggers,
    "mentionCandidate",
    "mention_candidate_unique",
    "place and canonical URL",
    (ctx, candidate) =>
      ctx.db
        .query("mentionCandidate")
        .withIndex("by_placeId_and_canonicalUrl", (q) =>
          q.eq("placeId", candidate.placeId).eq("canonicalUrl", candidate.canonicalUrl),
        )
        .take(2),
  );

  // Counts per status and platform for the steward's overview, in the same transaction as the row.
  triggers.register("mentionCandidate", async (ctx, change) => {
    const before = change.oldDoc;
    const after = change.newDoc;
    if (before?.status === after?.status && before?.platform === after?.platform) return;
    if (before) await bump(ctx.innerDb, before.status, before.platform, -1);
    if (after) await bump(ctx.innerDb, after.status, after.platform, 1);
  });

  triggers.register("mentionCandidate", async (_ctx, change) => {
    const candidate = change.newDoc;
    if (candidate === null) return;
    if (
      candidate.status === "attached" &&
      (candidate.sourceId === undefined || candidate.attachedAt === undefined)
    )
      throw violation(
        "mention_attached_has_source",
        "an attached candidate names its source and when it was attached",
      );
    if (candidate.status === "rejected" && candidate.reason === undefined)
      throw violation("mention_rejected_has_reason", "a rejected candidate says why");
  });

  // Only a found post carries an excerpt, and it is short: the post itself stays where it was posted.
  triggers.register("source", async (_ctx, change) => {
    const source = change.newDoc;
    if (source === null || source.excerpt === undefined) return;
    if (source.origin !== "story_finder")
      throw violation(
        "source_excerpt_found_only",
        "only a post the story finder found has an excerpt",
      );
    if (!source.excerpt.trim() || source.excerpt.length > QUOTE_MAX || !source.excerptLang)
      throw violation(
        "source_excerpt_short",
        `an excerpt is 1 to ${QUOTE_MAX} characters with its language`,
      );
  });
}
