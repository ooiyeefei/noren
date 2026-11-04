import { describe, expect, it } from "vitest";
import { findRepeatedFragments } from "@/lib/claims/repeated-fragments";

const texts = (input: string) => findRepeatedFragments(input).map(({ text }) => text);

describe("findRepeatedFragments: Japanese", () => {
  it("flags a fragment written twice back to back, with offsets into the text", () => {
    const input = "今も今も、架空のお店があります。";
    expect(findRepeatedFragments(input)).toEqual([{ start: 0, end: 4, text: "今も今も" }]);
  });
  it("flags a phrase cut at a particle and a repeated predicate, in kana or kanji", () => {
    expect(texts("架空の店ではお客さんがお客さんが来ます。")).toEqual(["お客さんがお客さんが"]);
    expect(texts("はい、そうですそうです。")).toEqual(["そうですそうです"]);
    expect(texts("毎日毎日焼いています。")).toEqual(["毎日毎日"]);
  });
  it("takes a run of three or more as one span", () => {
    expect(texts("今も今も今もあります")).toEqual(["今も今も今も"]);
  });
  it("finds every run in a segment, in order", () => {
    expect(texts("私は私は店に行き、今も今も続けています。")).toEqual(["私は私は", "今も今も"]);
  });
  it("counts offsets in UTF-16 units after a surrogate pair", () => {
    const input = "架空😀今も今もです";
    const [found] = findRepeatedFragments(input);
    expect(found).toEqual({ start: 4, end: 8, text: "今も今も" });
    expect(input.slice(found!.start, found!.end)).toBe("今も今も");
  });

  it("leaves a single repeated character alone: ここ, 時々 and long runs of one character", () => {
    for (const input of [
      "ここにあります",
      "ここ",
      "時々来ます",
      "々",
      "人人",
      "ああああ",
      "ははは",
      "ええええ",
    ])
      expect(texts(input), input).toEqual([]);
  });
  it("leaves kana reduplication alone: どんどん, いろいろ, もともと and their katakana forms", () => {
    for (const input of [
      "どんどん増えます",
      "いろいろな話",
      "もともと家でした",
      "ちょろちょろ流れます",
      "ひとつひとつ作ります",
      "もっともっと知りたい",
      "ドンドン増えます",
      "ゆっくり歩きます",
    ])
      expect(texts(input), input).toEqual([]);
  });
  it("leaves 'each' constructions and idioms spelled with a repeat alone", () => {
    for (const input of [
      "一つ一つ手作りです",
      "お客さん一人一人に話します",
      "一歩一歩進みます",
      "一軒一軒回ります",
      "知らず知らずのうちに",
      "代わる代わる話します",
      "日に日に増えます",
    ])
      expect(texts(input), input).toEqual([]);
  });
  it("leaves punctuation, spaces and other scripts to their own rules", () => {
    for (const input of ["。。。", "、、、、", "……………", "ーーーー", "abab", "1212", "ＡＢＡＢ"])
      expect(texts(input), input).toEqual([]);
  });
  it("does not flag text where nothing repeats", () => {
    expect(texts("架空のお店は、祖母が始めた店です。カードは使えます。")).toEqual([]);
    expect(texts("")).toEqual([]);
  });
});

describe("findRepeatedFragments: English", () => {
  it("flags a repeated word, ignoring case and counting a longer run as one span", () => {
    expect(findRepeatedFragments("We went to the the shop.")).toEqual([
      { start: 11, end: 18, text: "the the" },
    ]);
    expect(texts("The the shop opened.")).toEqual(["The the"]);
    expect(texts("It is the the the best.")).toEqual(["the the the"]);
    expect(texts("I I think so")).toEqual(["I I"]);
  });
  it("sees a repeat across a line break", () => {
    expect(texts("at the\nthe door")).toEqual(["the\nthe"]);
  });
  it("leaves ordinary doubles and words that merely start alike", () => {
    for (const input of [
      "She had had enough.",
      "I know that that is true.",
      "It was very very good.",
      "Bye bye, see you.",
      "the thermal bath",
      "the cat and the dog",
      "there their",
    ])
      expect(texts(input), input).toEqual([]);
  });
  it("flags an ordinary double written three times", () => {
    expect(texts("that that that")).toEqual(["that that that"]);
  });
});

describe("findRepeatedFragments: both", () => {
  it("returns Japanese and English runs together, in order, and each text is the slice it names", () => {
    const input = "the the 店で今も今も、and and 続けます。";
    const found = findRepeatedFragments(input);
    expect(found.map(({ text }) => text)).toEqual(["the the", "今も今も", "and and"]);
    for (const { start, end, text } of found) expect(input.slice(start, end)).toBe(text);
    expect(found.map(({ start }) => start)).toEqual(
      [...found.map(({ start }) => start)].sort((a, b) => a - b),
    );
  });
  it("does not change the text it is given", () => {
    const input = "今も今も";
    findRepeatedFragments(input);
    expect(input).toBe("今も今も");
  });
});
