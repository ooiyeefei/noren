import { vi } from "vitest";
import * as registry from "../../src/lib/region/registry";

type RegionEnv = Parameters<typeof registry.enabledRegionConfigs>[0];

/**
 * Switches regions off for the rest of the test, as a region file with
 * `"enabled": false` would. Malaysia now ships on, so a test that needs an off
 * region cannot lean on the shipped file any more. A region named in
 * REGIONS_PREVIEW still counts as on, exactly as in production, so tests can
 * flip it back with `vi.stubEnv("REGIONS_PREVIEW", id)`. Undone by
 * `vi.restoreAllMocks()`.
 */
export function switchRegionsOff(...off: string[]) {
  const original = registry.enabledRegionConfigs;
  return vi.spyOn(registry, "enabledRegionConfigs").mockImplementation((env?: RegionEnv) => {
    const preview = new Set(
      (env?.REGIONS_PREVIEW ?? process.env.REGIONS_PREVIEW)?.split(",").map((id) => id.trim()),
    );
    // Ask for every region, then drop the ones this test has switched off.
    const all = original({
      REGION_ID: env?.REGION_ID ?? process.env.REGION_ID,
      REGIONS_PREVIEW: [...registry.REGION_CONFIGS.keys()].join(","),
    });
    return all.filter((config) => preview.has(config.id) || !off.includes(config.id));
  });
}
