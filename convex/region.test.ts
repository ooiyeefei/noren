/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, it } from "vitest";
import schema from "./schema";
import {
  isCautionKey,
  isCategoryKey,
  isInsideRegion,
  isRegionLocale,
  regionConfig,
  regionPolicy,
} from "./lib/region";

const modules = import.meta.glob("./**/*.ts");

it("regionConfig returns nagasaki", async () => {
  const t = convexTest(schema, modules);
  await t.run(async () => {
    expect(regionConfig("nagasaki").id).toBe("nagasaki");
  });
});
it("regionConfig throws invalid_input for an unknown region", () => {
  try {
    regionConfig("unknown");
    expect.fail("Expected unknown region to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    if (!(error instanceof ConvexError)) throw error;
    expect(error.data.code).toBe("invalid_input");
  }
});
it("isInsideRegion accepts the default centre and the bbox corners, rejects a point outside and NaN", () => {
  const region = regionConfig("nagasaki");
  const [west, south, east, north] = region.bbox;
  expect(isInsideRegion(region, region.defaultCenter)).toBe(true);
  for (const lng of [west, east]) {
    for (const lat of [south, north]) expect(isInsideRegion(region, { lat, lng })).toBe(true);
  }
  expect(isInsideRegion(region, { lat: south - 1, lng: west })).toBe(false);
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(isInsideRegion(region, { lat: value, lng: west })).toBe(false);
    expect(isInsideRegion(region, { lat: south, lng: value })).toBe(false);
  }
});
it("isRegionLocale and isCautionKey follow the config", () => {
  const region = regionConfig("nagasaki");
  for (const lang of region.locales) expect(isRegionLocale(region, lang)).toBe(true);
  for (const { key } of region.cautionVocabulary) expect(isCautionKey(region, key)).toBe(true);
  expect(isRegionLocale(region, "unknown")).toBe(false);
  expect(isCautionKey(region, "unknown")).toBe(false);
});
it("regionPolicy keeps real businesses draft-only while launchPackComplete is false", () => {
  expect(regionConfig("nagasaki").legal.launchPackComplete).toBe(false);
  expect(regionPolicy("nagasaki")).toEqual({
    realBusinessesDraftOnly: true,
    inviteOnly: true,
    noindex: true,
    allowPilotVisibility: false,
  });
});

it("isCategoryKey accepts only a configured category, including regions with no vocabulary", () => {
  const region = regionConfig("nagasaki");
  expect(region.categories?.length).toBeGreaterThan(0);
  for (const { key } of region.categories ?? []) expect(isCategoryKey(region, key)).toBe(true);
  expect(isCategoryKey(region, "unknown")).toBe(false);
  expect(isCategoryKey({ ...region, categories: undefined }, "cafe")).toBe(false);
});
