import { describe, expect, it } from "vitest";
import { anchorsFor, planTrip } from "@/lib/trip";
import type { Candidate, Plan, Rest, TripRequest } from "@/lib/trip/types";
import { checkPlan, legMinutes, observe, routeMinutes, type Fault } from "../fixtures/trip-check";
import { SAMPLE_NIGHTS, guessedParty, sampleRoute, setParty, traveller } from "../fixtures/trip-parties";
import { PLACES, REGION, haversineMetres, world } from "../fixtures/trip-world";

// Invariant 3 and the shape of the route (contracts/engine.md): the choices when a route cannot be
// driven, the guess that never refuses, nights chosen among `via` towns, long drives split with
// rests, and the notes a day carries.

const SEED = "route-seed";

function plan(request: TripRequest, places?: readonly Candidate[]): { plan: Plan; faults: Fault[] } {
  const observed = observe(world(SEED, { places }));
  const result = planTrip(request, observed.world);
  const faults = checkPlan(result, { request, world: world(SEED, { places }), seen: observed.seen, places });
  return { plan: result, faults };
}

function messages(faults: Fault[]): string[] {
  return faults.map((fault) => `invariant ${fault.invariant}, ${fault.where}: ${fault.message}`);
}

const ONE_DAY = {
  regionId: "malaysia-west",
  start: "kuala-lumpur",
  end: "alor-setar",
  days: 1,
  startDate: "2026-12-13",
  pins: [],
};
const adult = () => traveller("t1", "adult", { likes: ["food"] });

describe("the road table", () => {
  it("measures Kuala Lumpur to Alor Setar at more than five hours and less than six", () => {
    const minutes = routeMinutes(REGION, "kuala-lumpur", "alor-setar");
    expect(minutes).toBeGreaterThan(300);
    expect(minutes).toBeLessThan(360);
  });

  it("measures the sample route's five days", () => {
    const legs = legMinutes(sampleRoute(setParty([adult()])));
    expect(legs).toHaveLength(5);
    expect(legs[2]).toBe(0);
    expect(Math.max(...legs)).toBe(legs[0]);
  });
});

describe("invariant 3: a limit the organiser set", () => {
  const request: TripRequest = {
    ...ONE_DAY,
    party: setParty([adult()], { limits: { stretchMinutes: 120, dayDriveMinutes: 300 } }),
  };

  it("comes back with no days and a route entry with three different choices", () => {
    const { plan: result, faults } = plan(request);
    expect(result.days).toEqual([]);
    const route = result.unmet.filter((entry) => entry.what === "route");
    expect(route).toHaveLength(1);
    expect(route[0]!.choices).toHaveLength(3);
    expect(new Set(route[0]!.choices).size).toBe(3);
    expect(messages(faults)).toEqual([]);
  });

  it("plans the same route when the limit is raised to six hours", () => {
    const { plan: result, faults } = plan({
      ...request,
      party: setParty([adult()], { limits: { stretchMinutes: 120, dayDriveMinutes: 360 } }),
    });
    expect(result.days).toHaveLength(1);
    expect(result.unmet.filter((entry) => entry.what === "route" || entry.what === "dayDrive")).toEqual([]);
    expect(messages(faults)).toEqual([]);
  });
});

describe("invariant 3: a limit that is Noren's guess", () => {
  const guesses = REGION.trip!.guesses;
  const request: TripRequest = { ...ONE_DAY, party: guessedParty([adult()]) };

  it("starts from the region's guesses and says they are guesses", () => {
    expect(request.party.limits).toEqual({
      stretchMinutes: guesses.stretchMinutes,
      dayDriveMinutes: guesses.dayDriveMinutes,
    });
    expect(request.party.guessed).toEqual(expect.arrayContaining(["stretch", "dayDrive"]));
  });

  it("is planned, and day 1 is named as over the guess with the same three choices", () => {
    const { plan: result, faults } = plan(request);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.driveMinutes).toBeGreaterThan(guesses.dayDriveMinutes);
    const over = result.unmet.filter((entry) => entry.what === "dayDrive");
    expect(over).toHaveLength(1);
    expect(over[0]!.day).toBe(1);
    expect(over[0]!.choices).toHaveLength(3);
    expect(result.unmet.filter((entry) => entry.what === "route")).toEqual([]);

    const refused = plan({
      ...request,
      party: setParty([adult()], { limits: { stretchMinutes: 120, dayDriveMinutes: 300 } }),
    }).plan.unmet.find((entry) => entry.what === "route");
    expect(over[0]!.choices).toEqual(refused!.choices);
    expect(messages(faults)).toEqual([]);
  });

  it("names only the days that are over: the sample route has one", () => {
    const { plan: result, faults } = plan(sampleRoute(guessedParty([adult()])));
    expect(result.days).toHaveLength(5);
    expect(result.unmet.filter((entry) => entry.what === "dayDrive").map((entry) => entry.day)).toEqual([1]);
    expect(messages(faults)).toEqual([]);
  });
});

describe("nights chosen among the via towns", () => {
  const via = ["ipoh", "taiping", "george-town"];
  const request: TripRequest = {
    regionId: "malaysia-west",
    start: "kuala-lumpur",
    end: "kuala-lumpur",
    days: 4,
    startDate: "2026-12-13",
    via,
    party: setParty([adult()], { limits: { stretchMinutes: 120, dayDriveMinutes: 420 } }),
    pins: [],
  };

  it("gives every night but the last a place among them, in the order of the route", () => {
    const { plan: result, faults } = plan(request);
    expect(result.days).toHaveLength(4);
    const nights = result.days.slice(0, 3).map((day) => day.night);
    for (const night of nights) expect(via, `night ${String(night)}`).toContain(night);
    const positions = nights.map((night) => via.indexOf(night as string));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(result.days[3]!.night).toBeUndefined();
    expect(messages(faults)).toEqual([]);
  });

  it("with one town to pass and one night, sleeps there", () => {
    const { plan: result, faults } = plan({
      ...request,
      days: 2,
      via: ["george-town"],
    });
    expect(result.days.map((day) => day.night)).toEqual(["george-town", undefined]);
    expect(messages(faults)).toEqual([]);
  });
});

describe("a drive longer than the stretch limit", () => {
  const request: TripRequest = sampleRoute(
    setParty([adult()], { limits: { stretchMinutes: 90, dayDriveMinutes: 360 } }),
  );

  it("is split with rests, and no run of driving is longer than the limit", () => {
    const { plan: result, faults } = plan(request);
    expect(messages(faults)).toEqual([]);
    const day = result.days[0]!;
    expect(day.driveMinutes).toBeGreaterThan(300);
    const rests = day.items.filter((item): item is Rest => item.kind === "rest" && item.why === "stretch");
    expect(rests.length).toBeGreaterThanOrEqual(1);
    for (const rest of rests) expect(rest.minutes).toBeGreaterThan(0);
  });

  it("splits more when the limit is shorter", () => {
    const count = (stretch: number) => {
      const { plan: result, faults } = plan(
        sampleRoute(setParty([adult()], { limits: { stretchMinutes: stretch, dayDriveMinutes: 360 } })),
      );
      expect(messages(faults)).toEqual([]);
      return result.days[0]!.items.filter((item) => item.kind === "rest" || item.kind === "stop").length;
    };
    expect(count(60)).toBeGreaterThanOrEqual(count(150));
  });
});

describe("the notes a day carries", () => {
  it("a day that is mostly driving carries mostly_driving", () => {
    // Alor Setar and back in a day: about ten and a half hours of a eleven-and-a-half-hour day.
    const request: TripRequest = {
      regionId: "malaysia-west",
      start: "kuala-lumpur",
      end: "kuala-lumpur",
      days: 1,
      startDate: "2026-12-13",
      via: ["alor-setar"],
      party: setParty([adult()], { limits: { stretchMinutes: 120, dayDriveMinutes: 700 } }),
      pins: [],
    };
    const { plan: result, faults } = plan(request);
    expect(messages(faults)).toEqual([]);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.driveMinutes).toBeGreaterThanOrEqual(600);
    expect(result.days[0]!.notes).toContain("mostly_driving");
  });

  it("a day in one town does not", () => {
    const { plan: result } = plan(sampleRoute(setParty([adult()])));
    const stayDay = result.days[2]!;
    expect(stayDay.driveMinutes).toBe(0);
    expect(stayDay.notes).not.toContain("mostly_driving");
  });

  it("on a route that starts Monday 1 February 2027, day 5 (the eve of Chinese New Year, an expected busy day) carries busy_travel_day; day 1 does not", () => {
    const { plan: result } = plan({ ...sampleRoute(setParty([adult()])), startDate: "2027-02-01" });
    expect(result.days[4]!.date).toBe("2027-02-05");
    expect(result.days[4]!.notes).toContain("busy_travel_day");
    expect(result.days[0]!.notes).not.toContain("busy_travel_day");
    // The busy day is not verified, and the page must say so.
    expect(result.days[4]!.calendar.some((entry) => entry.verified === false)).toBe(true);
  });

  it("every day of the sample route from 2026-12-13 carries a verified school-holiday calendar entry", () => {
    const { plan: result } = plan(sampleRoute(setParty([adult()])));
    expect(result.days[0]!.date).toBe("2026-12-13");
    for (const day of result.days) expect(day.calendar.some((entry) => entry.verified === true)).toBe(true);
  });

  it("a day in a town with no story yet carries no_stories_in_town", () => {
    const georgeTown = REGION.towns!.find((town) => town.id === "george-town")!;
    const withoutStories = PLACES.map((place) =>
      haversineMetres(georgeTown.center, place.pin) <= 20_000 ? { ...place, hasStory: false } : place,
    );
    const request = sampleRoute(setParty([adult()]));
    const bare = plan(request, withoutStories);
    expect(messages(bare.faults)).toEqual([]);
    expect(bare.plan.days[2]!.notes).toContain("no_stories_in_town");
    expect(plan(request).plan.days[2]!.notes).not.toContain("no_stories_in_town");
  });
});

describe("where the engine looks for places", () => {
  const request = sampleRoute(setParty([adult()]));

  it("asks about each town of the route by its centre and radius", () => {
    const anchors = anchorsFor(request, REGION);
    expect(anchors.length).toBeLessThanOrEqual(12);
    for (const night of new Set(SAMPLE_NIGHTS)) {
      const towns = REGION.towns!.filter((town) => town.onRoad === night);
      const found = towns.some((town) =>
        anchors.some(
          (anchor) => anchor.withinMetres === town.radiusMetres && haversineMetres(anchor.near, town.center) < 0.5,
        ),
      );
      expect(found, `a town for night at ${night}`).toBe(true);
    }
  });

  it("asks about road points by the region's reach, where a meal may fall on the driving day", () => {
    const reach = REGION.trip!.roadPointReachMetres;
    const points = REGION.roads!.points;
    // A town may have the same radius as the reach (George Town does), so tell the two apart by
    // where they sit: a road-point anchor is centred on a road point's pin.
    const anchors = anchorsFor(request, REGION).filter(
      (anchor) => anchor.withinMetres === reach && points.some((point) => haversineMetres(point.pin, anchor.near) < 0.5),
    );
    expect(anchors.length).toBeGreaterThan(0);
    // The meal of day 1 falls on the road between Kuala Lumpur and Alor Setar.
    const onTheRoad = new Set(["sungai-buloh", "rawang", "tanjung-malim", "slim-river", "tapah", "kampar", "gopeng", "ipoh", "taiping", "juru", "sungai-petani", "alor-setar", "kuala-lumpur"]);
    expect(
      anchors.some((anchor) => points.some((point) => onTheRoad.has(point.id) && haversineMetres(point.pin, anchor.near) < 0.5)),
    ).toBe(true);
  });

  it("never lists more than twelve, and puts the towns first, however long the route", () => {
    const long: TripRequest = {
      regionId: "malaysia-west",
      start: "kuala-lumpur",
      end: "alor-setar",
      days: 7,
      startDate: "2026-12-13",
      nights: ["tanjung-malim", "kampar", "ipoh", "taiping", "george-town", "sungai-petani"],
      party: setParty([adult()]),
      pins: [],
    };
    const anchors = anchorsFor(long, REGION);
    expect(anchors.length).toBeLessThanOrEqual(12);
    for (const night of long.nights!) {
      const towns = REGION.towns!.filter((town) => town.onRoad === night);
      const found = towns.some((town) =>
        anchors.some((anchor) => anchor.withinMetres === town.radiusMetres && haversineMetres(anchor.near, town.center) < 0.5),
      );
      expect(found, `a town for night at ${night}`).toBe(true);
    }
  });
});
