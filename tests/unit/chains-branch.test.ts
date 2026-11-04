import { describe, expect, it } from "vitest";
import {
  areaOf,
  BranchIndex,
  branchSplits,
  isGenericBase,
  type BranchRecord,
} from "../../src/lib/chains/branch";
import { keyedName } from "../../src/lib/chains/names";

// Every name here is fictional.
const at = (n: number) => ({ lat: 32.7 + n * 0.01, lng: 129.8 });
const records = (names: string[]): BranchRecord[] =>
  names.map((name, n) => ({ id: `r${n}`, name, ...at(n) }));

describe("branchSplits", () => {
  it("splits at a space before a name ending in 店 and is certain of it", () => {
    expect(branchSplits("ミモザ食堂 大村店")).toEqual(
      expect.arrayContaining([{ base: "ミモザ食堂", suffix: "大村店", certain: true }]),
    );
  });

  it("reads a name written in one piece as base plus one to six characters of area", () => {
    const splits = branchSplits("ミモザ食堂大村店");
    expect(splits.map((split) => split.suffix)).toEqual(
      expect.arrayContaining(["村店", "大村店", "食堂大村店"]),
    );
    expect(splits.every((split) => !split.certain)).toBe(true);
  });

  it("reads 支店, 号店, 駅前店 and 本店 as suffixes", () => {
    expect(branchSplits("架空信金 大浦支店")[0]).toMatchObject({
      base: "架空信金",
      suffix: "大浦支店",
    });
    expect(branchSplits("架空堂 2号店")[0]).toMatchObject({ base: "架空堂", suffix: "2号店" });
    expect(branchSplits("架空堂 長与駅前店")[0]).toMatchObject({
      base: "架空堂",
      suffix: "長与駅前店",
    });
    expect(branchSplits("架空堂 本店")[0]).toMatchObject({ base: "架空堂", suffix: "本店" });
  });

  it("reads an English branch or store with up to three area words", () => {
    const splits = branchSplits("Mimosa Cafe Omura Branch");
    expect(splits.map((split) => split.base)).toEqual([
      "Mimosa Cafe Omura",
      "Mimosa Cafe",
      "Mimosa",
    ]);
    expect(branchSplits("Mimosa Cafe Yume Town Store")[0]).toMatchObject({
      base: "Mimosa Cafe Yume Town",
      suffix: "Store",
    });
  });

  it("finds no suffix in a name that has none, or in a kind of shop that ends in 店", () => {
    expect(branchSplits("ミモザ食堂")).toEqual([]);
    expect(branchSplits("架空書店")).toEqual([]);
    expect(branchSplits("架空 酒店")).toEqual([]);
    expect(branchSplits("Mimosa Cafe")).toEqual([]);
  });
});

describe("areaOf", () => {
  it("is what stands before 店", () => {
    expect(areaOf("大村店")).toBe("大村");
    expect(areaOf("大浦支店")).toBe("大浦");
    expect(areaOf("本店")).toBe("");
  });
});

describe("isGenericBase", () => {
  it("is true for a word that names a kind of place", () => {
    expect(isGenericBase(keyedName("Cafe").key)).toBe(true);
    expect(isGenericBase(keyedName("ラーメン").key)).toBe(true);
    expect(isGenericBase(keyedName("ミモザ食堂").key)).toBe(false);
  });
});

describe("BranchIndex", () => {
  const index = new BranchIndex(
    records([
      "ミモザ食堂 大村店",
      "ミモザ食堂 時津店",
      "ミモザ食堂諫早店",
      "ミモザ食堂",
      "ラーメン 大村店",
      "ラーメン 時津店",
      "ラーメン 諫早店",
      "架空 大村店",
      "架空 時津店",
      "架空 諫早店",
      "山田佛具店",
      "山田石油店",
      "山田ハタ店",
      "ブルーム大村店",
      "ブルーム時津店",
      "ブルーム諫早店",
    ]),
  );
  const group = (base: string) => index.group(keyedName(base).key);

  it("groups branches under one base name, with or without a space, and the bare name too", () => {
    expect(group("ミモザ食堂")).toMatchObject({ hasSuffix: true, generic: false });
    expect(group("ミモザ食堂")!.members).toHaveLength(4);
  });

  it("finds the area in a name written in one piece by what other branches share", () => {
    expect(group("ブルーム")!.members).toHaveLength(3);
    expect(index.chosenBase(13)).toMatchObject({ base: "ブルーム", suffix: "大村店" });
  });

  it("does not make a base of the start of unrelated shops", () => {
    // 佛具, 石油 and ハタ are not areas, so the three Yamadas stay three separate names.
    expect(group("山田")).toBeNull();
    expect(index.chosenBase(10).suffix).toBeNull();
  });

  it("marks a base made of a kind of place as generic", () => {
    expect(group("ラーメン")).toMatchObject({ generic: true });
  });

  it("counts a place listed twice at one door once", () => {
    const twice = new BranchIndex([
      { id: "a", name: "ミモザ食堂 大村店", lat: 32.7, lng: 129.8 },
      { id: "b", name: "ミモザ食堂 大村店", lat: 32.7001, lng: 129.8 },
      { id: "c", name: "ミモザ食堂 時津店", lat: 32.8, lng: 129.8 },
      { id: "d", name: "ミモザ食堂 大村店", lat: 32.9, lng: 129.8 },
    ]);
    expect(twice.isDouble(1)).toBe(true);
    expect(twice.isDouble(3)).toBe(false);
    expect(twice.group(keyedName("ミモザ食堂").key)!.members).toEqual([0, 2, 3]);
  });

  it("reads the base of a name that is not in the list", () => {
    expect(index.baseOf("ミモザ食堂 長崎店")).toMatchObject({
      base: "ミモザ食堂",
      suffix: "長崎店",
    });
    expect(index.baseOf("独立カフェ")).toMatchObject({ suffix: null });
  });

  it("lists the plausible readings of a name, the certain one first", () => {
    const readings = index.candidates("ミモザ食堂 大村店");
    expect(readings[0]).toMatchObject({ base: "ミモザ食堂", suffix: "大村店" });
    expect(index.candidates("ミモザ食堂")).toEqual([]);
  });
});
