import malaysiaWest from "../../../regions/malaysia-west.json";
import nagasaki from "../../../regions/nagasaki.json";
import { areaRegionSchema, overlayAreaRegion, regionSchema, type RegionConfig } from "./schema";

const files: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["nagasaki", nagasaki],
  ["malaysia-west", malaysiaWest],
]);
const defaultHomeId = "nagasaki";

type RegionEnv = { REGION_ID?: string; REGIONS_PREVIEW?: string };

function parseRegion<T extends { id: string }>(
  id: string,
  result: { success: true; data: T } | { success: false; error: { message: string } },
): T {
  if (!result.success) throw new Error(`${id}.json is invalid: ${result.error.message}`);
  if (result.data.id !== id) {
    throw new Error(`${id}.json declares a different region id: ${result.data.id}`);
  }
  return result.data;
}

function loadRegionConfigs(homeId: string): ReadonlyMap<string, RegionConfig> {
  if (!files.has(homeId)) throw new Error(`Unknown REGION_ID "${homeId}"`);
  const home = parseRegion(homeId, regionSchema.safeParse(files.get(homeId)));
  return new Map(
    Array.from(files, ([id, json]) => {
      if (id === homeId) return [id, home];
      const area = parseRegion(id, areaRegionSchema.safeParse(json));
      return [id, parseRegion(id, overlayAreaRegion(home, area))];
    }),
  );
}

const configuredHomeId = process.env.REGION_ID || defaultHomeId;

/** Every shipped file is validated at module load, with its filename in any error. */
export const REGION_CONFIGS = loadRegionConfigs(configuredHomeId);

function configsFor(homeId: string): ReadonlyMap<string, RegionConfig> {
  return homeId === configuredHomeId ? REGION_CONFIGS : loadRegionConfigs(homeId);
}

export function getRegionConfig(id: string): RegionConfig | undefined {
  return REGION_CONFIGS.get(id);
}

export function homeRegionConfig(
  env: RegionEnv = { REGION_ID: process.env.REGION_ID },
): RegionConfig {
  const homeId = env.REGION_ID || defaultHomeId;
  const home = configsFor(homeId).get(homeId);
  if (!home) throw new Error(`Unknown REGION_ID "${homeId}"`);
  return home;
}

export function activeRegionConfig(env?: RegionEnv): RegionConfig {
  return homeRegionConfig(env);
}

export function enabledRegionConfigs(
  env: RegionEnv = {
    REGION_ID: process.env.REGION_ID,
    REGIONS_PREVIEW: process.env.REGIONS_PREVIEW,
  },
): RegionConfig[] {
  const homeId = env.REGION_ID || defaultHomeId;
  const preview = new Set(env.REGIONS_PREVIEW?.split(",").map((id) => id.trim()));
  return [...configsFor(homeId).values()].filter(
    (config) => preview.has(config.id) || (config.enabled ?? config.id === homeId),
  );
}
