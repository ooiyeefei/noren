import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedMapsHost, parseMapsUrl, resolveMapsLink } from "@/lib/geo/maps-link";

const env = { GEO_USER_AGENT: "Noren/1.0 (+https://example.org)" };
const start = "https://maps.app.goo.gl/mock";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Maps URL parser", () => {
  it.each([
    [
      "https://www.google.com/maps/place/%E4%B8%89%E5%85%AB%E3%83%A9%E3%83%BC%E3%83%A1%E3%83%B3+%E5%A4%A7%E6%B5%A6%E6%94%AF%E5%BA%97/@32.7360863,129.8711773,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d32.7360863!4d129.8711773",
      { name: "三八ラーメン 大浦支店", lat: 32.7360863, lng: 129.8711773, exact: true },
    ],
    [
      "https://google.com/maps/place/Mock+shop/@30,120,17z/data=!3d32.7!4d129.8",
      { name: "Mock shop", lat: 32.7, lng: 129.8, exact: true },
    ],
    // A shared place: the view is shifted for the side panel, so only the place's own pin is right.
    [
      "https://www.google.com/maps/place/Mock+cafe/@32.7375117,129.8688211,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d32.7375117!4d129.871396!16s%2Fg%2Fmock?entry=tts",
      { name: "Mock cafe", lat: 32.7375117, lng: 129.871396, exact: true },
    ],
    ["https://google.com/maps/@32.7,129.8,17z", { lat: 32.7, lng: 129.8, exact: false }],
    ["https://google.com/maps?q=32.7,129.8", { lat: 32.7, lng: 129.8, exact: true }],
    // A dropped pin is exact, so it wins over the view's centre.
    ["https://google.com/maps/@30,120,17z?q=32.7,129.8", { lat: 32.7, lng: 129.8, exact: true }],
    ["https://google.com/maps?q=Mock+shop", { name: "Mock shop" }],
    ["https://google.com/maps/place/12345/@32,129,17z", { lat: 32, lng: 129, exact: false }],
    // A pin out of range is not replaced by the view's centre.
    ["https://google.com/maps/place/Mock/@32,129,17z/data=!3d95!4d129", { name: "Mock" }],
    ["https://google.com/maps/place/32.7,129.8", {}],
    ["garbage", {}],
    ["https://google.com/maps?q=91,129", {}],
    ["https://google.com/maps/@32,181,17z", {}],
    ["https://google.com/maps/place/%ZZ/@32,129,17z", {}],
  ])("parses URL text: %s", (url, expected) => expect(parseMapsUrl(url)).toEqual(expected));
});

describe("Maps host allowlist", () => {
  it.each([
    "maps.app.goo.gl/mock",
    "goo.gl/maps/mock",
    "www.google.com/maps",
    "google.com/maps",
    "maps.google.com/maps",
  ])("accepts %s", (host) => expect(isAllowedMapsHost(`https://${host}`)).toBe(true));
  it.each([
    "http://maps.app.goo.gl/mock",
    "https://mock@google.com/maps",
    "https://google.com:444/maps",
    "https://maps.app.goo.gl.evil.com/mock",
    "https://evilgoogle.com/maps",
    "https://127.0.0.1/maps",
    "https://[::1]/maps",
    "https://google.com./maps",
    "https://xn--google-9jg.com/maps",
    "https://goo.gl/else",
    "https://google.com/else",
    "garbage",
  ])("refuses %s", (url) => expect(isAllowedMapsHost(url)).toBe(false));
});

describe("Maps link resolver", () => {
  it("follows 2 hops then succeeds; manual requests omit cookies and use the project User-Agent", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://goo.gl/maps/mock" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://google.com/maps?q=32,129" },
        }),
      )
      .mockResolvedValueOnce(new Response(null));
    expect(await resolveMapsLink({ url: start, fetch, env })).toEqual({
      ok: true,
      finalUrl: "https://google.com/maps?q=32,129",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(init).toMatchObject({
        method: "HEAD",
        redirect: "manual",
        credentials: "omit",
        headers: { "User-Agent": env.GEO_USER_AGENT },
      });
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it("a hop to a non-allowed host is refused", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
      );
    expect(await resolveMapsLink({ url: start, fetch, env })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("allowed"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("more than 3 hops is refused", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () => new Response(null, { status: 302, headers: { location: "/mock-next" } }),
      );
    expect(await resolveMapsLink({ url: start, fetch, env })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("maximum 3"),
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("exactly 3 redirects are accepted", async () => {
    let count = 0;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () =>
        ++count <= 3
          ? new Response(null, { status: 302, headers: { location: "/mock-next" } })
          : new Response(null),
      );
    expect(await resolveMapsLink({ url: start, fetch, env })).toMatchObject({ ok: true });
  });
  it("falls back to GET when HEAD is rejected; the response body is never read", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream(
      {
        pull() {
          throw new Error("must never read body");
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const response = new Response(body);
    const text = vi.spyOn(response, "text");
    const json = vi.spyOn(response, "json");
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(response);
    expect(await resolveMapsLink({ url: start, fetch, env })).toMatchObject({ ok: true });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["HEAD", "GET"]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
  it("a timeout is a readable failure", async () => {
    vi.useFakeTimers();
    const fetch: typeof globalThis.fetch = async (_, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    const result = resolveMapsLink({ url: start, fetch, env, timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toMatchObject({ ok: false, reason: expect.stringContaining("timed out") });
  });
  it("missing GEO_USER_AGENT is a readable failure before fetching", async () => {
    vi.stubEnv("GEO_USER_AGENT", "");
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await resolveMapsLink({ url: start, fetch })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("GEO_USER_AGENT"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fetch failures never throw or expose the link", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error(start));
    expect(await resolveMapsLink({ url: start, fetch, env })).toEqual({
      ok: false,
      reason: "The Maps link could not be resolved. Try another link.",
    });
  });
});
