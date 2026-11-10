import { createAnthropic } from "@ai-sdk/anthropic";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createLanguageModel } from "@/lib/ai/claim-extractor";
import { aiConfig } from "@/lib/ai/config";
import {
  CHECK_MAX_TOKENS_NATIVE,
  CheckOutputError,
  classifyCheckError,
  describeCheckError,
} from "@/lib/ai/translation-check";
import {
  createStoryChecker,
  parseSentenceReport,
  storyCheckPrompt,
  type SentenceInput,
} from "@/lib/story-agent/check";

describe("parseSentenceReport", () => {
  it("passes only a sentence the checker supports and lists nothing against", () => {
    expect(parseSentenceReport({ supported: true, added: [] })).toEqual({
      supported: true,
      added: [],
    });
    expect(parseSentenceReport({ supported: true, added: ["a date"] }).supported).toBe(false);
    expect(parseSentenceReport({ supported: false, added: [] }).supported).toBe(false);
  });

  it("refuses a report without a usable verdict or list", () => {
    expect(() => parseSentenceReport(null)).toThrow(CheckOutputError);
    expect(() => parseSentenceReport({ added: [] })).toThrow(CheckOutputError);
    expect(() => parseSentenceReport({ supported: true, added: "a date" })).toThrow(
      CheckOutputError,
    );
  });

  it("cleans the list: trimmed, without repeats or blanks, at most five", () => {
    const added = ["  a   date ", "a date", " ", "b", "c", "d", "e", "f"];
    expect(parseSentenceReport({ supported: false, added }).added).toEqual([
      "a date",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("storyCheckPrompt", () => {
  it("gives the checker the sentence and only the words it cites", () => {
    const { prompt, system } = storyCheckPrompt({
      en: "A reviewer heard it began as a stall.",
      ja: "屋台から始まったと聞いた人がいます。",
      words: ["屋台から始めた店だそうです"],
    });
    expect(prompt).toContain("A reviewer heard it began as a stall.");
    expect(prompt).toContain("- 屋台から始めた店だそうです");
    expect(system).toContain("そうです");
  });
});

describe("the story check with Claude", () => {
  // Fictional shop, as in the endpoint probe.
  const supportedSentence: SentenceInput = {
    en: "You eat the pudding here with chopsticks, one visitor says.",
    ja: "ここではプリンを箸で食べる、と訪れた人は言います。",
    words: ["プリンは箸で食べるデザートでした"],
  };
  const inventedSentence: SentenceInput = {
    en: "The owner's grandfather founded it in 1925.",
    ja: "オーナーの祖父が1925年に創業しました。",
    words: ["大正14年創業"],
  };
  const PASS = { supported: true, added: [] };
  const FAIL = { supported: false, added: ["the owner's grandfather"] };

  function answering(
    text: string,
    finish: "stop" | "length" | "content-filter" | "other" = "stop",
  ) {
    return new MockLanguageModelV4({
      provider: "anthropic.messages",
      modelId: "claude-haiku-5-5",
      doGenerate: async () => ({
        content: text ? [{ type: "text" as const, text }] : [],
        finishReason: { unified: finish, raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    });
  }
  const native = (model: MockLanguageModelV4) =>
    createStoryChecker({ model, reportMode: "native" });

  it("asks for structured output with the report schema, not for a forced tool call", async () => {
    const model = answering(JSON.stringify(PASS));
    await native(model).check(supportedSentence);
    expect(model.doGenerateCalls).toHaveLength(1);
    const [call] = model.doGenerateCalls;
    expect(call).toMatchObject({
      responseFormat: {
        type: "json",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["supported", "added"],
        },
      },
      maxOutputTokens: CHECK_MAX_TOKENS_NATIVE,
    });
    expect(call!.tools ?? []).toEqual([]);
    expect(call!.toolChoice?.type ?? "auto").toBe("auto");
    expect(call!.temperature).toBeUndefined();
    expect(JSON.stringify(call!.prompt)).toContain("Sentence (English)");
  });

  it("passes a sentence its cited words support", async () => {
    expect(await native(answering(JSON.stringify(PASS))).check(supportedSentence)).toEqual(PASS);
  });

  it("fails a sentence that adds something, and lists it", async () => {
    expect(await native(answering(JSON.stringify(FAIL))).check(inventedSentence)).toEqual(FAIL);
  });

  it("does not pass a sentence the checker calls supported while listing a claim", async () => {
    const report = { supported: true, added: ["a date"] };
    expect(await native(answering(JSON.stringify(report))).check(inventedSentence)).toEqual({
      supported: false,
      added: ["a date"],
    });
  });

  const unreadable: [string, string, "stop" | "length" | "content-filter" | "other"][] = [
    ["text that is not JSON", "Yes, the words support it.", "stop"],
    ["JSON that is not an object", "[]", "stop"],
    ["JSON cut off in the middle", '{"supported": true, "added": [', "stop"],
    ["an object without a verdict", "{}", "stop"],
    ["a verdict that is not a boolean", '{"supported":"yes","added":[]}', "stop"],
    ["a list that is not a list of claims", '{"supported":false,"added":"a date"}', "stop"],
    ["an empty answer", "", "stop"],
    ["a passing report cut off at max tokens", JSON.stringify(PASS), "length"],
    ["a passing report from a refused request", JSON.stringify(PASS), "content-filter"],
    ["a refusal with no text", "", "content-filter"],
    ["a passing report with an unknown stop", JSON.stringify(PASS), "other"],
  ];
  it.each(unreadable)("fails closed on %s", async (_name, text, finish) => {
    const error = await native(answering(text, finish))
      .check(supportedSentence)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CheckOutputError);
    expect(classifyCheckError(error)).toBe("fail");
    expect(describeCheckError(error)).not.toContain("プリン");
  });

  it("lets a provider error through unchanged, so overload is retried", async () => {
    const model = new MockLanguageModelV4({
      provider: "anthropic.messages",
      doGenerate: async () => {
        throw new APICallError({
          message: "Overloaded",
          url: "https://api.anthropic.com/v1/messages",
          requestBodyValues: {},
          statusCode: 529,
        });
      },
    });
    const error = await native(model)
      .check(supportedSentence)
      .catch((caught: unknown) => caught);
    expect(APICallError.isInstance(error)).toBe(true);
    expect(classifyCheckError(error)).toBe("retry");
  });

  it("wake is an ordinary short request that does not read the answer", async () => {
    const model = answering("", "length");
    await expect(native(model).wake()).resolves.toBeUndefined();
    expect(model.doGenerateCalls[0]).toMatchObject({ maxOutputTokens: 16 });
    expect(model.doGenerateCalls[0]!.responseFormat?.type ?? "text").toBe("text");
  });

  describe("on the wire to Anthropic", () => {
    function message(text: string, stopReason = "end_turn") {
      return Response.json({
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [{ type: "text", text }],
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }
    function wired(setting: string, response: () => Response) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
      const result = aiConfig("check_story", {
        ANTHROPIC_API_KEY: "mock-anthropic-key",
        AI_MODEL_CHECK_STORY: setting,
      });
      if (!result.ok) throw new Error(result.reason);
      const unused = () => () => {
        throw new Error("wrong provider");
      };
      const model = createLanguageModel(result.config, {
        anthropic: (options) => createAnthropic({ ...options, fetch }),
        gateway: unused,
        meta: unused,
        modal: unused,
      });
      return { fetch, checker: createStoryChecker({ model, reportMode: "native" }) };
    }

    it.each(["claude-sonnet-5-5", "claude-haiku-5-5"])(
      "sends %s one structured-output request: no tool_choice, no tools, no sampling or thinking settings",
      async (setting) => {
        const { fetch, checker } = wired(setting, () => message(JSON.stringify(FAIL)));
        expect(await checker.check(inventedSentence)).toEqual(FAIL);
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0]!;
        expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
        expect(new Headers(init!.headers).get("x-api-key")).toBe("mock-anthropic-key");
        const body = JSON.parse(String(init!.body));
        expect(body).toMatchObject({
          model: setting,
          max_tokens: CHECK_MAX_TOKENS_NATIVE,
          output_config: {
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["supported", "added"],
              },
            },
          },
        });
        for (const field of ["tool_choice", "tools", "temperature", "top_p", "top_k", "thinking"])
          expect(body).not.toHaveProperty(field);
        expect(JSON.stringify(body.messages)).toContain("大正14年創業");
      },
    );

    it("a refusal and a max_tokens stop are failed checks, never passes", async () => {
      for (const stopReason of ["refusal", "max_tokens"]) {
        const { checker } = wired("claude-haiku-5-5", () =>
          message(JSON.stringify(PASS), stopReason),
        );
        const error = await checker.check(supportedSentence).catch((caught: unknown) => caught);
        expect(error, stopReason).toBeInstanceOf(CheckOutputError);
      }
    });
  });
});
