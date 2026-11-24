import { readdirSync, readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { regionSchema } from "../../src/lib/region/schema";
import {
  activeRegionConfig,
  enabledRegionConfigs,
  getRegionConfig,
  homeRegionConfig,
  REGION_CONFIGS,
} from "../../src/lib/region/registry";

it("the registry holds exactly the regions in regions/", () => {
  const files = readdirSync("regions")
    .filter((file) => file.endsWith(".json"))
    .sort();
  expect([...REGION_CONFIGS.keys()].map((id) => `${id}.json`).sort()).toEqual(files);
  expect([...REGION_CONFIGS.keys()]).toEqual(["nagasaki", "malaysia-west"]);
  expect(getRegionConfig("nagasaki")).toEqual(regionSchema.parse(nagasaki));
});
it("activeRegionConfig uses REGION_ID", () => {
  expect(activeRegionConfig({ REGION_ID: "nagasaki" })).toBe(getRegionConfig("nagasaki"));
});
it("throws for an unknown REGION_ID", () => {
  expect(() => activeRegionConfig({ REGION_ID: "unknown" })).toThrow("unknown");
});
it("returns Nagasaki as the home region when unset", () => {
  expect(homeRegionConfig({})).toBe(getRegionConfig("nagasaki"));
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

afterEach(() => vi.unstubAllEnvs());

it("lays Malaysian area fields over the app-wide settings", () => {
  const home = homeRegionConfig({});
  const area = getRegionConfig("malaysia-west");
  expect(area).toMatchObject({
    id: "malaysia-west",
    locales: home.locales,
    defaultLocale: home.defaultLocale,
    legal: home.legal,
    features: home.features,
    sharing: home.sharing,
    photos: home.photos,
    voice: home.voice,
    minimumAge: home.minimumAge,
    takedown: home.takedown,
    demo: home.demo,
    consent: home.consent,
    retention: home.retention,
    collection: { newAccount: home.collection.newAccount, utcOffsetHours: 8 },
    geo: { countrycodes: ["my"] },
    enabled: true,
  });
  expect(area?.neighbourhoods).toBeUndefined();
  expect(area?.geo.aerialPhoto).toBeUndefined();
});

it("lists Malaysia as enabled in the shipped config, with or without a preview", () => {
  vi.stubEnv("REGION_ID", undefined);
  vi.stubEnv("REGIONS_PREVIEW", undefined);
  expect(enabledRegionConfigs().map(({ id }) => id)).toEqual(["nagasaki", "malaysia-west"]);
  vi.stubEnv("REGIONS_PREVIEW", " , unknown , malaysia-west , malaysia-west ");
  expect(enabledRegionConfigs().map(({ id }) => id)).toEqual(["nagasaki", "malaysia-west"]);
});

it("lists Malaysia only with an explicit preview when its file says enabled: false", async () => {
  // The registry reads the file at load, so load a copy of it with Malaysia switched off.
  vi.resetModules();
  vi.doMock("../../regions/malaysia-west.json", async (original) => {
    const file = (await original<{ default: Record<string, unknown> }>()).default;
    return { default: { ...file, enabled: false } };
  });
  try {
    const off = await import("../../src/lib/region/registry");
    vi.stubEnv("REGION_ID", undefined);
    vi.stubEnv("REGIONS_PREVIEW", undefined);
    expect(off.enabledRegionConfigs().map(({ id }) => id)).toEqual(["nagasaki"]);
    vi.stubEnv("REGIONS_PREVIEW", " , unknown , malaysia-west , malaysia-west ");
    expect(off.enabledRegionConfigs().map(({ id }) => id)).toEqual(["nagasaki", "malaysia-west"]);
  } finally {
    vi.doUnmock("../../regions/malaysia-west.json");
    vi.resetModules();
  }
});

it("rejects an area-only file chosen as home", () => {
  expect(() => homeRegionConfig({ REGION_ID: "malaysia-west" })).toThrow(
    "malaysia-west.json is invalid",
  );
});
