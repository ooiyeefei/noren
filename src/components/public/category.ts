import type { Locale } from "@/lib/i18n";
import type { RegionConfig } from "@/lib/region/schema";

type CategoryRegion = Pick<RegionConfig, "categories" | "defaultLocale">;
export function categoryOptions(region: CategoryRegion, locale: Locale) {
  return [...(region.categories ?? [])]
    .sort((a, b) => Number(b.focus) - Number(a.focus))
    .map((entry) => ({
      key: entry.key,
      label: entry.labels[locale] || entry.labels[region.defaultLocale] || entry.key,
      unreviewed: entry.labelsReviewedBy === null,
      focus: entry.focus,
    }));
}
export function labelForCategory(region: CategoryRegion, key: string, locale: Locale) {
  return categoryOptions(region, locale).find((entry) => entry.key === key)?.label || key;
}
