import { afterEach, assertType, describe, expect, it, vi } from "vitest";
import { SOURCE_ADAPTER_IDS, type SourceAdapterId } from "../../src/lib/domain/constants";
import {
  ADAPTERS,
  describeSource,
  embedFor,
  enabledAdapters,
  frameHostsFor,
  scriptHostsFor,
  type RegisteredAdapter,
} from "../../src/lib/adapters";
import { linkCardAdapter } from "../../src/lib/adapters/link-card";
import { metaEmbedAdapter } from "../../src/lib/adapters/meta-embed";
import { youtubeAdapter } from "../../src/lib/adapters/youtube";
import { xAdapter } from "../../src/lib/adapters/x";
import { googleMapsLinkAdapter } from "../../src/lib/adapters/google-maps-link";
import { tiktokAdapter } from "../../src/lib/adapters/tiktok";
import { cleanUrl, fetchStatus, parseHttpUrl } from "../../src/lib/adapters/url";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const forms: { id: SourceAdapterId; urls: string[] }[] = [
  { id: "link_card", urls: ["https://example.com/post", "http://example.com/"] },
  {
    id: "meta_embed",
    urls: [
      "https://instagram.com/p/EXAMPLE123",
      "https://www.instagram.com/reel/EXAMPLE123/",
      "https://instagram.com/tv/EXAMPLE123/",
      "https://facebook.com/example/posts/1234567890",
      "https://www.facebook.com/example/videos/1234567890/",
      "https://m.facebook.com/watch/?v=1234567890",
      "https://web.facebook.com/reel/1234567890",
      "https://facebook.com/permalink.php?story_fbid=1234567890&id=1234567890",
      "https://facebook.com/share/p/EXAMPLE123",
      "https://facebook.com/share/v/EXAMPLE123/",
      "https://threads.net/@example/post/EXAMPLE123",
      "https://www.threads.com/t/EXAMPLE123",
      "https://www.threads.net/t/EXAMPLE123",
      "https://threads.com/@example/post/EXAMPLE123/",
    ],
  },
  {
    id: "youtube",
    urls: [
      "https://youtube.com/watch?v=AAAAAAAAAAA",
      "https://www.youtube.com/shorts/AAAAAAAAAAA",
      "https://m.youtube.com/live/AAAAAAAAAAA",
      "https://youtube.com/embed/AAAAAAAAAAA",
      "https://youtu.be/AAAAAAAAAAA",
      "https://youtube-nocookie.com/embed/AAAAAAAAAAA",
      "https://www.youtube-nocookie.com/embed/AAAAAAAAAAA",
    ],
  },
  {
    id: "x",
    urls: [
      "https://x.com/example/status/1234567890",
      "https://www.x.com/example/status/1234567890/",
      "https://mobile.x.com/example/status/1234567890",
      "https://twitter.com/example/status/1234567890",
      "https://www.twitter.com/example/status/1234567890",
      "https://mobile.twitter.com/example/status/1234567890",
      "https://x.com/i/web/status/1234567890",
      "https://x.com/i/status/1234567890",
    ],
  },
  {
    id: "google_maps_link",
    urls: [
      "https://google.com/maps",
      "https://www.google.com/maps/search/?query=example",
      "https://maps.google.com/maps/place/example",
      "https://google.co.jp/maps/place/example",
      "https://www.google.com.my/maps",
      "https://maps.app.goo.gl/EXAMPLE123",
      "https://goo.gl/maps/EXAMPLE123",
    ],
  },
  {
    id: "tiktok",
    urls: [
      "https://tiktok.com/@example/video/1234567890",
      "https://www.tiktok.com/@example/video/1234567890/",
      "https://m.tiktok.com/@example/video/1234567890",
    ],
  },
];

describe("source adapters", () => {
  it.each(forms)("each adapter matches its URL forms: $id", ({ id, urls }) => {
    for (const url of urls) expect(ADAPTERS[id].matches(url), url).toBe(true);
  });

  it.each<[SourceAdapterId, string]>([
    ["youtube", "https://youtube.com.evil.example/watch?v=AAAAAAAAAAA"],
    ["youtube", "https://youtube.com/watch?v=AAAAAAAAAA"],
    ["youtube", "https://youtu.be/AAAAAAAAAAA/extra"],
    ["youtube", "https://youtube-nocookie.com/watch?v=AAAAAAAAAAA"],
    ["x", "https://notx.com/example/status/1234567890"],
    ["x", "https://x.com.evil.example/example/status/1234567890"],
    ["x", "https://x.com/example/status/EXAMPLE123"],
    ["x", "https://x.com/AAAAAAAAAAAAAAAA/status/1234567890"],
    ["tiktok", "https://vm.tiktok.com/EXAMPLE123"],
    ["tiktok", "https://vt.tiktok.com/EXAMPLE123"],
    ["tiktok", "https://tiktok.com.evil.example/@example/video/1234567890"],
    ["tiktok", "https://tiktok.com/@example/video/EXAMPLE123"],
    ["meta_embed", "https://instagram.com/explore/"],
    ["meta_embed", "https://instagram.com.evil.example/p/EXAMPLE123/"],
    ["meta_embed", "https://facebook.com/example"],
    ["meta_embed", "https://facebook.com/watch/"],
    ["meta_embed", "https://facebook.com/permalink.php?story_fbid=1234567890"],
    ["meta_embed", "https://threads.net/@example"],
    ["meta_embed", "https://threads.com.evil.example/t/EXAMPLE123"],
    ["google_maps_link", "https://google.com.evil.example/maps"],
    ["google_maps_link", "https://notgoogle.co.jp/maps"],
    ["google_maps_link", "https://google.com/search?q=example"],
    ["google_maps_link", "https://goo.gl/EXAMPLE123"],
    ["link_card", "https://example:example@example.com/post"],
  ])("rejects lookalikes: %s %s", (id, url) => {
    expect(ADAPTERS[id].matches(url)).toBe(false);
    expect(() => ADAPTERS[id].describe(url)).toThrow(Error);
  });

  it.each<[SourceAdapterId, string, string]>([
    [
      "link_card",
      " http://EXAMPLE.com/post?keep=example&utm_source=example&fbclid=EXAMPLE123&gclid=EXAMPLE123&igsh=EXAMPLE123&igshid=EXAMPLE123#example ",
      "http://example.com/post?keep=example#example",
    ],
    [
      "meta_embed",
      "http://INSTAGRAM.com/reel/EXAMPLE123?igsh=EXAMPLE123#example",
      "https://www.instagram.com/reel/EXAMPLE123",
    ],
    [
      "meta_embed",
      "https://m.facebook.com/watch/?v=1234567890&utm_source=example&extra=example#example",
      "https://www.facebook.com/watch?v=1234567890",
    ],
    [
      "meta_embed",
      "https://facebook.com/permalink.php?id=1234567890&story_fbid=1234567890&fbclid=EXAMPLE123&extra=example#example",
      "https://www.facebook.com/permalink.php?story_fbid=1234567890&id=1234567890",
    ],
    [
      "meta_embed",
      "https://threads.net/@example/post/EXAMPLE123?igshid=EXAMPLE123#example",
      "https://www.threads.com/@example/post/EXAMPLE123",
    ],
    [
      "youtube",
      "https://youtu.be/AAAAAAAAAAA?si=EXAMPLE123&utm_source=example#example",
      "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    ],
    [
      "x",
      "https://mobile.twitter.com/example/status/1234567890?s=example&t=example&utm_source=example#example",
      "https://x.com/i/status/1234567890",
    ],
    [
      "x",
      "https://x.com/i/web/status/1234567890?s=example#example",
      "https://x.com/i/status/1234567890",
    ],
    [
      "google_maps_link",
      "https://maps.app.goo.gl/EXAMPLE123/?utm_source=example&gclid=EXAMPLE123&g_st=example#example",
      "https://maps.app.goo.gl/EXAMPLE123",
    ],
    [
      "tiktok",
      "http://m.tiktok.com/@example/video/1234567890?utm_source=example#example",
      "https://www.tiktok.com/@example/video/1234567890",
    ],
  ])("canonical URLs remove tracking and preserve page identity: %s", (id, input, canonical) => {
    expect(ADAPTERS[id].describe(input).canonicalUrl).toBe(canonical);
  });

  it("shared URL cleaning strips tracking case-insensitively and supports adapter parameters", () => {
    expect(
      cleanUrl(
        new URL(
          "https://EXAMPLE.com/?UTM_source=example&fbclid=example&si=example&s=example&t=example&keep=example#example",
        ),
        ["si", "s", "t"],
      ),
    ).toBe("https://example.com/?keep=example#example");
  });

  it("X canonical duplicates collapse without trusting the URL handle", () => {
    const urls = [
      "https://x.com/NHK_PR/status/1",
      "https://x.com/nhk_pr/status/1/",
      "https://twitter.com/i/web/status/1",
    ];
    for (const url of urls) {
      expect(describeSource(url, ["x"])).toMatchObject({
        ok: true,
        source: { canonicalUrl: "https://x.com/i/status/1", author: null },
      });
    }
  });

  it.each<[SourceAdapterId, string, string]>([
    ["tiktok", "https://tiktok.com/@EXAMPLE/video/1/", "https://www.tiktok.com/@example/video/1"],
    [
      "meta_embed",
      "https://facebook.com/EXAMPLE/posts/AbC/",
      "https://www.facebook.com/example/posts/AbC",
    ],
    [
      "meta_embed",
      "https://threads.net/@EXAMPLE/post/AbC/",
      "https://www.threads.com/@example/post/AbC",
    ],
    ["meta_embed", "https://instagram.com/p/AbC/", "https://www.instagram.com/p/AbC"],
    ["meta_embed", "https://facebook.com/share/p/AbC/", "https://www.facebook.com/share/p/AbC"],
    ["google_maps_link", "https://goo.gl/maps/AbC/?g_st=tracking", "https://goo.gl/maps/AbC"],
    ["link_card", "https://example.com/post/", "https://example.com/post"],
  ])("normalizes handles and trailing slashes: %s %s", (id, input, canonical) => {
    expect(ADAPTERS[id].describe(input).canonicalUrl).toBe(canonical);
    expect(ADAPTERS[id].describe(canonical).canonicalUrl).toBe(canonical);
  });

  it("keeps Instagram reels and posts distinct until interchangeability is verified", () => {
    expect(metaEmbedAdapter.describe("https://instagram.com/reel/AbC/").canonicalUrl).toBe(
      "https://www.instagram.com/reel/AbC",
    );
    expect(metaEmbedAdapter.describe("https://instagram.com/p/AbC/").canonicalUrl).toBe(
      "https://www.instagram.com/p/AbC",
    );
  });

  it("distinct hash-routed link cards stay distinct", () => {
    const canonicals = [1, 2].map(
      (id) => linkCardAdapter.describe(`https://example.com/#/post/${id}`).canonicalUrl,
    );
    expect(canonicals).toEqual(["https://example.com/#/post/1", "https://example.com/#/post/2"]);
  });

  it.each(["http://example.com:80/post/", "https://example.com:443/post/"])(
    "link cards keep the pasted scheme and allow its default port: %s",
    (input) => {
      const canonical = `${new URL(input).protocol}//example.com/post`;
      expect(linkCardAdapter.describe(input)).toMatchObject({
        canonicalUrl: canonical,
        embed: { kind: "link", url: canonical },
      });
    },
  );

  it.each(["http://169.254.169.254/", "http://[::1]/", "https://example.com:8080/"])(
    "link cards refuse IP literals and non-default ports directly: %s",
    (input) => {
      expect(linkCardAdapter.matches(input)).toBe(false);
      expect(() => linkCardAdapter.describe(input)).toThrow();
    },
  );

  it("describeSource prefers the platform adapter over the link card", () => {
    const result = describeSource("https://youtu.be/AAAAAAAAAAA", ["link_card", "youtube"]);
    expect(result).toEqual({
      ok: true,
      source: {
        adapter: "youtube",
        platform: "youtube",
        canonicalUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
        embed: { kind: "iframe", url: "https://www.youtube-nocookie.com/embed/AAAAAAAAAAA" },
        author: null,
      },
    });
  });

  it("falls back to a link card", () => {
    expect(
      describeSource("https://example.com/post?utm_source=example#example", SOURCE_ADAPTER_IDS),
    ).toEqual({
      ok: true,
      source: {
        adapter: "link_card",
        platform: "web",
        canonicalUrl: "https://example.com/post#example",
        embed: { kind: "link", url: "https://example.com/post#example" },
        author: null,
      },
    });
    expect(describeSource("https://vm.tiktok.com/EXAMPLE123", SOURCE_ADAPTER_IDS)).toMatchObject({
      ok: true,
      source: { adapter: "link_card" },
    });
  });

  it("a disabled adapter's URL becomes a link card", () => {
    expect(
      describeSource(
        "https://youtu.be/AAAAAAAAAAA",
        SOURCE_ADAPTER_IDS.filter((id) => id !== "youtube"),
      ),
    ).toMatchObject({ ok: true, source: { adapter: "link_card", platform: "web" } });
  });

  it("returns no_adapter when nothing enabled matches", () => {
    expect(describeSource("https://example.com", ["youtube"])).toEqual({
      ok: false,
      reason: "no_adapter",
    });
    expect(describeSource("https://youtu.be/AAAAAAAAAAA", [])).toEqual({
      ok: false,
      reason: "no_adapter",
    });
  });

  it.each([
    ["javascript:example", "unsupported_scheme"],
    ["data:text/plain,example", "unsupported_scheme"],
    ["ftp://example.com", "unsupported_scheme"],
    ["https://example:example@example.com", "invalid_url"],
    ["https://example@example.com", "invalid_url"],
    ["https://:example@example.com", "invalid_url"],
    ["unparseable input", "invalid_url"],
    ["/example", "invalid_url"],
    ["https://localhost", "invalid_url"],
    ["http://169.254.169.254/latest/meta-data/", "invalid_url"],
    ["https://127.0.0.1/post", "invalid_url"],
    ["http://2130706433/post", "invalid_url"],
    ["http://0x7f000001/post", "invalid_url"],
    ["http://[::1]/post", "invalid_url"],
    ["http://[::ffff:169.254.169.254]/post", "invalid_url"],
    ["https://example.com:8080/post", "invalid_url"],
    ["http://example.com:443/post", "invalid_url"],
    ["x".repeat(2049), "too_long"],
  ])("describeSource refuses %s", (url, reason) => {
    expect(describeSource(url, SOURCE_ADAPTER_IDS)).toEqual({ ok: false, reason });
  });

  it("accepts a trimmed URL of exactly 2048 characters", () => {
    const url = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length);
    expect(parseHttpUrl(` ${url} `).ok).toBe(true);
    expect(describeSource(url + "a", SOURCE_ADAPTER_IDS)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it.each(["storesContent", "aiAllowed"] as const)(
    "enabledAdapters refuses an adapter whose %s is true",
    (flag) => {
      const unsafe = {
        ...linkCardAdapter,
        policy: { ...linkCardAdapter.policy, [flag]: true },
      } as unknown as RegisteredAdapter;
      const registry = { ...ADAPTERS, link_card: unsafe };
      expect(() => enabledAdapters(["link_card"], registry)).toThrow(/link_card/);
    },
  );

  it("a RegisteredAdapter literal with storesContent: true is a type error", () => {
    assertType<RegisteredAdapter>({
      ...linkCardAdapter,
      policy: {
        ...linkCardAdapter.policy,
        // @ts-expect-error Adapters must never store platform content.
        storesContent: true,
      },
    });
  });

  it("enabledAdapters puts link_card last", () => {
    expect(
      enabledAdapters(["link_card", "tiktok", "x", "youtube"]).map((adapter) => adapter.id),
    ).toEqual(["tiktok", "x", "youtube", "link_card"]);
  });

  it("exports the six registered adapter constants", () => {
    expect(Object.values(ADAPTERS)).toEqual([
      linkCardAdapter,
      metaEmbedAdapter,
      youtubeAdapter,
      xAdapter,
      googleMapsLinkAdapter,
      tiktokAdapter,
    ]);
  });

  it("the frozen registry cannot be mutated", () => {
    expect(Object.isFrozen(ADAPTERS)).toBe(true);
    expect(Reflect.set(ADAPTERS, "link_card", youtubeAdapter)).toBe(false);
    expect(Reflect.deleteProperty(ADAPTERS, "x")).toBe(false);
    expect(ADAPTERS.link_card).toBe(linkCardAdapter);
    expect(ADAPTERS.x).toBe(xAdapter);
  });

  it("scriptHostsFor and frameHostsFor list the origins of the enabled set", () => {
    expect(scriptHostsFor([...SOURCE_ADAPTER_IDS, "x", "meta_embed"])).toEqual([
      "https://platform.twitter.com",
      "https://www.instagram.com",
    ]);
    expect(frameHostsFor([...SOURCE_ADAPTER_IDS, "youtube", "tiktok"])).toEqual([
      "https://platform.twitter.com",
      "https://www.facebook.com",
      "https://www.instagram.com",
      "https://www.tiktok.com",
      "https://www.youtube-nocookie.com",
    ]);
    expect(scriptHostsFor(["link_card", "google_maps_link", "youtube", "tiktok"])).toEqual([]);
    expect(frameHostsFor(["link_card", "google_maps_link"])).toEqual([]);
    expect(frameHostsFor([])).toEqual([]);
    expect(scriptHostsFor([])).toEqual([]);
  });

  it.each<[SourceAdapterId, string, { handle: string; url: string } | null]>([
    ["x", "https://x.com/example/status/1234567890", null],
    ["x", "https://x.com/i/status/1234567890", null],
    [
      "meta_embed",
      "https://www.facebook.com/example/posts/1234567890",
      { handle: "example", url: "https://www.facebook.com/example" },
    ],
    [
      "meta_embed",
      "https://www.facebook.com/example/videos/1234567890",
      { handle: "example", url: "https://www.facebook.com/example" },
    ],
    ["meta_embed", "https://www.facebook.com/reel/1234567890", null],
    ["meta_embed", "https://www.facebook.com/share/p/EXAMPLE123", null],
    [
      "meta_embed",
      "https://www.threads.com/@example/post/EXAMPLE123",
      { handle: "@example", url: "https://www.threads.com/@example" },
    ],
    ["meta_embed", "https://www.threads.com/t/EXAMPLE123", null],
    ["meta_embed", "https://www.instagram.com/p/EXAMPLE123", null],
    [
      "tiktok",
      "https://www.tiktok.com/@example/video/1234567890",
      { handle: "@example", url: "https://www.tiktok.com/@example" },
    ],
  ])("derives only unverified URL author suggestions: %s %s", (id, url, author) => {
    expect(ADAPTERS[id].author(url)).toEqual(author);
    expect(describeSource(url, [id])).toMatchObject({ ok: true, source: { author } });
  });

  it.each([
    ["https://facebook.com/example/posts/1234567890", "post", true],
    ["https://facebook.com/example/videos/1234567890", "video", false],
    ["https://facebook.com/watch/?v=1234567890", "video", false],
    ["https://facebook.com/reel/1234567890", "video", false],
    ["https://facebook.com/share/v/EXAMPLE123", "video", false],
    ["https://facebook.com/share/p/EXAMPLE123", "post", true],
    ["https://facebook.com/permalink.php?story_fbid=1234567890&id=1234567890", "post", true],
  ])("uses Facebook's appropriate plugin: %s", (input, plugin, showText) => {
    const { canonicalUrl, embed } = metaEmbedAdapter.describe(input as string);
    const url = new URL(embed.url);
    expect(embed.kind).toBe("iframe");
    expect(url.pathname).toBe(`/plugins/${plugin}.php`);
    expect(url.searchParams.get("href")).toBe(canonicalUrl);
    expect(url.searchParams.get("show_text")).toBe(showText ? "true" : null);
  });

  it("keeps Threads as a link", () => {
    expect(metaEmbedAdapter.describe("https://threads.net/t/EXAMPLE123").embed).toEqual({
      kind: "link",
      url: "https://www.threads.com/t/EXAMPLE123",
    });
  });

  it.each(["place_id", "query_place_id"])(
    "Google Maps keeps only the place_id from %s",
    (parameter) => {
      const { canonicalUrl, embed } = googleMapsLinkAdapter.describe(
        `https://www.google.co.jp/maps/place/example?${parameter}=EXAMPLE123&query=example&reviews=example&lat=123&fbclid=example#example`,
      );
      expect(canonicalUrl).toBe(
        "https://www.google.com/maps/search?api=1&query=example&query_place_id=EXAMPLE123",
      );
      expect(embed).toEqual({ kind: "link", url: canonicalUrl, placeId: "EXAMPLE123" });
      expect(embedFor("google_maps_link", canonicalUrl)).toEqual(embed);
    },
  );

  it("Google Maps supplies the default query and safely encodes identifiers", () => {
    expect(
      googleMapsLinkAdapter.describe("https://google.com/maps?place_id=EXAMPLE123").canonicalUrl,
    ).toBe("https://www.google.com/maps/search?api=1&query=place&query_place_id=EXAMPLE123");
    const description = googleMapsLinkAdapter.describe(
      "https://google.com/maps?place_id=EXAMPLE123%26example&query=example%20example",
    );
    expect(new URL(description.canonicalUrl).searchParams.get("query_place_id")).toBe(
      "EXAMPLE123&example",
    );
    expect(googleMapsLinkAdapter.describe(description.canonicalUrl)).toEqual(description);
  });

  it.each([
    [200, "live"],
    [404, "gone"],
    [410, "gone"],
    [401, "unknown"],
    [403, "unknown"],
    [500, "unknown"],
  ] as const)("YouTube liveness: %i %s", async (status, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    expect(await youtubeAdapter.liveness("https://www.youtube.com/watch?v=AAAAAAAAAAA")).toBe(
      expected,
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DAAAAAAAAAAA",
    );
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      signal: expect.any(AbortSignal),
    });
  });

  it("YouTube liveness: network error unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mock network error")));
    expect(await youtubeAdapter.liveness("https://youtu.be/AAAAAAAAAAA")).toBe("unknown");
  });

  it("YouTube oEmbed Not Found is gone without consuming the response body", async () => {
    const response = new Response("Not Found", { status: 404 });
    const text = vi.spyOn(response, "text");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await youtubeAdapter.liveness("https://youtu.be/AAAAAAAAAAA")).toBe("gone");
    expect(text).not.toHaveBeenCalled();
  });

  it("YouTube liveness: timeout unknown", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const result = youtubeAdapter.liveness("https://youtu.be/AAAAAAAAAAA");
    const signal = fetch.mock.calls[0]![1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(7999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe("unknown");
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [200, "live"],
    [404, "gone"],
    [429, "unknown"],
  ] as const)("X liveness: %i %s", async (status, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetch);
    expect(await xAdapter.liveness("https://x.com/example/status/1234567890")).toBe(expected);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://publish.x.com/oembed?omit_script=true&dnt=true&url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F1234567890",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("X liveness: network error and timeout are unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mock network error")));
    expect(await xAdapter.liveness("https://x.com/example/status/1234567890")).toBe("unknown");
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    const pending = xAdapter.liveness("https://x.com/example/status/1234567890");
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBe("unknown");
  });

  it("liveness never fetches an unrecognised URL", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await youtubeAdapter.liveness("https://example.com/")).toBe("unknown");
    expect(await xAdapter.liveness("https://example.com/")).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("link card, Meta, Google Maps and TikTok liveness never call fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const { id, urls } of forms.filter(({ id }) => id !== "youtube" && id !== "x")) {
      for (const url of urls) expect(await ADAPTERS[id].liveness(url)).toBe("unknown");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetchStatus cancels the response body without reading content", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const text = vi.fn();
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, body: { cancel }, text, json }),
    );
    expect(await fetchStatus("https://example.com/oembed")).toBe(200);
    expect(cancel).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
