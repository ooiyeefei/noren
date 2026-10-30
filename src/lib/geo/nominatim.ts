import type { GeoCandidate, Search } from "../ports";
import { isAllowedServerFetch } from "../security/outbound";

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
  namedetails?: Record<string, string>;
  category: string;
  type: string;
  osm_type: string;
  osm_id: number | string;
};

export function createNominatimSearch(options: {
  fetch: typeof globalThis.fetch;
  userAgent: string;
  endpoint?: string;
  timeoutMs?: number;
}): Search {
  const userAgent = options.userAgent.trim();
  if (!userAgent || userAgent.includes("@")) throw new Error("Invalid geo User-Agent");
  const endpoint = options.endpoint ?? "https://nominatim.openstreetmap.org/search";
  if (!isAllowedServerFetch(endpoint)) throw new Error("Disallowed Nominatim endpoint");

  return {
    async search(query, searchOptions) {
      if (searchOptions.mode === "typeahead") {
        return { ok: false, reason: "typeahead_not_allowed" };
      }
      if (!query.trim() || query.length > 200) return { ok: false, reason: "invalid_input" };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
      try {
        const url = new URL(endpoint);
        const [west, south, east, north] = searchOptions.bbox;
        const params = {
          q: query.trim(),
          format: "jsonv2",
          limit: "5",
          countrycodes: searchOptions.countrycodes.join(","),
          viewbox: [west, north, east, south].join(","),
          bounded: "1",
          "accept-language": searchOptions.languages.join(","),
          namedetails: "1",
        };
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const response = await options.fetch(url, {
          method: "GET",
          redirect: "error",
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return { ok: false, reason: `provider_error:${response.status}` };
        const items: NominatimItem[] = await response.json();
        const candidates: GeoCandidate[] = [];
        for (const item of items) {
          const lat = Number.parseFloat(item.lat);
          const lng = Number.parseFloat(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const names: Record<string, string> = {};
          if (item.namedetails) {
            if (item.namedetails.name) names.default = item.namedetails.name;
            for (const lang of searchOptions.languages) {
              const name = item.namedetails[`name:${lang}`];
              if (name) names[lang] = name;
            }
          } else {
            names.default = item.display_name.split(",")[0]?.trim() ?? "";
          }
          candidates.push({
            names,
            lat,
            lng,
            category: `${item.category}/${item.type}`,
            providerRef: `osm:${item.osm_type}/${item.osm_id}`,
            attribution: ["© OpenStreetMap contributors", "Nominatim"],
          });
          if (candidates.length === 5) break;
        }
        return { ok: true, candidates };
      } catch (error) {
        const name = error instanceof Error ? error.name : "Error";
        return { ok: false, reason: `provider_error:${name}` };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
