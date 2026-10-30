import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS, describeSource } from "../../src/lib/adapters";
import { SOURCE_ADAPTER_IDS, type SourceAdapterId } from "../../src/lib/domain/constants";
import { createNominatimSearch } from "../../src/lib/geo/nominatim";
import { isAllowedServerFetch, SERVER_FETCH_ORIGINS } from "../../src/lib/security/outbound";

afterEach(() => vi.unstubAllGlobals());

describe("server fetch allowlist", () => {
  it("every adapter's liveness fetches only allowed origins", async () => {
    const calls: { url: string | URL | Request; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        calls.push({ url, init });
        return new Response(null, { status: 200 });
      }),
    );
    const samples: Record<SourceAdapterId, string[]> = {
      link_card: ["https://mock.example/post", "https://evil.example/"],
      meta_embed: [
        "https://instagram.com/p/MOCK123/",
        "https://facebook.com/mock/posts/123",
        "https://threads.net/@mock/post/MOCK123",
      ],
      youtube: [
        "https://youtu.be/AAAAAAAAAAA",
        "https://www.youtube.com/watch?v=AAAAAAAAAAA&url=https://evil.example/",
      ],
      x: ["https://x.com/mock/status/123", "https://x.com/mock/status/123/extra"],
      google_maps_link: ["https://google.com/maps/place/mock"],
      tiktok: ["https://www.tiktok.com/@mock/video/123"],
    };
    for (const id of SOURCE_ADAPTER_IDS) {
      for (const sample of samples[id]) {
        const described = describeSource(sample, [id]);
        if (!described.ok) {
          expect(sample).toBe("https://x.com/mock/status/123/extra");
          expect(await ADAPTERS[id].liveness(sample)).toBe("unknown");
          continue;
        }
        expect(described.source.adapter).toBe(id);
        await ADAPTERS[id].liveness(described.source.canonicalUrl);
      }
    }
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map(({ url }) => new URL(String(url)).origin))).toEqual(
      new Set(["https://publish.x.com", "https://www.youtube.com"]),
    );
    for (const { url, init } of calls) {
      expect(isAllowedServerFetch(String(url))).toBe(true);
      expect(init).toMatchObject({ redirect: "error", credentials: "omit" });
      expect(String(url)).not.toContain("evil.example");
    }
  });

  it("the Nominatim default endpoint is allowed", async () => {
    const calls: string[] = [];
    const search = createNominatimSearch({
      userAgent: "Noren mock test",
      fetch: async (url) => {
        calls.push(String(url));
        return Response.json([]);
      },
    });
    expect(
      await search.search("mock", {
        mode: "submit",
        bbox: [129.7, 32.55, 130.12, 33],
        countrycodes: ["jp"],
        languages: ["ja"],
      }),
    ).toEqual({ ok: true, candidates: [] });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!).pathname).toBe("/search");
    expect(calls.every(isAllowedServerFetch)).toBe(true);
  });

  it("isAllowedServerFetch refuses http, credentials, ports, look-alikes and unlisted hosts", () => {
    for (const origin of SERVER_FETCH_ORIGINS) {
      expect(isAllowedServerFetch(origin + "/path?url=https://evil.example/")).toBe(true);
      expect(isAllowedServerFetch(new URL(origin + ":443/path"))).toBe(true);
    }
    for (const url of [
      "http://www.youtube.com",
      "https://mock@www.youtube.com",
      "https://mock:mock@publish.x.com",
      "https://www.youtube.com:444",
      "https://www.youtube.com.evil.example",
      "https://evil.example",
      "https://www.youtube.com.",
      "file:///etc/passwd",
      "malformed",
    ]) {
      expect(isAllowedServerFetch(url), url).toBe(false);
    }
  });

  it("no server module calls fetch except the known ones", () => {
    const root = resolve(import.meta.dirname, "../..");
    function files(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return entry.name === "_generated" ? [] : files(path);
        return entry.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(entry.name) ? [path] : [];
      });
    }
    const callers = ["convex", "src/lib"]
      .flatMap((directory) => files(resolve(root, directory)))
      .filter((file) => /\bfetch\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file))
      .sort();
    expect(callers).toEqual([
      "src/lib/adapters/url.ts",
      "src/lib/geo/maps-link.ts",
      "src/lib/geo/nominatim.ts",
    ]);
  });
});

it("Maps fetches allow exactly the five hosts and permitted paths", () => {
  for (const host of [
    "maps.app.goo.gl/mock",
    "goo.gl/maps/mock",
    "www.google.com/maps",
    "google.com/maps",
    "maps.google.com/maps",
  ])
    expect(isAllowedServerFetch(`https://${host}`)).toBe(true);
  for (const url of [
    "https://google.com/other",
    "https://goo.gl/other",
    "https://evilgoogle.com/maps",
    "https://maps.app.goo.gl.evil.com/mock",
    "https://maps.app.goo.gl./mock",
    "http://google.com/maps",
    "https://mock@google.com/maps",
    "https://google.com:444/maps",
    "https://127.0.0.1/maps",
    "https://[::1]/maps",
    "https://xn--google-9jg.com/maps",
    "https://example.org/maps",
  ])
    expect(isAllowedServerFetch(url), url).toBe(false);
});
