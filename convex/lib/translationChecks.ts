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

/**
 * A found post's quote is a stranger's public words, not an owner's: no consent text covers it and
 * none is needed, so its machine translation is checked whenever the check is on, for as long as
 * the quote is shown on a live found-post card. This is a separate branch from consentCoversCheck,
 * which still decides alone for every interview statement.
 */
export function excerptIsCheckable(
  source: Doc<"source"> | null,
): source is Doc<"source"> & { excerpt: string; excerptLang: string } {
  return (
    source !== null &&
    source.origin === "story_finder" &&
    source.status === "live" &&
    !!source.excerpt &&
    !!source.excerptLang
  );
}

export async function checkFor(
  ctx: QueryCtx,
  translationId: Id<"claimTranslation"> | Id<"sourceExcerptTranslation">,
) {
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

/** The same rule for a found post's quote: a held translation is left off; the quote is shown. */
export async function isExcerptHeld(ctx: QueryCtx, translation: Doc<"sourceExcerptTranslation">) {
  const check = await checkFor(ctx, translation._id);
  return check?.status === "held" && check.text === translation.text;
}

export async function dropCheck(
  ctx: MutationCtx,
  translationId: Id<"claimTranslation"> | Id<"sourceExcerptTranslation">,
) {
  const check = await checkFor(ctx, translationId);
  if (check !== null) await ctx.db.delete("translationCheck", check._id);
}

/**
 * Erases what a found post's source holds of the post: its quote and every translation of it. A post
 * that comes off the page is never shown again, so nothing of it should stay to be shown. Does nothing
 * to a member's post, whose note is the member's own words.
 */
export async function eraseFoundQuote(ctx: MutationCtx, source: Doc<"source">) {
  if (source.origin !== "story_finder") return;
  const translations = await ctx.db
    .query("sourceExcerptTranslation")
    .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", source._id))
    .take(8);
  for (const translation of translations) {
    await dropCheck(ctx, translation._id);
    await ctx.db.delete("sourceExcerptTranslation", translation._id);
  }
  await ctx.db.patch("source", source._id, { excerpt: undefined, excerptLang: undefined });
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

/**
 * Starts a fresh check of a found post's quote's machine translation when the check is on, replacing
 * any earlier check of it. No consent applies (excerptIsCheckable); the check joins the same queue,
 * run and endpoint wake as statements' checks.
 */
export async function queueExcerptCheck(
  ctx: MutationCtx,
  translation: Doc<"sourceExcerptTranslation">,
) {
  await dropCheck(ctx, translation._id);
  const setting = checkSetting();
  if (setting === undefined) return;
  const source = await ctx.db.get("source", translation.sourceId);
  if (!excerptIsCheckable(source) || translation.sourceText !== source.excerpt) return;
  await ctx.db.insert("translationCheck", {
    subject: "excerpt",
    translationId: translation._id,
    sourceId: source._id,
    lang: translation.lang,
    text: translation.text,
    status: "pending",
    modelSetting: setting,
    attempts: 0,
    retranslated: false,
    added: [],
    missing: [],
    nextAttemptAt: Date.now(),
  });
  await scheduleCheckRun(ctx, 0);
}
