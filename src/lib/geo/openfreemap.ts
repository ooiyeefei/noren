import type { MapStyle } from "../ports";
import type { RegionConfig } from "../region/schema";

export const OPENFREEMAP_THEMES = ["liberty", "bright", "positron"] as const;
export const DEFAULT_IDEOGRAPH_FONT = "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif";

export function createOpenFreeMapStyle(region: RegionConfig): MapStyle {
  if (region.geo.mapStyle.adapter !== "openfreemap") {
    throw new Error("Expected openfreemap adapter");
  }
  return {
    styleUrl(region, theme) {
      const url = region.geo.mapStyle.url;
      if (!OPENFREEMAP_THEMES.some((known) => known === theme)) return url;
      const themed = new URL(url);
      themed.pathname = themed.pathname.replace(/[^/]+\/?$/, theme);
      return themed.toString();
    },
    attribution: region.geo.attribution,
    glyphs: undefined,
    cjkMode: "localIdeographFontFamily",
  };
}
