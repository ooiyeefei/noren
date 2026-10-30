import nagasaki from "../../../regions/nagasaki.json";
import { regionSchema, type RegionConfig } from "./schema";

const files = { "nagasaki.json": nagasaki };

/** Every region file is validated at module load, with its filename in any error. */
export const REGION_CONFIGS: ReadonlyMap<string, RegionConfig> = new Map(
  Object.entries(files).map(([file, json]) => {
    const result = regionSchema.safeParse(json);
    if (!result.success) throw new Error(`${file} is invalid: ${result.error.message}`);
    if (result.data.id !== file.replace(/\.json$/, "")) {
      throw new Error(`${file} declares a different region id: ${result.data.id}`);
    }
    return [result.data.id, result.data];
  }),
);

export function getRegionConfig(id: string): RegionConfig | undefined {
  return REGION_CONFIGS.get(id);
}

export function activeRegionConfig(
  env: { REGION_ID?: string } = { REGION_ID: process.env.REGION_ID },
): RegionConfig {
  if (env.REGION_ID) {
    const region = getRegionConfig(env.REGION_ID);
    if (!region) throw new Error(`Unknown REGION_ID "${env.REGION_ID}"`);
    return region;
  }
  const [only, ...rest] = REGION_CONFIGS.values();
  if (only && rest.length === 0) return only;
  throw new Error("Set REGION_ID to choose a region");
}
