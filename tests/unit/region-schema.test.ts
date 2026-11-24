import { expect, it } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { areaRegionSchema, regionSchema } from "../../src/lib/region/schema";

const area = {
  id: "test-area",
  name: nagasaki.name,
  bbox: nagasaki.bbox,
  defaultCenter: nagasaki.defaultCenter,
  nameFallback: nagasaki.nameFallback,
  geo: { countrycodes: nagasaki.geo.countrycodes, attribution: nagasaki.geo.attribution },
  cautionVocabulary: nagasaki.cautionVocabulary,
  categories: nagasaki.categories,
  collection: { utcOffsetHours: 9 },
};

const pin = nagasaki.defaultCenter;
const point = (id: string) => ({ id, pin: { lat: pin.lat, lng: pin.lng }, offRoadMinutes: 5 });
const roadSource = { text: "Test data", builtOn: "2026-11-24", licence: "ODbL-1.0" };
const fact = {
  key: "test_fact",
  labels: { en: "Test fact", ja: "テスト" },
  labelsReviewedBy: null,
};

it("accepts Nagasaki without the new switches", () => {
  const legacyFeatures: Partial<typeof nagasaki.features> = { ...nagasaki.features };
  delete legacyFeatures.trip;
  delete legacyFeatures.facts;
  expect(regionSchema.parse({ ...nagasaki, features: legacyFeatures }).features).toMatchObject({
    trip: "off",
    facts: false,
  });
});

it("refuses a disconnected road point", () => {
  const roads = {
    points: [point("test-a"), point("test-b"), point("test-c")],
    segments: [{ from: "test-a", to: "test-b", minutes: 1, kilometres: 1, road: "Test" }],
    source: roadSource,
  };
  expect(areaRegionSchema.safeParse({ ...area, roads }).error?.issues).toMatchObject([
    { path: ["roads", "points"] },
  ]);
  expect(
    areaRegionSchema.safeParse({
      ...area,
      roads: { ...roads, points: roads.points.slice(0, 2) },
    }).success,
  ).toBe(true);
});

it("refuses a fact without effects", () => {
  expect(
    areaRegionSchema.safeParse({ ...area, factVocabulary: [fact] }).error?.issues,
  ).toMatchObject([{ path: ["factVocabulary", 0] }]);
});

it("refuses app-wide settings in an area file", () => {
  expect(areaRegionSchema.safeParse(area).success).toBe(true);
  expect(areaRegionSchema.safeParse({ ...area, features: { trip: "open" } }).success).toBe(false);
  expect(
    areaRegionSchema.safeParse({
      ...area,
      collection: { ...area.collection, newAccount: nagasaki.collection.newAccount },
    }).success,
  ).toBe(false);
});

it("refuses town and segment references to unknown road points", () => {
  const roads = {
    points: [point("test-a")],
    segments: [{ from: "test-missing", to: "test-a", minutes: 1, kilometres: 1, road: "Test" }],
    source: roadSource,
  };
  const [town] = nagasaki.towns;
  expect(
    areaRegionSchema.safeParse({
      ...area,
      roads,
      towns: [{ ...town, onRoad: "test-missing" }],
    }).error?.issues,
  ).toMatchObject([{ path: ["towns", 0, "onRoad"] }, { path: ["roads", "segments", 0, "from"] }]);
});

it("accepts road endpoints that name a point and refuses one that does not", () => {
  const roads = {
    points: [point("test-a"), point("test-b")],
    segments: [{ from: "test-a", to: "test-b", minutes: 1, kilometres: 1, road: "Test" }],
    source: roadSource,
  };
  expect(
    areaRegionSchema.safeParse({ ...area, roads: { ...roads, endpoints: ["test-a"] } }).success,
  ).toBe(true);
  expect(
    areaRegionSchema.safeParse({ ...area, roads: { ...roads, endpoints: ["test-missing"] } }).error
      ?.issues,
  ).toMatchObject([{ path: ["roads", "endpoints", 0] }]);
});

it("checks fact key uniqueness and translations", () => {
  expect(
    areaRegionSchema.safeParse({
      ...area,
      factVocabulary: [
        { ...fact, meets: ["step-free"] },
        { ...fact, meets: ["step-free"], labels: { en: "Test fact" } },
      ],
    }).error?.issues,
  ).toMatchObject([
    { path: ["factVocabulary", 1, "key"] },
    { path: ["factVocabulary", 1, "labels"] },
  ]);
});

it("requires towns, name languages and categories when explicitly enabled", () => {
  expect(
    areaRegionSchema.safeParse({
      ...area,
      enabled: true,
      categories: undefined,
    }).error?.issues,
  ).toMatchObject([{ path: ["towns"] }, { path: ["nameLanguages"] }, { path: ["categories"] }]);
});
