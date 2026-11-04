import { v, type Infer } from "convex/values";
import { translationFits } from "../src/lib/story-finder/mention";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import {
  checkFor,
  checkSetting,
  consentCoversCheck,
  excerptIsCheckable,
  scheduleCheckRun,
} from "./lib/translationChecks";

/** A sleeping endpoint answers 503 at once and is ready about 3.5 minutes later. */
export const RETRY_AFTER_MS = 30_000;
/** After this long without an answer the check is marked unavailable, for a steward to re-queue. */
export const GIVE_UP_AFTER_MS = 9 * 60_000;
/** Longer than a run may take (Convex stops an action at 10 minutes). */
const LEASE_MS = 10 * 60_000;
const BATCH_SIZE = 20;
const CHECKABLE = ["owner_confirmed", "published", "disputed"] as const;

const itemValidator = v.object({
  checkId: v.id("translationCheck"),
  text: v.string(),
  lang: v.string(),
  original: v.string(),
  originalLang: v.string(),
  placeId: v.id("place"),
  retranslated: v.boolean(),
  /** How the translator frames the words when it translates them again. */
  inputKind: v.union(v.literal("claim"), v.literal("public_post_quote")),
});
export type CheckItem = Infer<typeof itemValidator>;

const outcomeValidator = v.union(
  v.object({
    kind: v.literal("report"),
    faithful: v.boolean(),
    added: v.array(v.string()),
    missing: v.array(v.string()),
  }),
  /** The endpoint was asleep or unreachable; `sent` is false when no request went out. */
  v.object({ kind: v.literal("retry"), sent: v.boolean(), error: v.optional(v.string()) }),
  /** The run ran out of time before reaching this check. */
  v.object({ kind: v.literal("defer") }),
  v.object({ kind: v.literal("fail"), error: v.string() }),
  v.object({ kind: v.literal("retranslation_failed"), error: v.string() }),
);
export type CheckOutcome = Infer<typeof outcomeValidator>;
const stepValidator = v.union(
  v.literal("passed"),
  v.literal("retranslate"),
  v.literal("held"),
  v.literal("waiting"),
  v.literal("unavailable"),
  v.literal("stale"),
);
export type CheckStep = Infer<typeof stepValidator>;

type ClaimCheck = Extract<Doc<"translationCheck">, { claimId: Id<"claim"> }>;
type ExcerptCheck = Extract<Doc<"translationCheck">, { subject: "excerpt" }>;

/** What a pending check compares, and how to replace its translation with a second attempt. */
type Subject = {
  check: Doc<"translationCheck">;
  original: string;
  originalLang: string;
  placeId: Id<"place">;
  inputKind: CheckItem["inputKind"];
  /** Saves a re-translation; false when it may not replace the checked one. */
  replace(text: string, modelVersion: string): Promise<boolean>;
};

/** An interview statement: checked only while the owner's consent covers sending it to Modal. */
async function claimSubject(ctx: MutationCtx, check: ClaimCheck): Promise<Subject | null> {
  const translation = await ctx.db.get("claimTranslation", check.translationId);
  const claim = translation === null ? null : await ctx.db.get("claim", translation.claimId);
  if (
    translation === null ||
    translation.origin !== "machine" ||
    translation.text !== check.text ||
    claim === null ||
    !CHECKABLE.some((status) => status === claim.status) ||
    !(await consentCoversCheck(ctx, claim))
  )
    return null;
  return {
    check,
    original: claim.textOriginal,
    originalLang: claim.langOriginal,
    placeId: claim.placeId,
    inputKind: "claim",
    replace: async (text, modelVersion) => {
      await ctx.db.patch("claimTranslation", translation._id, { text, modelVersion });
      await writeAudit(ctx, {
        actorKind: "ai",
        modelVersion,
        action: "claim.translate_machine",
        targetType: "claim",
        targetId: claim._id,
        diff: { lang: translation.lang, retranslated: true },
      });
      return true;
    },
  };
}

/**
 * A found post's quote: public words, so no consent applies (excerptIsCheckable), while the quote
 * is still shown and the translation is still of the quote as it stands.
 */
async function excerptSubject(ctx: MutationCtx, check: ExcerptCheck): Promise<Subject | null> {
  const translation = await ctx.db.get("sourceExcerptTranslation", check.translationId);
  const source = await ctx.db.get("source", check.sourceId);
  if (
    translation === null ||
    translation.text !== check.text ||
    !excerptIsCheckable(source) ||
    translation.sourceText !== source.excerpt
  )
    return null;
  return {
    check,
    original: source.excerpt,
    originalLang: source.excerptLang,
    placeId: source.placeId,
    inputKind: "public_post_quote",
    replace: async (text, modelVersion) => {
      // The same bounds as the first translation: about as long as the quote, no added address.
      if (!translationFits(source.excerpt, text)) return false;
      await ctx.db.patch("sourceExcerptTranslation", translation._id, { text, modelVersion });
      await writeAudit(ctx, {
        actorKind: "ai",
        modelVersion,
        action: "source.translate_machine",
        targetType: "source",
        targetId: source._id,
        diff: { lang: translation.lang, retranslated: true },
      });
      return true;
    },
  };
}

/** The check and what it is about, while the check still describes its translation. */
async function current(
  ctx: MutationCtx,
  checkId: Id<"translationCheck">,
  text: string,
): Promise<Subject | null> {
  const check = await ctx.db.get("translationCheck", checkId);
  if (check === null || check.text !== text || check.status !== "pending") return null;
  const subject =
    check.subject === "excerpt" ? await excerptSubject(ctx, check) : await claimSubject(ctx, check);
  if (subject === null) {
    // The words were edited, withdrawn, taken down or translated by a person, or the owner's
    // consent no longer covers sending them to Modal: nothing is left to check, and nothing is sent.
    await ctx.db.delete("translationCheck", check._id);
    return null;
  }
  return subject;
}

async function audit(
  ctx: MutationCtx,
  check: Doc<"translationCheck">,
  setting: string,
  diff: Record<string, unknown>,
) {
  await writeAudit(ctx, {
    ...(setting
      ? { actorKind: "ai" as const, modelVersion: setting }
      : { actorKind: "system" as const }),
    ...(check.subject === "excerpt"
      ? { action: "source.translation_check", targetType: "source", targetId: check.sourceId }
      : { action: "claim.translation_check", targetType: "claim", targetId: check.claimId }),
    diff: { lang: check.lang, ...diff },
  });
}

/** Leases the checks that are due, so one run sends them all to the endpoint it wakes. */
export const startBatch = internalMutation({
  args: {},
  returns: v.array(itemValidator),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("translationCheck")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(BATCH_SIZE * 2);
    const items: CheckItem[] = [];
    for (const row of due) {
      if (items.length === BATCH_SIZE) break;
      if (row.leaseUntil !== undefined && row.leaseUntil > now) continue;
      const found = await current(ctx, row._id, row.text);
      if (found === null) continue;
      await ctx.db.patch("translationCheck", row._id, {
        leaseUntil: now + LEASE_MS,
        firstAttemptAt: row.firstAttemptAt ?? now,
      });
      items.push({
        checkId: row._id,
        text: row.text,
        lang: row.lang,
        original: found.original,
        originalLang: found.originalLang,
        placeId: found.placeId,
        retranslated: row.retranslated,
        inputKind: found.inputKind,
      });
    }
    return items;
  },
});

/**
 * The verdict state machine. A faithful translation passes. An unfaithful one is translated again
 * once with the checker's lists ("retranslate"), and if the new one is still unfaithful it is held
 * back from the public until a person decides. A sleeping endpoint means waiting 30 seconds, up to
 * nine minutes from the first attempt; any other failure leaves the check unavailable.
 */
export const recordOutcome = internalMutation({
  args: {
    checkId: v.id("translationCheck"),
    text: v.string(),
    modelSetting: v.string(),
    outcome: outcomeValidator,
  },
  returns: stepValidator,
  handler: async (ctx, { checkId, text, modelSetting, outcome }): Promise<CheckStep> => {
    const found = await current(ctx, checkId, text);
    if (found === null) return "stale";
    const { check } = found;
    const now = Date.now();
    const base = { leaseUntil: undefined, modelSetting };
    if (outcome.kind === "defer") {
      await ctx.db.patch("translationCheck", checkId, { ...base, nextAttemptAt: now });
      return "waiting";
    }
    if (outcome.kind === "retry") {
      const attempts = check.attempts + (outcome.sent ? 1 : 0);
      if (now - (check.firstAttemptAt ?? now) >= GIVE_UP_AFTER_MS) {
        await ctx.db.patch("translationCheck", checkId, {
          ...base,
          status: "unavailable",
          attempts,
          error: `gave up after ${Math.round((now - check.firstAttemptAt!) / 1000)} s: ${outcome.error ?? "endpoint not ready"}`,
        });
        await audit(ctx, check, modelSetting, {
          result: "unavailable",
          attempts,
        });
        return "unavailable";
      }
      await ctx.db.patch("translationCheck", checkId, {
        ...base,
        attempts,
        nextAttemptAt: now + RETRY_AFTER_MS,
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
      });
      return "waiting";
    }
    if (outcome.kind === "fail") {
      const attempts = check.attempts + 1;
      await ctx.db.patch("translationCheck", checkId, {
        ...base,
        status: "unavailable",
        attempts,
        error: outcome.error,
      });
      await audit(ctx, check, modelSetting, {
        result: "unavailable",
        attempts,
      });
      return "unavailable";
    }
    if (outcome.kind === "retranslation_failed") {
      // The first check's lists are already stored; a person decides from them.
      await ctx.db.patch("translationCheck", checkId, {
        ...base,
        status: "held",
        error: outcome.error,
      });
      await audit(ctx, check, modelSetting, {
        result: "held",
        attempts: check.attempts,
        added: check.added.length,
        missing: check.missing.length,
        retranslated: false,
      });
      return "held";
    }
    const attempts = check.attempts + 1;
    const verdict = {
      attempts,
      added: outcome.added,
      missing: outcome.missing,
      checkedAt: now,
      error: undefined,
    };
    if (!outcome.faithful && !check.retranslated) {
      // Keep the lease: the same run translates again and checks the new text.
      await ctx.db.patch("translationCheck", checkId, { ...verdict, modelSetting });
      return "retranslate";
    }
    const status = outcome.faithful ? "passed" : "held";
    await ctx.db.patch("translationCheck", checkId, { ...base, ...verdict, status });
    await audit(ctx, check, modelSetting, {
      result: status,
      attempts,
      added: outcome.added.length,
      missing: outcome.missing.length,
      retranslated: check.retranslated,
    });
    return status;
  },
});

/** Replaces an unfaithful machine translation with the translator's second attempt. */
export const saveRetranslation = internalMutation({
  args: {
    checkId: v.id("translationCheck"),
    text: v.string(),
    newText: v.string(),
    modelVersion: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { checkId, text, newText, modelVersion }) => {
    const found = await current(ctx, checkId, text);
    const trimmed = newText.trim();
    if (found === null || !trimmed || trimmed.length > 1000) return false;
    if (!(await found.replace(trimmed, modelVersion))) {
      // A second attempt that may not be shown either: hold the first, with its check's lists.
      await ctx.db.patch("translationCheck", checkId, {
        status: "held",
        leaseUntil: undefined,
        error: "the re-translation did not fit the words it translates",
      });
      await audit(ctx, found.check, found.check.modelSetting, {
        result: "held",
        attempts: found.check.attempts,
        added: found.check.added.length,
        missing: found.check.missing.length,
        retranslated: false,
      });
      return false;
    }
    await ctx.db.patch("translationCheck", checkId, { text: trimmed, retranslated: true });
    return true;
  },
});

/** Ends a run: schedules the next one when checks are still waiting. */
export const finishRun = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const run = await ctx.db.query("translationCheckRun").first();
    if (run !== null)
      await ctx.db.patch("translationCheckRun", run._id, { scheduledId: undefined });
    const waiting = await ctx.db
      .query("translationCheck")
      .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "pending"))
      .take(50);
    if (!waiting.length) return null;
    const now = Date.now();
    const next = Math.min(
      ...waiting.map((row) => Math.max(row.nextAttemptAt, row.leaseUntil ?? 0)),
    );
    await scheduleCheckRun(ctx, Math.max(0, next - now));
    return null;
  },
});

async function requireCheck(ctx: MutationCtx, claimId: Id<"claim">, lang: string) {
  const translation = await ctx.db
    .query("claimTranslation")
    .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId).eq("lang", lang))
    .unique();
  const check = translation === null ? null : await checkFor(ctx, translation._id);
  if (translation === null || check === null || check.text !== translation.text)
    throw appError("not_found", "no translation check for this statement and language");
  return check;
}

/** A steward decides that a held translation may be shown; it stays labelled machine-translated. */
export const release = mutation({
  args: { claimId: v.id("claim"), lang: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, lang }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const check = await requireCheck(ctx, claimId, lang);
    if (check.status !== "held") throw appError("conflict", "only a held translation is released");
    await ctx.db.patch("translationCheck", check._id, {
      status: "released",
      decidedBy: steward._id,
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "claim.translation_released",
      targetType: "claim",
      targetId: claimId,
      diff: { lang },
    });
    return null;
  },
});

/** A steward queues a check that could not run; it joins the next run. */
export const checkAgain = mutation({
  args: { claimId: v.id("claim"), lang: v.string() },
  returns: v.null(),
  handler: async (ctx, { claimId, lang }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const check = await requireCheck(ctx, claimId, lang);
    if (check.status !== "unavailable")
      throw appError("conflict", "only a check that could not run is queued again");
    const setting = checkSetting();
    if (setting === undefined) throw appError("conflict", "the translation check is switched off");
    const claim = await ctx.db.get("claim", claimId);
    if (claim === null || !(await consentCoversCheck(ctx, claim)))
      throw appError("conflict", "the owner's consent does not cover the translation check");
    await ctx.db.patch("translationCheck", check._id, {
      status: "pending",
      modelSetting: setting,
      firstAttemptAt: undefined,
      nextAttemptAt: Date.now(),
      leaseUntil: undefined,
      error: undefined,
    });
    await scheduleCheckRun(ctx, 0);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "ai.translation_check_requested",
      targetType: "claim",
      targetId: claimId,
      diff: { lang },
    });
    return null;
  },
});
