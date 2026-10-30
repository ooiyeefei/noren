import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadRegions } from "../../src/lib/region";
import { activeRegionConfig, getRegionConfig, REGION_CONFIGS } from "../../src/lib/region/registry";

it("the registry holds exactly the regions in regions/", () => {
  const loaded = loadRegions();
  expect([...REGION_CONFIGS.keys()].sort()).toEqual([...loaded.keys()].sort());
  for (const [id, region] of loaded) expect(getRegionConfig(id)).toEqual(region);
});
it("activeRegionConfig uses REGION_ID", () => {
  expect(activeRegionConfig({ REGION_ID: "nagasaki" })).toBe(getRegionConfig("nagasaki"));
});
it("throws for an unknown REGION_ID", () => {
  expect(() => activeRegionConfig({ REGION_ID: "unknown" })).toThrow("unknown");
});
it("returns the only region when unset", () => {
  expect(activeRegionConfig({})).toBe(getRegionConfig("nagasaki"));
});
it("getRegionConfig returns undefined for an unknown id", () => {
  expect(getRegionConfig("unknown")).toBeUndefined();
});
it("registry.ts and schema.ts import nothing through @/ or node:", () => {
  for (const file of ["registry.ts", "schema.ts"]) {
    const text = readFileSync(`src/lib/region/${file}`, "utf8");
    expect(text).not.toMatch(/(?:from\s*|import\s*\(?)['"](?:@\/|node:)/);
  }
});
