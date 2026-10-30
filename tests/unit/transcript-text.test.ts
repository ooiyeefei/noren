import { describe, expect, it } from "vitest";
import {
  quoteAt,
  quoteMatches,
  segmentRanges,
  transcriptText,
} from "../../src/lib/claims/transcript-text";

describe("transcript text", () => {
  it("joins segments with newlines", () => {
    expect(transcriptText([{ text: " First " }, { text: "" }, { text: "Last" }])).toBe(
      " First \n\nLast",
    );
    expect(transcriptText([])).toBe("");
  });

  it("segmentRanges point at each segment's text", () => {
    const segments = [{ text: "one" }, { text: "" }, { text: "three" }];
    const text = transcriptText(segments);
    const ranges = segmentRanges(segments);
    expect(ranges).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 4 },
      { start: 5, end: 10 },
    ]);
    expect(ranges.map(({ start, end }) => text.slice(start, end))).toEqual(
      segments.map((segment) => segment.text),
    );
    expect(segmentRanges([])).toEqual([]);
  });

  it("quoteAt returns the slice", () => {
    expect(quoteAt("one\ntwo", 4, 7)).toBe("two");
    expect(quoteAt("one\ntwo", 0, 7)).toBe("one\ntwo");
  });

  it("quoteAt refuses negative, reversed, empty, fractional and out-of-range spans", () => {
    for (const [start, end] of [
      [-1, 2],
      [2, -1],
      [3, 1],
      [2, 2],
      [0.5, 2],
      [0, 2.5],
      [0, 4],
      [4, 5],
      [NaN, 2],
      [0, Infinity],
    ]) {
      expect(quoteAt("abc", start!, end!)).toBeNull();
    }
    expect(quoteAt("", 0, 0)).toBeNull();
  });

  it("quoteMatches accepts a quote equal to the slice, including surrogate pairs", () => {
    expect(quoteMatches("A mock story here.", 2, 12, "mock story")).toBe(true);
    expect(quoteMatches(" padded ", 0, 8, " padded ")).toBe(true);
    expect(quoteMatches("喫茶𠮷です。", 2, 4, "𠮷")).toBe(true);
    expect(quoteMatches("one\ntwo", 0, 7, "one\ntwo")).toBe(true);
  });

  it("a whole-transcript span with the quote '。' is refused", () => {
    const text = "これは架空のテストです。";
    expect(quoteMatches(text, 0, text.length, "。")).toBe(false);
    expect(quoteMatches(" padded ", 0, 8, "padded")).toBe(false);
  });

  it("rejects a blank quote", () => {
    expect(quoteMatches(" \n\t", 0, 3, "")).toBe(false);
    expect(quoteMatches(" \n\t", 0, 3, " \n\t")).toBe(false);
  });

  it("rejects a quote outside the span", () => {
    expect(quoteMatches("one\ntwo", 0, 3, "two")).toBe(false);
    expect(quoteMatches("one\ntwo", 0, 3, "e\nt")).toBe(false);
    expect(quoteMatches("one", -1, 3, "one")).toBe(false);
    expect(quoteMatches("one", 0, 3, "ONE")).toBe(false);
  });

  it("Japanese text with a surrogate pair keeps consistent offsets", () => {
    const segments = [{ text: "𠮷です" }, { text: "喫茶𠮷" }];
    const text = transcriptText(segments);
    expect(text).toBe("𠮷です\n喫茶𠮷");
    expect(segmentRanges(segments)).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
    expect(quoteAt(text, 0, 2)).toBe("𠮷");
    expect(quoteAt(text, 5, 9)).toBe("喫茶𠮷");
    expect(quoteMatches(text, 5, 9, "𠮷")).toBe(false);
    expect(quoteMatches(text, 5, 9, "喫茶𠮷")).toBe(true);
  });
});
