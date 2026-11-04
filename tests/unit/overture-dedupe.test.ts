import { describe, expect, it } from "vitest";
import {
  PlaceIndex,
  closeKeys,
  dice,
  distanceMetres,
  nameKeys,
  normalizeName,
  relatedKeys,
  similarKeys,
  websiteKey,
  type IndexedPlace,
} from "../../src/lib/overture/dedupe";

// Names and coordinates are synthetic. One degree of latitude is about 111 km: 0.0001 is 11 m.
const base = { lat: 32.75, lng: 129.88 };
const north = (metres: number) => ({ lat: base.lat + metres / 111_195, lng: base.lng });
const place = (
  id: string,
  names: string[],
  at: { lat: number; lng: number } = base,
  extra: Partial<IndexedPlace> = {},
): IndexedPlace => ({ id, ...at, keys: nameKeys(names), websites: [], category: "cafe", ...extra });

describe("name normalisation", () => {
  it("folds width, case, katakana, spaces and punctuation", () => {
    expect(normalizeName("ＭＯＣＫ　Ｃａｆé")).toBe("mockcafe");
    expect(normalizeName("カフェ・ド・テスト")).toBe(normalizeName("かふぇ ど てすと"));
    expect(normalizeName("ｶﾌｪ架空")).toBe(normalizeName("カフェ架空"));
    expect(normalizeName("Mock-Cafe & Bar")).toBe("mockcafebar");
  });

  it("drops accents from Latin names only, so が never becomes か", () => {
    expect(normalizeName("Café Résumé")).toBe("caferesume");
    expect(normalizeName("がっこう")).not.toBe(normalizeName("かっこう"));
  });

  it("keeps kanji apart from their readings", () => {
    expect(normalizeName("珈琲館")).not.toBe(normalizeName("コーヒーかん"));
  });

  it("returns one key per distinct name and none for blanks", () => {
    expect(nameKeys(["架空 カフェ", "架空カフェ", " ", ""])).toEqual(["架空かふぇ"]);
  });
});

describe("similar names", () => {
  it("matches the same name, and one name inside the other when it is most of it", () => {
    expect(similarKeys("らーめん山田", "らーめん山田")).toBe(true);
    expect(similarKeys("らーめん山田", "らーめん山田長崎店")).toBe(true);
    expect(similarKeys("mockcafe", "mockcafeshop")).toBe(true);
  });

  it("does not match a different owner, a generic word or a short name", () => {
    expect(similarKeys("らーめん山田", "らーめん山本")).toBe(false);
    expect(similarKeys("かふぇ", "かふぇ架空の森")).toBe(false);
    expect(similarKeys("山田", "山田製麺所")).toBe(false);
    expect(similarKeys("架空カフェ", "架空カフェの隣のとても長い別の名前のお店")).toBe(false);
  });

  it("matches a close pair that spells a name differently, with three characters inside", () => {
    expect(closeKeys("ほてるもんとれ", "ほてるもんとれ長崎")).toBe(true);
    expect(
      closeKeys(
        normalizeName("ANA Crowne Plaza Hotel Nagasaki"),
        normalizeName("ANA Crowne Plaza Nagasaki"),
      ),
    ).toBe(true);
    expect(closeKeys("匠寛堂", normalizeName("長崎菓寮 匠寛堂"))).toBe(true);
    expect(closeKeys("和泉苑", "和泉屋")).toBe(false);
    expect(closeKeys("架空食堂", "全然違うお店")).toBe(false);
    // Known limit: two names that differ in one last character look alike to this closer rule, so it
    // runs only where the places are within 25 m of each other and of the same category.
    expect(closeKeys("らーめん山田", "らーめん山本")).toBe(true);
  });

  it("measures the shared two-character pieces", () => {
    expect(dice("abcd", "abcd")).toBe(1);
    expect(dice("abcd", "wxyz")).toBe(0);
    expect(dice("a", "a")).toBe(0);
  });

  it("asks a little name evidence of a shared website", () => {
    expect(relatedKeys("山幸", "割烹寿司山幸")).toBe(true);
    expect(relatedKeys("架空食堂", "全然違うお店")).toBe(false);
  });
});

describe("website keys", () => {
  it("compares host and path, not scheme, www or a trailing slash", () => {
    expect(websiteKey("https://www.Example.com/shop/")).toBe("example.com/shop");
    expect(websiteKey("http://example.com/shop")).toBe("example.com/shop");
    expect(websiteKey("https://example.com")).toBe("example.com");
    expect(websiteKey("mailto:a@example.com")).toBeNull();
    expect(websiteKey("not a url")).toBeNull();
  });
});

describe("distance", () => {
  it("is about 111 m for 0.001 degrees of latitude", () => {
    expect(Math.round(distanceMetres(base, { lat: base.lat + 0.001, lng: base.lng }))).toBe(111);
  });
});

describe("place index", () => {
  const options = { nameMetres: 50, closeMetres: 25, websiteMetres: 100 };

  it("finds the same name within 50 m and not beyond", () => {
    const index = new PlaceIndex(options, [place("a", ["架空食堂"])]);
    expect(index.find(place("x", ["架空食堂"], north(45)))?.place.id).toBe("a");
    expect(index.find(place("x", ["架空食堂"], north(55)))).toBeUndefined();
  });

  it("does not match a different name next door", () => {
    const index = new PlaceIndex(options, [place("a", ["架空食堂"])]);
    expect(index.find(place("x", ["別のお店"], north(5)))).toBeUndefined();
  });

  it("matches across the languages a place has names in", () => {
    const index = new PlaceIndex(options, [place("a", ["架空食堂", "Mock Diner"])]);
    expect(index.find(place("x", ["mock diner"], north(10)))?.place.id).toBe("a");
  });

  it("uses the closer rule only within 25 m and in the same category", () => {
    const index = new PlaceIndex(options, [
      place("a", ["長崎菓寮 匠寛堂"], base, { category: "shop" }),
    ]);
    const candidate = (metres: number, category: string) =>
      place("x", ["匠寛堂"], north(metres), { category });
    expect(index.find(candidate(10, "shop"))?.by).toBe("close name");
    expect(index.find(candidate(10, "restaurant"))).toBeUndefined();
    expect(index.find(candidate(40, "shop"))).toBeUndefined();
  });

  it("matches a website only in the same category, with a related name, within 100 m", () => {
    const site = "example.com/hotel";
    const index = new PlaceIndex(options, [
      place("a", ["架空ホテル"], base, { category: "stay", websites: [site] }),
    ]);
    const candidate = (names: string[], metres: number, category: string) =>
      place("x", names, north(metres), { category, websites: [site] });
    expect(index.find(candidate(["架空ホテル別館"], 80, "stay"))?.by).toBe("website");
    // The hotel's restaurant shares the website and is another place.
    expect(index.find(candidate(["架空ホテル別館"], 80, "restaurant"))).toBeUndefined();
    expect(index.find(candidate(["全然違う名前"], 80, "stay"))).toBeUndefined();
    expect(index.find(candidate(["架空ホテル別館"], 130, "stay"))).toBeUndefined();
  });

  it("returns the nearest of several matches and never the candidate itself", () => {
    const index = new PlaceIndex(options, [
      place("far", ["架空食堂"], north(40)),
      place("near", ["架空食堂"], north(10)),
      place("self", ["架空食堂"]),
    ]);
    expect(index.find(place("self", ["架空食堂"]))?.place.id).toBe("near");
  });

  it("finds a match in the next grid cell", () => {
    // 0.002 degrees is one cell; these two points straddle a cell edge.
    const edge = 32.752;
    const index = new PlaceIndex(options, [
      place("a", ["架空食堂"], { lat: edge - 0.00005, lng: base.lng }),
    ]);
    expect(
      index.find(place("x", ["架空食堂"], { lat: edge + 0.00005, lng: base.lng }))?.place.id,
    ).toBe("a");
  });

  it("refuses a radius the grid cannot cover", () => {
    expect(() => new PlaceIndex({ ...options, websiteMetres: 300 })).toThrow();
  });
});
