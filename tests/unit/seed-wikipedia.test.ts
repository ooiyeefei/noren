import { describe, expect, it, vi } from "vitest";
import { fetchLeads, leadUrl, parseLead } from "../../scripts/lib/wikipedia";
const payload = {
  query: {
    pages: [{ title: "Mock article", extract: "Open text fixture.", revisions: [{ revid: 123 }] }],
  },
};
const userAgent = "Noren/0.1 (+https://noren.yooi.me)";
describe("Wikipedia seed", () => {
  it("leadUrl encodes the title and asks for the intro, plain text and revision id", () => {
    const url = leadUrl("ja", "日本語 & test");
    expect(url.origin).toBe("https://ja.wikipedia.org");
    expect(url.searchParams.get("titles")).toBe("日本語 & test");
    expect(url.searchParams.get("prop")).toBe("extracts|revisions");
    for (const key of ["exintro", "explaintext", "redirects"])
      expect(url.searchParams.get(key)).toBe("1");
    expect(url.searchParams.get("rvprop")).toBe("ids");
    expect(url.searchParams.get("formatversion")).toBe("2");
  });
  it("parseLead builds the permalink, attribution, licence and revisionRef", () => {
    expect(parseLead("ja", payload, 42)).toEqual({
      lang: "ja",
      text: "Open text fixture.",
      licence: "CC-BY-SA-4.0",
      sourceUrl: "https://ja.wikipedia.org/w/index.php?oldid=123",
      attribution: 'Wikipedia contributors, "Mock article", ja.wikipedia.org, CC BY-SA 4.0',
      revisionRef: "oldid:123",
      retrievedAt: 42,
    });
  });
  it("a missing page or empty extract throws", () => {
    for (const page of [
      { title: "Missing", missing: true },
      { title: "Empty", extract: " " },
      { title: "No revision", extract: "text" },
    ])
      expect(() => parseLead("en", { query: { pages: [page] } }, 42)).toThrow();
  });
  it("fetchLeads waits a second between requests, sends the User-Agent and refuses to run without one", async () => {
    const events: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      events.push("fetch");
      expect(options?.headers).toEqual({ "User-Agent": userAgent });
      return new Response(JSON.stringify(payload));
    });
    const sleep = vi.fn(async (ms: number) => {
      expect(ms).toBeGreaterThanOrEqual(1000);
      events.push("sleep");
    });
    const deps = { fetch: fetcher, userAgent, sleep, now: () => 42 };
    const items = [
      { lang: "ja", title: "Mock ja" },
      { lang: "en", title: "Mock en" },
    ];
    expect(await fetchLeads(items, deps)).toHaveLength(2);
    expect(events).toEqual(["fetch", "sleep", "fetch"]);
    expect(sleep).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    await expect(fetchLeads(items, { ...deps, userAgent: "" })).rejects.toThrow(/GEO_USER_AGENT/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not retry failed responses or truncate oversized leads", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
    await expect(
      fetchLeads([{ lang: "en", title: "Mock" }], {
        fetch: fetcher,
        userAgent,
        sleep: async () => {},
        now: () => 42,
      }),
    ).rejects.toThrow(/429/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() =>
      parseLead(
        "en",
        {
          query: {
            pages: [{ title: "Large", extract: "x".repeat(20001), revisions: [{ revid: 1 }] }],
          },
        },
        42,
      ),
    ).toThrow(/20000/);
  });
});
