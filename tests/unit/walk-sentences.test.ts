import { describe, expect, it } from "vitest";
import { firstSentences } from "@/lib/walk/sentences";

describe("firstSentences", () => {
  it("takes the first two sentences word for word", () => {
    expect(firstSentences("It is old. My gran came here. We sat by the window.")).toEqual({
      text: "It is old. My gran came here.",
      more: true,
    });
  });

  it("says nothing is left out when the story is short", () => {
    expect(firstSentences("Just one line.")).toEqual({ text: "Just one line.", more: false });
    expect(firstSentences("One. Two.")).toEqual({ text: "One. Two.", more: false });
  });

  it("splits Japanese at the full stop and the marks beside it, with no spaces needed", () => {
    expect(
      firstSentences("ちゃんぽんは昔のままです。祖母とよく来ました！窓際に座りました。"),
    ).toEqual({
      text: "ちゃんぽんは昔のままです。祖母とよく来ました！",
      more: true,
    });
  });

  it("keeps a closing quote with its sentence and counts ?! as one stop", () => {
    expect(firstSentences('He said "come in!" Then we ate?! It was good.')).toEqual({
      text: 'He said "come in!" Then we ate?!',
      more: true,
    });
    expect(firstSentences("「いらっしゃい」と言われた。次の日も行った。三日目も。")).toEqual({
      text: "「いらっしゃい」と言われた。次の日も行った。",
      more: true,
    });
  });

  it("does not stop at an abbreviation, an initial or a decimal", () => {
    expect(firstSentences("Mr. Tanaka runs it. He opens at 6.30 every day. Come early.")).toEqual({
      text: "Mr. Tanaka runs it. He opens at 6.30 every day.",
      more: true,
    });
    expect(firstSentences("J. K. Rowling never came. Fine.")).toEqual({
      text: "J. K. Rowling never came. Fine.",
      more: false,
    });
  });

  it("makes runs of white space and line breaks single spaces, and changes no word", () => {
    expect(firstSentences("  Line one.\n\nLine   two.  ")).toEqual({
      text: "Line one. Line two.",
      more: false,
    });
  });

  it("stops at the limit on a sentence it can finish, never mid-sentence", () => {
    const first = "A".repeat(100) + ".";
    const text = `${first} ${"B".repeat(250)}.`;
    expect(firstSentences(text, { maxChars: 300 })).toEqual({ text: first, more: true });
  });

  it("cuts a single long sentence at a word and says so with an ellipsis", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const cut = firstSentences(long, { maxChars: 100 });
    expect(cut.more).toBe(true);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(101);
    // Still the start of what was written.
    expect(long.startsWith(cut.text.slice(0, -1))).toBe(true);
    expect(long.slice(cut.text.length - 1, cut.text.length)).toBe(" ");
  });

  it("returns nothing for nothing", () => {
    expect(firstSentences("   \n ")).toEqual({ text: "", more: false });
  });

  it("reads a story with no full stop at all as one sentence", () => {
    expect(firstSentences("no stops here")).toEqual({ text: "no stops here", more: false });
  });
});
