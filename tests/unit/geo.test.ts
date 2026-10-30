import { afterEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import {
  createGeoSearch,
  createNominatimSearch,
  createOpenFreeMapStyle,
  DEFAULT_IDEOGRAPH_FONT,
  geoUserAgent,
  nominatimPolicy,
  OPENFREEMAP_THEMES,
} from "../../src/lib/geo";
import type { GeoSearchOptions, GeoSearchResult } from "../../src/lib/ports";
import { regionSchema } from "../../src/lib/region/schema";

const region = regionSchema.parse(nagasaki);
const searchOptions: GeoSearchOptions = {
  bbox: region.bbox,
  countrycodes: region.geo.countrycodes,
  languages: region.locales,
  mode: "submit",
};
const userAgent = "Noren/0.1 (+https://noren.yooi.me)";
const item = {
  lat: "32.75",
  lon: "129.87",
  display_name: "Mock place, Mock district",
  namedetails: {
    name: "Mock place",
    "name:ja": "模擬の場所",
    "name:en": "Mock place",
    "name:fr": "Mock",
  },
  category: "amenity",
  type: "cafe",
  osm_type: "node",
  osm_id: 123,
};

function adapter(items = [item]) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(items));
  return { fetch, search: createNominatimSearch({ fetch, userAgent }) };
}

afterEach(() => vi.useRealTimers());

describe("OpenFreeMap style", () => {
  const style = createOpenFreeMapStyle(region);

  it("the style URL comes from the region and swaps a known theme", () => {
    const custom = structuredClone(region);
    custom.geo.mapStyle.url = "https://example.org/custom/styles/liberty?version=2";
    for (const theme of OPENFREEMAP_THEMES) {
      expect(style.styleUrl(custom, theme, "ja")).toBe(
        `https://example.org/custom/styles/${theme}?version=2`,
      );
    }
  });

  it("an unknown theme keeps the region's URL", () => {
    expect(style.styleUrl(region, "unknown", "ja")).toBe(region.geo.mapStyle.url);
  });

  it("attribution is the region's and never empty", () => {
    expect(style.attribution).toEqual(region.geo.attribution);
    expect(style.attribution.length).toBeGreaterThan(0);
  });

  it("cjkMode is localIdeographFontFamily", () => {
    expect(style.cjkMode).toBe("localIdeographFontFamily");
    expect(style.glyphs).toBeUndefined();
    expect(DEFAULT_IDEOGRAPH_FONT).toBe("'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif");
  });

  it("rejects a different adapter at construction", () => {
    const invalid = JSON.parse(JSON.stringify(region));
    invalid.geo.mapStyle.adapter = "other";
    expect(() => createOpenFreeMapStyle(invalid)).toThrow("Expected openfreemap adapter");
  });
});

describe("Nominatim search", () => {
  it("typeahead is refused without calling fetch", async () => {
    const { fetch, search } = adapter();
    expect(await search.search("", { ...searchOptions, mode: "typeahead" })).toEqual({
      ok: false,
      reason: "typeahead_not_allowed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("an empty or 201-character query is refused", async () => {
    const { fetch, search } = adapter();
    expect(await search.search("  ", searchOptions)).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(await search.search("a".repeat(201), searchOptions)).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect((await search.search("a".repeat(200), searchOptions)).ok).toBe(true);
  });

  it("the request carries the region's bbox as viewbox, bounded, countrycodes, languages, limit 5 and the User-Agent", async () => {
    const { fetch, search } = adapter();
    await search.search("模擬の場所", searchOptions);
    const [input, init] = fetch.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "模擬の場所",
      format: "jsonv2",
      limit: "5",
      countrycodes: "jp",
      viewbox: "129.7,33,130.12,32.55",
      bounded: "1",
      "accept-language": "ja,en",
      namedetails: "1",
    });
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("User-Agent")).toBe(userAgent);
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("a User-Agent containing @ is refused at construction", () => {
    for (const invalid of ["", "  ", "Noren@invalid"]) {
      expect(() => createNominatimSearch({ fetch: vi.fn(), userAgent: invalid })).toThrow();
    }
  });

  it.each([
    "http://nominatim.openstreetmap.org/search",
    "https://example.org/search",
    "http://127.0.0.1/search",
    "https://nominatim.openstreetmap.org:8443/search",
    "https://user:pass@nominatim.openstreetmap.org/search",
    "not a URL",
  ])("a disallowed endpoint throws at construction: %s", (endpoint) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() => createNominatimSearch({ fetch, userAgent, endpoint })).toThrow(
      "Disallowed Nominatim endpoint",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a redirect response is not followed", async () => {
    const { fetch, search } = adapter();
    fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }),
    );
    expect(await search.search("mock", searchOptions)).toEqual({
      ok: false,
      reason: "provider_error:302",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("results map to candidates with names per language, category, providerRef and attribution", async () => {
    const { search } = adapter();
    expect(await search.search("mock", searchOptions)).toEqual({
      ok: true,
      candidates: [
        {
          names: { default: "Mock place", ja: "模擬の場所", en: "Mock place" },
          lat: 32.75,
          lng: 129.87,
          category: "amenity/cafe",
          providerRef: "osm:node/123",
          attribution: ["© OpenStreetMap contributors", "Nominatim"],
        },
      ],
    });
  });

  it("falls back to the first display name part without namedetails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([{ ...item, namedetails: undefined }]));
    const result = await createNominatimSearch({ fetch, userAgent }).search("mock", searchOptions);
    expect(result.ok && result.candidates[0]?.names).toEqual({ default: "Mock place" });
  });

  it("items with bad coordinates are dropped", async () => {
    const { search } = adapter([{ ...item, lat: "bad" }, { ...item, lon: "" }, item]);
    const result = await search.search("mock", searchOptions);
    expect(result.ok && result.candidates.length).toBe(1);
  });

  it("at most five candidates", async () => {
    const { search } = adapter(Array.from({ length: 8 }, () => item));
    const result = await search.search("mock", searchOptions);
    expect(result.ok && result.candidates.length).toBe(5);
  });

  it("a 503 refuses provider_error:503", async () => {
    const { fetch, search } = adapter();
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await search.search("mock", searchOptions)).toEqual({
      ok: false,
      reason: "provider_error:503",
    });
  });

  it("a timeout refuses provider_error:AbortError", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = createNominatimSearch({ fetch, userAgent }).search("mock", searchOptions);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "provider_error:AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a network error refuses with its error name", async () => {
    const { fetch, search } = adapter();
    fetch.mockRejectedValue(new TypeError("offline"));
    expect(await search.search("mock", searchOptions)).toEqual({
      ok: false,
      reason: "provider_error:TypeError",
    });
  });
});

function central(maxEntries?: number, cacheTtl = 2) {
  let time = 0;
  const provider = vi
    .fn<() => Promise<GeoSearchResult>>()
    .mockResolvedValue({ ok: true, candidates: [] });
  const search = createGeoSearch({
    search: { search: provider },
    policy: { ...nominatimPolicy(userAgent), cacheTtl },
    now: () => time,
    maxEntries,
  });
  return {
    provider,
    search,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("central geo policy", () => {
  it.each(["", "   ", "a".repeat(201)])(
    "an invalid query does not consume the slot or call the network (%s)",
    async (query) => {
      const { fetch, search: provider } = adapter();
      const search = createGeoSearch({
        search: provider,
        policy: nominatimPolicy(userAgent),
        now: () => 0,
      });
      expect(await search.search(query, searchOptions)).toEqual({
        ok: false,
        reason: "invalid_input",
      });
      expect(fetch).not.toHaveBeenCalled();
      expect((await search.search("valid", searchOptions)).ok).toBe(true);
      expect(await search.search(query, searchOptions)).toEqual({
        ok: false,
        reason: "invalid_input",
      });
      expect(await search.search("second valid", searchOptions)).toEqual({
        ok: false,
        reason: "rate_limited",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the Nominatim policy constants", () => {
    expect(nominatimPolicy(userAgent)).toEqual({
      rateLimit: 1,
      userAgent,
      cacheTtl: 86_400,
      storage: "reference-only",
    });
  });

  it("a cached query makes no second call", async () => {
    const { provider, search } = central();
    await search.search("mock", searchOptions);
    expect((await search.search("mock", searchOptions)).ok).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await search.search("mock", { ...searchOptions, mode: "typeahead" })).toEqual({
      ok: false,
      reason: "typeahead_not_allowed",
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("the cache key ignores case and extra spaces", async () => {
    const { provider, search } = central();
    await search.search(" Mock   Place ", searchOptions);
    expect((await search.search("mock place", searchOptions)).ok).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it.each(["bbox", "countrycodes", "languages"] as const)(
    "the cache key includes %s",
    async (key) => {
      const { provider, search, advance } = central();
      await search.search("mock", searchOptions);
      advance(1000);
      const changed = { ...searchOptions, [key]: key === "bbox" ? [0, 0, 1, 1] : ["en"] };
      await search.search("mock", changed);
      expect(provider).toHaveBeenCalledTimes(2);
    },
  );

  it("a cached entry expires after cacheTtl", async () => {
    const { provider, search, advance } = central();
    await search.search("mock", searchOptions);
    advance(1999);
    await search.search("mock", searchOptions);
    expect(provider).toHaveBeenCalledTimes(1);
    advance(1);
    await search.search("mock", searchOptions);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("refusals are not cached", async () => {
    const { provider, search, advance } = central();
    provider.mockResolvedValueOnce({ ok: false, reason: "provider_error:503" });
    await search.search("mock", searchOptions);
    advance(1000);
    expect((await search.search("mock", searchOptions)).ok).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("a second provider call within one second is refused rate_limited", async () => {
    const { provider, search, advance } = central();
    const pending = search.search("first", searchOptions);
    expect(await search.search("concurrent", searchOptions)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    await pending;
    advance(999);
    expect(await search.search("second", searchOptions)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("after one second it goes through", async () => {
    const { provider, search, advance } = central();
    await search.search("first", searchOptions);
    advance(1000);
    expect((await search.search("second", searchOptions)).ok).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("the cache evicts the oldest entry beyond maxEntries", async () => {
    const { provider, search, advance } = central(2, 100);
    for (const query of ["first", "second", "first", "third"]) {
      await search.search(query, searchOptions);
      advance(1000);
    }
    await search.search("first", searchOptions);
    expect(provider).toHaveBeenCalledTimes(4);
  });

  it("geoUserAgent accepts only a project/version with an HTTPS project address", () => {
    expect(geoUserAgent({ GEO_USER_AGENT: `  ${userAgent}  ` })).toBe(userAgent);
    for (const env of [
      {},
      ...[
        "",
        "  ",
        "Noren@invalid",
        "Fei Ooi +60 12-345 6789",
        "a@b.c",
        "Noren",
        "Noren/1.0 (https://example.org)",
        "Noren/1.0 (+http://example.org)",
        "Noren/1.0 (+https://example.org/with space)",
      ].map((GEO_USER_AGENT) => ({ GEO_USER_AGENT })),
    ]) {
      expect(geoUserAgent(env)).toBeNull();
    }
  });
});
