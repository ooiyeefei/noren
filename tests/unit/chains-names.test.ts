import { describe, expect, it } from "vitest";
import { keyLength, keyedName, startsWithBrandKey } from "../../src/lib/chains/names";

// Every name here is fictional.
describe("keyedName", () => {
  it("folds width and case and drops spaces, middle dots and punctuation", () => {
    expect(keyedName("ＨＡＲＤ　Ｏｕｔ・Ｌｅｔ!").key).toBe("hardoutlet");
    expect(keyedName("架空 ラーメン").key).toBe("架空ラーメン");
    expect(keyedName("ｶﾌｪ・ミモザ").key).toBe("カフェミモザ");
  });

  it("drops accents from Latin names only, so が stays が", () => {
    expect(keyedName("Café Élan").key).toBe("cafeelan");
    expect(keyedName("がっこう").key).toBe("がっこう");
  });

  it("keeps katakana and hiragana apart", () => {
    expect(keyedName("ミモザ").key).not.toBe(keyedName("みもざ").key);
  });

  it("counts characters, not code units", () => {
    expect(keyLength(keyedName("𠮷野").key)).toBe(2);
  });
});

describe("startsWithBrandKey", () => {
  const name = (value: string) => keyedName(value);

  it("matches a name that equals the brand or starts with it", () => {
    expect(startsWithBrandKey(name("ミモザ"), "ミモザ")).toBe(true);
    expect(startsWithBrandKey(name("ミモザ 大村店"), "ミモザ")).toBe(true);
    expect(startsWithBrandKey(name("ミモザ大村店"), "ミモザ")).toBe(true);
  });

  it("does not match a brand that is only inside the name", () => {
    expect(startsWithBrandKey(name("カフェ ミモザ"), "ミモザ")).toBe(false);
  });

  it("does not stop inside a Latin word, but does at the end of one", () => {
    expect(startsWithBrandKey(name("Gustoso Pizza"), "gusto")).toBe(false);
    expect(startsWithBrandKey(name("Gusto Pizza"), "gusto")).toBe(true);
    expect(startsWithBrandKey(name("Gusto・Pizza"), "gusto")).toBe(true);
    expect(startsWithBrandKey(name("Gusto大村店"), "gusto")).toBe(true);
  });

  it("is false for an empty prefix", () => {
    expect(startsWithBrandKey(name("ミモザ"), "")).toBe(false);
  });
});
