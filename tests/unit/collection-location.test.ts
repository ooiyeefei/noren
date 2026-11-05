import { describe, expect, it, vi } from "vitest";
import { readLocation } from "@/lib/collection/location";

type Options = Parameters<Geolocation["getCurrentPosition"]>[2];

function failing(code: number) {
  return {
    getCurrentPosition: (_: unknown, fail?: PositionErrorCallback | null) =>
      fail?.({ code } as GeolocationPositionError),
  };
}

describe("readLocation", () => {
  it("returns the reading and its accuracy", async () => {
    const geolocation = {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 32.74, longitude: 129.87, accuracy: 12 } } as GeolocationPosition),
    };
    expect(await readLocation(geolocation)).toEqual({
      kind: "read",
      lat: 32.74,
      lng: 129.87,
      accuracy: 12,
    });
  });

  it("asks for a fresh, precise reading that gives up after 15 seconds", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback, _?: unknown, options?: Options) => {
      expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition);
    });
    await readLocation({ getCurrentPosition });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("names each way a reading can fail, so the page can say what to do next", async () => {
    expect(await readLocation(failing(1))).toEqual({ kind: "denied" });
    expect(await readLocation(failing(2))).toEqual({ kind: "unavailable" });
    expect(await readLocation(failing(3))).toEqual({ kind: "timeout" });
    expect(await readLocation(undefined)).toEqual({ kind: "unsupported" });
  });
});
