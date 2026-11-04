import { describe, expect, it, vi, type Mock } from "vitest";
import { runStoryAgent, type StoryStep } from "@/lib/story-agent/agent";
import type { ReportedStory, StoryWriter } from "@/lib/story-agent/story";
import type { StoryChecker } from "@/lib/story-agent/check";

// All posts are made up.
const posts = [
  { id: "a", platform: "google_reviews", text: "店主の祖父が屋台から始めた店だそうです。" },
  { id: "b", platform: "web", text: "二階の窓から港を出る船が見えます。" },
];
const place = { names: [{ lang: "ja", value: "テスト店" }] };
const good = {
  en: "One reviewer heard it began as a street stall.",
  ja: "屋台から始まったと聞いた人がいます。",
  citations: [{ post: 1, words: "店主の祖父が屋台から始めた店だそうです" }],
};
const harbour = {
  en: "From upstairs you can watch ships leave the harbour.",
  ja: "二階から港を出る船が見えます。",
  citations: [{ post: 2, words: "二階の窓から港を出る船が見えます" }],
};
const invented = { ...harbour, citations: [{ post: 2, words: "海が見える特等席です" }] };
const stated = {
  ...good,
  en: "It began as a street stall in 1950.",
  ja: "1950年に屋台から始まりました。",
};

function setup(drafts: ReportedStory[], flagged: Record<string, string[]> = {}) {
  const steps: StoryStep[] = [];
  const write: Mock<StoryWriter["write"]> = vi.fn(async () => {
    const next = drafts[write.mock.calls.length - 1];
    if (!next) throw new Error("the writer was called too often");
    return next;
  });
  const check = vi.fn<StoryChecker["check"]>(async ({ en }) => {
    const added = flagged[en] ?? [];
    return { supported: added.length === 0, added };
  });
  const deps = {
    writer: { write },
    checker: { check, wake: async () => {} },
    step: async (step: StoryStep) => void steps.push(step),
  };
  return { steps, write, check, run: () => runStoryAgent({ place, posts }, deps) };
}

describe("runStoryAgent", () => {
  it("publishes a clean draft after one read of each sentence", async () => {
    const agent = setup([{ sentences: [good, harbour] }]);
    const sentences = await agent.run();
    expect(sentences.map(({ en }) => en)).toEqual([good.en, harbour.en]);
    expect(agent.write).toHaveBeenCalledTimes(1);
    expect(agent.check).toHaveBeenCalledTimes(2);
    expect(agent.steps.map(({ kind }) => kind)).toEqual(["read", "drafted", "checked", "checked"]);
    expect(agent.steps[0]).toMatchObject({ count: 2, detail: "google_reviews, web" });
  });

  it("hands rejected citations back once, and drops what is still wrong", async () => {
    const agent = setup([{ sentences: [good, invented] }, { sentences: [good, invented] }]);
    const sentences = await agent.run();
    expect(sentences.map(({ en }) => en)).toEqual([good.en]);
    expect(agent.write).toHaveBeenCalledTimes(2);
    expect(agent.write.mock.calls[1]?.[0].feedback?.problems[0]).toContain("海が見える特等席です");
    expect(agent.steps.map(({ kind }) => kind)).toEqual([
      "read",
      "drafted",
      "citation_rejected",
      "rewrote",
      "dropped",
      "checked",
    ]);
  });

  it("keeps a sentence the rewrite fixed", async () => {
    const agent = setup([{ sentences: [invented] }, { sentences: [harbour] }]);
    expect((await agent.run()).map(({ en }) => en)).toEqual([harbour.en]);
  });

  it("sends the second reader's findings back, and reads only what changed", async () => {
    const agent = setup([{ sentences: [stated, harbour] }, { sentences: [good, harbour] }], {
      [stated.en]: ["the year 1950"],
    });
    const sentences = await agent.run();
    expect(sentences.map(({ en }) => en)).toEqual([good.en, harbour.en]);
    expect(agent.write.mock.calls[1]?.[0].feedback?.problems[0]).toContain("the year 1950");
    // The draft's two sentences, then only the rewritten one.
    expect(agent.check.mock.calls.map(([input]) => input.en)).toEqual([
      stated.en,
      harbour.en,
      good.en,
    ]);
  });

  it("drops a sentence the second reader flags twice", async () => {
    const agent = setup([{ sentences: [stated] }, { sentences: [stated] }], {
      [stated.en]: ["the year 1950"],
    });
    expect(await agent.run()).toEqual([]);
    expect(agent.steps.at(-1)).toMatchObject({ kind: "dropped", detail: "the year 1950" });
  });

  it("does nothing more when the writer finds nothing worth telling", async () => {
    const agent = setup([{ sentences: [] }]);
    expect(await agent.run()).toEqual([]);
    expect(agent.check).not.toHaveBeenCalled();
  });

  it("lets a failure from a model reach the caller", async () => {
    const agent = setup([]);
    await expect(agent.run()).rejects.toThrow("called too often");
  });
});
