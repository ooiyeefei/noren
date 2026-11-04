import { describe, expect, it } from "vitest";
import {
  isLocalMultiBranch,
  JAPAN_NOTABLE,
  LOCAL_BRANCH_LIMIT,
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
