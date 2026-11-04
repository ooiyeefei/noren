/// <reference types="vite/client" />
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as languageModels from "../src/lib/ai/claim-extractor";
import type { AiModelConfig } from "../src/lib/ai/config";
import {
  addClaim,
  addCorrectedTranscript,
  addInterview,
  addPage,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { GIVE_UP_AFTER_MS, RETRY_AFTER_MS } from "./translationChecks";

const modules = import.meta.glob("./**/*.ts");
// Fictional Test Kissa text, as in the endpoint probe.
const ORIGINAL = "この店は祖母が昭和の終わりに始めました。お支払いは現金だけです。";
const FAITHFUL = "My grandmother started this shop at the end of the Showa era. We only take cash.";
const UNFAITHFUL =
  "My grandmother started this shop, the best coffee shop in Nagasaki, at the end of the Showa era.";
const STILL_UNFAITHFUL = "Grandmother opened the best coffee shop in Nagasaki in the Showa era.";
const SETTING = "modal:noren-glimmer";
const ADDED = ["the best coffee shop in Nagasaki"];
const MISSING = ["payment is cash only"];

const noNetwork = vi.fn(() => {
  throw new Error("network calls are forbidden in translation check tests");
});
beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-04T00:00:00Z") });
  noNetwork.mockClear();
  vi.stubGlobal("fetch", noNetwork);
  vi.stubEnv("AI_MODEL_CHECK_TRANSLATION", SETTING);
  vi.stubEnv("MODAL_PROXY_TOKEN", "mock-modal-token");
  vi.stubEnv("MODAL_BASE_URL", "https://mock.invalid");
  vi.stubEnv("AI_MODEL_TRANSLATE", "claude-sonnet-5-5");
  vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
  vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
  vi.stubEnv("META_API_KEY", undefined);
});
afterEach(() => {
  expect(noNetwork).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator, visibility: "demo_public" });
  const interviewId = await addInterview(b, { placeId, interviewerId: creator });
  const { transcriptId } = await addCorrectedTranscript(b, {
    interviewId,
    createdBy: creator,
    segments: [{ start: 0, end: 5, text: ORIGINAL }],
  });
  const claim = () =>
    addClaim(b, {
      placeId,
      transcriptId,
      origin: "interview",
      status: "published",
      text: ORIGINAL,
    });
  const claimId = await claim();
  const save = (text: string, id: Id<"claim"> = claimId) =>
    b.t.mutation(internal.claims.saveMachineTranslation, {
      claimId: id,
      lang: "en",
      sourceText: ORIGINAL,
      text,
      modelVersion: "muse-spark-1.3",
    });
  const checks = () => b.t.run((ctx) => ctx.db.query("translationCheck").collect());
  const translation = (id: Id<"claim"> = claimId) =>
    b.t.run((ctx) =>
      ctx.db
        .query("claimTranslation")
        .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", id).eq("lang", "en"))
        .unique(),
    );
  const runs = async () =>
    (await b.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter(
      ({ name }) => name === "aiActions:checkTranslations",
    );
  const record = (
    checkId: Id<"translationCheck">,
    text: string,
    outcome: Parameters<
      typeof b.t.mutation<typeof internal.translationChecks.recordOutcome>
    >[1]["outcome"],
  ) =>
    b.t.mutation(internal.translationChecks.recordOutcome, {
      checkId,
      text,
      modelSetting: SETTING,
      outcome,
    });
  const audit = async (action: string) =>
    (await b.t.run((ctx) => ctx.db.query("auditLog").collect())).filter(
      (row) => row.action === action,
    );
  /** A found post on the place, its quote the same made-up words: a stranger's public post. */
  let posts = 0;
  const foundQuote = (options: { origin?: "story_finder" } = { origin: "story_finder" }) =>
    b.run((ctx) =>
      ctx.db.insert("source", {
        placeId,
        addedBy: steward,
        platform: "web",
        adapter: "link_card",
        url: `https://blog.example.com/mock-entry-${++posts}`,
        canonicalUrl: `https://blog.example.com/mock-entry-${posts}`,
        status: "live",
        isMock: true,
        // Shown on the demo place, as a steward's demo source is.
        demoConsentBy: steward,
        demoConsentAt: Date.now(),
        ...(options.origin ? { origin: options.origin, excerpt: ORIGINAL, excerptLang: "ja" } : {}),
      }),
    );
  const saveQuote = (sourceId: Id<"source">, text: string) =>
    b.t.mutation(internal.storyFinder.saveExcerptTranslation, {
      sourceId,
      lang: "en",
      sourceText: ORIGINAL,
      text,
      modelVersion: "muse-spark-1.3",
    });
  const quoteTranslation = (sourceId: Id<"source">) =>
    b.t.run((ctx) =>
      ctx.db
        .query("sourceExcerptTranslation")
        .withIndex("by_sourceId_and_lang", (q) => q.eq("sourceId", sourceId).eq("lang", "en"))
        .unique(),
    );
  const setConsent = (patch: { textVersion?: string; withdrawnAt?: number }) =>
    b.run(async (ctx) => {
      const consent = await ctx.db
        .query("consent")
        .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
        .unique();
      await ctx.db.patch("consent", consent!._id, patch);
    });
  return {
    b,
    steward,
    placeId,
    claimId,
    setConsent,
    claim,
    save,
    checks,
    translation,
    runs,
    record,
    audit,
    foundQuote,
    saveQuote,
    quoteTranslation,
    asSteward: b.as("steward"),
  };
}

/** convex-test moves its clock a millisecond per transaction. */
function near(actual: number | undefined, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected);
  expect(actual).toBeLessThan(expected + 50);
}

function report(faithful: boolean) {
  return faithful
    ? { kind: "report" as const, faithful, added: [], missing: [] }
    : { kind: "report" as const, faithful, added: ADDED, missing: MISSING };
}

describe("queueing", () => {
  it("with the setting unset a machine translation is saved as before: no check, nothing scheduled", async () => {
    vi.stubEnv("AI_MODEL_CHECK_TRANSLATION", undefined);
    const s = await setup();
    await s.save(FAITHFUL);
    expect(await s.translation()).toMatchObject({ text: FAITHFUL, origin: "machine" });
    expect(await s.checks()).toEqual([]);
    expect(await s.runs()).toEqual([]);
  });

  it("each machine translation queues a check, and all of them share one scheduled run", async () => {
    const s = await setup();
    const second = await s.claim();
    await s.save(FAITHFUL);
    await s.save(UNFAITHFUL, second);
    expect(await s.checks()).toEqual([
      expect.objectContaining({
        claimId: s.claimId,
        text: FAITHFUL,
        status: "pending",
        modelSetting: SETTING,
        attempts: 0,
        retranslated: false,
      }),
      expect.objectContaining({ claimId: second, text: UNFAITHFUL, status: "pending" }),
    ]);
    expect(await s.runs()).toHaveLength(1);
  });

  it("a withdrawn statement's check is dropped before anything is sent", async () => {
    const s = await setup();
    await s.save(FAITHFUL);
    await s.b.run((ctx) => ctx.db.patch("claim", s.claimId, { status: "hidden" }));
    expect(await s.b.t.mutation(internal.translationChecks.startBatch, {})).toEqual([]);
    expect(await s.checks()).toEqual([]);
  });
});

describe("the verdict state machine", () => {
  it("faithful: checked, audited with the model setting, and shown as before", async () => {
    const s = await setup();
    await s.save(FAITHFUL);
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    expect(item).toMatchObject({
      original: ORIGINAL,
      originalLang: "ja",
      lang: "en",
      text: FAITHFUL,
    });
    expect(await s.record(item!.checkId, FAITHFUL, report(true))).toBe("passed");
    const [passed] = await s.checks();
    expect(passed).toMatchObject({ status: "passed", attempts: 1, added: [], missing: [] });
    expect(passed!.leaseUntil).toBeUndefined();
    expect(await s.audit("claim.translation_check")).toEqual([
      expect.objectContaining({
        actorKind: "ai",
        modelVersion: SETTING,
        targetId: s.claimId,
        diff: expect.objectContaining({ lang: "en", result: "passed", attempts: 1 }),
      }),
    ]);
  });

  it("unfaithful twice: translated again once, then held from the public until a steward shows it", async () => {
    const s = await setup();
    await s.save(UNFAITHFUL);
    await addPage(s.b, {
      placeId: s.placeId,
      sentences: [
        { lang: "ja", text: ORIGINAL, claimIds: [s.claimId] },
        { lang: "en", text: UNFAITHFUL, claimIds: [s.claimId] },
      ],
    });
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    expect(await s.record(item!.checkId, UNFAITHFUL, report(false))).toBe("retranslate");
    expect(
      await s.b.t.mutation(internal.translationChecks.saveRetranslation, {
        checkId: item!.checkId,
        text: UNFAITHFUL,
        newText: ` ${STILL_UNFAITHFUL} `,
        modelVersion: "muse-spark-1.3",
      }),
    ).toBe(true);
    expect(await s.translation()).toMatchObject({ text: STILL_UNFAITHFUL, origin: "machine" });
    // The old text is no longer what the check describes.
    expect(await s.record(item!.checkId, UNFAITHFUL, report(false))).toBe("stale");
    expect(await s.record(item!.checkId, STILL_UNFAITHFUL, report(false))).toBe("held");
    expect((await s.checks())[0]).toMatchObject({
      status: "held",
      text: STILL_UNFAITHFUL,
      retranslated: true,
      attempts: 2,
      added: ADDED,
      missing: MISSING,
      modelSetting: SETTING,
    });
    expect(await s.audit("claim.translate_machine")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ diff: { lang: "en", retranslated: true } }),
      ]),
    );
    expect(await s.audit("claim.translation_check")).toEqual([
      expect.objectContaining({
        diff: expect.objectContaining({ result: "held", added: 1, missing: 1, retranslated: true }),
      }),
    ]);

    // The public page, composed before the hold, shows the owner's words with a review note.
    const page = await s.b.t.query(api.pages.getPublished, { placeId: s.placeId });
    expect(page?.sentences.find(({ lang }) => lang === "en")).toEqual({
      lang: "en",
      ordinal: 1,
      text: ORIGINAL,
      textLang: "ja",
      translation: "original",
      claimIds: [s.claimId],
      underReview: true,
    });
    expect(page?.claims[0]!.translations).toEqual([]);
    expect(JSON.stringify(page)).not.toContain("Nagasaki");

    // A page composed now never uses the held translation either.
    await s.asSteward.mutation(api.pages.compose, { placeId: s.placeId });
    const recomposed = await s.b.t.query(api.pages.getPublished, { placeId: s.placeId });
    expect(recomposed?.sentences.find(({ lang }) => lang === "en")).toMatchObject({
      text: ORIGINAL,
      underReview: true,
    });

    // The steward sees the lists, and decides.
    const [view] = await s.asSteward.query(api.claims.listForPlace, { placeId: s.placeId });
    expect(view!.translations[0]!.check).toEqual({
      status: "held",
      added: ADDED,
      missing: MISSING,
      attempts: 2,
      retranslated: true,
    });
    expect(
      await errorCode(
        s.b
          .as("creator")
          .mutation(api.translationChecks.release, { claimId: s.claimId, lang: "en" }),
      ),
    ).toBe("forbidden");
    expect(
      await errorCode(
        s.asSteward.mutation(api.translationChecks.checkAgain, { claimId: s.claimId, lang: "en" }),
      ),
    ).toBe("conflict");
    await s.asSteward.mutation(api.translationChecks.release, { claimId: s.claimId, lang: "en" });
    expect((await s.checks())[0]).toMatchObject({ status: "released", decidedBy: s.steward });
    expect(await s.audit("claim.translation_released")).toHaveLength(1);
    await s.asSteward.mutation(api.pages.compose, { placeId: s.placeId });
    const released = await s.b.t.query(api.pages.getPublished, { placeId: s.placeId });
    expect(released?.sentences.find(({ lang }) => lang === "en")).toMatchObject({
      text: STILL_UNFAITHFUL,
      translation: "machine",
    });
    expect(released?.sentences.find(({ lang }) => lang === "en")).not.toHaveProperty("underReview");
  });

  it("a failed re-translation holds the translation with the first check's lists", async () => {
    const s = await setup();
    await s.save(UNFAITHFUL);
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    await s.record(item!.checkId, UNFAITHFUL, report(false));
    expect(
      await s.record(item!.checkId, UNFAITHFUL, {
        kind: "retranslation_failed",
        error: "Error: provider_error:Error",
      }),
    ).toBe("held");
    expect((await s.checks())[0]).toMatchObject({
      status: "held",
      text: UNFAITHFUL,
      retranslated: false,
      added: ADDED,
      missing: MISSING,
    });
  });

  it("a person's translation replaces a held one, and its check goes with it", async () => {
    const s = await setup();
    await s.save(UNFAITHFUL);
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    await s.record(item!.checkId, UNFAITHFUL, report(false));
    await s.record(item!.checkId, UNFAITHFUL, { kind: "retranslation_failed", error: "Error: x" });
    await s.asSteward.mutation(api.claims.setHumanTranslation, {
      claimId: s.claimId,
      lang: "en",
      text: FAITHFUL,
    });
    expect(await s.checks()).toEqual([]);
    expect(await s.record(item!.checkId, UNFAITHFUL, report(true))).toBe("stale");
  });
});

describe("retries and giving up", () => {
  it("a sleeping endpoint waits 30 seconds, gives up after 9 minutes, and a steward can queue it again", async () => {
    const s = await setup();
    await s.save(FAITHFUL);
    const start = Date.now();
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    near((await s.checks())[0]!.firstAttemptAt, start);
    const sleeping = { kind: "retry" as const, sent: true, error: "AI_APICallError HTTP 503: x" };
    expect(await s.record(item!.checkId, FAITHFUL, sleeping)).toBe("waiting");
    const [waiting] = await s.checks();
    expect(waiting).toMatchObject({ status: "pending", attempts: 1 });
    near(waiting!.nextAttemptAt, start + RETRY_AFTER_MS);
    expect(waiting!.leaseUntil).toBeUndefined();
    // Not due yet: a run now leases nothing.
    expect(await s.b.t.mutation(internal.translationChecks.startBatch, {})).toEqual([]);
    await s.b.t.mutation(internal.translationChecks.finishRun, {});
    const scheduled = (await s.runs()).filter(({ state }) => state.kind === "pending");
    near(Math.max(...scheduled.map(({ scheduledTime }) => scheduledTime)), start + RETRY_AFTER_MS);

    vi.setSystemTime(start + GIVE_UP_AFTER_MS + 1000);
    const [again] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    expect(await s.record(again!.checkId, FAITHFUL, sleeping)).toBe("unavailable");
    expect((await s.checks())[0]).toMatchObject({
      status: "unavailable",
      attempts: 2,
      error: expect.stringMatching(/^gave up after 54\d s: AI_APICallError HTTP 503/),
    });
    expect(await s.audit("claim.translation_check")).toEqual([
      expect.objectContaining({ diff: expect.objectContaining({ result: "unavailable" }) }),
    ]);
    // An unavailable translation is still shown, unchecked, as before.
    expect((await s.translation())?.text).toBe(FAITHFUL);

    vi.stubEnv("AI_MODEL_CHECK_TRANSLATION", undefined);
    expect(
      await errorCode(
        s.asSteward.mutation(api.translationChecks.checkAgain, { claimId: s.claimId, lang: "en" }),
      ),
    ).toBe("conflict");
    vi.stubEnv("AI_MODEL_CHECK_TRANSLATION", SETTING);
    await s.asSteward.mutation(api.translationChecks.checkAgain, {
      claimId: s.claimId,
      lang: "en",
    });
    const [queued] = await s.checks();
    expect(queued).toMatchObject({ status: "pending", attempts: 2 });
    expect(queued!.firstAttemptAt).toBeUndefined();
    expect(queued!.error).toBeUndefined();
    expect(await s.audit("ai.translation_check_requested")).toHaveLength(1);
  });

  it("a 4xx is unavailable at once and schedules no retry", async () => {
    const s = await setup();
    await s.save(FAITHFUL);
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    expect(
      await s.record(item!.checkId, FAITHFUL, {
        kind: "fail",
        error: "AI_APICallError HTTP 401: x",
      }),
    ).toBe("unavailable");
    const before = (await s.runs()).length;
    await s.b.t.mutation(internal.translationChecks.finishRun, {});
    expect(await s.runs()).toHaveLength(before);
  });

  it("queueing while a run is waiting brings the run forward instead of adding a second", async () => {
    const s = await setup();
    await s.save(FAITHFUL);
    const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
    await s.record(item!.checkId, FAITHFUL, { kind: "retry", sent: true });
    await s.b.t.mutation(internal.translationChecks.finishRun, {});
    await s.save(UNFAITHFUL, await s.claim());
    const pending = (await s.runs()).filter(({ state }) => state.kind === "pending");
    // The first run (never started in this test) and the run brought forward to now.
    expect(pending).toHaveLength(2);
    for (const { scheduledTime } of pending)
      expect(Math.abs(scheduledTime - Date.now())).toBeLessThan(50);
  });
});

describe("the check action", () => {
  function toolModel(answers: (() => Record<string, unknown>)[]) {
    let call = 0;
    return new MockLanguageModelV4({
      doGenerate: async () => {
        const answer = answers[Math.min(call++, answers.length - 1)]!();
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: `call-${call}`,
              toolName: "report_check",
              input: JSON.stringify(answer),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
  }
  function translatorModel(text: string) {
    return new MockLanguageModelV4({
      doGenerate: async (options) => {
        const { items } = JSON.parse(
          (options.prompt.at(-1)!.content as { type: string; text: string }[])[0]!.text,
        ) as { items: { itemId: string }[] };
        return {
          content: [
            { type: "text", text: JSON.stringify({ items: [{ itemId: items[0]!.itemId, text }] }) },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
  }
  function models(checker: MockLanguageModelV4, translator: MockLanguageModelV4) {
    return vi
      .spyOn(languageModels, "createLanguageModel")
      .mockImplementation((config: AiModelConfig) =>
        config.provider === "modal" ? checker : translator,
      );
  }
  async function runScheduled(b: { t: { finishInProgressScheduledFunctions(): Promise<void> } }) {
    vi.runOnlyPendingTimers();
    await b.t.finishInProgressScheduledFunctions();
  }

  it("runs the loop through the shared model factory: unfaithful, translated again, then checked", async () => {
    const s = await setup();
    const checker = toolModel([
      () => ({ faithful: false, added: ADDED, missing: MISSING }),
      () => ({ faithful: true, added: [], missing: [] }),
    ]);
    const translator = translatorModel(FAITHFUL);
    const factory = models(checker, translator);
    await s.save(UNFAITHFUL);
    await runScheduled(s.b);
    expect(await s.translation()).toMatchObject({
      text: FAITHFUL,
      modelVersion: "claude-sonnet-5-5",
    });
    expect((await s.checks())[0]).toMatchObject({
      status: "passed",
      retranslated: true,
      attempts: 2,
      text: FAITHFUL,
    });
    expect(factory.mock.calls.map(([config]) => config)).toEqual([
      {
        provider: "modal",
        apiKey: "mock-modal-token",
        modelId: "noren-glimmer",
        baseURL: "https://mock.invalid",
      },
      { provider: "anthropic", apiKey: "mock-anthropic-key", modelId: "claude-sonnet-5-5" },
    ]);
    expect(checker.doGenerateCalls).toHaveLength(2);
    for (const call of checker.doGenerateCalls) {
      expect(call.toolChoice).toEqual({ type: "tool", toolName: "report_check" });
      expect(call.responseFormat).toBeUndefined();
      expect(call.maxOutputTokens).toBe(3000);
    }
    const sent = JSON.stringify(translator.doGenerateCalls[0]!.prompt);
    expect(sent).toContain("doNotAdd");
    expect(sent).toContain(ADDED[0]);
    expect(sent).toContain(MISSING[0]);
    // Nothing is left to do, so no further run is scheduled.
    expect((await s.runs()).filter(({ state }) => state.kind === "pending")).toEqual([]);
  });

  it("a sleeping endpoint gets one request; every check waits for the same wake 30 seconds later", async () => {
    const s = await setup();
    let asleep = true;
    const checker = toolModel([
      () => {
        if (asleep)
          throw new APICallError({
            message: "no upstreams available",
            url: "https://mock.invalid/v1/chat/completions",
            requestBodyValues: {},
            statusCode: 503,
          });
        return { faithful: true, added: [], missing: [] };
      },
    ]);
    models(checker, translatorModel(FAITHFUL));
    await s.save(FAITHFUL);
    await s.save(FAITHFUL, await s.claim());
    await s.save(FAITHFUL, await s.claim());
    const start = Date.now();
    await runScheduled(s.b);
    expect(checker.doGenerateCalls).toHaveLength(1);
    const waitingChecks = await s.checks();
    expect(waitingChecks.map(({ status, attempts }) => [status, attempts])).toEqual([
      ["pending", 1],
      ["pending", 0],
      ["pending", 0],
    ]);
    for (const { nextAttemptAt } of waitingChecks) near(nextAttemptAt, start + RETRY_AFTER_MS);
    const waiting = (await s.runs()).filter(({ state }) => state.kind === "pending");
    expect(waiting).toHaveLength(1);
    near(waiting[0]!.scheduledTime, start + RETRY_AFTER_MS);

    asleep = false;
    // convex-test's clock runs a few milliseconds ahead of the timers, so a run may find the
    // checks not quite due and reschedule itself; run every run until none is left.
    await s.b.t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(RETRY_AFTER_MS), 10);
    expect(checker.doGenerateCalls).toHaveLength(4);
    expect((await s.checks()).map(({ status }) => status)).toEqual(["passed", "passed", "passed"]);
  });

  describe("a found post's quote", () => {
    it("whose check could not run is queued again, and a statement's is left to the steward", async () => {
      const s = await setup();
      const checker = toolModel([() => ({ faithful: true, added: [], missing: [] })]);
      models(checker, translatorModel(FAITHFUL));
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, FAITHFUL);
      await s.save(FAITHFUL);
      const rows = await s.checks();
      await s.b.t.run(async (ctx) => {
        for (const row of rows)
          await ctx.db.patch("translationCheck", row._id, {
            status: "unavailable",
            error: "mock error",
          });
      });
      expect(
        await s.b.t.mutation(internal.translationChecks.recheckUnavailableExcerpts, {}),
      ).toEqual({ queued: 1 });
      await runScheduled(s.b);
      const after = await s.checks();
      expect(after.find((row) => row.subject === "excerpt")).toMatchObject({ status: "passed" });
      expect(after.find((row) => row.subject !== "excerpt")).toMatchObject({
        status: "unavailable",
      });
      expect(
        await s.b.t.mutation(internal.translationChecks.recheckUnavailableExcerpts, {}),
      ).toEqual({ queued: 0 });
    });

    it("is checked as public words with no consent, while the statements' consent gate stays as it is", async () => {
      const s = await setup();
      // The owner agreed to a text that does not name Modal: their statement is not sent.
      await s.setConsent({ textVersion: "draft-2" });
      const checker = toolModel([() => ({ faithful: true, added: [], missing: [] })]);
      models(checker, translatorModel(FAITHFUL));
      await s.save(FAITHFUL);
      expect(await s.checks()).toEqual([]);
      // A stranger's public quote needs no consent: its translation is checked.
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, FAITHFUL);
      expect(await s.checks()).toEqual([
        expect.objectContaining({ subject: "excerpt", sourceId, status: "pending" }),
      ]);
      await runScheduled(s.b);
      expect(checker.doGenerateCalls).toHaveLength(1);
      const sent = JSON.stringify(checker.doGenerateCalls[0]!.prompt);
      expect(sent).toContain(ORIGINAL);
      expect(sent).toContain(FAITHFUL);
      expect((await s.checks())[0]).toMatchObject({ status: "passed", attempts: 1 });
      expect(await s.audit("source.translation_check")).toEqual([
        expect.objectContaining({
          targetType: "source",
          targetId: sourceId,
          actorKind: "ai",
          modelVersion: SETTING,
          diff: expect.objectContaining({ result: "passed", lang: "en" }),
        }),
      ]);
      expect(await s.audit("claim.translation_check")).toEqual([]);
      const [view] = await s.b.t.query(api.sources.listForPlace, { placeId: s.placeId });
      expect(view!.excerptTranslations).toEqual([{ lang: "en", text: FAITHFUL }]);
    });

    it("only a post the story finder found and still shows is checked", async () => {
      const s = await setup();
      // A member's own link has no quote: nothing is translated or checked.
      const member = await s.foundQuote({});
      await s.saveQuote(member, FAITHFUL);
      expect(await s.quoteTranslation(member)).toBeNull();
      // A found post taken down after its check was queued: dropped when the run starts, unsent.
      const checker = toolModel([() => ({ faithful: true, added: [], missing: [] })]);
      const factory = models(checker, translatorModel(FAITHFUL));
      const found = await s.foundQuote();
      await s.saveQuote(found, FAITHFUL);
      expect(await s.checks()).toHaveLength(1);
      await s.b.run((ctx) => ctx.db.patch("source", found, { status: "hidden" }));
      await runScheduled(s.b);
      expect(factory).not.toHaveBeenCalled();
      expect(checker.doGenerateCalls).toEqual([]);
      expect(await s.checks()).toEqual([]);
    });

    it("unfaithful: translated again once as a stranger's quote with the lists, then held, and the card shows the quote alone", async () => {
      const s = await setup();
      const checker = toolModel([() => ({ faithful: false, added: ADDED, missing: MISSING })]);
      const translator = translatorModel(STILL_UNFAITHFUL);
      models(checker, translator);
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, UNFAITHFUL);
      await runScheduled(s.b);
      expect(checker.doGenerateCalls).toHaveLength(2);
      expect(translator.doGenerateCalls).toHaveLength(1);
      const sent = JSON.stringify(translator.doGenerateCalls[0]!.prompt);
      expect(sent).toContain("untrusted data");
      expect(sent).toContain("doNotAdd");
      expect(sent).toContain(ADDED[0]);
      expect(sent).toContain(MISSING[0]);
      expect(await s.quoteTranslation(sourceId)).toMatchObject({
        text: STILL_UNFAITHFUL,
        modelVersion: "claude-sonnet-5-5",
      });
      expect((await s.checks())[0]).toMatchObject({
        subject: "excerpt",
        status: "held",
        retranslated: true,
        attempts: 2,
        text: STILL_UNFAITHFUL,
      });
      expect(await s.audit("source.translate_machine")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ diff: { lang: "en", retranslated: true } }),
        ]),
      );
      expect(await s.audit("source.translation_check")).toEqual([
        expect.objectContaining({ diff: expect.objectContaining({ result: "held" }) }),
      ]);
      // Held: the public card shows the quote in its own words, with no translation.
      const [view] = await s.b.t.query(api.sources.listForPlace, { placeId: s.placeId });
      expect(view).toMatchObject({ excerpt: ORIGINAL, excerptLang: "ja", excerptTranslations: [] });
      expect(JSON.stringify(view)).not.toContain(STILL_UNFAITHFUL);
    });

    it("a re-translation that does not fit the quote is not saved, and the first is held", async () => {
      const s = await setup();
      const checker = toolModel([() => ({ faithful: false, added: ADDED, missing: MISSING })]);
      // A made-up second attempt that adds a web address the quote never had.
      models(checker, translatorModel(`${FAITHFUL} Book at mock-shop.example.com.`));
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, UNFAITHFUL);
      await runScheduled(s.b);
      expect(checker.doGenerateCalls).toHaveLength(1);
      expect((await s.quoteTranslation(sourceId))?.text).toBe(UNFAITHFUL);
      expect((await s.checks())[0]).toMatchObject({ status: "held", retranslated: false });
      const [view] = await s.b.t.query(api.sources.listForPlace, { placeId: s.placeId });
      expect(view!.excerptTranslations).toEqual([]);
    });

    it("the server refuses to save a re-translation that does not fit, whatever the translator did", async () => {
      const s = await setup();
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, UNFAITHFUL);
      const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
      expect(
        await s.record(item!.checkId, UNFAITHFUL, {
          kind: "report",
          faithful: false,
          added: ADDED,
          missing: MISSING,
        }),
      ).toBe("retranslate");
      expect(
        await s.b.t.mutation(internal.translationChecks.saveRetranslation, {
          checkId: item!.checkId,
          text: UNFAITHFUL,
          newText: "x".repeat(500),
          modelVersion: "claude-sonnet-5-5",
        }),
      ).toBe(false);
      expect((await s.quoteTranslation(sourceId))?.text).toBe(UNFAITHFUL);
      const [held] = await s.checks();
      expect(held).toMatchObject({ status: "held", added: ADDED, missing: MISSING });
      expect(held!.leaseUntil).toBeUndefined();
      // Nothing is left pending, so the run schedules no further run for it.
      await s.b.t.mutation(internal.translationChecks.finishRun, {});
      const run = await s.b.t.run((ctx) => ctx.db.query("translationCheckRun").first());
      expect(run?.scheduledId).toBeUndefined();
    });

    it("statements and quotes share one run: a sleeping endpoint gets one request and one wake", async () => {
      const s = await setup();
      let asleep = true;
      const checker = toolModel([
        () => {
          if (asleep)
            throw new APICallError({
              message: "no upstreams available",
              url: "https://mock.invalid/v1/chat/completions",
              requestBodyValues: {},
              statusCode: 503,
            });
          return { faithful: true, added: [], missing: [] };
        },
      ]);
      models(checker, translatorModel(FAITHFUL));
      await s.save(FAITHFUL);
      await s.saveQuote(await s.foundQuote(), FAITHFUL);
      const start = Date.now();
      await runScheduled(s.b);
      expect(checker.doGenerateCalls).toHaveLength(1);
      const waiting = await s.checks();
      expect(waiting.map(({ subject, status }) => [subject ?? "claim", status])).toEqual([
        ["claim", "pending"],
        ["excerpt", "pending"],
      ]);
      for (const { nextAttemptAt } of waiting) near(nextAttemptAt, start + RETRY_AFTER_MS);
      expect((await s.runs()).filter(({ state }) => state.kind === "pending")).toHaveLength(1);
      asleep = false;
      await s.b.t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(RETRY_AFTER_MS), 10);
      expect(checker.doGenerateCalls).toHaveLength(3);
      expect((await s.checks()).map(({ status }) => status)).toEqual(["passed", "passed"]);
    });

    it("gives up after nine minutes like a statement's check; the translation stays shown", async () => {
      const s = await setup();
      const sourceId = await s.foundQuote();
      await s.saveQuote(sourceId, FAITHFUL);
      const start = Date.now();
      const sleeping = { kind: "retry" as const, sent: true, error: "AI_APICallError HTTP 503: x" };
      const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
      expect(item).toMatchObject({
        original: ORIGINAL,
        originalLang: "ja",
        inputKind: "public_post_quote",
      });
      expect(await s.record(item!.checkId, FAITHFUL, sleeping)).toBe("waiting");
      vi.setSystemTime(start + GIVE_UP_AFTER_MS + 1000);
      const [again] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
      expect(await s.record(again!.checkId, FAITHFUL, sleeping)).toBe("unavailable");
      expect((await s.checks())[0]).toMatchObject({ status: "unavailable", attempts: 2 });
      const [view] = await s.b.t.query(api.sources.listForPlace, { placeId: s.placeId });
      expect(view!.excerptTranslations).toEqual([{ lang: "en", text: FAITHFUL }]);
    });
  });

  describe("consent", () => {
    it("an owner who agreed to a text that does not name Modal: no check, and nothing reaches the adapter", async () => {
      const s = await setup();
      await s.setConsent({ textVersion: "draft-2" });
      const checker = toolModel([() => ({ faithful: false, added: ADDED, missing: MISSING })]);
      const translator = translatorModel(FAITHFUL);
      const factory = models(checker, translator);
      await s.save(UNFAITHFUL);
      expect(await s.checks()).toEqual([]);
      expect(await s.runs()).toEqual([]);
      // Even a run started by hand finds nothing it may send.
      await s.b.t.action(internal.aiActions.checkTranslations, {});
      expect(factory).not.toHaveBeenCalled();
      expect(checker.doGenerateCalls).toEqual([]);
      expect(translator.doGenerateCalls).toEqual([]);
      // The translation stays as it is today: shown and labelled machine, neither held nor checked.
      expect(await s.translation()).toMatchObject({ text: UNFAITHFUL, origin: "machine" });
      const [view] = await s.asSteward.query(api.claims.listForPlace, { placeId: s.placeId });
      expect(view!.translations).toEqual([
        expect.not.objectContaining({ check: expect.anything() }),
      ]);
      expect(view!.translations[0]).toMatchObject({ text: UNFAITHFUL, origin: "machine" });
      expect(await s.audit("claim.translation_check")).toEqual([]);
    });

    it("a check queued before the owner withdrew consent is dropped when its run starts, unsent", async () => {
      const s = await setup();
      const checker = toolModel([() => ({ faithful: true, added: [], missing: [] })]);
      const factory = models(checker, translatorModel(FAITHFUL));
      await s.save(FAITHFUL);
      expect(await s.checks()).toHaveLength(1);
      await s.setConsent({ withdrawnAt: Date.now() });
      await runScheduled(s.b);
      expect(factory).not.toHaveBeenCalled();
      expect(checker.doGenerateCalls).toEqual([]);
      expect(await s.checks()).toEqual([]);
      expect(await s.translation()).toMatchObject({ text: FAITHFUL, origin: "machine" });
    });

    it("a steward cannot queue again a check the owner's consent no longer covers", async () => {
      const s = await setup();
      await s.save(FAITHFUL);
      const [item] = await s.b.t.mutation(internal.translationChecks.startBatch, {});
      await s.record(item!.checkId, FAITHFUL, { kind: "fail", error: "Error: mock" });
      await s.setConsent({ withdrawnAt: Date.now() });
      expect(
        await errorCode(
          s.asSteward.mutation(api.translationChecks.checkAgain, {
            claimId: s.claimId,
            lang: "en",
          }),
        ),
      ).toBe("conflict");
      expect(await s.runs()).toHaveLength(1);
    });
  });
});
