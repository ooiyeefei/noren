import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  createStoryWriter,
  storyPrompt,
  verifyStory,
  WORDS_MAX,
  type ReportedStory,
} from "@/lib/story-agent/story";

// All posts are made up.
const posts = [
  {
    id: "a",
    platform: "google_reviews",
    text: "店主の祖父が屋台から始めた店だそうです。 とても 美味しかった。",
  },
  {
    id: "b",
    platform: "web",
    title: "架空の町の喫茶店めぐり",
    text: "二階の窓から港を出る船が見えます。",
  },
];
const WORDS = "店主の祖父が屋台から始めた";
const sentence = (citations: ReportedStory["sentences"][number]["citations"]) => ({
  en: "A reviewer heard it began as a street stall.",
  ja: "屋台から始まったと聞いた人がいます。",
  citations,
});

describe("verifyStory", () => {
  it("keeps a sentence whose words are all in the posts, apart from whitespace", () => {
    const { sentences, problems } = verifyStory(posts, {
      sentences: [
        sentence([
          { post: 1, words: "店主の祖父が屋台から始めた店だそうです。" },
          { post: 1, words: "とても  美味しかった" },
        ]),
      ],
    });
    expect(problems).toEqual([]);
    expect(sentences[0]?.citations.map(({ postId }) => postId)).toEqual(["a", "a"]);
  });

  it("accepts words from a post's title", () => {
    const { sentences } = verifyStory(posts, {
      sentences: [sentence([{ post: 2, words: "架空の町の喫茶店めぐり" }])],
    });
    expect(sentences).toHaveLength(1);
  });

  it.each([
    [
      "words from another post",
      { post: 2, words: "店主の祖父が屋台から始めた" },
      "these words are not in that post",
    ],
    [
      "a translation",
      { post: 1, words: "It began as a street stall" },
      "these words are not in that post",
    ],
    ["no such post", { post: 3, words: "店主の祖父が屋台から始めた" }, "there is no such post"],
    ["post zero", { post: 0, words: "店主の祖父が屋台から始めた" }, "there is no such post"],
    ["too few letters", { post: 1, words: "店主" }, "too short to prove anything"],
    [
      "too long",
      { post: 1, words: "あ".repeat(WORDS_MAX + 1) },
      `longer than ${WORDS_MAX} characters`,
    ],
  ])("fails the whole sentence on %s, even beside a good citation", (_, bad, problem) => {
    const { sentences, problems } = verifyStory(posts, {
      sentences: [sentence([{ post: 1, words: "店主の祖父が屋台から始めた" }, bad])],
    });
    expect(sentences).toEqual([]);
    expect(problems.map((item) => item.problem)).toEqual([problem]);
  });

  it("fails a citation holding contact details", () => {
    const withContact = [
      { id: "c", platform: "web", text: "予約は test@example.com まで連絡してください。" },
    ];
    const { sentences, problems } = verifyStory(withContact, {
      sentences: [sentence([{ post: 1, words: "予約は test@example.com まで" }])],
    });
    expect(sentences).toEqual([]);
    expect(problems[0]?.problem).toBe("holds contact details");
  });

  it("fails a sentence with no citation or missing a language", () => {
    const { sentences, problems } = verifyStory(posts, {
      sentences: [
        sentence([]),
        { ...sentence([{ post: 1, words: "店主の祖父が屋台から始めた" }]), ja: " " },
      ],
    });
    expect(sentences).toEqual([]);
    expect(problems.map((item) => item.problem)).toEqual(["cites nothing", "missing a language"]);
  });

  it("fails a sentence with Japanese in its English", () => {
    const { sentences, problems } = verifyStory(posts, {
      sentences: [
        { ...sentence([{ post: 1, words: WORDS }]), en: "One post speaks of 屋台 here." },
      ],
    });
    expect(sentences).toEqual([]);
    expect(problems[0]?.problem).toBe("the English has Japanese in it");
  });

  it.each(["It moved — one post says so.", "It moved – one post says so."])(
    "fails a sentence with a dash: %s",
    (en) => {
      const { sentences, problems } = verifyStory(posts, {
        sentences: [{ ...sentence([{ post: 1, words: WORDS }]), en }],
      });
      expect(sentences).toEqual([]);
      expect(problems[0]?.problem).toContain("dash");
    },
  );

  it.each([
    "The same write-up says it moved.",
    "Per that same writer, it moved.",
    "Another post says it moved.",
    "A different reviewer says it moved.",
    "That account says it moved.",
  ])("fails a sentence that leans on another: %s", (en) => {
    const { sentences, problems } = verifyStory(posts, {
      sentences: [{ ...sentence([{ post: 1, words: WORDS }]), en }],
    });
    expect(sentences).toEqual([]);
    expect(problems[0]?.problem).toContain("leans on another sentence");
  });

  it("does not mistake an ordinary 'that' for leaning on another sentence", () => {
    const { sentences } = verifyStory(posts, {
      sentences: [
        {
          ...sentence([{ post: 1, words: WORDS }]),
          en: "Two reviewers say that one stall became the shop.",
        },
      ],
    });
    expect(sentences).toHaveLength(1);
  });

  it("keeps a sentence that says who said it without leaning on another", () => {
    const { sentences } = verifyStory(posts, {
      sentences: [
        {
          ...sentence([{ post: 1, words: WORDS }]),
          en: "It began as a stall, one reviewer heard.",
        },
      ],
    });
    expect(sentences).toHaveLength(1);
  });

  it("keeps at most four sentences", () => {
    const one = sentence([{ post: 1, words: "店主の祖父が屋台から始めた" }]);
    const { sentences } = verifyStory(posts, { sentences: Array.from({ length: 6 }, () => one) });
    expect(sentences).toHaveLength(4);
  });
});

describe("storyPrompt", () => {
  const place = { names: [{ lang: "ja", value: "テスト店" }] };

  it("numbers the posts and fences them off from the instructions", () => {
    const prompt = storyPrompt(place, posts);
    expect(prompt).toContain("[Post 1] platform: google_reviews");
    expect(prompt).toContain("[Post 2] platform: web");
    const fence = prompt.match(/=====POSTS-[0-9a-f-]+=====/)?.[0] ?? "";
    expect(prompt.split(fence)).toHaveLength(4);
    expect(prompt.split(fence)[2]).toContain("二階の窓");
  });

  it("hands the last draft and its problems back", () => {
    const previous = { sentences: [sentence([])] };
    const prompt = storyPrompt(place, posts, { previous, problems: ["cites nothing"] });
    expect(prompt).toContain("YOUR LAST DRAFT");
    expect(prompt).toContain("- cites nothing");
  });
});

describe("createStoryWriter on a model that is not forced to call the tool", () => {
  const place = { names: [{ lang: "en", value: "Test Kissa" }] };
  const report = { sentences: [sentence([{ post: 1, words: WORDS }])] };
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };
  const calling = {
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "call_1",
        toolName: "report_story",
        input: JSON.stringify(report),
      },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
  const talking = {
    content: [{ type: "text" as const, text: "Here is the story." }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage,
    warnings: [],
  };

  it("asks with tool_choice auto and the token limit it is given, and asks again after a reply without the call", async () => {
    const model = new MockLanguageModelV4({
      provider: "anthropic.messages",
      doGenerate: [talking, calling],
    });
    const writer = createStoryWriter({ model, forceTool: false, maxOutputTokens: 16_000 });
    expect(await writer.write({ place, posts })).toEqual(report);
    expect(model.doGenerateCalls.map((call) => call.toolChoice)).toEqual([
      { type: "auto" },
      { type: "auto" },
    ]);
    expect(model.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual([16_000, 16_000]);
  });

  it("keeps 8,000 tokens and a forced call unless told otherwise, and gives up after two replies without the call", async () => {
    const forced = new MockLanguageModelV4({ doGenerate: [calling] });
    await createStoryWriter({ model: forced }).write({ place, posts });
    expect(forced.doGenerateCalls[0]).toMatchObject({
      toolChoice: { type: "tool", toolName: "report_story" },
      maxOutputTokens: 8000,
    });
    const silent = new MockLanguageModelV4({ doGenerate: [talking, talking] });
    await expect(
      createStoryWriter({ model: silent, forceTool: false }).write({ place, posts }),
    ).rejects.toThrow("the writer did not call report_story");
    expect(silent.doGenerateCalls).toHaveLength(2);
  });
});
