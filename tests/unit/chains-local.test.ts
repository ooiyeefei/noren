import { describe, expect, it } from "vitest";
import {
  isFlagshipName,
  isLocalMultiBranch,
  isNagasakiBorn,
  JAPAN_NOTABLE,
  LOCAL_BRANCH_LIMIT,
  NAGASAKI_BORN_SHARE,
  nagasakiShare,
  prefectureOf,
} from "../../src/lib/chains/local";

describe("isLocalMultiBranch", () => {
  it("spares a base name found only in Nagasaki, fewer than five times", () => {
    expect(isLocalMultiBranch({ sites: 2, elsewhere: 0 })).toBe(true);
    expect(isLocalMultiBranch({ sites: 3, elsewhere: 0 })).toBe(true);
    expect(isLocalMultiBranch({ sites: LOCAL_BRANCH_LIMIT - 1, elsewhere: 0 })).toBe(true);
  });

  it("does not spare five or more", () => {
    expect(isLocalMultiBranch({ sites: LOCAL_BRANCH_LIMIT, elsewhere: 0 })).toBe(false);
    expect(isLocalMultiBranch({ sites: 12, elsewhere: 0 })).toBe(false);
  });

  it("does not spare a name that is also found outside Nagasaki", () => {
    expect(isLocalMultiBranch({ sites: 3, elsewhere: 1 })).toBe(false);
  });

  it("reads the limits the owner gave", () => {
    expect(LOCAL_BRANCH_LIMIT).toBe(5);
    expect(JAPAN_NOTABLE).toBe(5);
  });
});

describe("prefectureOf", () => {
  it("reads the region field in Japanese, English and by code", () => {
    expect(prefectureOf([{ region: "長崎県" }])).toBe("nagasaki");
    expect(prefectureOf([{ region: "Nagasaki-ken" }])).toBe("nagasaki");
    expect(prefectureOf([{ region: "42" }])).toBe("nagasaki");
    expect(prefectureOf([{ region: "熊本県" }])).toBe("other");
  });

  it("reads the postcode when the region is empty: Nagasaki's start with 85", () => {
    expect(prefectureOf([{ region: null, postcode: "850-0001" }])).toBe("nagasaki");
    expect(prefectureOf([{ postcode: "８５６－０８４４" }])).toBe("nagasaki");
    expect(prefectureOf([{ postcode: "〒860-0001" }])).toBe("other");
  });

  it("is unknown without either, or with a postcode too short to tell", () => {
    expect(prefectureOf([])).toBe("unknown");
    expect(prefectureOf([{ region: null, postcode: null }])).toBe("unknown");
    expect(prefectureOf([{ postcode: "05" }])).toBe("unknown");
  });
});

describe("isNagasakiBorn", () => {
  it("is true when Nagasaki prefecture holds 30% or more of a name's places in Japan", () => {
    expect(NAGASAKI_BORN_SHARE).toBe(0.3);
    expect(isNagasakiBorn({ nagasaki: 3, elsewhere: 7 })).toBe(true);
    expect(isNagasakiBorn({ nagasaki: 6, elsewhere: 14 })).toBe(true);
    expect(isNagasakiBorn({ nagasaki: 9, elsewhere: 1 })).toBe(true);
    expect(isNagasakiBorn({ nagasaki: 5, elsewhere: 0 })).toBe(true);
  });

  it("is false under 30%", () => {
    expect(isNagasakiBorn({ nagasaki: 29, elsewhere: 71 })).toBe(false);
    expect(isNagasakiBorn({ nagasaki: 9, elsewhere: 991 })).toBe(false);
  });

  it("is false for a name with no place in Nagasaki, or no place at all", () => {
    expect(isNagasakiBorn({ nagasaki: 0, elsewhere: 0 })).toBe(false);
    expect(isNagasakiBorn({ nagasaki: 0, elsewhere: 5 })).toBe(false);
  });

  it("reads the share from 0 to 1", () => {
    expect(nagasakiShare({ nagasaki: 1, elsewhere: 3 })).toBe(0.25);
    expect(nagasakiShare({ nagasaki: 0, elsewhere: 0 })).toBe(0);
  });
});

describe("isFlagshipName", () => {
  it("is true for the brand plus 本店, 総本店 or 本家, with or without a space or an area", () => {
    for (const name of [
      "架空堂本店",
      "架空堂 本店",
      "架空堂総本店",
      "架空堂 総本店",
      "架空堂本家",
      "架空堂 古町本店",
      "架空堂　長与本店",
      "牛たん本家",
      "Kakudo Souhonten",
      "Kakudo Honten",
      "Kakudo Honke",
    ])
      expect(isFlagshipName(name), name).toBe(true);
  });

  it("is false for a branch, for 本舗 by itself and for 本店 with no brand before it", () => {
    for (const name of [
      "架空堂 大村店",
      "架空堂 支店",
      "架空本舗",
      "架空堂本舗 大村店",
      "本店",
      "総本店",
      "本店 架空堂",
      "本家本元",
      "架空堂",
      "Kakudo Honpo",
    ])
      expect(isFlagshipName(name), name).toBe(false);
  });
});
