import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_CAPABILITIES, aiConfig } from "../../src/lib/ai/config";

const configured = { AI_GATEWAY_API_KEY: "test-key", TRANSCRIBE_PROVIDER: "gateway" };
afterEach(() => vi.unstubAllEnvs());
function stubConfig(values: Record<string, string | undefined>) {
  for (const variable of [
    "ANTHROPIC_API_KEY",
    "AI_GATEWAY_API_KEY",
    "META_API_KEY",
    "TRANSCRIBE_PROVIDER",
    "TRANSCRIBE_MODEL",
    "TRANSCRIBE_BASE_URL",
    "TRANSCRIBE_API_KEY",
    "TRANSCRIBE_MAX_BYTES",
    ...AI_CAPABILITIES.map((capability) => `AI_MODEL_${capability.toUpperCase()}`),
  ])
    vi.stubEnv(variable, values[variable]);
}
describe("aiConfig", () => {
  it("each capability names its missing variable", () => {
    for (const capability of AI_CAPABILITIES) {
      expect(aiConfig(capability, {})).toEqual({
        ok: false,
        reason: expect.stringContaining("AI_GATEWAY_API_KEY"),
      });
      const variable =
        capability === "transcribe" ? "TRANSCRIBE_MODEL" : `AI_MODEL_${capability.toUpperCase()}`;
      expect(aiConfig(capability, configured)).toEqual({
        ok: false,
        reason: expect.stringContaining(variable),
      });
    }
    expect(aiConfig("transcribe", { AI_GATEWAY_API_KEY: "test-key" })).toEqual({
      ok: false,
      reason: expect.stringContaining("TRANSCRIBE_PROVIDER"),
    });
  });
  it("a blank or malformed model id is refused", () => {
    for (const model of [
      "",
      "  ",
      "model",
      "/model",
      "Vendor/model",
      "vendor/model/path",
      "vendor/bad model",
    ]) {
      expect(aiConfig("extract", { ...configured, AI_MODEL_EXTRACT: model }).ok).toBe(false);
    }
  });
  it("TRANSCRIBE_PROVIDER other than gateway is refused", () => {
    expect(
      aiConfig("transcribe", {
        ...configured,
        TRANSCRIBE_PROVIDER: "direct",
        TRANSCRIBE_MODEL: "mock/model",
      }).ok,
    ).toBe(false);
  });
  it("no reason ever contains the key", () => {
    for (const capability of AI_CAPABILITIES) {
      const result = aiConfig(capability, { AI_GATEWAY_API_KEY: "recognisable-fake-secret" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).not.toContain("recognisable-fake-secret");
    }
  });
  it("trimmed values are accepted", () => {
    for (const capability of AI_CAPABILITIES) {
      const variable =
        capability === "transcribe" ? "TRANSCRIBE_MODEL" : `AI_MODEL_${capability.toUpperCase()}`;
      expect(
        aiConfig(capability, {
          AI_GATEWAY_API_KEY: " test-key ",
          TRANSCRIBE_PROVIDER: " gateway ",
          [variable]: " mock/Model_v1.2:latest ",
        }),
      ).toEqual({
        ok: true,
        config: { provider: "gateway", apiKey: "test-key", modelId: "mock/Model_v1.2:latest" },
      });
    }
  });
  it("a slashless id with ANTHROPIC_API_KEY resolves to the direct Anthropic route", () => {
    for (const capability of ["extract", "translate", "compose", "entail"] as const) {
      stubConfig({
        ANTHROPIC_API_KEY: "mock-anthropic-key",
        AI_GATEWAY_API_KEY: "mock-gateway-key",
        [`AI_MODEL_${capability.toUpperCase()}`]: "claude-sonnet-5-5",
      });
      expect(aiConfig(capability, process.env)).toEqual({
        ok: true,
        config: {
          provider: "anthropic",
          apiKey: "mock-anthropic-key",
          modelId: "claude-sonnet-5-5",
        },
      });
    }
  });
  it("a slashless id without the key fails closed naming ANTHROPIC_API_KEY", () => {
    stubConfig({ AI_GATEWAY_API_KEY: "mock-gateway-key", AI_MODEL_EXTRACT: "claude-sonnet-5-5" });
    expect(aiConfig("extract", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("ANTHROPIC_API_KEY"),
    });
  });
  it("a vendor/model id with AI_GATEWAY_API_KEY resolves to the gateway", () => {
    stubConfig({
      ANTHROPIC_API_KEY: "mock-anthropic-key",
      AI_GATEWAY_API_KEY: "mock-gateway-key",
      AI_MODEL_TRANSLATE: "anthropic/claude-sonnet-5-5",
    });
    expect(aiConfig("translate", process.env)).toEqual({
      ok: true,
      config: {
        provider: "gateway",
        apiKey: "mock-gateway-key",
        modelId: "anthropic/claude-sonnet-5-5",
      },
    });
  });
  it("a vendor/model id without the gateway key fails closed naming AI_GATEWAY_API_KEY", () => {
    stubConfig({ ANTHROPIC_API_KEY: "mock-anthropic-key", AI_MODEL_TRANSLATE: "mock/model" });
    expect(aiConfig("translate", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("AI_GATEWAY_API_KEY"),
    });
  });
  it("an id with spaces is trimmed", () => {
    stubConfig({ ANTHROPIC_API_KEY: " mock-key ", AI_MODEL_EXTRACT: "  claude-sonnet-5-5  " });
    expect(aiConfig("extract", process.env)).toEqual({
      ok: true,
      config: { provider: "anthropic", apiKey: "mock-key", modelId: "claude-sonnet-5-5" },
    });
  });
  it("an empty id fails with a reason", () => {
    stubConfig({ ANTHROPIC_API_KEY: "mock-key", AI_MODEL_EXTRACT: " " });
    expect(aiConfig("extract", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("AI_MODEL_EXTRACT"),
    });
  });
  it("transcribe with only an Anthropic key fails closed and mentions the typed-transcript fallback", () => {
    stubConfig({
      ANTHROPIC_API_KEY: "mock-key",
      TRANSCRIBE_PROVIDER: "gateway",
      TRANSCRIBE_MODEL: "mock/transcriber",
    });
    const result = aiConfig("transcribe", process.env);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("AI_GATEWAY_API_KEY") });
    if (!result.ok) expect(result.reason).toContain("typed-transcript fallback");
  });
  it("transcribe refuses slashless ids even when both keys exist", () => {
    stubConfig({
      ANTHROPIC_API_KEY: "mock-key",
      ...configured,
      TRANSCRIBE_MODEL: "claude-sonnet-5-5",
    });
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("gateway model id"),
    });
  });
  it("no failure reason is ever an empty string", () => {
    for (const capability of AI_CAPABILITIES) {
      const variable =
        capability === "transcribe" ? "TRANSCRIBE_MODEL" : `AI_MODEL_${capability.toUpperCase()}`;
      const failures = [
        {},
        { [variable]: "claude-sonnet-5-5" },
        { [variable]: "mock/model", ANTHROPIC_API_KEY: "mock-key" },
        { ...configured, TRANSCRIBE_PROVIDER: "direct", [variable]: "mock/model" },
        ...[
          undefined,
          "",
          " ",
          "/model",
          "Vendor/model",
          "vendor/model/path",
          "bad model",
          "bad?",
        ].map((modelId) => ({ ...configured, [variable]: modelId })),
      ];
      for (const values of failures) {
        // The provider-switch case is a failure only for transcription.
        if (values.TRANSCRIBE_PROVIDER === "direct" && capability !== "transcribe") continue;
        stubConfig(values);
        const result = aiConfig(capability, process.env);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason.trim().length).toBeGreaterThan(0);
          expect(result.reason).not.toContain("mock-key");
          expect(result.reason).not.toContain("test-key");
        }
      }
    }
  });
});

describe("openai-compatible config", () => {
  const compatible = {
    TRANSCRIBE_PROVIDER: "openai-compatible",
    TRANSCRIBE_BASE_URL: "https://mock.invalid/openai/v1///",
    TRANSCRIBE_API_KEY: "mock-compatible-key",
    TRANSCRIBE_MODEL: "whisper-large-v3",
  };
  it("openai-compatible with all variables resolves", () => {
    stubConfig(compatible);
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: true,
      config: {
        provider: "openai-compatible",
        baseURL: "https://mock.invalid/openai/v1",
        apiKey: "mock-compatible-key",
        modelId: "whisper-large-v3",
        maxBytes: 24000000,
      },
    });
  });
  it("each missing variable fails closed naming it", () => {
    for (const variable of Object.keys(compatible)) {
      for (const value of [undefined, "", " "]) {
        stubConfig({ ...compatible, [variable]: value });
        expect(aiConfig("transcribe", process.env)).toEqual({
          ok: false,
          reason: expect.stringContaining(variable),
        });
      }
    }
  });
  it("a non-https or credentialed base URL is refused", () => {
    for (const baseURL of [
      "http://mock.invalid/v1",
      "https://user:password@mock.invalid/v1",
      "https://user@mock.invalid/v1",
      "invalid",
      "https://",
      "https://mock.invalid/v1?key=mock-secret",
      "https://mock.invalid/v1#secret",
    ]) {
      stubConfig({ ...compatible, TRANSCRIBE_BASE_URL: baseURL });
      const result = aiConfig("transcribe", process.env);
      expect(result).toEqual({ ok: false, reason: expect.stringContaining("TRANSCRIBE_BASE_URL") });
      if (!result.ok) expect(result.reason).not.toMatch(/password|mock-secret/);
    }
  });
  it("TRANSCRIBE_MAX_BYTES defaults to 24000000 and a bad value is refused", () => {
    for (const value of [
      "",
      " ",
      "0",
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      "24MB",
      "1e6",
      "9007199254740992",
    ]) {
      stubConfig({ ...compatible, TRANSCRIBE_MAX_BYTES: value });
      expect(aiConfig("transcribe", process.env)).toEqual({
        ok: false,
        reason: expect.stringContaining("TRANSCRIBE_MAX_BYTES"),
      });
    }
    for (const [value, expected] of [
      [undefined, 24000000],
      [" 1000000 ", 1000000],
    ] as const) {
      stubConfig({ ...compatible, TRANSCRIBE_MAX_BYTES: value });
      expect(aiConfig("transcribe", process.env)).toMatchObject({
        ok: true,
        config: { maxBytes: expected },
      });
    }
  });
  it("gateway still resolves as before", () => {
    stubConfig({
      ...configured,
      TRANSCRIBE_MODEL: "mock/transcriber",
      TRANSCRIBE_BASE_URL: "http://invalid",
      TRANSCRIBE_MAX_BYTES: "bad",
    });
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: true,
      config: { provider: "gateway", apiKey: "test-key", modelId: "mock/transcriber" },
    });
  });
  it("an unknown provider lists the valid ones", () => {
    stubConfig({ ...compatible, TRANSCRIBE_PROVIDER: "unknown" });
    const result = aiConfig("transcribe", process.env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("TRANSCRIBE_PROVIDER");
      expect(result.reason).toContain("gateway");
      expect(result.reason).toContain("openai-compatible");
    }
  });
  it("no failure reason is ever empty", () => {
    for (const invalid of [
      { TRANSCRIBE_MODEL: "bad model" },
      { TRANSCRIBE_API_KEY: "mock\nkey" },
      { TRANSCRIBE_BASE_URL: "http://invalid" },
      { TRANSCRIBE_MAX_BYTES: "bad" },
    ]) {
      stubConfig({ ...compatible, ...invalid });
      const result = aiConfig("transcribe", process.env);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Meta Model API", () => {
  it("meta:model routes a language capability to Meta with META_API_KEY", () => {
    for (const capability of ["extract", "translate", "compose", "entail"] as const) {
      stubConfig({
        ANTHROPIC_API_KEY: "mock-anthropic-key",
        META_API_KEY: " mock-meta-key ",
        [`AI_MODEL_${capability.toUpperCase()}`]: " meta:muse-spark-1.3 ",
      });
      expect(aiConfig(capability, process.env)).toEqual({
        ok: true,
        config: { provider: "meta", apiKey: "mock-meta-key", modelId: "muse-spark-1.3" },
      });
    }
  });
  it("meta:model without META_API_KEY fails closed naming it, never falling back", () => {
    stubConfig({
      ANTHROPIC_API_KEY: "mock-anthropic-key",
      AI_MODEL_EXTRACT: "meta:muse-spark-1.3",
    });
    expect(aiConfig("extract", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("META_API_KEY"),
    });
  });
  it("a malformed meta id or key is refused, and no reason contains the key", () => {
    for (const [model, key] of [
      ["meta:", "recognisable-fake-secret"],
      ["meta:bad model", "recognisable-fake-secret"],
      ["meta:meta/muse", "recognisable-fake-secret"],
      ["meta:muse-spark-1.3", "recognisable-fake-secret\nsecond-line"],
    ]) {
      stubConfig({
        ANTHROPIC_API_KEY: "mock-anthropic-key",
        META_API_KEY: key,
        AI_MODEL_TRANSLATE: model,
      });
      const result = aiConfig("translate", process.env);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).not.toContain("recognisable-fake-secret");
    }
  });
  it("TRANSCRIBE_PROVIDER=meta needs a model id and META_API_KEY", () => {
    stubConfig({ TRANSCRIBE_PROVIDER: "meta", META_API_KEY: "mock-meta-key" });
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("TRANSCRIBE_MODEL"),
    });
    stubConfig({ TRANSCRIBE_PROVIDER: "meta", TRANSCRIBE_MODEL: "muse-voice-transcribe-1.0" });
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: false,
      reason: expect.stringContaining("META_API_KEY"),
    });
    stubConfig({
      TRANSCRIBE_PROVIDER: " meta ",
      TRANSCRIBE_MODEL: " muse-voice-transcribe-1.0 ",
      META_API_KEY: "mock-meta-key",
    });
    expect(aiConfig("transcribe", process.env)).toEqual({
      ok: true,
      config: { provider: "meta", apiKey: "mock-meta-key", modelId: "muse-voice-transcribe-1.0" },
    });
    stubConfig({
      TRANSCRIBE_PROVIDER: "meta",
      TRANSCRIBE_MODEL: "meta/muse voice",
      META_API_KEY: "mock-meta-key",
    });
    expect(aiConfig("transcribe", process.env).ok).toBe(false);
  });
});
