import { describe, expect, it, vi } from "vitest";
import { searchPlaces } from "@/components/creator/geo-search";

const suggestion = {
  name: "Mock harbour",
  lat: 32.75,
  lng: 129.87,
  provider: "nominatim",
  attribution: ["© OpenStreetMap contributors"],
};
const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
describe("creator geo search", () => {
  it("a blank or 201-character query never fetches", async () => {
    const fetch = respond({});
    expect(await searchPlaces("  ", "ja", fetch)).toEqual({ ok: false, kind: "empty" });
    expect(await searchPlaces("a".repeat(201), "ja", fetch)).toEqual({
      ok: false,
      kind: "too_long",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("200 maps suggestions", async () => {
    expect(await searchPlaces("mock", "ja", respond({ suggestions: [suggestion] }))).toEqual({
      ok: true,
      suggestions: [suggestion],
    });
  });
  it.each([
    [401, "signed_out"],
    [403, "forbidden"],
    [429, "busy"],
    [500, "unavailable"],
    [400, "unavailable"],
  ] as const)("%s maps to %s without retrying", async (status, kind) => {
    const fetch = respond({ error: { code: "mock", message: "Mock error" } }, status);
    expect(await searchPlaces("mock", "ja", fetch)).toEqual({ ok: false, kind });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    {},
    { suggestions: [{ ...suggestion, lat: 91 }] },
    { suggestions: [{ ...suggestion, provider: "other" }] },
    { suggestions: [{ ...suggestion, attribution: [] }] },
  ])("a 200 with the wrong shape is bad_response: %j", async (body) => {
    expect(await searchPlaces("mock", "en", respond(body))).toEqual({
      ok: false,
      kind: "bad_response",
    });
  });
  it("invalid JSON is bad_response and a network failure is unavailable", async () => {
    expect(
      await searchPlaces("mock", "ja", vi.fn<typeof fetch>().mockResolvedValue(new Response("{"))),
    ).toEqual({ ok: false, kind: "bad_response" });
    expect(
      await searchPlaces(
        "mock",
        "ja",
        vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      ),
    ).toEqual({ ok: false, kind: "unavailable" });
  });
  it("the request is GET /api/geo/search with q and lang encoded", async () => {
    const fetch = respond({ suggestions: [] });
    await searchPlaces(" 港 & mock ", "ja-JP", fetch);
    expect(fetch).toHaveBeenCalledWith(
      `/api/geo/search?${new URLSearchParams({ q: "港 & mock", lang: "ja-JP" })}`,
      { method: "GET", credentials: "same-origin" },
    );
  });
});
