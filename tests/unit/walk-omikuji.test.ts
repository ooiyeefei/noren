import { describe, expect, it } from "vitest";
import { chooseOmikuji, localDay, omikujiSeed } from "@/lib/draw";
import { bearingDegrees, compassPoint } from "@/lib/walk/direction";
import { legFrom, nearestNeighbourhood, slipFor } from "@/lib/walk/omikuji";
import type { TodaysSlips } from "@/lib/walk/types";
import region from "../../regions/nagasaki.json";
import { ORIGIN, northOf } from "../fixtures/walk";

describe("the day's slip, shared by the connector and walk mode", () => {
  const pool = [
    { id: "a", hasStory: true },
    { id: "b", hasStory: false },
    { id: "c", hasStory: true },
    { id: "d", hasStory: false },
  ];
  const seed = omikujiSeed("nagasaki", "2026-11-10", "shinchi");

  it("fixes the seed by region, day and neighbourhood, with a dash for the whole region", () => {
    expect(seed).toBe("nagasaki|2026-11-10|shinchi");
    expect(omikujiSeed("nagasaki", "2026-11-10", undefined)).toBe("nagasaki|2026-11-10|-");
  });

  it("gives the same place to everyone who asks with the same seed, whatever order the pool is in", () => {
    const chosen = chooseOmikuji(pool, seed);
    expect(chosen).toBeDefined();
    expect(chooseOmikuji([...pool].reverse(), seed)).toEqual(chosen);
    expect(chooseOmikuji(pool, seed)).toEqual(chosen);
  });

  it("does not change when another place is listed, unless the new place is the one drawn", () => {
    const before = chooseOmikuji(pool, seed)!;
    let unchanged = 0;
    for (let i = 0; i < 40; i++) {
      const after = chooseOmikuji([...pool, { id: `new-${i}`, hasStory: i % 2 === 0 }], seed)!;
      if (after.id === before.id) unchanged++;
      else expect(after.id).toBe(`new-${i}`);
    }
    expect(unchanged).toBeGreaterThan(20);
  });

  it("moves with the day and the neighbourhood", () => {
    const picks = new Set<string>();
    for (let day = 1; day <= 28; day++)
      picks.add(
        chooseOmikuji(
          pool,
          omikujiSeed("nagasaki", `2026-11-${String(day).padStart(2, "0")}`, "shinchi"),
        )!.id,
      );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("is empty for an empty pool and counts the day in the region's time", () => {
    expect(chooseOmikuji([], seed)).toBeUndefined();
    // 2026-11-10 15:30 UTC is already the 11th in Japan.
    expect(localDay(Date.UTC(2026, 10, 10, 15, 30), 9)).toBe("2026-11-11");
  });
});

describe("picking the slip on the phone", () => {
  const neighbourhoods = region.neighbourhoods;

  it("takes the neighbourhood whose circle holds the position", () => {
    expect(nearestNeighbourhood(neighbourhoods, ORIGIN)?.id).toBe("shinchi");
    expect(nearestNeighbourhood(neighbourhoods, { lat: 32.7437, lng: 129.8728 })?.id).toBe(
      "dejima",
    );
  });

  it("takes the nearest centre when no circle holds the position", () => {
    const outside = { lat: 32.7525, lng: 129.8705 + 0.02 };
    const nearest = nearestNeighbourhood(neighbourhoods, outside);
    expect(nearest).toBeDefined();
    expect(nearest?.id).not.toBeUndefined();
    expect(nearestNeighbourhood([], ORIGIN)).toBeUndefined();
  });

  it("finds the slip for a neighbourhood, or for the whole region with null", () => {
    const slips: TodaysSlips = {
      day: "2026-11-10",
      slips: [{ neighbourhoodId: "suwa", place: place("one") }, { place: place("region-wide") }],
    };
    expect(slipFor(slips, "suwa")?.place.slug).toBe("one");
    expect(slipFor(slips, null)?.place.slug).toBe("region-wide");
    expect(slipFor(slips, "dejima")).toBeUndefined();
    function place(slug: string) {
      return { slug, names: [], hasStory: false, pin: ORIGIN };
    }
  });
});

describe("how far and which way", () => {
  it("works out the bearing and the compass point", () => {
    expect(bearingDegrees(ORIGIN, northOf(ORIGIN, 100))).toBeCloseTo(0, 1);
    expect(bearingDegrees(ORIGIN, { ...ORIGIN, lng: ORIGIN.lng + 0.001 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(ORIGIN, { lat: ORIGIN.lat - 0.001, lng: ORIGIN.lng })).toBeCloseTo(
      180,
      1,
    );
    expect(bearingDegrees(ORIGIN, { ...ORIGIN, lng: ORIGIN.lng - 0.001 })).toBeCloseTo(270, 0);
    expect([0, 44, 46, 90, 135, 180, 225, 270, 315, 359, 360, -45].map(compassPoint)).toEqual([
      "n",
      "ne",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
      "n",
      "n",
      "nw",
    ]);
  });

  it("gives metres and minutes on foot with the usual allowance for streets, and a direction", () => {
    const leg = legFrom(ORIGIN, northOf(ORIGIN, 480));
    // 480 m in a straight line, x1.3 for streets = 624 m (shown as 620), at 80 m a minute = 8 minutes.
    expect(leg).toMatchObject({ metres: 620, minutes: 8, compass: "n" });
    expect(leg.straightMetres).toBeCloseTo(480, 0);
    expect(legFrom(ORIGIN, { lat: ORIGIN.lat, lng: ORIGIN.lng + 0.002 }).compass).toBe("e");
  });
});
