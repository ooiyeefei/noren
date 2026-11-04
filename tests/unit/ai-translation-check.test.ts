import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createLanguageModel } from "../../src/lib/ai/claim-extractor";
import { aiConfig } from "../../src/lib/ai/config";
import {
  CHECK_RUN_BUDGET_MS,
  checkTranslationsJob,
  type TranslationCheckItem,
  type TranslationCheckOutcome,
  type TranslationCheckStep,
} from "../../src/lib/ai/jobs";
import { createModal } from "../../src/lib/ai/modal";
import {
  CHECK_MAX_TOKENS,
  CHECK_REPORT_SCHEMA,
  CHECK_TOOL,
  CheckOutputError,
  checkPrompt,
  classifyCheckError,
  createTranslationChecker,
  describeCheckError,
  parseCheckReport,
  type TranslationChecker,
} from "../../src/lib/ai/translation-check";
import type { Translator } from "../../src/lib/ports";

// Fictional Test Kissa text, as in the endpoint probe.
const ORIGINAL = "この店は祖母が昭和の終わりに始めました。お支払いは現金だけです。";
const FAITHFUL = "My grandmother started this shop at the end of the Showa era. We only take cash.";
const UNFAITHFUL =
  "My grandmother started this shop, the best coffee shop in Nagasaki, at the end of the Showa era.";

function apiError(statusCode?: number) {
  return new APICallError({
    message: statusCode === 503 ? "no upstreams available" : "mock provider failure",
    url: "https://mock.invalid/v1/chat/completions",
    requestBodyValues: { messages: [ORIGINAL] },
    ...(statusCode === undefined ? {} : { statusCode }),
  });
}

describe("parseCheckReport", () => {
  it("reads the tool arguments as an object or a JSON string", () => {
    const report = {
      faithful: false,
      added: ["best coffee shop in Nagasaki"],
      missing: ["cash only"],
    };
    expect(parseCheckReport(report)).toEqual(report);
    expect(parseCheckReport(JSON.stringify(report))).toEqual(report);
    expect(parseCheckReport({ faithful: true, added: [], missing: [] })).toEqual({
      faithful: true,
      added: [],
      missing: [],
    });
  });
  it("passes a translation only when the checker says faithful and lists nothing", () => {
    expect(parseCheckReport({ faithful: true, added: ["an extra claim"], missing: [] })).toEqual({
      faithful: false,
      added: ["an extra claim"],
      missing: [],
    });
    expect(parseCheckReport({ faithful: false, added: [], missing: [] }).faithful).toBe(false);
  });
  it("trims, drops blanks and repeats, and keeps at most 5 claims of 200 characters", () => {
    const long = "あ".repeat(250);
    const report = parseCheckReport({
      faithful: false,
      added: ["  one\n claim ", "one claim", "", " ", "two", "three", "four", "five", "six"],
      missing: [long],
    });
    expect(report.added).toEqual(["one claim", "two", "three", "four", "five"]);
    expect(report.missing).toEqual(["あ".repeat(200)]);
  });
  it("treats absent lists as empty", () => {
    expect(parseCheckReport({ faithful: true })).toEqual({
      faithful: true,
      added: [],
      missing: [],
    });
  });
  it("refuses a report it cannot read, with a named error", () => {
    for (const bad of [
      "not json",
      "[]",
      null,
      42,
      { added: [], missing: [] },
      { faithful: "yes", added: [], missing: [] },
      { faithful: false, added: "one claim", missing: [] },
      { faithful: false, added: [1], missing: [] },
    ]) {
      expect(() => parseCheckReport(bad)).toThrow(CheckOutputError);
      try {
        parseCheckReport(bad);
      } catch (error) {
        expect((error as Error).name).toBe("CheckOutputError");
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("checkPrompt", () => {
  it("starts with low reasoning, says pronouns are not additions and leaves style alone", () => {
    const { system, prompt } = checkPrompt({
      original: ORIGINAL,
      originalLang: "ja",
      translation: FAITHFUL,
      translationLang: "en",
    });
    expect(system.startsWith("Reasoning strength: low\n")).toBe(true);
    expect(system).toContain(
      `Japanese often leaves out subjects and pronouns, so supplying words like "my", "we" or "I" is not an addition.`,
    );
    expect(system).toContain("Do not judge style.");
    expect(system).not.toContain("omission");
    expect(prompt).toBe(`Original (Japanese):\n${ORIGINAL}\n\nTranslation (English):\n${FAITHFUL}`);
  });
  it("into Japanese, leaving pronouns out is not an omission either", () => {
    const { system, prompt } = checkPrompt({
      original: FAITHFUL,
      originalLang: "en",
      translation: ORIGINAL,
      translationLang: "ja",
    });
    expect(system).toContain("not an omission");
    expect(prompt.startsWith("Original (English):")).toBe(true);
  });
});

describe("classifyCheckError", () => {
  it("retries a sleeping or unreachable endpoint and a timeout", () => {
    for (const error of [
      apiError(503),
      apiError(502),
      apiError(504),
      apiError(),
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      Object.assign(new Error("aborted"), { name: "AbortError" }),
      new TypeError("fetch failed"),
    ])
      expect(classifyCheckError(error), describeCheckError(error)).toBe("retry");
  });
  it("never retries a 4xx, a server error or an unreadable answer", () => {
    for (const error of [
      apiError(400),
      apiError(401),
      apiError(403),
      apiError(404),
      apiError(429),
      apiError(500),
      new CheckOutputError("the check returned no report"),
      new Error("other"),
      "a string",
      undefined,
    ])
      expect(classifyCheckError(error)).toBe("fail");
  });
  it("describes an error by name, status and message, with a fallback for non-errors", () => {
    expect(describeCheckError(apiError(503))).toBe(
      "AI_APICallError HTTP 503: no upstreams available",
    );
    expect(describeCheckError(apiError(503))).not.toContain(ORIGINAL);
    expect(describeCheckError(Object.assign(new Error(""), { name: "AbortError" }))).toBe(
      "AbortError: no message",
    );
    expect(describeCheckError("thrown text")).toBe("NonError: thrown text");
    expect(describeCheckError(undefined)).toBe("NonError: undefined");
  });
});

describe("modal: models", () => {
  const env = {
    MODAL_PROXY_TOKEN: " mock-modal-token ",
    MODAL_BASE_URL: "https://mock.invalid/v1/",
    AI_MODEL_CHECK_TRANSLATION: " modal:noren-glimmer ",
  };
  it("resolve for any capability, with the base URL trimmed of /v1", () => {
    expect(aiConfig("check_translation", env)).toEqual({
      ok: true,
      config: {
        provider: "modal",
        apiKey: "mock-modal-token",
        modelId: "noren-glimmer",
        baseURL: "https://mock.invalid",
      },
    });
    expect(
      aiConfig("followup", { ...env, AI_MODEL_FOLLOWUP: "modal:noren-glimmer" }),
    ).toMatchObject({ ok: true, config: { provider: "modal", modelId: "noren-glimmer" } });
  });
  it("fail closed naming the missing or bad setting, never the token", () => {
    const cases: [Record<string, string | undefined>, string][] = [
      [{ MODAL_PROXY_TOKEN: undefined }, "MODAL_PROXY_TOKEN"],
      [{ MODAL_PROXY_TOKEN: "mock\ntoken" }, "MODAL_PROXY_TOKEN"],
      [{ MODAL_BASE_URL: undefined }, "MODAL_BASE_URL"],
      [{ MODAL_BASE_URL: "http://mock.invalid" }, "MODAL_BASE_URL"],
      [{ MODAL_BASE_URL: "https://user:pass@mock.invalid" }, "MODAL_BASE_URL"],
      [{ MODAL_BASE_URL: "https://mock.invalid/?key=mock-modal-token" }, "MODAL_BASE_URL"],
      [{ AI_MODEL_CHECK_TRANSLATION: "modal:bad model" }, "AI_MODEL_CHECK_TRANSLATION"],
      [{ AI_MODEL_CHECK_TRANSLATION: "modal:" }, "AI_MODEL_CHECK_TRANSLATION"],
    ];
    for (const [change, variable] of cases) {
      const result = aiConfig("check_translation", { ...env, ...change });
      expect(result).toEqual({ ok: false, reason: expect.stringContaining(variable) });
      if (!result.ok) expect(result.reason).not.toContain("mock-modal-token");
    }
  });
  it("leave the check off when its setting is unset", () => {
    expect(
      aiConfig("check_translation", { ...env, AI_MODEL_CHECK_TRANSLATION: undefined }),
    ).toEqual({
      ok: false,
      reason: expect.stringContaining("AI_MODEL_CHECK_TRANSLATION"),
    });
  });
});

function completion(args: unknown) {
  return {
    id: "mock-completion",
    object: "chat.completion",
    created: 0,
    model: "noren-glimmer",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: CHECK_TOOL, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

describe("the checker on the wire", () => {
  function wired(response: () => Response) {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const result = aiConfig("check_translation", {
      MODAL_PROXY_TOKEN: "mock-modal-token",
      MODAL_BASE_URL: "https://mock.invalid",
      AI_MODEL_CHECK_TRANSLATION: "modal:noren-glimmer",
    });
    if (!result.ok) throw new Error(result.reason);
    const model = createLanguageModel(result.config, {
      anthropic: () => () => {
        throw new Error("wrong provider");
      },
      gateway: () => () => {
        throw new Error("wrong provider");
      },
      meta: () => () => {
        throw new Error("wrong provider");
      },
      modal: (options) => createModal({ ...options, fetch }),
    });
    return { fetch, checker: createTranslationChecker({ model }) };
  }
  const input = {
    original: ORIGINAL,
    originalLang: "ja",
    translation: UNFAITHFUL,
    translationLang: "en",
  };

  it("sends one forced report_check call with max_tokens and no response_format", async () => {
    const report = {
      faithful: false,
      added: ["best coffee shop in Nagasaki"],
      missing: ["cash only"],
    };
    const { fetch, checker } = wired(() => Response.json(completion(report)));
    expect(await checker.check(input)).toEqual(report);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://mock.invalid/v1/chat/completions");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer mock-modal-token");
    const body = JSON.parse(String(init!.body));
    expect(body).not.toHaveProperty("response_format");
    expect(body).toMatchObject({
      model: "noren-glimmer",
      max_tokens: CHECK_MAX_TOKENS,
      tool_choice: { type: "function", function: { name: CHECK_TOOL } },
      tools: [
        {
          type: "function",
          function: { name: CHECK_TOOL, parameters: CHECK_REPORT_SCHEMA },
        },
      ],
    });
    expect(body.max_tokens).toBe(3000);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content.startsWith("Reasoning strength: low")).toBe(true);
    expect(body.messages[1].content).toContain(UNFAITHFUL);
  });

  it("a sleeping endpoint's 503 is thrown at once, without a retry inside the call", async () => {
    const { fetch, checker } = wired(() =>
      Response.json({ error: "no upstreams available" }, { status: 503 }),
    );
    const error = await checker.check(input).catch((caught: unknown) => caught);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(classifyCheckError(error)).toBe("retry");
  });

  it("a 4xx is a failure, sent once", async () => {
    const { fetch, checker } = wired(() =>
      Response.json({ error: { message: "bad token" } }, { status: 401 }),
    );
    const error = await checker.check(input).catch((caught: unknown) => caught);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(classifyCheckError(error)).toBe("fail");
  });

  it("an answer without the report is an unreadable answer, not a retry", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "faithful" }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    const error = await createTranslationChecker({ model })
      .check(input)
      .catch((caught: unknown) => caught);
    expect(classifyCheckError(error)).toBe("fail");
  });
});

describe("checkTranslationsJob", () => {
  const env = {
    AI_MODEL_CHECK_TRANSLATION: "modal:noren-glimmer",
    MODAL_PROXY_TOKEN: "mock-modal-token",
    MODAL_BASE_URL: "https://mock.invalid",
    AI_MODEL_TRANSLATE: "claude-sonnet-5-5",
    ANTHROPIC_API_KEY: "mock-anthropic-key",
  };
  function item(n: number, text = FAITHFUL): TranslationCheckItem {
    return {
      checkId: `check-${n}`,
      text,
      lang: "en",
      original: ORIGINAL,
      originalLang: "ja",
      placeId: "place-1",
      retranslated: false,
    };
  }
  /** A fake of recordOutcome's state machine, enough to drive the job. */
  function setup(
    items: TranslationCheckItem[],
    check: TranslationChecker["check"],
    options: { translate?: Translator["translate"]; env?: Record<string, string | undefined> } = {},
  ) {
    const records: {
      checkId: string;
      text: string;
      setting: string;
      outcome: TranslationCheckOutcome;
    }[] = [];
    const lines: string[] = [];
    const checks = vi.fn(check);
    const translate = vi.fn(
      options.translate ??
        (async ([only]) => ({
          ok: true as const,
          items: [{ ...only!, text: FAITHFUL, modelVersion: "m" }],
        })),
    );
    const saved: string[] = [];
    let clock = 0;
    const deps = {
      env: options.env ?? env,
      log: (line: string) => lines.push(line),
      now: () => clock,
      startBatch: async () => items,
      makeChecker: vi.fn((): TranslationChecker => ({ check: checks })),
      makeTranslator: vi.fn((): Translator => ({ translate })),
      placeNames: async () => [
        { lang: "ja", value: "テスト喫茶", isPrimary: true },
        { lang: "en", value: "Test Kissa", isPrimary: true },
      ],
      record: vi.fn(
        async (
          current: TranslationCheckItem,
          setting: string,
          outcome: TranslationCheckOutcome,
        ): Promise<TranslationCheckStep> => {
          records.push({ checkId: current.checkId, text: current.text, setting, outcome });
          if (outcome.kind === "report")
            return outcome.faithful ? "passed" : current.retranslated ? "held" : "retranslate";
          if (outcome.kind === "fail") return "unavailable";
          if (outcome.kind === "retranslation_failed") return "held";
          return "waiting";
        },
      ),
      saveRetranslation: vi.fn(async (_item: TranslationCheckItem, text: string) => {
        saved.push(text);
        return true;
      }),
    };
    return {
      deps,
      records,
      lines,
      checks,
      translate,
      saved,
      tick: (ms: number) => (clock += ms),
    };
  }
  const report = (faithful: boolean) =>
    faithful
      ? { faithful, added: [], missing: [] }
      : { faithful, added: ["best coffee shop in Nagasaki"], missing: ["cash only"] };

  it("a faithful translation passes with one check and no re-translation", async () => {
    const s = setup([item(1)], async () => report(true));
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ passed: 1, held: 0 });
    expect(s.checks).toHaveBeenCalledExactlyOnceWith({
      original: ORIGINAL,
      originalLang: "ja",
      translation: FAITHFUL,
      translationLang: "en",
    });
    expect(s.translate).not.toHaveBeenCalled();
    expect(s.records).toEqual([
      {
        checkId: "check-1",
        text: FAITHFUL,
        setting: "modal:noren-glimmer",
        outcome: { kind: "report", ...report(true) },
      },
    ]);
  });

  it("an unfaithful translation is translated again once with the lists, then checked again", async () => {
    const s = setup([item(1, UNFAITHFUL)], async ({ translation }) =>
      report(translation === FAITHFUL),
    );
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ retranslate: 1, passed: 1 });
    expect(s.translate).toHaveBeenCalledExactlyOnceWith([{ itemId: "check-1", text: ORIGINAL }], {
      from: "ja",
      to: "en",
      inputKind: "claim",
      glossary: { テスト喫茶: "Test Kissa" },
      feedback: { added: ["best coffee shop in Nagasaki"], missing: ["cash only"] },
    });
    expect(s.saved).toEqual([FAITHFUL]);
    expect(s.checks).toHaveBeenCalledTimes(2);
    expect(s.records.map(({ text, outcome }) => [text, outcome.kind])).toEqual([
      [UNFAITHFUL, "report"],
      [FAITHFUL, "report"],
    ]);
  });

  it("a re-translation that is still unfaithful is held, and the loop never runs a third time", async () => {
    const s = setup([item(1, UNFAITHFUL)], async () => report(false), {
      translate: async ([only]) => ({
        ok: true,
        items: [{ ...only!, text: `${UNFAITHFUL} Again.`, modelVersion: "m" }],
      }),
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ retranslate: 1, held: 1 });
    expect(s.translate).toHaveBeenCalledTimes(1);
    expect(s.checks).toHaveBeenCalledTimes(2);
  });

  it("a failed re-translation holds the translation with the first check's lists", async () => {
    const s = setup([item(1, UNFAITHFUL)], async () => report(false), {
      translate: async () => ({ ok: false, reason: "provider_error:Error" }),
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ held: 1 });
    expect(s.records.at(-1)!.outcome).toEqual({
      kind: "retranslation_failed",
      error: "Error: provider_error:Error",
    });
    expect(s.saved).toEqual([]);
  });

  it("the first 503 stops the run sending: every other check waits for the same wake", async () => {
    const s = setup([item(1), item(2), item(3)], async () => {
      throw apiError(503);
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ waiting: 3 });
    expect(s.checks).toHaveBeenCalledTimes(1);
    expect(s.records.map(({ outcome }) => outcome)).toEqual([
      { kind: "retry", sent: true, error: "AI_APICallError HTTP 503: no upstreams available" },
      { kind: "retry", sent: false },
      { kind: "retry", sent: false },
    ]);
  });

  it("a 4xx marks that check unavailable and the run goes on", async () => {
    let calls = 0;
    const s = setup([item(1), item(2)], async () => {
      calls += 1;
      if (calls === 1) throw apiError(401);
      return report(true);
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ unavailable: 1, passed: 1 });
    expect(s.records[0]!.outcome).toEqual({
      kind: "fail",
      error: "AI_APICallError HTTP 401: mock provider failure",
    });
    expect(s.lines.join("\n")).not.toContain("mock-modal-token");
  });

  it("without a usable setting every leased check is unavailable and nothing is sent", async () => {
    const s = setup([item(1)], async () => report(true), {
      env: { ...env, MODAL_PROXY_TOKEN: undefined },
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ unavailable: 1 });
    expect(s.deps.makeChecker).not.toHaveBeenCalled();
    expect(s.records[0]!.outcome).toEqual({
      kind: "fail",
      error: expect.stringContaining("MODAL_PROXY_TOKEN"),
    });
  });

  it("after its time budget the run defers the rest to the next run", async () => {
    const s = setup([item(1), item(2)], async () => {
      s.tick(CHECK_RUN_BUDGET_MS + 1);
      return report(true);
    });
    expect(await checkTranslationsJob(s.deps)).toMatchObject({ passed: 1, waiting: 1 });
    expect(s.records[1]!.outcome).toEqual({ kind: "defer" });
  });

  it("a failure inside the run releases every check it leased", async () => {
    const s = setup([item(1), item(2)], async () => report(true));
    s.deps.record.mockImplementationOnce(async () => {
      throw new Error("mock database failure");
    });
    await checkTranslationsJob(s.deps);
    expect(s.checks).toHaveBeenCalledTimes(1);
    expect(s.records.map(({ checkId, outcome }) => [checkId, outcome.kind])).toEqual([
      ["check-1", "defer"],
      ["check-2", "defer"],
    ]);
    expect(s.lines.join("\n")).toContain("Error: mock database failure");
  });
});
