import { describe, expect, it, vi } from "vitest";
import { extractJob, transcribeJob, translateJob } from "../../src/lib/ai/jobs";
import type { ExtractedClaim, Transcription } from "../../src/lib/ports";

const env = {
  AI_GATEWAY_API_KEY: "test-key",
  TRANSCRIBE_PROVIDER: "gateway",
  TRANSCRIBE_MODEL: "mock/transcriber",
  AI_MODEL_EXTRACT: "mock/extractor",
  AI_MODEL_TRANSLATE: "mock/translator",
};
const input = { interviewId: "interview", storageId: "audio", language: "ja" };
const claim: ExtractedClaim = {
  kind: "story",
  textOriginal: "mock",
  quote: "mock",
  spanStart: 0,
  spanEnd: 4,
};
const transcription: Transcription = {
  text: "mock",
  segments: [{ start: 0, end: 1, text: "mock" }],
  language: "ja",
  durationSeconds: 1,
  modelVersion: "untrusted-provider-version",
};
function transcriptionDeps() {
  return {
    env,
    log: vi.fn(),
    loadAudio: vi.fn(async () => new Uint8Array([1]) as Uint8Array | null),
    makeTranscriber: vi.fn(() => ({ transcribe: vi.fn(async () => transcription) })),
    saveMachineTranscript: vi.fn(async () => null),
    recordProcessingError: vi.fn(async () => null),
  };
}
function extractionDeps() {
  return {
    env,
    log: vi.fn(),
    loadForExtraction: vi.fn(async () => ({
      transcriptId: "corrected",
      text: "prefix mock",
      language: "ja",
      regionId: "nagasaki",
    })),
    makeExtractor: vi.fn(() => ({
      extract: vi.fn(async () => [claim, { ...claim, quote: "invented" }]),
    })),
    insertExtracted: vi.fn(async () => ({ inserted: 1, dropped: 0 })),
    recordProcessingError: vi.fn(async () => null),
  };
}
function translationDeps() {
  return {
    env,
    log: vi.fn(),
    listUntranslated: vi.fn(async () => [
      { claimId: "a", text: "mock a", from: "ja", to: "en" },
      { claimId: "b", text: "mock b", from: "ja", to: "en" },
      { claimId: "c", text: "mock c", from: "en", to: "ja" },
    ]),
    placeNames: vi.fn(async () => [
      { lang: "ja", value: "架空", isPrimary: true },
      { lang: "en", value: "Mock", isPrimary: true },
    ]),
    makeTranslator: vi.fn(() => ({
      translate: vi.fn(async () => ({
        ok: true as const,
        items: [{ itemId: "a", text: "translated", modelVersion: "provider" }],
      })),
    })),
    saveMachineTranslation: vi.fn(async () => null),
  };
}

describe("AI jobs", () => {
  it("transcribeJob missing config records/logs the reason and calls no model", async () => {
    const deps = { ...transcriptionDeps(), env: {} };
    expect(await transcribeJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("Error: AI is not configured: AI_GATEWAY_API_KEY"),
    );
    expect(deps.makeTranscriber).not.toHaveBeenCalled();
    expect(deps.loadAudio).not.toHaveBeenCalled();
  });
  it("extractJob missing config records/logs the reason and calls no model", async () => {
    const deps = { ...extractionDeps(), env: {} };
    expect(await extractJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("Error: AI is not configured: AI_GATEWAY_API_KEY"),
    );
    expect(deps.makeExtractor).not.toHaveBeenCalled();
    expect(deps.loadForExtraction).not.toHaveBeenCalled();
  });
  it("translateJob missing config records/logs the reason and calls no model", async () => {
    const deps = { ...translationDeps(), env: {} };
    expect(await translateJob({ placeId: "place" }, deps)).toEqual({ translated: 0, failed: 0 });
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining("Error: AI is not configured: AI_GATEWAY_API_KEY"),
    );
    expect(deps.makeTranslator).not.toHaveBeenCalled();
  });
  it("transcribeJob records 'the audio file is missing' when storage returns null", async () => {
    const deps = transcriptionDeps();
    deps.loadAudio.mockResolvedValue(null);
    expect(await transcribeJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      "transcription failed (Error: the audio file is missing)",
    );
    expect(deps.makeTranscriber).not.toHaveBeenCalled();
  });
  it("a thrown non-Error still records a non-empty message", async () => {
    const deps = transcriptionDeps();
    deps.loadAudio.mockRejectedValue("");
    expect(await transcribeJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("NonError: unknown thrown value"),
    );
    const extraction = extractionDeps();
    extraction.loadForExtraction.mockRejectedValue(null);
    expect(await extractJob(input, extraction)).toBe("failed");
    expect(extraction.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("NonError: null"),
    );
  });
  it("transcribeJob saves normalised segments and the configured model id", async () => {
    const deps = transcriptionDeps();
    expect(await transcribeJob(input, deps)).toBe("saved");
    expect(deps.saveMachineTranscript).toHaveBeenCalledWith({
      segments: transcription.segments,
      lang: "ja",
      modelVersion: "mock/transcriber",
      durationS: 1,
    });
  });
  it("extractJob passes only anchored items to insertExtracted and records the zero-insert reason", async () => {
    const deps = extractionDeps();
    expect(await extractJob(input, deps)).toEqual({ inserted: 1, dropped: 1 });
    expect(deps.insertExtracted).toHaveBeenCalledWith({
      transcriptId: "corrected",
      modelVersion: "mock/extractor",
      items: [{ ...claim, spanStart: 7, spanEnd: 11 }],
    });
    deps.insertExtracted.mockResolvedValue({ inserted: 0, dropped: 1 });
    expect(await extractJob(input, deps)).toEqual({ inserted: 0, dropped: 2 });
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("no claims were proposed: 2 dropped by the quote check"),
    );
  });
  it("translateJob groups by language pair, skips nothing silently, and counts failures", async () => {
    const deps = translationDeps();
    const translator = deps.makeTranslator();
    deps.makeTranslator.mockReturnValue(translator);
    expect(await translateJob({ placeId: "place" }, deps)).toEqual({ translated: 1, failed: 2 });
    expect(translator.translate).toHaveBeenCalledTimes(2);
    expect(translator.translate).toHaveBeenCalledWith(
      [
        { itemId: "a", text: "mock a" },
        { itemId: "b", text: "mock b" },
      ],
      { from: "ja", to: "en", inputKind: "claim", glossary: { 架空: "Mock" } },
    );
    expect(deps.log).toHaveBeenCalledTimes(2);
    expect(deps.saveMachineTranslation).toHaveBeenCalledWith({
      claimId: "a",
      lang: "en",
      sourceText: "mock a",
      text: "translated",
      modelVersion: "mock/translator",
    });
  });
  it("translation refusals, thrown failures, and save failures count every pending item", async () => {
    for (const failure of ["refusal", "throw", "save"] as const) {
      const deps = translationDeps();
      const translate = vi.fn(async () => {
        if (failure === "throw") throw "mock failure";
        if (failure === "refusal")
          return { ok: false as const, reason: "provider_error:TypeError" };
        return {
          ok: true as const,
          items: ["a", "b", "c"].map((itemId) => ({
            itemId,
            text: "translated",
            modelVersion: "provider",
          })),
        };
      });
      const custom = { ...deps, makeTranslator: () => ({ translate }) };
      if (failure === "save")
        deps.saveMachineTranslation.mockRejectedValue(new Error("write failed"));
      expect(await translateJob({ placeId: "place" }, custom)).toEqual({
        translated: 0,
        failed: 3,
      });
      expect(deps.log).toHaveBeenCalled();
    }
  });
  it("failures redact keys, and failure to record an error is logged", async () => {
    const deps = transcriptionDeps();
    deps.loadAudio.mockRejectedValue(new TypeError("test-key"));
    deps.recordProcessingError.mockRejectedValue(new Error("test-key"));
    expect(await transcribeJob(input, deps)).toBe("failed");
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain("test-key");
    expect(deps.log).toHaveBeenCalledTimes(2);
  });
});

it("transcription factory and save failures are recorded with a readable error name", async () => {
  for (const stage of ["factory", "save"] as const) {
    const deps = transcriptionDeps();
    if (stage === "factory")
      deps.makeTranscriber.mockImplementation(() => {
        throw new TypeError("model unavailable");
      });
    else deps.saveMachineTranscript.mockRejectedValue(new TypeError("transcript write failed"));
    expect(await transcribeJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("transcription failed (TypeError:"),
    );
  }
});
it("extraction refuses an unknown region and records factory, provider, and insert failures", async () => {
  for (const stage of ["region", "factory", "provider", "insert"] as const) {
    const deps = extractionDeps();
    if (stage === "region")
      deps.loadForExtraction.mockResolvedValue({
        transcriptId: "corrected",
        text: "mock",
        language: "ja",
        regionId: "not-configured",
      });
    if (stage === "factory")
      deps.makeExtractor.mockImplementation(() => {
        throw new Error("model unavailable");
      });
    if (stage === "provider")
      deps.makeExtractor.mockReturnValue({
        extract: vi.fn(async () => {
          throw new Error("provider unavailable");
        }),
      });
    if (stage === "insert") deps.insertExtracted.mockRejectedValue(new Error("insert refused"));
    expect(await extractJob(input, deps)).toBe("failed");
    expect(deps.recordProcessingError).toHaveBeenCalledWith(
      expect.stringContaining("claim extraction failed (Error:"),
    );
    if (stage === "region") expect(deps.makeExtractor).not.toHaveBeenCalled();
  }
});
it("translation query and setup failures are logged and count known pending items", async () => {
  for (const stage of ["list", "names", "factory"] as const) {
    const deps = translationDeps();
    if (stage === "list") deps.listUntranslated.mockRejectedValue(new Error("query unavailable"));
    if (stage === "names") deps.placeNames.mockRejectedValue(new Error("names unavailable"));
    if (stage === "factory")
      deps.makeTranslator.mockImplementation(() => {
        throw new Error("model unavailable");
      });
    expect(await translateJob({ placeId: "place" }, deps)).toEqual({
      translated: 0,
      failed: stage === "list" ? 0 : 3,
    });
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("translation failed (Error:"));
  }
});
it("translation splits oversized groups without dropping any item", async () => {
  const deps = translationDeps();
  const pending = Array.from({ length: 51 }, (_, i) => ({
    claimId: `mock-${i}`,
    text: `mock text ${i}`,
    from: "ja",
    to: "en",
  }));
  deps.listUntranslated.mockResolvedValue(pending);
  const translate = vi.fn(async (items: { itemId: string; text: string }[]) => ({
    ok: true as const,
    items: items.map((item) => ({ ...item, modelVersion: "provider" })),
  }));
  expect(
    await translateJob({ placeId: "place" }, { ...deps, makeTranslator: () => ({ translate }) }),
  ).toEqual({ translated: 51, failed: 0 });
  expect(translate.mock.calls.map(([items]) => items.length)).toEqual([50, 1]);
  expect(deps.saveMachineTranslation).toHaveBeenCalledTimes(51);
});
