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
  regions?: readonly RegionConfig[];
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
  const regions = deps.regions ?? [deps.region];
  const boxes = regions.map((region) => region.bbox);
  // Nominatim accepts one viewbox per request. Limit hits to the individual boxes before display.
  const bbox: RegionConfig["bbox"] = [
    Math.min(...boxes.map(([west]) => west)),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
  const countrycodes = [...new Set(regions.flatMap((region) => region.geo.countrycodes))];
  let search: Search | undefined;

  return async (request) => {
    const authorization = await deps.authorize();
    if (!authorization.ok) return authorization.response;

    const query = parseQuery(schema, request.url);
    if (!query.ok) return query.response;

    if (!regions.length) return Response.json({ suggestions: [] });
    const userAgent = geoUserAgent(deps.env);
    if (userAgent === null) {
      return jsonError(
        "internal",
        "geo search is not configured: GEO_USER_AGENT is missing or invalid",
      );
    }
    search ??= createGeoSearch({
      search: createNominatimSearch({ fetch: deps.fetch, userAgent, boxes }),
      policy: nominatimPolicy(userAgent),
      now: deps.now,
    });
    const result = await search.search(query.data.q, {
      mode: "submit",
      bbox,
      countrycodes,
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
