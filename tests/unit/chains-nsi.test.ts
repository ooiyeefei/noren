import { describe, expect, it } from "vitest";
import {
  BrandMatcher,
  brandKeys,
  categoriesForPath,
  coverageOf,
  featureHolds,
  nsiBrands,
  type NsiData,
  type NsiFeature,
  type NsiItem,
} from "../../src/lib/chains/nsi";

// A fictional slice of the index: brands that do not exist.
const NAGASAKI = { lat: 32.75, lng: 129.88 };
const square = (west: number, south: number, east: number, north: number): NsiFeature => ({
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  },
});
const features = new Map<string, NsiFeature>([
  ["jp-kyushu.geojson", square(129, 31, 132, 34)],
  ["jp-hokkaido.geojson", square(139, 41, 146, 46)],
  [
    "jp-ring.geojson",
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [128, 31],
            [131, 31],
            [131, 34],
            [128, 34],
            [128, 31],
          ],
          [
            [129.5, 32.5],
            [130.2, 32.5],
            [130.2, 33],
            [129.5, 33],
            [129.5, 32.5],
          ],
        ],
      },
    },
  ],
]);
const item = (
  id: string,
  displayName: string,
  tags: Record<string, string>,
  extra: Partial<NsiItem> = {},
): NsiItem => ({
  id,
  displayName,
  locationSet: { include: ["jp"] },
  tags,
  ...extra,
});
const data: NsiData = {
  _meta: { version: "9.9.20990101" },
  nsi: {
    "brands/amenity/restaurant": {
      items: [
        item("mimosa-1", "ミモザ食堂", {
          brand: "ミモザ食堂",
          "brand:en": "Mimosa Diner",
          "name:ja-Hira": "みもざしょくどう",
        }),
        item("tiny-1", "ミモ", { brand: "ミモ" }),
        item(
          "kyushu-1",
          "九州架空亭",
          { brand: "九州架空亭" },
          { locationSet: { include: ["jp-kyushu.geojson"] } },
        ),
        item(
          "hokkaido-1",
          "北架空亭",
          { brand: "北架空亭" },
          { locationSet: { include: ["jp-hokkaido.geojson"] } },
        ),
        item(
          "world-1",
          "Gusto Fictional",
          { brand: "Gusto Fictional" },
          { locationSet: { include: ["001"] } },
        ),
        item(
          "world-not-jp",
          "Elsewhere Grill",
          { brand: "Elsewhere Grill" },
          { locationSet: { include: ["001"], exclude: ["jp"] } },
        ),
        item(
          "us-only",
          "Americana Grill",
          { brand: "Americana Grill" },
          { locationSet: { include: ["us"] } },
        ),
      ],
    },
    "brands/shop/clothes": { items: [item("roots-1", "Roots Wear", { brand: "Roots Wear" })] },
    "brands/shop/second_hand": {
      items: [item("reuse-1", "リユース架空", { brand: "リユース架空" })],
    },
    "brands/tourism/hotel": {
      items: [item("hotel-1", "ホテル架空イン", { brand: "ホテル架空イン" })],
    },
    "brands/office/insurance": { items: [item("ins-1", "架空保険", { brand: "架空保険" })] },
    "operators/amenity/school": { items: [item("op-1", "架空学園", { operator: "架空学園" })] },
  },
};

describe("coverageOf", () => {
  it("reaches Japan by the country, the world or an area that holds the region", () => {
    expect(coverageOf({ include: ["jp"] }, NAGASAKI, features)).toBe("japan");
    expect(coverageOf({ include: ["001"] }, NAGASAKI, features)).toBe("world");
    expect(coverageOf({ include: ["jp-kyushu.geojson"] }, NAGASAKI, features)).toBe("region");
    expect(coverageOf({ include: ["jp", "jp-kyushu.geojson"] }, NAGASAKI, features)).toBe("japan");
  });

  it("does not reach a brand of other countries or of other parts of Japan", () => {
    expect(coverageOf({ include: ["us"] }, NAGASAKI, features)).toBeNull();
    expect(coverageOf({ include: ["jp-hokkaido.geojson"] }, NAGASAKI, features)).toBeNull();
    expect(coverageOf({ include: ["jp-unknown.geojson"] }, NAGASAKI, features)).toBeNull();
    expect(coverageOf({ include: [[129.8, 32.7, 20]] }, NAGASAKI, features)).toBeNull();
    expect(coverageOf(undefined, NAGASAKI, features)).toBeNull();
  });

  it("honours an exclusion that holds Japan", () => {
    expect(coverageOf({ include: ["001"], exclude: ["jp"] }, NAGASAKI, features)).toBeNull();
    expect(coverageOf({ include: ["001"], exclude: ["us"] }, NAGASAKI, features)).toBe("world");
  });
});

describe("featureHolds", () => {
  it("is true inside a polygon, false outside or inside a hole", () => {
    expect(featureHolds(features.get("jp-kyushu.geojson"), NAGASAKI)).toBe(true);
    expect(featureHolds(features.get("jp-hokkaido.geojson"), NAGASAKI)).toBe(false);
    expect(featureHolds(features.get("jp-ring.geojson"), NAGASAKI)).toBe(false);
    expect(featureHolds(features.get("jp-ring.geojson"), { lat: 33.5, lng: 129.2 })).toBe(true);
    expect(featureHolds(undefined, NAGASAKI)).toBe(false);
  });
});

describe("categoriesForPath", () => {
  it("lets a place to eat match a restaurant, a cafe, a bar or a take-away shop", () => {
    expect(categoriesForPath("brands/amenity/fast_food")).toEqual([
      "restaurant",
      "cafe",
      "bar",
      "shop",
    ]);
  });
  it("keeps clothes, cars and offices out", () => {
    expect(categoriesForPath("brands/shop/clothes")).toEqual([]);
    expect(categoriesForPath("brands/shop/car")).toEqual([]);
    expect(categoriesForPath("brands/office/insurance")).toEqual([]);
    expect(categoriesForPath("operators/amenity/school")).toEqual([]);
  });
  it("maps the shops the map lists, hotels and baths", () => {
    expect(categoriesForPath("brands/shop/second_hand")).toEqual(["shop"]);
    expect(categoriesForPath("brands/shop/bakery")).toEqual(["shop", "restaurant", "cafe"]);
    expect(categoriesForPath("brands/shop/musical_instrument")).toEqual(["music_shop", "shop"]);
    expect(categoriesForPath("brands/tourism/hotel")).toEqual(["stay"]);
    expect(categoriesForPath("brands/leisure/sauna")).toEqual(["bath"]);
  });
});

describe("brandKeys", () => {
  it("reads the name and its aliases in Japanese, English and kana, at least three characters", () => {
    const keys = brandKeys(data.nsi["brands/amenity/restaurant"]!.items[0]!);
    expect(keys).toEqual(expect.arrayContaining(["ミモザ食堂", "mimosadiner", "みもざしょくどう"]));
    expect(brandKeys(data.nsi["brands/amenity/restaurant"]!.items[1]!)).toEqual([]);
  });

  it("reads matchNames too", () => {
    expect(brandKeys(item("x", "架空", {}, { matchNames: ["かくうやま"] }))).toEqual([
      "かくうやま",
    ]);
  });
});

describe("nsiBrands", () => {
  const { brands, stats } = nsiBrands(data, features, NAGASAKI);

  it("keeps the brands that operate in Japan and the region, from the brand trees only", () => {
    expect(brands.map((brand) => brand.id).sort()).toEqual([
      "hotel-1",
      "kyushu-1",
      "mimosa-1",
      "reuse-1",
      "world-1",
    ]);
    expect(stats).toMatchObject({
      version: "9.9.20990101",
      keptJapan: 3,
      keptWorld: 1,
      keptRegion: 1,
      withoutUsableName: 1,
      inapplicableCategory: 2,
    });
    expect(stats.notInJapan).toBe(3);
  });

  describe("BrandMatcher", () => {
    const matcher = new BrandMatcher(brands);
    const match = (name: string, category?: string) =>
      matcher.match([name], category)?.brand.id ?? null;

    it("matches a name that equals a brand or starts with it", () => {
      expect(match("ミモザ食堂", "restaurant")).toBe("mimosa-1");
      expect(match("ミモザ食堂 大村店", "restaurant")).toBe("mimosa-1");
      expect(match("MIMOSA DINER", "restaurant")).toBe("mimosa-1");
      expect(match("みもざしょくどう 時津店", "restaurant")).toBe("mimosa-1");
    });

    it("does not match a brand inside the name or a name that merely resembles it", () => {
      expect(match("カフェ ミモザ食堂", "restaurant")).toBeNull();
      expect(match("ミモザ", "restaurant")).toBeNull();
    });

    it("does not read a brand of three characters or fewer in a longer word", () => {
      expect(match("ミモ", "restaurant")).toBeNull();
      expect(match("Gustoso Pizza", "restaurant")).toBeNull();
      expect(match("Gusto Fictional Omura", "restaurant")).toBe("world-1");
    });

    it("needs a category the brand's kind of business fits", () => {
      // A bar called Roots is not a clothes brand, and a hotel is not a restaurant.
      expect(match("Roots Wear Bar", "bar")).toBeNull();
      expect(match("ホテル架空イン長崎", "restaurant")).toBeNull();
      expect(match("ホテル架空イン長崎", "stay")).toBe("hotel-1");
      expect(match("リユース架空 大村店", "shop")).toBe("reuse-1");
      expect(match("リユース架空 大村店", "bar")).toBeNull();
      expect(match("ミモザ食堂", undefined)).toBeNull();
    });

    it("matches a regional brand of the region and never a brand of another country", () => {
      expect(match("九州架空亭 諫早店", "restaurant")).toBe("kyushu-1");
      expect(match("Americana Grill", "restaurant")).toBeNull();
      expect(match("Elsewhere Grill", "restaurant")).toBeNull();
    });

    it("finds the match among a place's several names", () => {
      expect(matcher.match(["Unrelated", "ミモザ食堂"], "restaurant")?.brand.id).toBe("mimosa-1");
    });
  });
});
