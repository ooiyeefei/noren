import { describe, expect, it } from "vitest";
import { daysBetween, groupTrips, orderTrail, tripArea, tripLabels } from "@/lib/trail/trips";

const place = (
  id: string,
  stampDay: string,
  stampTime: number | null,
  areaNames: Record<string, string> | null = null,
) => ({ placeId: id, stampDay, stampTime, areaNames });
const nagasaki = { ja: "長崎", en: "Nagasaki" };
const suwa = { ja: "諏訪", en: "Suwa" };
const shimabara = { ja: "島原城下町", en: "Shimabara Castle Town" };

describe("daysBetween", () => {
  it("counts whole calendar days, across a month and a year", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-11-05", "2026-11-05")).toBe(0);
  });
});

describe("orderTrail", () => {
  it("goes by day, then puts a place known by day alone before those with a time", () => {
    const ordered = orderTrail([
      place("d", "2026-11-06", 100),
      place("b", "2026-11-05", 300),
      place("a", "2026-11-05", null),
      place("c", "2026-11-05", 200),
    ]);
    expect(ordered.map(({ placeId }) => placeId)).toEqual(["a", "c", "b", "d"]);
  });

  it("breaks a tie on the place id, and does not change what it is given", () => {
    const input = [place("z", "2026-11-05", null), place("y", "2026-11-05", null)];
    expect(orderTrail(input).map(({ placeId }) => placeId)).toEqual(["y", "z"]);
    expect(input.map(({ placeId }) => placeId)).toEqual(["z", "y"]);
  });
});

describe("groupTrips", () => {
  it("starts a new trip after more than three days with no stamp", () => {
    const trips = groupTrips([
      place("a", "2026-10-01", 1),
      place("b", "2026-10-04", 1),
      place("c", "2026-10-08", 1),
      place("d", "2026-10-09", 1),
    ]);
    expect(trips.map((trip) => trip.places.map(({ placeId }) => placeId))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(trips.map(({ startDay, endDay }) => [startDay, endDay])).toEqual([
      ["2026-10-01", "2026-10-04"],
      ["2026-10-08", "2026-10-09"],
    ]);
  });

  it("keeps places on the same day, or three days apart, in one trip", () => {
    expect(groupTrips([place("a", "2026-10-01", 1), place("b", "2026-10-01", 2)])).toHaveLength(1);
    expect(groupTrips([place("a", "2026-10-01", 1), place("b", "2026-10-04", 1)])).toHaveLength(1);
    expect(groupTrips([place("a", "2026-10-01", 1), place("b", "2026-10-05", 1)])).toHaveLength(2);
  });

  it("gives each trip an id that stays the same between renders", () => {
    const input = [place("a", "2026-10-01", 1), place("b", "2026-10-20", 1)];
    expect(groupTrips(input).map(({ id }) => id)).toEqual(groupTrips(input).map(({ id }) => id));
    expect(new Set(groupTrips(input).map(({ id }) => id)).size).toBe(2);
  });

  it("gives no trips for no places", () => {
    expect(groupTrips([])).toEqual([]);
  });
});

describe("tripArea", () => {
  it("names the neighbourhood when every place falls in it", () => {
    expect(tripArea([{ areaNames: suwa }, { areaNames: suwa }], nagasaki, "en")).toBe("Suwa");
    expect(tripArea([{ areaNames: shimabara }], nagasaki, "ja")).toBe("島原城下町");
  });

  it("names the region when places span neighbourhoods or fall in none", () => {
    expect(tripArea([{ areaNames: suwa }, { areaNames: shimabara }], nagasaki, "en")).toBe(
      "Nagasaki",
    );
    expect(tripArea([{ areaNames: suwa }, { areaNames: null }], nagasaki, "ja")).toBe("長崎");
    expect(tripArea([{ areaNames: null }], nagasaki, "en")).toBe("Nagasaki");
  });
});

describe("tripLabels", () => {
  it("reads as the area and the month the trip began", () => {
    const trips = groupTrips([
      place("a", "2026-10-03", 1, suwa),
      place("b", "2026-10-04", 1, { ...suwa }),
      place("c", "2026-11-05", 1, shimabara),
    ]);
    expect(tripLabels(trips, nagasaki, "en")).toEqual([
      "Suwa · Oct 2026",
      "Shimabara Castle Town · Nov 2026",
    ]);
    expect(tripLabels(trips, nagasaki, "ja")).toEqual([
      "諏訪 · 2026年10月",
      "島原城下町 · 2026年11月",
    ]);
  });

  it("adds the first day when two trips would read the same", () => {
    const trips = groupTrips([
      place("a", "2026-10-03", 1, suwa),
      place("b", "2026-10-20", 1, suwa),
    ]);
    expect(tripLabels(trips, nagasaki, "en")).toEqual(["Suwa · Oct 3, 2026", "Suwa · Oct 20, 2026"]);
  });
});
