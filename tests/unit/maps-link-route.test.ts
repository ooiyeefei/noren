import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonError } from "@/lib/http/handler";

const { authorize, session } = vi.hoisted(() => ({ authorize: vi.fn(), session: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: session }));
vi.mock("@/lib/convex/server", () => ({ requireRoleOnServer: authorize }));
let GET: (request: Request) => Promise<Response>;
const request = (url = "https://google.com/maps/place/Mock/@32,129,17z") =>
  new Request(`https://example.org/api/geo/maps-link?${new URLSearchParams({ url })}`);
beforeEach(async () => {
  vi.resetModules();
  session.mockReset().mockResolvedValue({ userId: "mock-creator" });
  authorize.mockReset().mockResolvedValue({ ok: true, person: { _id: "mock-creator" } });
  vi.stubEnv("GEO_USER_AGENT", "Noren/1.0 (+https://example.org)");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
  GET = (await import("@/app/api/geo/maps-link/route")).GET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function check(request: Request, status: number) {
  const response = await GET(request);
  expect(response.status).toBe(status);
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  if (status >= 400)
    expect((await response.clone().json()).error.message.trim().length).toBeGreaterThan(0);
  return response;
}
describe("Maps link route", () => {
  it("signed-out is 401 before anything else", async () => {
    authorize.mockResolvedValue({
      ok: false,
      response: jsonError("unauthenticated", "sign in to continue"),
    });
    const req = new Request("https://example.org/");
    Object.defineProperty(req, "url", {
      get() {
        throw new Error("must authorize first");
      },
    });
    await check(req, 401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("a plain user is 403", async () => {
    authorize.mockResolvedValue({
      ok: false,
      response: jsonError("forbidden", "the user role may not do this"),
    });
    await check(request("bad"), 403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creator succeeds", async () => {
    expect(await (await check(request(), 200)).json()).toEqual({
      suggestion: { name: "Mock", lat: 32, lng: 129 },
      source: "the link you pasted",
    });
    expect(authorize).toHaveBeenCalledWith(["creator"]);
  });
  it("cooldown returns 429 with Retry-After and is per user", async () => {
    vi.useFakeTimers();
    await check(request(), 200);
    expect((await check(request(), 429)).headers.get("Retry-After")).toBe("1");
    session.mockResolvedValueOnce({ userId: "mock-steward" });
    await check(request(), 200);
    await vi.advanceTimersByTimeAsync(1000);
    await check(request(), 200);
  });
  it("no coordinates is 422", async () => {
    await check(request("https://google.com/maps/place/Mock"), 422);
  });
  it("a bad url is 400", async () => {
    for (const url of [
      "bad",
      "https://evil.example/",
      `https://maps.app.goo.gl/${"x".repeat(500)}`,
      "",
    ])
      await check(request(url), 400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("a refused redirect gives a readable failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
    );
    await check(request(), 400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
