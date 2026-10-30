import type { GeoPolicy, GeoSearchResult, Search } from "../ports";

export { createOpenFreeMapStyle, OPENFREEMAP_THEMES, DEFAULT_IDEOGRAPH_FONT } from "./openfreemap";
export { createNominatimSearch } from "./nominatim";

export function nominatimPolicy(userAgent: string): GeoPolicy {
  return { rateLimit: 1, userAgent, cacheTtl: 86_400, storage: "reference-only" };
}

export function geoUserAgent(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env.GEO_USER_AGENT?.trim();
  return value && /^[\w.-]+\/[\w.-]+ \(\+https:\/\/[^\s)]+\)$/.test(value) ? value : null;
}

export function createGeoSearch(options: {
  search: Search;
  policy: GeoPolicy;
  now?: () => number;
  maxEntries?: number;
}): Search {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 500;
  const cache = new Map<string, { expires: number; result: GeoSearchResult }>();
  // D-12 (2026-10-30): accept per-instance limits although Nominatim's limit is per app.
  // Upgrade to a shared Convex limiter when traffic grows.
  let lastCall: number | undefined;

  return {
    async search(query, searchOptions) {
      if (searchOptions.mode === "typeahead") {
        return { ok: false, reason: "typeahead_not_allowed" };
      }
      if (!query.trim() || query.length > 200) return { ok: false, reason: "invalid_input" };
      const key = JSON.stringify([
        query.trim().toLowerCase().replace(/\s+/g, " "),
        searchOptions.bbox,
        searchOptions.countrycodes,
        searchOptions.languages,
      ]);
      const time = now();
      const cached = cache.get(key);
      if (cached && time < cached.expires) return structuredClone(cached.result);
      if (cached) cache.delete(key);
      if (lastCall !== undefined && time - lastCall < 1000 / options.policy.rateLimit) {
        return { ok: false, reason: "rate_limited" };
      }
      // Reserve before awaiting so concurrent misses share the same rate budget.
      lastCall = time;
      const result = await options.search.search(query, searchOptions);
      if (result.ok && maxEntries > 0) {
        cache.delete(key);
        cache.set(key, {
          expires: now() + options.policy.cacheTtl * 1000,
          result: structuredClone(result),
        });
        while (cache.size > maxEntries) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      }
      return result;
    },
  };
}
