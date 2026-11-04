import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The translation check is on when AI_MODEL_CHECK_TRANSLATION is set; unset, nothing changes. */
export function checkSetting(): string | undefined {
  return process.env.AI_MODEL_CHECK_TRANSLATION?.trim() || undefined;
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
 * Starts a fresh check of a machine translation's current text when the check is on, replacing
 * any earlier check of that translation.
 */
export async function queueCheck(
  ctx: MutationCtx,
  translation: Doc<"claimTranslation">,
  options: { retranslated?: boolean } = {},
) {
  await dropCheck(ctx, translation._id);
  const setting = checkSetting();
  if (setting === undefined || translation.origin !== "machine") return;
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
