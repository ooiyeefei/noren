import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { regionConfig } from "./region";

/** The translation check is on when AI_MODEL_CHECK_TRANSLATION is set; unset, nothing changes. */
export function checkSetting(): string | undefined {
  return process.env.AI_MODEL_CHECK_TRANSLATION?.trim() || undefined;
}

/**
 * The check sends a person's words and their translation to Modal, so it runs only on interview
 * statements whose owner agreed to a consent text that names Modal, while that consent stands.
 * Anything else gets no check and stays as it was: shown, labelled machine-translated.
 */
export async function consentCoversCheck(ctx: QueryCtx, claim: Doc<"claim">): Promise<boolean> {
  if (claim.origin !== "interview" || claim.sourceTranscriptId === undefined) return false;
  const transcript = await ctx.db.get("transcript", claim.sourceTranscriptId);
  const interview =
    transcript === null ? null : await ctx.db.get("interview", transcript.interviewId);
  if (interview === null || interview.status === "withdrawn") return false;
  const consent = await ctx.db
    .query("consent")
    .withIndex("by_interviewId", (q) => q.eq("interviewId", interview._id))
    .first();
  const place = await ctx.db.get("place", claim.placeId);
  return (
    consent !== null &&
    consent.withdrawnAt === undefined &&
    place !== null &&
    regionConfig(place.regionId).consent.versionsNamingModal.includes(consent.textVersion)
  );
}

export async function checkFor(ctx: QueryCtx, translationId: Id<"claimTranslation">) {
  return await ctx.db
    .query("translationCheck")
    .withIndex("by_translationId", (q) => q.eq("translationId", translationId))
    .first();
}

/** A held translation stays off public pages until a person decides; nothing else is held. */
export async function isHeld(ctx: QueryCtx, translation: Doc<"claimTranslation">) {
  if (translation.origin !== "machine") return false;
  const check = await checkFor(ctx, translation._id);
  return check?.status === "held" && check.text === translation.text;
}

export async function dropCheck(ctx: MutationCtx, translationId: Id<"claimTranslation">) {
  const check = await checkFor(ctx, translationId);
  if (check !== null) await ctx.db.delete("translationCheck", check._id);
}

/**
 * Schedules the one check run, unless one is running (it looks for more work when it ends) or is
 * already due sooner. Every queued check waits for the same run, so one endpoint wake serves all.
 */
export async function scheduleCheckRun(ctx: MutationCtx, delayMs: number) {
  const run = await ctx.db.query("translationCheckRun").first();
  const now = Date.now();
  if (run?.scheduledId !== undefined) {
    const job = await ctx.db.system.get("_scheduled_functions", run.scheduledId);
    if (job?.state.kind === "inProgress") return;
    if (job?.state.kind === "pending") {
      if (job.scheduledTime <= now + delayMs) return;
      await ctx.scheduler.cancel(run.scheduledId);
    }
  }
  const scheduledId = await ctx.scheduler.runAfter(
    delayMs,
    internal.aiActions.checkTranslations,
    {},
  );
  if (run === null) await ctx.db.insert("translationCheckRun", { scheduledId });
  else await ctx.db.patch("translationCheckRun", run._id, { scheduledId });
}

/**
 * Starts a fresh check of a machine translation's current text when the check is on and the
 * owner's consent covers it, replacing any earlier check of that translation.
 */
export async function queueCheck(
  ctx: MutationCtx,
  translation: Doc<"claimTranslation">,
  options: { retranslated?: boolean } = {},
) {
  await dropCheck(ctx, translation._id);
  const setting = checkSetting();
  if (setting === undefined || translation.origin !== "machine") return;
  const claim = await ctx.db.get("claim", translation.claimId);
  if (claim === null || !(await consentCoversCheck(ctx, claim))) return;
  await ctx.db.insert("translationCheck", {
    translationId: translation._id,
    claimId: translation.claimId,
    lang: translation.lang,
    text: translation.text,
    status: "pending",
    modelSetting: setting,
    attempts: 0,
    retranslated: options.retranslated ?? false,
    added: [],
    missing: [],
    nextAttemptAt: Date.now(),
  });
  await scheduleCheckRun(ctx, 0);
}
