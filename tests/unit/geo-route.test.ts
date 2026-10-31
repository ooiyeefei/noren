import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGeoSearchRoute,
  toSuggestions,
  type GeoSearchRouteDeps,
} from "@/lib/geo/search-route";
import { jsonError } from "@/lib/http/handler";
import type { GeoCandidate } from "@/lib/ports";
import { activeRegionConfig } from "@/lib/region/registry";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/convex/server", () => ({ requirePersonOnServer: vi.fn() }));

import { requirePersonOnServer } from "@/lib/convex/server";

const region = activeRegionConfig();
const userAgent = "Noren-test/1.0 (+https://example.invalid/geo-policy)";
const item = {
  lat: "32.75",
  lon: "129.87",
  display_name: "Mock place, Mock region",
  namedetails: { name: "Mock default", "name:ja": "模擬の場所", "name:en": "Mock place" },
  category: "amenity",
  type: "cafe",
  osm_type: "node",
  osm_id: 123,
};

function setup(overrides: Partial<GeoSearchRouteDeps> = {}) {
  let time = 0;
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json([item]));
  const authorize = vi.fn<GeoSearchRouteDeps["authorize"]>().mockResolvedValue({ ok: true });
  const env: Record<string, string | undefined> = { GEO_USER_AGENT: userAgent };
  const handler = createGeoSearchRoute({
    region,
    env,
    fetch,
    authorize,
    now: () => time,
    ...overrides,
  });
  return {
    fetch,
    authorize,
    env,
    get: (params = "q=mock") => handler(new Request(`http://x/api/geo/search?${params}`)),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  expect(body.error.code.length).toBeGreaterThan(0);
  expect(body.error.message.trim().length).toBeGreaterThan(0);
  return body.error.message as string;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("geo search route", () => {
  it.each([
    ["signed out", 401, "unauthenticated"],
    ["refused", 403, "forbidden"],
  ] as const)("%s is %s and never calls the provider", async (_label, status, code) => {
    const { get, fetch, authorize } = setup();
    authorize.mockImplementation(async () => ({
      ok: false,
      response: jsonError(code, "access refused"),
    }));
    for (const params of ["q=mock", ""]) await expectError(await get(params), status, code);
    expect(fetch).not.toHaveBeenCalled();
    authorize.mockResolvedValue({ ok: true });
    expect((await get()).status).toBe(200);
  });

  it.each(["", "q=", "q=%20%20", `q=${"a".repeat(201)}`])(
    "a missing, blank or 201-character q is 400 invalid_input (%s)",
    async (params) => {
      const { get, fetch } = setup();
      await expectError(await get(params), 400, "invalid_input");
      expect(fetch).not.toHaveBeenCalled();
      expect((await get()).status).toBe(200);
    },
  );

  it("an unsupported lang is 400", async () => {
    const { get, fetch } = setup();
    await expectError(await get("q=mock&lang=fr"), 400, "invalid_input");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns at most five suggestions named in the requested language with provider and attribution", async () => {
    const { get, fetch } = setup();
    fetch.mockImplementation(async () => Response.json(Array.from({ length: 8 }, () => item)));
    for (const [lang, name] of [
      ["ja", "模擬の場所"],
      ["en", "Mock place"],
    ]) {
      const response = await get(`q=mock&lang=${lang}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(await response.json()).toEqual({
        suggestions: Array.from({ length: 5 }, () => ({
          name,
          lat: 32.75,
          lng: 129.87,
          provider: "nominatim",
          attribution: ["© OpenStreetMap contributors", "Nominatim"],
        })),
      });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default name and drops candidates without any name", () => {
    const candidate: GeoCandidate = {
      names: { default: "Mock default" },
      lat: 32.75,
      lng: 129.87,
      category: "amenity/cafe",
      providerRef: "osm:node/123",
      attribution: ["© OpenStreetMap contributors", "Nominatim"],
    };
    expect(toSuggestions([candidate, { ...candidate, names: {} }], "ja")).toEqual([
      {
        name: "Mock default",
        lat: 32.75,
        lng: 129.87,
        provider: "nominatim",
        attribution: [...candidate.attribution],
      },
    ]);
  });

  it("calls the provider with the region bbox, countrycodes, both locales, submit mode and configured User-Agent", async () => {
    const { get, fetch } = setup();
    const response = await get("q=%20mock%20&ignored=yes");
    expect((await response.json()).suggestions[0].name).toBe(
      item.namedetails[`name:${region.defaultLocale}` as "name:ja" | "name:en"],
    );
    const [input, init] = fetch.mock.calls[0]!;
    const [west, south, east, north] = region.bbox;
    expect(Object.fromEntries(new URL(String(input)).searchParams)).toEqual({
      q: "mock",
      format: "jsonv2",
      limit: "5",
      countrycodes: region.geo.countrycodes.join(","),
      viewbox: [west, north, east, south].join(","),
      bounded: "1",
      "accept-language": region.locales.join(","),
      namedetails: "1",
    });
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("User-Agent")).toBe(userAgent);
    // The real policy and adapter both refuse typeahead before reaching fetch.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a second different query within one second is 429; the same query comes from cache", async () => {
    const { get, fetch, advance } = setup();
    expect((await get()).status).toBe(200);
    advance(999);
    const limited = await get("q=other");
    expect(limited.headers.get("Retry-After")).toBe("1");
    await expectError(limited, 429, "rate_limited");
    expect((await get()).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(1);
    expect((await get("q=other")).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "  ", "Noren@invalid"])(
    "invalid GEO_USER_AGENT is 500 (%s)",
    async (value) => {
      const env = { GEO_USER_AGENT: value };
      const { get, fetch } = setup({ env });
      const message = await expectError(await get(), 500, "internal");
      expect(message).toBe("geo search is not configured: GEO_USER_AGENT is missing or invalid");
      if (value) expect(message).not.toContain(value);
      expect(fetch).not.toHaveBeenCalled();
      env.GEO_USER_AGENT = userAgent;
      expect((await get()).status).toBe(200);
      env.GEO_USER_AGENT = undefined;
      await expectError(await get(), 500, "internal");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["503", "AbortError"])(
    "provider %s is 500 internal with the reason code",
    async (reason) => {
      const { get, fetch } = setup();
      if (reason === "503") fetch.mockResolvedValue(new Response("upstream body", { status: 503 }));
      else
        fetch.mockRejectedValue(
          Object.assign(new Error("upstream details"), { name: "AbortError" }),
        );
      expect(await expectError(await get(), 500, "internal")).toBe(
        `geo search failed (provider_error:${reason})`,
      );
    },
  );

  it("returns an empty suggestions array when no places match", async () => {
    const { get, fetch } = setup();
    fetch.mockImplementation(async () => Response.json([]));
    expect(await (await get()).json()).toEqual({ suggestions: [] });
  });

  it("route.ts wires the real handler", async () => {
    vi.mocked(requirePersonOnServer).mockImplementation(async () => ({
      ok: false,
      response: jsonError("unauthenticated", "sign in to continue"),
    }));
    const fetch = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/geo/search/route");
    await expectError(
      await GET(new Request("http://x/api/geo/search?q=dejima")),
      401,
      "unauthenticated",
    );
    // Any signed-in member may search for a place to add (FR-032).
    expect(requirePersonOnServer).toHaveBeenCalledWith();
    expect(fetch).not.toHaveBeenCalled();
  });
});
