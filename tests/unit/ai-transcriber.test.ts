import { createOpenAI } from "@ai-sdk/openai";
import { MockTranscriptionModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeJob } from "../../src/lib/ai/jobs";
import {
  createCompatibleTranscriber,
  createTranscriber,
  supportsTimestamps,
  toTranscriptSegments,
} from "../../src/lib/ai/transcriber";
import type { Transcription } from "../../src/lib/ports";

const base: Transcription = {
  text: "",
  segments: [],
  language: "ja",
  durationSeconds: 12,
  modelVersion: "mock/model",
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("transcriber", () => {
  it("segments map to seconds and drop blank text", async () => {
    const model = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: " mock ",
        segments: [
          { startSecond: 1.5, endSecond: 3, text: " mock " },
          { startSecond: 3, endSecond: 4, text: " " },
        ],
        language: "ja",
        durationInSeconds: 4,
        warnings: [],
        response: { timestamp: new Date(0), modelId: "mock/model" },
      }),
    });
    const result = await createTranscriber({ model, modelVersion: "mock/model" }).transcribe(
      new Uint8Array([1]),
      { language: "en" },
    );
    expect(result.segments).toEqual([{ start: 1.5, end: 3, text: "mock" }]);
  });
  it("a 12 000-character text without segments is split at sentence ends under 5000 characters", () => {
    const text = `${"あ".repeat(1999)}。`.repeat(6);
    const segments = toTranscriptSegments({ ...base, text });
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(
      segments.every((s) => s.text.length <= 5000 && s.text.endsWith("。") && s.end === 12),
    ).toBe(true);
    expect(
      toTranscriptSegments({ ...base, text: "a".repeat(12000) }).map((s) => s.text.length),
    ).toEqual([4000, 4000, 4000]);
  });
  it("no text at all throws", () => {
    expect(() => toTranscriptSegments({ ...base, text: " \n" })).toThrow("no text");
  });
  it("invalid times are made finite and nonnegative and excessive segments fail closed", () => {
    expect(
      toTranscriptSegments({
        ...base,
        segments: [
          { start: NaN, end: Infinity, text: "text" },
          { start: -2, end: -3, text: "text" },
        ],
      }),
    ).toEqual([
      { start: 0, end: 0, text: "text" },
      { start: 0, end: 0, text: "text" },
    ]);
    expect(() =>
      toTranscriptSegments({
        ...base,
        segments: Array.from({ length: 2001 }, () => ({ start: 0, end: 0, text: "text" })),
      }),
    ).toThrow("2000");
  });
  it("the configured modelVersion is returned", async () => {
    const model = new MockTranscriptionModelV4({
      doGenerate: async () => ({
        text: "mock",
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(0), modelId: "mock/model" },
      }),
    });
    const result = await createTranscriber({ model, modelVersion: "mock/chosen" }).transcribe(
      new Uint8Array([1]),
      { language: "ja" },
    );
    expect(result.modelVersion).toBe("mock/chosen");
    expect(result.language).toBe("ja");
    expect(result.segments).toEqual([{ start: 0, end: 0, text: "mock" }]);
  });
  it("createTranscriber returns language and duration", async () => {
    const generate = vi.fn(async () => ({
      text: "mock",
      segments: [],
      language: "ja",
      durationInSeconds: 4.5,
      warnings: [],
      response: { timestamp: new Date(0), modelId: "mock/model" },
    }));
    const model = new MockTranscriptionModelV4({ doGenerate: generate });
    expect(
      await createTranscriber({ model, modelVersion: "mock/model" }).transcribe(
        new Uint8Array([1]),
        { language: "en" },
      ),
    ).toMatchObject({ language: "ja", durationSeconds: 4.5 });
    expect(generate.mock.calls).toHaveLength(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
    expect(generate).not.toHaveBeenCalledWith(
      expect.objectContaining({ providerOptions: { gateway: { language: "en" } } }),
    );
  });
});

describe("openai-compatible transcriber", () => {
  const options = {
    baseURL: "https://mock.invalid/v1",
    apiKey: "mock-private-key",
    modelId: "whisper-large-v3",
    maxBytes: 4,
    vocabularyHint: "架空テスト店",
  };
  function fakeModel(overrides = {}) {
    return new MockTranscriptionModelV4({
      doGenerate: vi.fn(async () => ({
        text: "Mock transcript",
        segments: [{ startSecond: 1, endSecond: 4, text: "Mock transcript" }],
        language: "ja",
        durationInSeconds: 5,
        warnings: [],
        response: { timestamp: new Date(0), modelId: "mock" },
        ...overrides,
      })),
    });
  }
  it.each([
    ["whisper-1", true],
    ["whisper-large-v3", true],
    ["whisper-large-v3-turbo", true],
    ["self-hosted-whisper", true],
    ["gpt-4o-transcribe", false],
    ["gpt-4o-mini-transcribe", false],
    ["gpt-4o-transcribe-diarize", false],
    ["gpt-transcribe", false],
    ["gpt-future-transcribe", false],
  ])("supportsTimestamps(%s) is %s", (modelId, expected) => {
    expect(supportsTimestamps(modelId)).toBe(expected);
  });
  it.each([
    ["whisper-1", "verbose_json", ["segment"]],
    ["gpt-4o-transcribe", "json", []],
    ["gpt-4o-mini-transcribe", "json", []],
    ["gpt-4o-transcribe-diarize", "diarized_json", []],
    ["whisper-large-v3", "verbose_json", ["segment"]],
  ])(
    "%s uses the SDK format and supported timestamps in the HTTP request",
    async (modelId, format, timestamps) => {
      const request = vi.fn<typeof fetch>(async () => {
        return Response.json({ text: "架空のテスト音声", duration: 4.5 });
      });
      const result = await createCompatibleTranscriber(
        { ...options, modelId, vocabularyHint: ` ${"あ".repeat(210)} `, fetch: request },
        (config) =>
          createOpenAI({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            fetch: config.fetch,
          }).transcription(config.modelId),
      ).transcribe(new Uint8Array(1), { language: "ja" });
      expect(request).toHaveBeenCalledOnce();
      const form = request.mock.calls[0]![1]?.body;
      expect(form).toBeInstanceOf(FormData);
      if (!(form instanceof FormData)) throw new Error("expected multipart body");
      expect(form.getAll("response_format")).toEqual([format]);
      expect(form.getAll("timestamp_granularities[]")).toEqual(timestamps);
      expect(form.get("model")).toBe(modelId);
      expect(form.get("language")).toBe("ja");
      expect(form.get("prompt")).toBe("あ".repeat(200));
      expect(form.get("file")).toBeInstanceOf(Blob);
      expect(result).toMatchObject({
        language: "ja",
        modelVersion: `openai-compatible:${modelId}`,
        durationSeconds: 4.5,
        segments: [{ start: 0, end: 4.5, text: "架空のテスト音声" }],
      });
    },
  );
  it.each([undefined, " ", "架空テスト店"])(
    "the real request handles vocabulary %j",
    async (vocabularyHint) => {
      const request = vi.fn<typeof fetch>(async () => Response.json({ text: "mock" }));
      const result = await createCompatibleTranscriber({
        ...options,
        vocabularyHint,
        fetch: request,
      }).transcribe(new Uint8Array(1), { language: "ja" });
      const form = request.mock.calls[0]![1]?.body;
      if (!(form instanceof FormData)) throw new Error("expected multipart body");
      expect(form.get("prompt")).toBe(vocabularyHint?.trim() || null);
      expect(result.segments).toEqual([{ start: 0, end: 0, text: "mock" }]);
    },
  );
  it("a provider HTTP 400 preserves its reason and status without either key or endpoint", async () => {
    const apiKey = "sk-test-1234567890";
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "unsupported_value",
            message: `response_format 'verbose_json' is not compatible with model 'gpt-4o-transcribe'. ${apiKey} sk-other-secret ${options.baseURL}`,
          },
        },
        { status: 400 },
      ),
    );
    const transcriber = createCompatibleTranscriber({ ...options, apiKey, fetch: request });
    const error = await transcriber
      .transcribe(new Uint8Array(1), { language: "ja" })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("expected Error");
    expect(error.message).toContain("HTTP 400");
    expect(error.message).toContain("invalid_request_error");
    expect(error.message).toContain("unsupported_value");
    expect(error.message).toContain("AI_APICallError");
    expect(error.message).toContain("response_format 'verbose_json' is not compatible");
    expect(error.message).toContain("[redacted]");
    expect(error.message).not.toMatch(/sk-test-1234567890|sk-other-secret|mock\.invalid/);
    expect(request).toHaveBeenCalledOnce();
  });
  it("the job saves the safe HTTP provider reason for the interviewer", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { type: "invalid_request_error", message: "response_format is not compatible" } },
        { status: 400 },
      ),
    );
    const recordProcessingError = vi.fn(async () => null);
    const saveMachineTranscript = vi.fn(async () => null);
    expect(
      await transcribeJob(
        { interviewId: "mock", storageId: "mock", language: "ja" },
        {
          env: {
            TRANSCRIBE_PROVIDER: "openai-compatible",
            TRANSCRIBE_BASE_URL: options.baseURL,
            TRANSCRIBE_API_KEY: options.apiKey,
            TRANSCRIBE_MODEL: "gpt-4o-transcribe",
          },
          log: vi.fn(),
          loadAudio: async () => new Uint8Array(1),
          makeTranscriber: () => createCompatibleTranscriber({ ...options, fetch: request }),
          saveMachineTranscript,
          recordProcessingError,
        },
      ),
    ).toBe("failed");
    expect(recordProcessingError).toHaveBeenCalledWith(
      expect.stringMatching(/HTTP 400.*invalid_request_error.*response_format is not compatible/),
    );
    expect(JSON.stringify(recordProcessingError.mock.calls)).not.toContain(options.apiKey);
    expect(saveMachineTranscript).not.toHaveBeenCalled();
  });
  it("uses the last provider error when retries are exhausted without serializing private payloads", async () => {
    const lastError = Object.assign(new Error("capacity unavailable"), {
      statusCode: 503,
      data: { error: { type: "server_error", code: 503 } },
      responseBody: "Mock private transcript",
      requestBodyValues: { file: "Mock private audio" },
    });
    const error = Object.assign(new Error("retry wrapper"), { name: "AI_RetryError", lastError });
    const model = new MockTranscriptionModelV4({
      doGenerate: async () => {
        throw error;
      },
    });
    await expect(
      createCompatibleTranscriber(options, () => model).transcribe(new Uint8Array(1), {
        language: "ja",
      }),
    ).rejects.toThrow(
      "Transcription provider failed (AI_RetryError, HTTP 503, server_error, 503): capacity unavailable",
    );
  });
  it("a GPT response without a duration or timestamps falls back to zero seconds", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ text: "mock" }));
    const result = await createCompatibleTranscriber({
      ...options,
      modelId: "gpt-4o-transcribe",
      durationSeconds: 99,
      fetch: request,
    }).transcribe(new Uint8Array(1), { language: "ja" });
    expect(result).toMatchObject({
      durationSeconds: 0,
      segments: [{ start: 0, end: 0, text: "mock" }],
    });
  });
  it.each([undefined, null, "secret thrown string", 42, {}, new Error("")])(
    "unstructured throw %j still has a useful description",
    async (thrown) => {
      const model = new MockTranscriptionModelV4({
        doGenerate: async () => {
          throw thrown;
        },
      });
      await expect(
        createCompatibleTranscriber(options, () => model).transcribe(new Uint8Array(1), {
          language: "ja",
        }),
      ).rejects.toThrow(
        `Transcription provider failed (${thrown instanceof Error ? "Error" : thrown === null ? "null" : typeof thrown}): no provider message available`,
      );
    },
  );
  it("redacts configured non-sk keys and URLs before capping the provider reason at 200 characters", async () => {
    const message = `${options.apiKey} https://another.invalid/private ${"あ".repeat(240)}`;
    const model = new MockTranscriptionModelV4({
      doGenerate: async () => {
        throw new Error(message);
      },
    });
    const error = await createCompatibleTranscriber(options, () => model)
      .transcribe(new Uint8Array(1), { language: "ja" })
      .catch((error: unknown) => error);
    if (!(error instanceof Error)) throw new Error("expected Error");
    const reason = error.message.split("): ")[1]!.split(". Use the typed-transcript")[0]!;
    expect(reason).toHaveLength(200);
    expect(reason).toMatch(/^\[redacted\] \[redacted\]/);
    expect(error.message).not.toMatch(/mock-private-key|another\.invalid/);
  });
  it("segments and duration are normalised", async () => {
    const result = await createCompatibleTranscriber(options, () => fakeModel()).transcribe(
      new Uint8Array(1),
      { language: "en" },
    );
    expect(result).toEqual({
      text: "Mock transcript",
      segments: [{ start: 1, end: 4, text: "Mock transcript" }],
      language: "ja",
      durationSeconds: 5,
      modelVersion: "openai-compatible:whisper-large-v3",
    });
    const missing = await createCompatibleTranscriber(options, () =>
      fakeModel({
        language: undefined,
        durationInSeconds: undefined,
      }),
    ).transcribe(new Uint8Array(1), { language: "ja" });
    expect(missing).toMatchObject({ language: "ja", durationSeconds: 4 });
  });
  it("an endpoint without timestamps falls back to one segment spanning known audio", async () => {
    const result = await createCompatibleTranscriber({ ...options, durationSeconds: 9 }, () =>
      fakeModel({ segments: [], durationInSeconds: undefined }),
    ).transcribe(new Uint8Array(1), { language: "ja" });
    expect(result.segments).toEqual([{ start: 0, end: 9, text: "Mock transcript" }]);
  });
  it("audio over the limit fails before the model is called (the fake is never invoked)", async () => {
    const factory = vi.fn(() => fakeModel());
    await expect(
      createCompatibleTranscriber(options, factory).transcribe(new Uint8Array(5), {
        language: "ja",
      }),
    ).rejects.toThrow("TRANSCRIBE_MAX_BYTES (4 bytes); compress or split");
    expect(factory).not.toHaveBeenCalled();
  });
  it("a model error becomes a readable failure, not a throw", async () => {
    const recordProcessingError = vi.fn(async () => null);
    const result = await transcribeJob(
      { interviewId: "mock", storageId: "mock", language: "ja" },
      {
        env: {
          TRANSCRIBE_PROVIDER: "gateway",
          TRANSCRIBE_MODEL: "mock/model",
          AI_GATEWAY_API_KEY: "mock",
        },
        log: vi.fn(),
        loadAudio: async () => new Uint8Array(1),
        makeTranscriber: () =>
          createCompatibleTranscriber(
            options,
            () =>
              new MockTranscriptionModelV4({
                doGenerate: async () => {
                  throw new Error("mock-private-key Mock transcript");
                },
              }),
          ),
        saveMachineTranscript: vi.fn(async () => null),
        recordProcessingError,
      },
    );
    expect(result).toBe("failed");
    expect(recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("Transcription provider failed"),
    );
    expect(JSON.stringify(recordProcessingError.mock.calls)).not.toMatch(
      /mock-private-key|Mock transcript/,
    );
  });
  it("no secret or transcript text appears in any log call", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}),
    );
    await createCompatibleTranscriber(options, () => fakeModel()).transcribe(new Uint8Array(1), {
      language: "ja",
    });
    await expect(
      createCompatibleTranscriber(
        options,
        () =>
          new MockTranscriptionModelV4({
            doGenerate: async () => {
              throw new Error(`${options.apiKey} ${options.baseURL} Mock transcript`);
            },
          }),
      ).transcribe(new Uint8Array(1), { language: "ja" }),
    ).rejects.toThrow("provider failed");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
