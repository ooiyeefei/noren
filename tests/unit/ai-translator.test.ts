import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createLanguageModel } from "../../src/lib/ai/claim-extractor";
import { aiConfig } from "../../src/lib/ai/config";
import { createTranslator, placeGlossary } from "../../src/lib/ai/translator";
import type { TranslationOptions, TranslatorInputKind } from "../../src/lib/ports";

function modelFor(items: { itemId: string; text: string }[]) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify({ items }) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}
const options: TranslationOptions = {
  from: "ja",
  to: "en",
  glossary: { テスト店: "Mock Shop" },
  inputKind: "claim",
};
describe("translator", () => {
  it("both routes build a model through the same code path and pass the same schema/prompt", async () => {
    const direct = modelFor([{ itemId: "1", text: "Mock translation" }]);
    const gateway = modelFor([{ itemId: "1", text: "Mock translation" }]);
    const directModel = vi.fn(() => direct);
    const gatewayModel = vi.fn(() => gateway);
    const factories = {
      anthropic: vi.fn(() => directModel),
      gateway: vi.fn(() => gatewayModel),
    };
    for (const modelId of ["claude-sonnet-5-5", "anthropic/claude-sonnet-5-5"]) {
      const result = aiConfig("translate", {
        ANTHROPIC_API_KEY: "mock-direct-key",
        AI_GATEWAY_API_KEY: "mock-gateway-key",
        AI_MODEL_TRANSLATE: modelId,
      });
      if (!result.ok) throw new Error(result.reason);
      expect(
        await createTranslator({
          model: createLanguageModel(result.config, factories),
          modelVersion: result.config.modelId,
        }).translate([{ itemId: "1", text: "Mock source" }], options),
      ).toEqual({
        ok: true,
        items: [{ itemId: "1", text: "Mock translation", modelVersion: modelId }],
      });
    }
    expect(factories.anthropic).toHaveBeenCalledExactlyOnceWith({ apiKey: "mock-direct-key" });
    expect(factories.gateway).toHaveBeenCalledExactlyOnceWith({ apiKey: "mock-gateway-key" });
    expect(directModel).toHaveBeenCalledExactlyOnceWith("claude-sonnet-5-5");
    expect(gatewayModel).toHaveBeenCalledExactlyOnceWith("anthropic/claude-sonnet-5-5");
    expect(direct.doGenerateCalls).toHaveLength(1);
    expect(gateway.doGenerateCalls).toHaveLength(1);
    expect(direct.doGenerateCalls[0]!.prompt).toEqual(gateway.doGenerateCalls[0]!.prompt);
    expect(direct.doGenerateCalls[0]!.responseFormat).toEqual(
      gateway.doGenerateCalls[0]!.responseFormat,
    );
    expect(direct.doGenerateCalls[0]!.responseFormat).toMatchObject({ type: "json" });
  });
  it("a kind outside claim/note/live_chunk is refused without calling the model", async () => {
    const model = modelFor([]);
    const translator = createTranslator({ model, modelVersion: "mock/model" });
    expect(
      await translator.translate([{ itemId: "1", text: "mock" }], {
        ...options,
        inputKind: "platform" as TranslatorInputKind,
      }),
    ).toEqual({ ok: false, reason: "unsupported_input_kind" });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
  it("same language, 0 or 51 items, blank or 1001-character text are refused", async () => {
    const model = modelFor([]);
    const translator = createTranslator({ model, modelVersion: "mock/model" });
    const item = { itemId: "1", text: "mock" };
    expect(await translator.translate([item], { ...options, to: "ja" })).toEqual({
      ok: false,
      reason: "same_language",
    });
    for (const items of [[], Array.from({ length: 51 }, () => item)])
      expect(await translator.translate(items, options)).toEqual({
        ok: false,
        reason: "too_many_items",
      });
    for (const text of [" ", "a".repeat(1001)])
      expect(await translator.translate([{ ...item, text }], options)).toEqual({
        ok: false,
        reason: "invalid_item",
      });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
  it("unknown or duplicate itemIds from the model are dropped", async () => {
    const model = modelFor([
      { itemId: "unknown", text: "x" },
      { itemId: "1", text: " translated " },
      { itemId: "1", text: "duplicate" },
      { itemId: "2", text: " " },
    ]);
    expect(
      await createTranslator({ model, modelVersion: "mock/model" }).translate(
        [
          { itemId: "1", text: "mock" },
          { itemId: "2", text: "other" },
        ],
        options,
      ),
    ).toEqual({
      ok: true,
      items: [{ itemId: "1", text: "translated", modelVersion: "mock/model" }],
    });
    const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("always render these names exactly so");
    expect(prompt).toContain("Mock Shop");
  });
  it("the glossary maps names to the target language's primary name", () => {
    const names = [
      { lang: "ja", value: "テスト", isPrimary: true },
      { lang: "ja", value: "てすと", isPrimary: false },
      { lang: "en", value: "Other mock", isPrimary: false },
      { lang: "en", value: "Primary mock", isPrimary: true },
    ];
    expect(placeGlossary(names, "ja", "en")).toEqual({
      テスト: "Primary mock",
      てすと: "Primary mock",
    });
    expect(placeGlossary(names.slice(0, 3), "ja", "en")["テスト"]).toBe("Other mock");
    expect(placeGlossary(names, "ja", "fr")).toEqual({});
  });
  it("a provider error becomes provider_error:<Name>", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new TypeError("test-key must not escape");
      },
    });
    expect(
      await createTranslator({ model, modelVersion: "mock/model" }).translate(
        [{ itemId: "1", text: "mock" }],
        options,
      ),
    ).toEqual({ ok: false, reason: "provider_error:TypeError" });
  });
  it("a provider's error message and custom name cannot expose keys or source text", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const error = new Error("mock-key and mock transcript");
        error.name = "mock-key and mock transcript";
        throw error;
      },
    });
    expect(
      await createTranslator({ model, modelVersion: "mock/model" }).translate(
        [{ itemId: "1", text: "mock transcript" }],
        options,
      ),
    ).toEqual({ ok: false, reason: "provider_error:Error" });
  });
});
