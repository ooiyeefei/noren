import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn(), fetchQuery: vi.fn() }));

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { GET } from "@/app/out/[sourceId]/route";
import { isCountedVisit, outboundPath } from "@/lib/http/outbound";

const original = "https://www.instagram.com/p/mock/";
const phone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const desktop =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const visit = (headers: Record<string, string> = {}, method = "GET") =>
  new Request("https://noren.example/out/mock-source", {
    method,
    headers: { "user-agent": phone, ...headers },
  });
const follow = (request: Request, sourceId = "mock-source") =>
  GET(request, { params: Promise.resolve({ sourceId }) });
const counted = vi.mocked(fetchMutation);
const peeked = vi.mocked(fetchQuery);

beforeEach(() => {
  counted.mockReset().mockResolvedValue(original);
  peeked.mockReset().mockResolvedValue(original);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("which requests count as a visit", () => {
  it("counts a person following the link in a browser", () => {
    for (const agent of [phone, desktop])
      expect(isCountedVisit("GET", new Headers({ "user-agent": agent }))).toBe(true);
  });

  it("does not count prefetches, link previews, crawlers or requests with no browser", () => {
    const headers = (fields: Record<string, string>) =>
      new Headers({ "user-agent": desktop, ...fields });
    expect(isCountedVisit("HEAD", headers({}))).toBe(false);
    for (const fields of <Record<string, string>[]>[
      { "next-router-prefetch": "1" },
      { purpose: "prefetch" },
      { "sec-purpose": "prefetch;prerender" },
      { "x-purpose": "preview" },
      { "x-moz": "prefetch" },
      { "user-agent": "" },
      { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
      { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
      { "user-agent": "curl/8.5.0" },
      { "user-agent": "python-requests/2.32.3" },
    ])
      expect(isCountedVisit("GET", headers(fields)), JSON.stringify(fields)).toBe(false);
    expect(isCountedVisit("GET", new Headers())).toBe(false);
  });

  it("links through /out with the post's id kept intact", () => {
    expect(outboundPath("k17abc")).toBe("/out/k17abc");
    expect(outboundPath("a/b?c")).toBe("/out/a%2Fb%3Fc");
  });
});

describe("the link out to a shared post", () => {
  it("counts a person's visit, then sends them on with only Noren's origin and nothing kept", async () => {
    const response = await follow(visit());
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(original);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("origin");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(counted).toHaveBeenCalledTimes(1);
    expect(getFunctionName(counted.mock.calls[0]![0])).toBe("links:follow");
    expect(counted.mock.calls[0]![1]).toEqual({ sourceId: "mock-source" });
    expect(peeked).not.toHaveBeenCalled();
  });

  it("sends a crawler on without counting it", async () => {
    const response = await follow(visit({ "user-agent": "Twitterbot/1.0" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(original);
    expect(getFunctionName(peeked.mock.calls[0]![0])).toBe("links:peek");
    expect(peeked.mock.calls[0]![1]).toEqual({ sourceId: "mock-source" });
    expect(counted).not.toHaveBeenCalled();
  });

  it("says plainly when the post is no longer shown, and never caches the answer", async () => {
    counted.mockResolvedValue(null);
    const response = await follow(visit());
    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("This post is no longer shown on Noren.");
  });

  it("asks the visitor to try again when Convex fails, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    counted.mockRejectedValue(new TypeError("fetch failed"));
    const response = await follow(visit());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Could not open the post. Go back and try again.");
    expect(log).toHaveBeenCalledWith("out mock-source: TypeError: fetch failed");
    // A throw that is not an Error, or has no message, still says what it was.
    counted.mockRejectedValue("");
    expect((await follow(visit())).status).toBe(503);
    expect(log).toHaveBeenLastCalledWith("out mock-source: string: (no message)");
  });
});
