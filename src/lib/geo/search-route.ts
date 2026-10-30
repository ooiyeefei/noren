import { z } from "zod";
import { createGeoSearch, createNominatimSearch, geoUserAgent, nominatimPolicy } from ".";
import { jsonError, parseQuery } from "../http/handler";
import type { GeoCandidate, Search } from "../ports";
import type { RegionConfig } from "../region/schema";

export type GeoSuggestion = {
  /** Display name in the requested language, else the provider's default name. Never stored as truth. */
  name: string;
  lat: number;
  lng: number;
  provider: "nominatim";
  /** Shown next to suggestions. Never empty. */
  attribution: string[];
};

export type GeoSearchResponse = { suggestions: GeoSuggestion[] };

export type GeoSearchRouteDeps = {
  region: RegionConfig;
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof globalThis.fetch;
  /** Wraps requireRoleOnServer(["creator"]) in production; a fake in tests. */
  authorize: () => Promise<{ ok: true } | { ok: false; response: Response }>;
  now?: () => number;
};

export function toSuggestions(candidates: readonly GeoCandidate[], lang: string): GeoSuggestion[] {
  return candidates.flatMap((candidate) => {
    const name = candidate.names[lang] ?? candidate.names.default;
    return name
      ? [
          {
            name,
            lat: candidate.lat,
            lng: candidate.lng,
            provider: "nominatim" as const,
            attribution: [...candidate.attribution],
          },
        ]
      : [];
  });
}

/** One handler owns one cached, rate-limited Search for this server instance. */
export function createGeoSearchRoute(
  deps: GeoSearchRouteDeps,
): (request: Request) => Promise<Response> {
  const schema = z.object({
    q: z.string().trim().min(1).max(200),
    lang: z
      .string()
      .refine((lang) => deps.region.locales.includes(lang))
      .optional(),
  });
  let search: Search | undefined;

  return async (request) => {
    const authorization = await deps.authorize();
    if (!authorization.ok) return authorization.response;

    const query = parseQuery(schema, request.url);
    if (!query.ok) return query.response;

    const userAgent = geoUserAgent(deps.env);
    if (userAgent === null) {
      return jsonError(
        "internal",
        "geo search is not configured: GEO_USER_AGENT is missing or invalid",
      );
    }
    search ??= createGeoSearch({
      search: createNominatimSearch({ fetch: deps.fetch, userAgent }),
      policy: nominatimPolicy(userAgent),
      now: deps.now,
    });
    const result = await search.search(query.data.q, {
      mode: "submit",
      bbox: deps.region.bbox,
      countrycodes: deps.region.geo.countrycodes,
      languages: deps.region.locales,
    });
    if (!result.ok) {
      return result.reason === "rate_limited"
        ? jsonError("rate_limited", "geo search failed (rate_limited)", {
            headers: { "Retry-After": "1" },
          })
        : jsonError("internal", `geo search failed (${result.reason})`);
    }
    const body: GeoSearchResponse = {
      suggestions: toSuggestions(result.candidates, query.data.lang ?? deps.region.defaultLocale),
    };
    return Response.json(body, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  };
}
