import { describe, expect, it } from "vitest";
import {
  answersParam,
  cleanQuestion,
  newestAsked,
  openQuestion,
  parseAnswers,
  starterFor,
  starterText,
} from "@/lib/slip/question";
import { STAFFED_CATEGORIES, STARTER_QUESTIONS } from "@/lib/slip/starter-questions";

describe("the starter list", () => {
  it("has about eight entries with unique plain keys, both languages, and both kinds", () => {
    expect(STARTER_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    const keys = STARTER_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of STARTER_QUESTIONS) {
      expect(q.key).toMatch(/^[a-z0-9]+$/);
      expect(q.en.length).toBeGreaterThan(5);
      expect(q.ja).toMatch(/[\p{Script=Han}\p{Script=Hiragana}]/u);
      expect(q.en + q.ja).not.toMatch(/https?:|@|best|rank|star/i);
    }
    expect(new Set(STARTER_QUESTIONS.map((q) => q.for))).toEqual(new Set(["staffed", "any"]));
  });

  it("only names categories the region has", async () => {
    const region = (await import("../../regions/nagasaki.json")).default as {
      categories: { key: string }[];
    };
    const known = region.categories.map((c) => c.key);
    for (const key of STAFFED_CATEGORIES) expect(known).toContain(key);
  });
});

describe("cleanQuestion", () => {
  it("trims and collapses whitespace and newlines to one line", () => {
    expect(cleanQuestion("  a \n\n b\t c ")).toEqual({ ok: true, text: "a b c" });
  });
  it("accepts 140 characters and refuses 141 or none", () => {
    expect(cleanQuestion("a".repeat(140)).ok).toBe(true);
    expect(cleanQuestion("a".repeat(141))).toEqual({ ok: false, reason: "long" });
    expect(cleanQuestion(" \n ")).toEqual({ ok: false, reason: "empty" });
  });
  it.each([
    "go to https://x.example/y",
    "visit www.example.org",
    "mail me@example.com",
    "ask @tanaka",
    "call 090-1234-5678",
    "電話は０９０１２３４５６７８です",
  ])("refuses contact details: %s", (text) => {
    expect(cleanQuestion(text)).toEqual({ ok: false, reason: "contact" });
  });
  it("accepts ordinary Japanese and years", () => {
    expect(cleanQuestion("1962年から、この看板は誰が描いていますか？").ok).toBe(true);
  });
});

describe("the answers parameter", () => {
  it("round-trips a story and a starter", () => {
    expect(parseAnswers("story:k17abc123def")).toEqual({ kind: "story", storyId: "k17abc123def" });
    expect(parseAnswers("starter:oldest")).toEqual({ kind: "starter", key: "oldest" });
    expect(answersParam({ kind: "starter", key: "oldest" })).toBe("starter:oldest");
    expect(answersParam({ kind: "story", storyId: "k17abc123def" })).toBe("story:k17abc123def");
  });
  it.each([
    undefined,
    null,
    "",
    "story",
    "story:",
    "story:a b",
    "story:../x",
    "starter:nope",
    "x:y",
  ])("rejects %s", (raw) => expect(parseAnswers(raw)).toBeNull());
});

describe("the open question", () => {
  const story = (id: string, addedAt: number, nextQuestion?: string) => ({
    id,
    addedAt,
    nextQuestion,
  });

  it("is the newest shown story's question, whatever the order given", () => {
    const shown = [story("a", 1, "Old?"), story("c", 3), story("b", 2, "Newer?")];
    expect(openQuestion({ placeId: "p", category: "cafe", shown })).toEqual({
      kind: "story",
      storyId: "b",
      text: "Newer?",
    });
    expect(newestAsked([story("z", 9)])).toBeUndefined();
  });

  it("is a starter when no story has one, the same every time", () => {
    const first = openQuestion({ placeId: "p1", category: "cafe", shown: [story("a", 1)] });
    expect(first.kind).toBe("starter");
    expect(openQuestion({ placeId: "p1", category: "cafe", shown: [] })).toEqual(first);
  });

  it("gives an unstaffed place only questions that work anywhere", () => {
    for (let i = 0; i < 200; i++) {
      expect(starterFor(`park-${i}`, "attraction").for).toBe("any");
      expect(starterFor(`park-${i}`, undefined).for).toBe("any");
    }
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => starterFor(`c-${i}`, "cafe").for));
    expect(kinds).toEqual(new Set(["staffed", "any"]));
  });

  it("reads a starter in each language", () => {
    expect(starterText("oldest", "en")).toMatch(/oldest/);
    expect(starterText("oldest", "ja")).toMatch(/古い/);
    expect(starterText("gone", "en")).toBeUndefined();
  });
});
