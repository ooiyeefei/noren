import {
  enabledRegionConfigs,
  getRegionConfig,
  homeRegionConfig,
} from "../../src/lib/region/registry";
import {
  deriveRegionPolicy,
  type RegionConfig,
  type RegionPolicy,
} from "../../src/lib/region/schema";
import { appError } from "./errors";

export function regionConfig(regionId: string): RegionConfig {
  const region = getRegionConfig(regionId);
  if (!region) throw appError("invalid_input", `Unknown region "${regionId}"`);
  return region;
}

export function homeRegion(): RegionConfig {
  return homeRegionConfig();
}

export function enabledRegionIds(): string[] {
  return enabledRegionConfigs().map(({ id }) => id);
}

export function isRegionOn(regionId: string): boolean {
  return enabledRegionIds().includes(regionId);
}

export function tripSwitch(): RegionConfig["features"]["trip"] {
  return homeRegion().features.trip;
}

export function factsOn(): boolean {
  return homeRegion().features.facts;
}

export function regionPolicy(regionId: string): RegionPolicy {
  return deriveRegionPolicy(regionConfig(regionId));
}

/** Inclusive bbox check; non-finite coordinates cannot belong to a region. */
export function isInsideRegion(region: RegionConfig, point: { lat: number; lng: number }): boolean {
  const [west, south, east, north] = region.bbox;
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lng >= west &&
    point.lng <= east &&
    point.lat >= south &&
    point.lat <= north
  );
}

export function isRegionLocale(region: RegionConfig, lang: string): boolean {
  return region.locales.includes(lang);
}

export function isCautionKey(region: RegionConfig, key: string): boolean {
  return region.cautionVocabulary.some((caution) => caution.key === key);
}

export function isCategoryKey(region: RegionConfig, key: string): boolean {
  return region.categories?.some((category) => category.key === key) ?? false;
}

export function isFactKey(region: RegionConfig, key: string): boolean {
  return region.factVocabulary?.some((fact) => fact.key === key) ?? false;
}
