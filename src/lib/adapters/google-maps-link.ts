import type { RegisteredAdapter } from "./index";
import { cleanUrl, parsedUrl, requireMatch } from "./url";

export const googleMapsLinkAdapter: RegisteredAdapter = {
  id: "google_maps_link",
  frameHosts: [],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: [] },
  matches(input) {
    const url = parsedUrl(input);
    if (!url) return false;
    if (url.hostname === "maps.app.goo.gl") return true;
    if (url.hostname === "goo.gl") return /^\/maps(?:\/|$)/.test(url.pathname);
    return (
      /^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/.test(url.hostname) &&
      url.pathname.startsWith("/maps")
    );
  },
  describe(input) {
    const parsed = requireMatch(input, googleMapsLinkAdapter.matches);
    const placeId =
      parsed.searchParams.get("query_place_id") || parsed.searchParams.get("place_id");
    parsed.protocol = "https:";
    parsed.hash = "";
    let url = cleanUrl(parsed, ["g_st"]);
    if (placeId) {
      const query = parsed.searchParams.get("query") || "place";
      url = `https://www.google.com/maps/search?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
    }
    return {
      platform: "google_maps",
      canonicalUrl: url,
      embed: placeId ? { kind: "link", url, placeId } : { kind: "link", url },
    };
  },
  author: () => null,
  liveness: async () => "unknown",
};
