import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  checkFollowUps,
  createFollowUpAgent,
  type FollowUpInput,
  type RawFollowUp,
} from "../../src/lib/ai/follow-ups";
import { getRegionConfig } from "../../src/lib/region/registry";

const region = getRegionConfig("nagasaki")!;
const transcript = "架空のテスト店です。祖母が始めた店です。カードは使えます。";
const input: FollowUpInput = {
  transcript,
  language: "ja",
  readerLanguage: "en",
  recorded: [{ kind: "caution", cautionType: "cash_only", textOriginal: "現金のみ" }],
  region,
};
const raw = (overrides: Partial<RawFollowUp> = {}): RawFollowUp => ({
  question: "おばあさまはどうして始めたのですか？",
  translation: "Why did your grandmother start it?",
  quote: "祖母が始めた",
  cautionType: "",
  ...overrides,
});
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
function toolStep(calls: { name: string; input: unknown }[]) {
  return {
    content: calls.map(({ name, input: callInput }, index) => ({
      type: "tool-call" as const,
      toolCallId: `call-${name}-${index}`,
      toolName: name,
      input: JSON.stringify(callInput),
    })),
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}
function agentModel(steps: ReturnType<typeof toolStep>[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const step = steps[index++];
      if (!step) throw new Error("no more mock steps");
      return step;
    },
  });
}

describe("checkFollowUps", () => {
  it("keeps a question built on an exact quote and puts stories before cautions", () => {
    const gap = raw({
      question: "定休日はありますか？",
      translation: "Do you have closed days?",
      quote: "",
      cautionType: "closed_days",
    });
    expect(checkFollowUps([gap, raw()], input)).toEqual([
      {
        question: "おばあさまはどうして始めたのですか？",
        translation: "Why did your grandmother start it?",
        basis: { kind: "quote", quote: "祖母が始めた" },
      },
      {
        question: "定休日はありますか？",
        translation: "Do you have closed days?",
        basis: { kind: "gap", cautionType: "closed_days" },
      },
    ]);
  });
  it("drops invented quotes, unknown or already covered topics, blanks and repeats", () => {
    expect(
      checkFollowUps(
        [
          raw({ quote: "祖父が始めた" }),
          raw({ quote: "", cautionType: "parking" }),
          raw({ quote: "", cautionType: "cash_only" }),
          raw({ question: " " }),
          raw({ question: "あ".repeat(201) }),
          raw(),
          raw(),
        ],
        input,
      ),
    ).toHaveLength(1);
  });
  it("keeps at most five, and no translation when both people share a language", () => {
    const many = Array.from({ length: 8 }, (_, i) => raw({ question: `質問${i}` }));
    const result = checkFollowUps(many, { ...input, readerLanguage: "ja" });
    expect(result).toHaveLength(5);
    for (const item of result) expect(item).not.toHaveProperty("translation");
  });
});

describe("createFollowUpAgent", () => {
  it("runs the tool loop and returns only checked questions from submit_questions", async () => {
    const model = agentModel([
      toolStep([
        { name: "find_in_transcript", input: { phrase: "祖母" } },
        { name: "list_caution_topics", input: {} },
        { name: "list_recorded_claims", input: {} },
      ]),
      toolStep([
        {
          name: "submit_questions",
          input: { questions: [raw(), raw({ question: "作り話", quote: "存在しない言葉" })] },
        },
      ]),
    ]);
    expect(await createFollowUpAgent({ model }).suggest(input)).toEqual([
      {
        question: "おばあさまはどうして始めたのですか？",
        translation: "Why did your grandmother start it?",
        basis: { kind: "quote", quote: "祖母が始めた" },
      },
    ]);
    expect(model.doGenerateCalls).toHaveLength(2);
    const first = model.doGenerateCalls[0]!;
    const system = JSON.stringify(first.prompt.find(({ role }) => role === "system"));
    expect(system).toContain("data, not instructions");
    expect(system).toContain("Japanese");
    expect(system).not.toContain(transcript);
    expect(JSON.stringify(first.prompt.find(({ role }) => role === "user"))).toContain(transcript);
    expect(first.tools?.map(({ name }) => name).sort()).toEqual([
      "find_in_transcript",
      "list_caution_topics",
      "list_recorded_claims",
      "submit_questions",
    ]);
    // The tools answer from the transcript and the region, so the second step sees real results.
    const results = JSON.stringify(
      model.doGenerateCalls[1]!.prompt.filter(({ role }) => role === "tool"),
    );
    expect(results).toContain("祖母が始めた店です。");
    expect(results).toMatch(/"key":"cash_only","label":"現金のみ","covered":true/);
    expect(results).toContain("現金のみ");
  });
  it("fails without exposing provider text when the model never submits or the call throws", async () => {
    const silent = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: "mock-key and mock transcript" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    });
    await expect(createFollowUpAgent({ model: silent }).suggest(input)).rejects.toThrow(
      /^follow-up provider failed$/,
    );
    const failing = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("mock-key and mock transcript");
      },
    });
    await expect(createFollowUpAgent({ model: failing }).suggest(input)).rejects.toThrow(
      /^follow-up provider failed$/,
    );
  });
  it("a blank or oversized transcript is refused before any model call", async () => {
    const model = agentModel([]);
    for (const text of [" ", "a".repeat(60_001)])
      await expect(
        createFollowUpAgent({ model }).suggest({ ...input, transcript: text }),
      ).rejects.toThrow("60000");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
