import { describe, expect, it } from "vitest";
import {
  baseSource,
  overtureAttribution,
  overtureNameTags,
  parseOverturePlace,
  GERS_ID,
  type OverturePlace,
} from "../../src/lib/overture/place";
import { planImport, type ExistingPlace, type PlanOptions } from "../../src/lib/overture/plan";

// Everything here is synthetic: invented names, identifiers and coordinates inside Nagasaki's bbox.
const gers = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { lat: 32.75, lng: 129.88 };
const north = (metres: number) => ({ lat: base.lat + metres / 111_195, lng: base.lng });

const place = (n: number, extra: Partial<OverturePlace> = {}): OverturePlace => ({
  id: gers(n),
  ...north(n * 300),
  confidence: 0.9,
  operatingStatus: null,
  basicCategory: "cafe",
  hierarchy: ["food_and_drink", "casual_eatery", "cafe"],
  names: { primary: `架空カフェ${n}`, common: {} },
  brand: null,
  websites: [],
  socials: [],
  address: null,
  sources: [
    {
      property: "",
      dataset: "meta",
      license: "CDLA-Permissive-2.0",
      recordId: `m${n}`,
      updateTime: null,
      confidence: 0.9,
    },
    {
      property: "/properties/confidence",
      dataset: "Overture",
      license: "CDLA-Permissive-2.0",
      recordId: null,
      updateTime: null,
      confidence: null,
    },
  ],
  ...extra,
});
const existingPlace = (id: string, extra: Partial<ExistingPlace> = {}): ExistingPlace => ({
  id,
  category: "cafe",
  pin: base,
  names: ["既存カフェ"],
  onMap: true,
  refs: [{ provider: "osm", ref: "node/1" }],
  ...extra,
});
const options: PlanOptions = {
  focusCategories: ["restaurant", "cafe", "bar", "shop", "stay", "museum", "attraction"],
  locales: ["ja", "en"],
  bbox: [129.7, 32.55, 130.12, 33.0],
  minConfidence: 0.7,
  mapBudget: 100,
};
const plan = (
  places: OverturePlace[],
  existing: ExistingPlace[] = [],
  extra: Partial<PlanOptions> = {},
) => planImport(places, existing, { ...options, ...extra });

describe("parsing a snapshot row", () => {
  const row = {
    id: gers(1),
    lat: 32.75,
    lng: 129.88,
    confidence: 0.8,
    operatingStatus: null,
    basicCategory: "cafe",
    taxonomy: { primary: "cafe", hierarchy: ["food_and_drink", "casual_eatery", "cafe"] },
    names: { primary: " 架空カフェ ", common: { en: "Mock Cafe", fr: " " } },
    brand: { wikidata: null, name: null },
    websites: ["https://example.test/"],
    socials: [],
    addresses: [{ freeform: "架空県架空市1-2" }],
    sources: [{ property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: "1" }],
  };

  it("reads the fields the import uses and ignores an empty brand", () => {
    expect(parseOverturePlace(row)).toMatchObject({
      id: gers(1),
      confidence: 0.8,
      hierarchy: ["food_and_drink", "casual_eatery", "cafe"],
      names: { primary: "架空カフェ", common: { en: "Mock Cafe" } },
      brand: null,
      address: "架空県架空市1-2",
    });
    expect(parseOverturePlace({ ...row, brand: { wikidata: "Q1", name: null } })?.brand).toEqual({
      wikidata: "Q1",
      name: null,
    });
  });

  it("skips rows with no id, no name or no usable point, and counts them", () => {
    const stats = { skipped: 0 };
    for (const bad of [
      { ...row, id: "" },
      { ...row, names: { primary: " " } },
      { ...row, lat: "32.7" },
      { ...row, lng: 181 },
      null,
      [],
    ])
      expect(parseOverturePlace(bad, stats)).toBeNull();
    expect(stats.skipped).toBe(6);
  });

  it("gives a place with no taxonomy an empty hierarchy", () => {
    expect(parseOverturePlace({ ...row, taxonomy: null })?.hierarchy).toEqual([]);
  });
});

describe("licence and credit", () => {
  it("takes the licence of the dataset that supplied the record", () => {
    expect(baseSource(place(1))).toEqual({ dataset: "meta", licence: "CDLA-Permissive-2.0" });
    const foursquare = place(2, {
      sources: [{ ...place(2).sources[0]!, dataset: "Foursquare", license: "Apache-2.0" }],
    });
    expect(baseSource(foursquare)).toEqual({ dataset: "Foursquare", licence: "Apache-2.0" });
    const cc0 = place(3, {
      sources: [{ ...place(3).sources[0]!, dataset: "AllThePlaces", license: "CC0-1.0" }],
    });
    expect(baseSource(cc0)?.licence).toBe("CC0");
  });

  it("never guesses: an unknown or missing licence gives no source", () => {
    const unknown = place(4, {
      sources: [{ ...place(4).sources[0]!, license: "Some-Unlisted-1.0" }],
    });
    expect(baseSource(unknown)).toBeNull();
    expect(
      baseSource(place(5, { sources: [{ ...place(5).sources[0]!, license: null }] })),
    ).toBeNull();
    expect(baseSource(place(6, { sources: [] }))).toBeNull();
  });

  it("writes a credit line that names the release, the provider and the licence", () => {
    expect(overtureAttribution("meta", "CDLA-Permissive-2.0", "2026-10-21.0")).toBe(
      "Overture Maps Foundation (release 2026-10-21.0); data from Meta, CDLA-Permissive-2.0; https://docs.overturemaps.org/attribution/",
    );
    expect(overtureAttribution("Foursquare", "Apache-2.0", "2026-10-21.0")).toContain(
      "data from Foursquare, Apache-2.0",
    );
    expect(overtureAttribution("SomethingNew", "CC0", "2026-10-21.0")).toContain("SomethingNew");
  });

  it("accepts a GERS id and rejects anything else", () => {
    expect(GERS_ID.test(gers(1))).toBe(true);
    expect(GERS_ID.test("../etc/passwd")).toBe(false);
    expect(GERS_ID.test("0000000A-0000-4000-8000-00000000000B")).toBe(false);
  });

  it("reads names the way the OSM listings do", () => {
    expect(
      overtureNameTags({
        names: { primary: "架空", common: { ja: "架空ja", en: "Mock", de: "x" } },
      }),
    ).toEqual({
      name: "架空",
      "name:ja": "架空ja",
      "name:en": "Mock",
    });
  });
});

describe("the import plan", () => {
  it("lists a place to visit as a new place with its Japanese name, category and licence", () => {
    const result = plan([place(1)]);
    expect(result).toMatchObject({ total: 1, inBbox: 1, kept: 1, categories: { cafe: 1 } });
    expect(result.add).toEqual([
      {
        gers: gers(1),
        lat: place(1).lat,
        lng: place(1).lng,
        category: "cafe",
        names: [{ lang: "ja", script: "kanji", value: "架空カフェ1", isPrimary: true }],
        dataset: "meta",
        licence: "CDLA-Permissive-2.0",
        confidence: 0.9,
      },
    ]);
  });

  it("gives a Latin-only name to both languages, as the OSM listings do", () => {
    const result = plan([place(1, { names: { primary: "Mock Cafe", common: {} } })]);
    expect(result.add[0]?.names.map((name) => [name.lang, name.value])).toEqual([
      ["ja", "Mock Cafe"],
      ["en", "Mock Cafe"],
    ]);
  });

  it("counts every reason a place is left out", () => {
    const result = plan([
      place(1),
      place(2, { lng: 131 }),
      place(3, { operatingStatus: "permanently_closed" }),
      place(4, { hierarchy: ["shopping", "convenience_store"] }),
      place(5, { hierarchy: [] }),
      place(6, { brand: { wikidata: "Q1", name: "Mock Brand" } }),
      place(7, { confidence: 0.69 }),
      place(8, { confidence: null }),
      place(9, { names: { primary: "あ".repeat(121), common: {} } }),
      place(10, { sources: [{ ...place(10).sources[0]!, license: "Some-Unlisted-1.0" }] }),
      place(11, { names: { primary: "架空町 バス停", common: {} } }),
    ]);
    expect(result.total).toBe(11);
    expect(result.inBbox).toBe(10);
    expect(result.kept).toBe(1);
    expect(result.skipped).toEqual({
      "closed or closing": 1,
      "not a place to visit (category)": 2,
      chain: 1,
      "below confidence floor": 2,
      "no valid name": 1,
      "licence not recognised": 1,
      "name is a stop, district or office": 1,
    });
  });

  it("drops a branded chain of shops, but keeps a branded hotel", () => {
    const brand = { wikidata: "Q1", name: "Mock Brand" };
    const result = plan([
      place(1, { brand }),
      place(2, {
        brand,
        hierarchy: ["lodging", "hotel"],
        names: { primary: "架空ホテル", common: {} },
      }),
    ]);
    expect(result.add.map((item) => item.category)).toEqual(["stay"]);
  });

  it("drops a branch named after a branded chain, from Overture's brands and from OSM's", () => {
    const chain = place(1, {
      brand: { wikidata: "Q1", name: "Mock Brand" },
      names: { primary: "架空バーガー", common: {} },
    });
    const branch = place(2, { names: { primary: "架空バーガー長崎店", common: {} } });
    const osmBranch = place(3, { names: { primary: "架空珈琲 大浦店", common: {} } });
    const other = place(4, { names: { primary: "架空バーガーショップ", common: {} } });
    const result = plan([chain, branch, osmBranch, other], [], {
      knownChains: [{ name: "架空珈琲" }],
    });
    expect(result.add.map((item) => item.gers)).toEqual([other.id]);
    expect(result.chainBranches).toBe(2);
  });

  it("reports how many category-and-chain-kept places each confidence floor would keep", () => {
    const result = plan(
      [
        place(1, { confidence: 0.95 }),
        place(2, { confidence: 0.75 }),
        place(3, { confidence: 0.55 }),
      ],
      [],
      { minConfidence: 0.9 },
    );
    expect(result.confidenceCurve).toEqual({ "0.5": 3, "0.6": 2, "0.7": 2, "0.8": 1, "0.9": 1 });
    expect(result.kept).toBe(1);
  });

  it("restricts the import to a bbox", () => {
    const inside = place(1);
    const outside = place(2, { lng: 129.99 });
    const result = plan([inside, outside], [], { bbox: [129.8, 32.7, 129.9, 32.8] });
    expect(result.inBbox).toBe(1);
    expect(result.add.map((item) => item.gers)).toEqual([inside.id]);
  });

  it("adds a reference to an existing place with the same name, instead of a second place", () => {
    const double = place(1, { ...base, names: { primary: "既存カフェ", common: {} } });
    const result = plan([double], [existingPlace("existing-1")]);
    expect(result.add).toEqual([]);
    expect(result.duplicatesOfExisting).toEqual([
      {
        placeId: "existing-1",
        gers: double.id,
        lat: double.lat,
        lng: double.lng,
        dataset: "meta",
        licence: "CDLA-Permissive-2.0",
        metres: 0,
        by: "name",
      },
    ]);
  });

  it("matches the Japanese or English name of an existing place, written differently", () => {
    const result = plan(
      [place(1, { ...north(20), names: { primary: "ｍｏｃｋ　ＣＡＦＥ", common: {} } })],
      [existingPlace("existing-1", { names: ["既存カフェ", "Mock Cafe"] })],
    );
    expect(result.duplicatesOfExisting).toHaveLength(1);
  });

  it("does not match a different place within 50 m, or the same name farther away", () => {
    const result = plan(
      [
        place(1, { ...north(10), names: { primary: "別の食堂", common: {} } }),
        place(2, { ...north(80), names: { primary: "既存カフェ", common: {} } }),
      ],
      [existingPlace("existing-1")],
    );
    expect(result.duplicatesOfExisting).toEqual([]);
    expect(result.add).toHaveLength(2);
  });

  it("matches a place a steward took off the map, so it never comes back as a new place", () => {
    const hidden = existingPlace("hidden-1", { onMap: false });
    const result = plan(
      [place(1, { ...base, names: { primary: "既存カフェ", common: {} } })],
      [hidden],
    );
    expect(result.add).toEqual([]);
    expect(result.duplicatesOfExisting.map((link) => link.placeId)).toEqual(["hidden-1"]);
  });

  it("leaves a place with no pin out of the matching but counts it on the map", () => {
    const result = plan(
      [place(1, { ...base, names: { primary: "既存カフェ", common: {} } })],
      [existingPlace("pinless", { pin: null })],
    );
    expect(result.add).toHaveLength(1);
    expect(result.map.onMapNow).toBe(1);
  });

  it("skips a record already imported, whatever its place", () => {
    const result = plan(
      [place(1)],
      [
        existingPlace("existing-1", {
          names: ["x"],
          pin: north(5000),
          refs: [{ provider: "overture", ref: gers(1) }],
        }),
      ],
    );
    expect(result.alreadyImported).toBe(1);
    expect(result.add).toEqual([]);
    expect(result.duplicatesOfExisting).toEqual([]);
  });

  it("keeps the most confident of two Overture records of one place", () => {
    const low = place(1, { ...base, confidence: 0.8, names: { primary: "架空食堂", common: {} } });
    const high = place(2, {
      ...north(10),
      confidence: 0.95,
      names: { primary: "架空食堂", common: {} },
    });
    const result = plan([low, high]);
    expect(result.add.map((item) => item.gers)).toEqual([high.id]);
    expect(result.duplicatesWithinOverture).toEqual([
      { gers: low.id, keep: high.id, by: "name", metres: 10 },
    ]);
  });

  it("chooses the same winner whatever the order of the snapshot", () => {
    const a = place(1, { ...base, confidence: 0.9, names: { primary: "架空食堂", common: {} } });
    const b = place(2, {
      ...north(10),
      confidence: 0.9,
      names: { primary: "架空食堂", common: {} },
    });
    expect(plan([a, b]).add.map((item) => item.gers)).toEqual(
      plan([b, a]).add.map((item) => item.gers),
    );
  });

  it("sets the map total after the import against the budget", () => {
    const places = [place(1), place(2), place(3)];
    const existing = [
      existingPlace("a", { pin: north(9000) }),
      existingPlace("b", { onMap: false, pin: north(9100) }),
    ];
    expect(plan(places, existing, { mapBudget: 4 }).map).toEqual({
      onMapNow: 1,
      afterImport: 4,
      budget: 4,
      withinBudget: true,
    });
    expect(plan(places, existing, { mapBudget: 3 }).map.withinBudget).toBe(false);
  });
});
