/// <reference types="vite/client" />
import { MockLanguageModelV4, MockTranscriptionModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as languageModels from "../src/lib/ai/claim-extractor";
import * as transcribers from "../src/lib/ai/transcriber";
import {
  addClaim,
  addCorrectedTranscript,
  addInterview,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const variables = [
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
  "META_API_KEY",
  "AI_MODEL_EXTRACT",
  "AI_MODEL_TRANSLATE",
  "TRANSCRIBE_PROVIDER",
  "TRANSCRIBE_MODEL",
  "TRANSCRIBE_BASE_URL",
  "TRANSCRIBE_API_KEY",
  "TRANSCRIBE_MAX_BYTES",
];
const noNetwork = vi.fn(() => {
  throw new Error("network calls are forbidden in AI request tests");
});
beforeEach(() => {
  vi.useFakeTimers();
  noNetwork.mockClear();
  vi.stubGlobal("fetch", noNetwork);
});
afterEach(() => {
  expect(noNetwork).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function fakeModel(output: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}
async function setup(options: { consent?: boolean; public?: boolean } = {}) {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const placeId = await addPlace(b, {
    createdBy: creator,
    isMock: true,
    visibility: options.public ? "demo_public" : "draft",
  });
  const interviewId = await addInterview(b, {
    placeId,
    interviewerId: creator,
    consent: options.consent,
  });
  return { b, creator, placeId, interviewId, caller: b.as("creator") };
}
async function scheduled(b: ReturnType<typeof newBackend>) {
  return b.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
}
async function attachAudio(s: Awaited<ReturnType<typeof setup>>) {
  const storageId = await s.b.t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([1, 2])], { type: "audio/webm" })),
  );
  expect(
    await s.caller.mutation(api.audio.attach, { interviewId: s.interviewId, storageId }),
  ).toEqual({ ok: true });
  return storageId;
}

it("with no AI variables every request is conflict naming the variable, and nothing is scheduled", async () => {
  for (const variable of variables) vi.stubEnv(variable, undefined);
  const s = await setup();
  const requests = [
    s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId }),
    s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId }),
    s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId }),
  ];
  for (const result of await Promise.allSettled(requests)) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason.data).toEqual({
        code: "conflict",
        message: expect.stringContaining("AI_GATEWAY_API_KEY"),
      });
    }
  }
  expect(await scheduled(s.b)).toHaveLength(0);
});

it("the recorder is asked for WAV only when the transcription service needs it", async () => {
  const b = newBackend(modules);
  for (const [provider, format] of [
    [undefined, "original"],
    ["gateway", "original"],
    ["openai-compatible", "original"],
    [" meta ", "wav"],
  ] as const) {
    vi.stubEnv("TRANSCRIBE_PROVIDER", provider);
    expect(await b.t.query(api.aiRequests.audioFormat, {})).toBe(format);
  }
});

describe("configured requests", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL_EXTRACT", "mock/extractor");
    vi.stubEnv("AI_MODEL_TRANSLATE", "mock/translator");
    vi.stubEnv("TRANSCRIBE_PROVIDER", "gateway");
    vi.stubEnv("TRANSCRIBE_MODEL", "mock/transcriber");
  });
  it("direct extraction and translation schedule without a gateway key", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
    vi.stubEnv("AI_MODEL_EXTRACT", "claude-sonnet-5-5");
    vi.stubEnv("AI_MODEL_TRANSLATE", "claude-sonnet-5-5");
    const s = await setup();
    const { transcriptId } = await addCorrectedTranscript(s.b, {
      interviewId: s.interviewId,
      createdBy: s.creator,
    });
    await addClaim(s.b, {
      placeId: s.placeId,
      origin: "interview",
      status: "owner_confirmed",
      transcriptId,
    });
    await expect(
      s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId }),
    ).resolves.toBeNull();
    await expect(
      s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId }),
    ).resolves.toEqual({ pending: 1 });
    expect((await scheduled(s.b)).map(({ name }) => name).sort()).toEqual([
      "aiActions:extractClaims",
      "aiActions:translateClaims",
    ]);
  });
  it.each([
    ["anthropic", "claude-sonnet-5-5"],
    ["gateway", "anthropic/claude-sonnet-5-5"],
  ] as const)(
    "%s actions use the shared model factory and save their results",
    async (provider, modelId) => {
      vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
      vi.stubEnv("AI_GATEWAY_API_KEY", provider === "gateway" ? "test-key" : undefined);
      vi.stubEnv("AI_MODEL_EXTRACT", modelId);
      vi.stubEnv("AI_MODEL_TRANSLATE", modelId);
      const s = await setup();
      const { transcriptId, text } = await addCorrectedTranscript(s.b, {
        interviewId: s.interviewId,
        createdBy: s.creator,
      });
      const factory = vi.spyOn(languageModels, "createLanguageModel").mockReturnValueOnce(
        fakeModel({
          claims: [
            {
              kind: "story",
              cautionType: null,
              textOriginal: text,
              quote: text,
              spanStart: 0,
              spanEnd: text.length,
            },
          ],
        }),
      );
      await s.b.t.action(internal.aiActions.extractClaims, { interviewId: s.interviewId });
      expect(
        await s.b.t.run((ctx) =>
          ctx.db
            .query("claim")
            .withIndex("by_sourceTranscriptId", (q) => q.eq("sourceTranscriptId", transcriptId))
            .take(50),
        ),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ modelVersion: modelId, quote: text })]),
      );
      const claimId = await addClaim(s.b, {
        placeId: s.placeId,
        origin: "interview",
        status: "owner_confirmed",
        transcriptId,
      });
      factory.mockReturnValueOnce(
        fakeModel({ items: [{ itemId: claimId, text: "Mock translation" }] }),
      );
      await s.b.t.action(internal.aiActions.translateClaims, { placeId: s.placeId });
      expect(
        await s.b.t.run((ctx) =>
          ctx.db
            .query("claimTranslation")
            .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claimId).eq("lang", "en"))
            .unique(),
        ),
      ).toMatchObject({ text: "Mock translation", origin: "machine", modelVersion: modelId });
      expect(factory).toHaveBeenCalledTimes(2);
      for (const [config] of factory.mock.calls)
        expect(config).toEqual({
          provider,
          modelId,
          apiKey: provider === "gateway" ? "test-key" : "mock-anthropic-key",
        });
    },
  );
  it("slashless language requests without an Anthropic key fail closed before scheduling", async () => {
    vi.stubEnv("AI_MODEL_EXTRACT", "claude-sonnet-5-5");
    vi.stubEnv("AI_MODEL_TRANSLATE", "claude-sonnet-5-5");
    const s = await setup();
    for (const request of [
      s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId }),
      s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId }),
    ])
      await expect(request).rejects.toMatchObject({
        data: { code: "conflict", message: expect.stringContaining("ANTHROPIC_API_KEY") },
      });
    expect(await scheduled(s.b)).toHaveLength(0);
  });
  it("transcribe with only an Anthropic key fails closed and offers the typed-transcript fallback", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
    vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
    const s = await setup();
    await attachAudio(s);
    const before = await s.b.t.run((ctx) => ctx.db.get("interview", s.interviewId));
    await expect(
      s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId }),
    ).rejects.toMatchObject({
      data: {
        code: "conflict",
        message: expect.stringMatching(/AI_GATEWAY_API_KEY.*typed-transcript fallback/),
      },
    });
    expect(await scheduled(s.b)).toHaveLength(0);
    expect(await s.b.t.run((ctx) => ctx.db.get("interview", s.interviewId))).toEqual(before);
    expect(await s.b.t.run((ctx) => ctx.db.query("auditLog").take(100))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "ai.transcribe_requested" })]),
    );
  });
  it("environment stubs reach process.env inside convex-test", async () => {
    const b = newBackend(modules);
    expect(await b.t.run(async () => process.env.AI_GATEWAY_API_KEY === "test-key")).toBe(true);
  });
  it("transcribe without consent or audio is conflict", async () => {
    const absentConsent = await setup({ consent: false });
    expect(
      await errorCode(
        absentConsent.caller.mutation(api.aiRequests.transcribe, {
          interviewId: absentConsent.interviewId,
        }),
      ),
    ).toBe("conflict");
    const absentAudio = await setup();
    expect(
      await errorCode(
        absentAudio.caller.mutation(api.aiRequests.transcribe, {
          interviewId: absentAudio.interviewId,
        }),
      ),
    ).toBe("conflict");
    expect(await scheduled(absentConsent.b)).toHaveLength(0);
    expect(await scheduled(absentAudio.b)).toHaveLength(0);
  });
  it("transcribe by another creator who can read the place is forbidden, and by one who cannot read it is not_found", async () => {
    for (const readable of [true, false]) {
      const s = await setup({ public: readable });
      await addPerson(s.b, "other", "creator", { isMock: true });
      expect(
        await errorCode(
          s.b.as("other").mutation(api.aiRequests.transcribe, { interviewId: s.interviewId }),
        ),
      ).toBe(readable ? "forbidden" : "not_found");
      expect(await scheduled(s.b)).toHaveLength(0);
    }
  });
  it("transcribe moves the interview to transcribing and schedules one action", async () => {
    const s = await setup();
    const storageId = await attachAudio(s);
    expect(
      await s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId }),
    ).toBeNull();
    expect(await s.b.t.run((ctx) => ctx.db.get("interview", s.interviewId))).toMatchObject({
      status: "transcribing",
    });
    const jobs = await scheduled(s.b);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      name: "aiActions:transcribeInterview",
      args: [{ interviewId: s.interviewId, storageId, language: "ja" }],
    });
  });
  function compatibleEnv() {
    vi.stubEnv("AI_GATEWAY_API_KEY", undefined);
    vi.stubEnv("TRANSCRIBE_PROVIDER", "openai-compatible");
    vi.stubEnv("TRANSCRIBE_BASE_URL", "https://mock.invalid/v1/");
    vi.stubEnv("TRANSCRIBE_API_KEY", "mock-private-key");
    vi.stubEnv("TRANSCRIBE_MODEL", "whisper-large-v3");
    vi.stubEnv("TRANSCRIBE_MAX_BYTES", "4");
  }
  it("openai-compatible schedules without a gateway key, passes only place names and saves the version tag", async () => {
    compatibleEnv();
    const s = await setup();
    const storageId = await attachAudio(s);
    await s.b.t.run(async (ctx) => {
      await ctx.db.patch("interview", s.interviewId, { durationS: 9 });
      await ctx.db.insert("placeName", {
        placeId: s.placeId,
        lang: "ja",
        script: "kana",
        value: "あ".repeat(220),
        isPrimary: false,
      });
    });
    await s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId });
    expect(await scheduled(s.b)).toHaveLength(1);
    const generate = vi.fn(async () => ({
      text: "Mock transcript",
      segments: [],
      language: undefined,
      durationInSeconds: undefined,
      warnings: [],
      response: { timestamp: new Date(0), modelId: "mock" },
    }));
    const original = transcribers.createCompatibleTranscriber;
    const factory = vi
      .spyOn(transcribers, "createCompatibleTranscriber")
      .mockImplementation((config) =>
        original(config, () => new MockTranscriptionModelV4({ doGenerate: generate })),
      );
    await s.b.t.action(internal.aiActions.transcribeInterview, {
      interviewId: s.interviewId,
      storageId,
      language: "ja",
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-compatible",
        baseURL: "https://mock.invalid/v1",
        durationSeconds: 9,
        vocabularyHint: expect.any(String),
      }),
    );
    const prompt = factory.mock.calls[0]![0].vocabularyHint!;
    expect(prompt.length).toBe(200);
    expect(prompt).toContain("テスト店");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: {
            language: "ja",
            prompt,
            timestampGranularities: ["segment"],
          },
        },
      }),
    );
    const saved = await s.b.t.run((ctx) =>
      ctx.db
        .query("transcript")
        .withIndex("by_interviewId_and_version", (q) => q.eq("interviewId", s.interviewId))
        .take(2),
    );
    expect(saved).toEqual([
      expect.objectContaining({
        modelVersion: "openai-compatible:whisper-large-v3",
        lang: "ja",
        segments: [{ start: 0, end: 9, text: "Mock transcript" }],
      }),
    ]);
  });
  it("openai-compatible invalid config fails before scheduling", async () => {
    compatibleEnv();
    vi.stubEnv("TRANSCRIBE_BASE_URL", "http://mock.invalid/v1");
    const s = await setup();
    await attachAudio(s);
    await expect(
      s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId }),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("TRANSCRIBE_BASE_URL") },
    });
    expect(await scheduled(s.b)).toHaveLength(0);
  });
  it("openai-compatible size and provider failures are readable and never log secrets or transcript text", async () => {
    for (const stage of ["size", "provider"] as const) {
      compatibleEnv();
      if (stage === "size") vi.stubEnv("TRANSCRIBE_MAX_BYTES", "1");
      const s = await setup();
      const storageId = await attachAudio(s);
      const logs = ["log", "info", "warn", "error", "debug"].map((method) =>
        vi.spyOn(console, method as "log").mockImplementation(() => {}),
      );
      const modelFactory = vi.fn(
        () =>
          new MockTranscriptionModelV4({
            doGenerate: async () => {
              throw new Error("mock-private-key Mock private transcript https://mock.invalid/v1");
            },
          }),
      );
      const original = transcribers.createCompatibleTranscriber;
      const spy = vi
        .spyOn(transcribers, "createCompatibleTranscriber")
        .mockImplementation((config) => original(config, modelFactory));
      await expect(
        s.b.t.action(internal.aiActions.transcribeInterview, {
          interviewId: s.interviewId,
          storageId,
          language: "ja",
        }),
      ).resolves.toBeNull();
      const interview = await s.b.t.run((ctx) => ctx.db.get("interview", s.interviewId));
      expect(interview?.processingError).toContain(
        stage === "size"
          ? "TRANSCRIBE_MAX_BYTES (1 bytes); compress or split"
          : "Transcription provider failed",
      );
      expect(interview?.processingError).not.toMatch(
        /mock-private-key|Mock private transcript|mock.invalid/,
      );
      if (stage === "size") expect(modelFactory).not.toHaveBeenCalled();
      for (const log of logs) {
        expect(JSON.stringify(log.mock.calls)).not.toMatch(
          /mock-private-key|Mock private transcript|mock.invalid/,
        );
        log.mockRestore();
      }
      spy.mockRestore();
    }
  });
  it("proposeClaims is conflict while only a machine transcript exists (FR-009)", async () => {
    const s = await setup();
    await s.b.t.mutation(internal.interviews.saveMachineTranscript, {
      interviewId: s.interviewId,
      segments: [{ start: 0, end: 1, text: "Mock transcript" }],
      lang: "ja",
      modelVersion: "mock/transcriber",
    });
    expect(
      await errorCode(
        s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId }),
      ),
    ).toBe("conflict");
    expect(await scheduled(s.b)).toHaveLength(0);
  });
  it("proposeClaims schedules once and is conflict when AI claims already cite that transcript version", async () => {
    const s = await setup();
    const { transcriptId, text } = await addCorrectedTranscript(s.b, {
      interviewId: s.interviewId,
      createdBy: s.creator,
    });
    await s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId });
    expect(await scheduled(s.b)).toHaveLength(1);
    await s.b.t.mutation(internal.claims.insertExtracted, {
      interviewId: s.interviewId,
      transcriptId,
      modelVersion: "mock/extractor",
      items: [
        { kind: "story", textOriginal: text, quote: text, spanStart: 0, spanEnd: text.length },
      ],
    });
    await expect(
      s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId }),
    ).rejects.toMatchObject({
      data: {
        code: "conflict",
        message: "AI claims were already proposed for this transcript version",
      },
    });
    expect(await scheduled(s.b)).toHaveLength(1);
  });
  it("proposeClaims clears processingError", async () => {
    const s = await setup();
    await addCorrectedTranscript(s.b, { interviewId: s.interviewId, createdBy: s.creator });
    await s.b.t.mutation(internal.interviews.recordProcessingError, {
      interviewId: s.interviewId,
      message: "previous provider failure",
    });
    await s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId });
    expect(
      (await s.b.t.run((ctx) => ctx.db.get("interview", s.interviewId)))?.processingError,
    ).toBeUndefined();
  });
  it("translatePlace is not_found for an unreadable draft, forbidden for a non-manager, returns pending 0 and schedules nothing when every confirmed claim is translated, and schedules when one is missing", async () => {
    const draft = await setup();
    await addPerson(draft.b, "other", "creator", { isMock: true });
    expect(
      await errorCode(
        draft.b.as("other").mutation(api.aiRequests.translatePlace, { placeId: draft.placeId }),
      ),
    ).toBe("not_found");
    const s = await setup({ public: true });
    await addPerson(s.b, "other", "creator", { isMock: true });
    expect(
      await errorCode(
        s.b.as("other").mutation(api.aiRequests.translatePlace, { placeId: s.placeId }),
      ),
    ).toBe("forbidden");
    const { transcriptId } = await addCorrectedTranscript(s.b, {
      interviewId: s.interviewId,
      createdBy: s.creator,
    });
    const claimId = await addClaim(s.b, {
      placeId: s.placeId,
      origin: "interview",
      status: "owner_confirmed",
      transcriptId,
    });
    await addPerson(s.b, "steward", "steward", { isMock: true });
    await s.b.as("steward").mutation(api.claims.setHumanTranslation, {
      claimId,
      lang: "en",
      text: "Mock translated claim",
    });
    expect(await s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId })).toEqual({
      pending: 0,
    });
    expect(await scheduled(s.b)).toHaveLength(0);
    await addClaim(s.b, {
      placeId: s.placeId,
      origin: "interview",
      status: "owner_confirmed",
      transcriptId,
    });
    expect(await s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId })).toEqual({
      pending: 1,
    });
    expect(await scheduled(s.b)).toHaveLength(1);
    expect(await s.b.t.query(internal.aiRequests.placeNames, { placeId: s.placeId })).toEqual(
      expect.arrayContaining([
        { lang: "ja", value: "テスト店", isPrimary: true },
        { lang: "en", value: "Test Shop", isPrimary: true },
      ]),
    );
  });
  it("every request writes one audit entry naming the person", async () => {
    const s = await setup();
    await attachAudio(s);
    await s.caller.mutation(api.aiRequests.transcribe, { interviewId: s.interviewId });
    await addCorrectedTranscript(s.b, { interviewId: s.interviewId, createdBy: s.creator });
    await s.caller.mutation(api.aiRequests.proposeClaims, { interviewId: s.interviewId });
    await s.caller.mutation(api.aiRequests.translatePlace, { placeId: s.placeId });
    const rows = (await s.b.t.run((ctx) => ctx.db.query("auditLog").take(100))).filter((row) =>
      row.action.startsWith("ai."),
    );
    expect(rows.map((row) => row.action).sort()).toEqual([
      "ai.claims_requested",
      "ai.transcribe_requested",
      "ai.translate_requested",
    ]);
    for (const row of rows)
      expect(row).toMatchObject({
        actorKind: "person",
        actorPersonId: s.creator,
        targetType: row.action === "ai.translate_requested" ? "place" : "interview",
      });
  });
});
