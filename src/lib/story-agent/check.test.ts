import { describe, expect, it } from "vitest";
import { CheckOutputError } from "../ai/translation-check";
import { parseSentenceReport, storyCheckPrompt } from "./check";

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
