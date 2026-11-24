import { describe, expect, it } from "vitest";
import malaysia from "../../regions/malaysia-west.json";
import { areaRegionSchema } from "@/lib/region/schema";
import { offRoadMinutes, quickestPath } from "@/lib/trip/roads";

const region = areaRegionSchema.parse(malaysia);

describe("trip roads", () => {
  it("uses the quickest route rather than the fewest segments or shortest distance", () => {
    const pin = { lat: 4, lng: 100 };
    const roads = {
      points: ["a", "b", "c"].map((id) => ({ id, pin, offRoadMinutes: 0 })),
      segments: [
        { from: "a", to: "c", minutes: 30, kilometres: 10, road: "local" },
        { from: "a", to: "b", minutes: 10, kilometres: 11, road: "main" },
        { from: "b", to: "c", minutes: 12, kilometres: 13, road: "main" },
      ],
      source: region.roads!.source,
    };
    expect(
      quickestPath(roads, "c", "a")?.map(({ from, to, minutes, kilometres }) => [
        from,
        to,
        minutes,
        kilometres,
      ]),
    ).toEqual([
      ["c", "b", 12, 13],
      ["b", "a", 10, 11],
    ]);
    expect(quickestPath(roads, "b", "b")).toEqual([]);
    expect(quickestPath(roads, "a", "unknown")).toBeUndefined();
  });

  it("uses recorded off-road minutes when available, including zero", () => {
    const from = { lat: 4, lng: 100 };
    const to = { lat: 4.01, lng: 100 };
    const trip = region.trip!;
    expect(offRoadMinutes(from, to, trip, 0)).toBe(0);
    expect(offRoadMinutes(from, to, trip, 8)).toBe(8);
    expect(offRoadMinutes(from, to, trip)).toBe(4);
  });
});
