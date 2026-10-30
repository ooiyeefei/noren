import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { mustBeUnique, violation } from "./shared";

/** Rules for the interview, consent, transcript and claim translation tables. */
export function registerInterviewRules(triggers: Triggers<DataModel>) {
  mustBeUnique(triggers, "consent", "consent_one_per_interview", "interview", (ctx, consent) =>
    ctx.db
      .query("consent")
      .withIndex("by_interviewId", (q) => q.eq("interviewId", consent.interviewId))
      .take(2),
  );

  // FR-008: no audio and no progress past `consent_pending` without a recorded, unwithdrawn
  // consent. Marking an interview `withdrawn` is never blocked, so hiding cannot be prevented.
  triggers.register("interview", async (ctx, change) => {
    const interview = change.newDoc;
    if (interview === null) return;
    if (interview.durationS !== undefined && interview.durationS < 0) {
      throw violation(
        "interview_duration_not_negative",
        "an interview cannot have a negative length",
      );
    }
    const needsConsent =
      (interview.status !== "consent_pending" && interview.status !== "withdrawn") ||
      (interview.audioStorageId !== undefined && interview.status !== "withdrawn");
    if (!needsConsent) return;
    const consent = await ctx.db
      .query("consent")
      .withIndex("by_interviewId", (q) => q.eq("interviewId", change.id))
      .first();
    if (consent === null || consent.withdrawnAt !== undefined) {
      throw violation(
        "interview_requires_consent",
        `interview ${change.id} needs a recorded, unwithdrawn consent before audio or status ${interview.status}`,
      );
    }
  });

  mustBeUnique(
    triggers,
    "transcript",
    "transcript_interview_version_unique",
    "interview and version",
    (ctx, transcript) =>
      ctx.db
        .query("transcript")
        .withIndex("by_interviewId_and_version", (q) =>
          q.eq("interviewId", transcript.interviewId).eq("version", transcript.version),
        )
        .take(2),
  );

  triggers.register("transcript", async (_ctx, change) => {
    const transcript = change.newDoc;
    if (transcript === null) return;
    if (!Number.isInteger(transcript.version) || transcript.version < 1) {
      throw violation("transcript_version_positive", "a transcript version starts at 1");
    }
    if (transcript.origin === "machine" && transcript.modelVersion === undefined) {
      throw violation("transcript_machine_has_model", "a machine transcript names its model");
    }
    if (transcript.origin === "human_corrected" && transcript.createdBy === undefined) {
      throw violation("transcript_corrected_has_author", "a corrected transcript names its author");
    }
  });

  mustBeUnique(
    triggers,
    "claimTranslation",
    "claim_translation_unique",
    "claim and language",
    (ctx, translation) =>
      ctx.db
        .query("claimTranslation")
        .withIndex("by_claimId_and_lang", (q) =>
          q.eq("claimId", translation.claimId).eq("lang", translation.lang),
        )
        .take(2),
  );
}
