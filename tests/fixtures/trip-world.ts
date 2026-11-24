import malaysiaWest from "../../regions/malaysia-west.json";
import { seededRng } from "@/lib/draw/rng";
import type { Candidate, LatLng, RegionTripSettings, World } from "@/lib/trip/types";

// A made-up world for the trip engine's tests: about 300 places spread over the towns of
// regions/malaysia-west.json and around its road points, built from a fixed seed so the world is
// the same every run. Every id and slug starts with "test-". None of it is real, and none of it
// leaves tests/ (constitution II: no invented data in the product).
//
// The facts cover every case the trip rules have to tell apart: a fresh "yes" and a fresh "no",
// two reports that disagree, a report 14 months old, and reports exactly on each side of the age
// limit. One rule, `vegan`, has no record anywhere on purpose: it is the rule no record can check.

export const REGION = malaysiaWest as unknown as RegionTripSettings;

/** The date the plans are made on in the fixtures. The engine has no clock. */
export const TODAY = "2026-12-01";
/** The first day of the sample trip. */
export const TRIP_START = "2026-12-13";

const METRES_PER_DEGREE = 111_320;

export function haversineMetres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const parse = (text: string) => {
    const [y = 0, m = 1, d = 1] = text.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type Fact = Candidate["facts"][number];
type Category = "restaurant" | "cafe" | "bar" | "shop" | "music_shop" | "gallery" | "stay" | "bath" | "museum" | "attraction" | "other";

const FOOD: readonly Category[] = ["restaurant", "cafe"];

/** How many made-up places each town gets, then how many go beside each road point. */
const TOWN_COUNTS: Record<string, number> = {
  ipoh: 30,
  "george-town": 30,
  "alor-setar": 26,
  "penang-island": 14,
  "seberang-perai": 14,
  taiping: 12,
  "kuala-kangsar": 12,
  "sungai-petani": 12,
  kampar: 12,
  gopeng: 10,
  "kuala-sepetang": 10,
  "tanjung-malim": 10,
};
const PLACES_PER_ROAD_POINT = 4;

// Reports are dated against the trip start 2026-12-13 and the age limit of 365 days.
const FRESH_FROM = "2026-06-01";
const FRESH_SPAN_DAYS = 175;
const OLD_DAY = "2025-10-05"; // 14 months before the trip
const JUST_FRESH_DAY = "2025-12-13"; // exactly 365 days before 2026-12-13: still fresh
const JUST_OLD_DAY = "2025-12-12"; // 366 days before: past the limit

function offsetPoint(centre: LatLng, radiusMetres: number, rng: () => number): LatLng {
  const distance = radiusMetres * Math.sqrt(rng());
  const bearing = rng() * 2 * Math.PI;
  const dLat = (distance * Math.cos(bearing)) / METRES_PER_DEGREE;
  const dLng = (distance * Math.sin(bearing)) / (METRES_PER_DEGREE * Math.cos((centre.lat * Math.PI) / 180));
  return { lat: centre.lat + dLat, lng: centre.lng + dLng };
}

function pickCategory(index: number, rng: () => number, atRoadPoint: boolean): Category {
  if (index < (atRoadPoint ? 2 : 5)) return "restaurant";
  if (index < (atRoadPoint ? 3 : 8)) return "cafe";
  if (atRoadPoint) return rng() < 0.5 ? "restaurant" : "attraction";
  const roll = rng();
  if (roll < 0.14) return "restaurant";
  if (roll < 0.22) return "cafe";
  if (roll < 0.4) return "attraction";
  if (roll < 0.52) return "museum";
  if (roll < 0.64) return "shop";
  if (roll < 0.72) return "gallery";
  if (roll < 0.78) return "music_shop";
  if (roll < 0.84) return "bar";
  if (roll < 0.9) return "stay";
  if (roll < 0.94) return "bath";
  return "other";
}

type Group = { name: string; centre: LatLng; radius: number; count: number; atRoadPoint: boolean };

function groups(): Group[] {
  const result: Group[] = [];
  for (const town of REGION.towns ?? []) {
    result.push({
      name: town.id,
      centre: town.center,
      radius: town.radiusMetres * 0.9,
      count: TOWN_COUNTS[town.id] ?? 8,
      atRoadPoint: false,
    });
  }
  // Beside every road point, inside the reach where a meal or a rest may fall, so a driving day
  // always has somewhere to eat.
  const reach = REGION.trip?.roadPointReachMetres ?? 3000;
  for (const point of REGION.roads?.points ?? []) {
    result.push({
      name: `road-${point.id}`,
      centre: point.pin,
      radius: reach * 0.8,
      count: PLACES_PER_ROAD_POINT,
      atRoadPoint: true,
    });
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

function buildPlaces(): Candidate[] {
  const rng = seededRng("trip-world-v1");
  const places: Candidate[] = [];
  let factCounter = 0;
  const fact = (key: string, value: "yes" | "no", day: string, basis?: "member" | "post"): Fact => {
    factCounter += 1;
    return {
      key,
      value,
      basis: basis ?? (factCounter % 2 === 0 ? "member" : "post"),
      day,
      factId: `test-fact-${String(factCounter).padStart(4, "0")}`,
    };
  };
  const freshDay = () => {
    const [y = 0, m = 1, d = 1] = FRESH_FROM.split("-").map(Number);
    const base = Date.UTC(y, m - 1, d);
    return new Date(base + Math.floor(rng() * FRESH_SPAN_DAYS) * 86_400_000).toISOString().slice(0, 10);
  };

  let serial = 0;
  for (const group of groups()) {
    for (let i = 0; i < group.count; i++) {
      serial += 1;
      // Every sixth place in a town is a clean one: no record and no caution, so nothing is met and
      // nothing fails. A pinned place and a hard-rule party can always count on some.
      const clean = !group.atRoadPoint && i % 6 === 5;
      const category: Category = clean && i >= 8 ? "attraction" : pickCategory(i, rng, group.atRoadPoint);
      const food = FOOD.includes(category);
      const slugBase = group.name.replace(/^road-/, "rp-");
      const slug = `test-${slugBase}-${String(i + 1).padStart(3, "0")}`;
      const facts: Fact[] = [];
      const cautions: string[] = [];

      // The made-up place's fate is set by its serial number for the special cases, so every case is
      // present in every run, and by the generator for the rest.
      const special = serial % 23;
      if (special === 3) {
        // Two fresh reports that disagree: neither side can be trusted for the rules the key names.
        facts.push(fact("level_entrance", "yes", freshDay()), fact("level_entrance", "no", freshDay()));
      } else if (special === 7 && food) {
        facts.push(fact("halal_sign", "yes", freshDay()), fact("halal_sign", "no", freshDay()));
      } else if (special === 11) {
        // A report 14 months old: the record is too old to count.
        facts.push(fact("level_entrance", "yes", OLD_DAY));
      } else if (special === 13) {
        facts.push(fact("steps_at_door", "yes", OLD_DAY));
      } else if (special === 15 && food) {
        facts.push(fact("halal_sign", "yes", OLD_DAY));
      } else if (special === 17) {
        facts.push(fact("level_entrance", "yes", JUST_FRESH_DAY));
      } else if (special === 19) {
        facts.push(fact("level_entrance", "yes", JUST_OLD_DAY));
      } else if (special === 21) {
        // Fresh and old reports on one key: the fresh one decides.
        facts.push(fact("steps_at_door", "no", OLD_DAY), fact("steps_at_door", "yes", freshDay()));
      }

      const specialHandled = facts.length > 0;
      const maybe = (probability: number) => rng() < probability;
      if (!specialHandled) {
        if (maybe(0.12)) facts.push(fact("steps_at_door", "yes", freshDay()));
        else if (maybe(0.14)) facts.push(fact("level_entrance", "yes", freshDay()));
        else if (maybe(0.05)) facts.push(fact("ramp", "yes", freshDay()));
        if (maybe(0.06)) facts.push(fact("dropoff_at_door", "yes", freshDay()));
        if (maybe(0.04)) facts.push(fact("dropoff_at_door", "no", freshDay()));
        if (maybe(0.1)) facts.push(fact("seats_to_rest", "yes", freshDay()));
        if (maybe(0.08)) facts.push(fact("shade_to_sit", "yes", freshDay()));
        if (maybe(0.08)) facts.push(fact("quiet_room", "yes", freshDay()));
        if (maybe(0.1)) facts.push(fact("table_to_work", "yes", freshDay()));
        if (maybe(0.16)) facts.push(fact("toilet_on_site", "yes", freshDay()));
        if (maybe(0.04)) facts.push(fact("wheelchair_toilet", "yes", freshDay()));
        if (maybe(0.14)) facts.push(fact("prayer_room", "yes", freshDay()));
        if (food) {
          const roll = rng();
          if (roll < 0.3) facts.push(fact("halal_sign", "yes", freshDay()));
          else if (roll < 0.5) facts.push(fact("pork_served", "yes", freshDay()));
          // vegetarian_dishes only ever "yes": a "no" would also count against `vegan`, and `vegan`
          // must stay a rule no record can check.
          if (maybe(0.25)) facts.push(fact("vegetarian_dishes", "yes", freshDay()));
          if (maybe(0.2)) facts.push(fact("high_chairs", "yes", freshDay()));
          else if (maybe(0.06)) facts.push(fact("high_chairs", "no", freshDay()));
          if (category === "restaurant" && maybe(0.1)) facts.push(fact("alcohol_served", "yes", freshDay()));
        }
        if (category === "bar") facts.push(fact("alcohol_served", "yes", freshDay()));
      }

      // Owner cautions: some places list steps; a few more note cash only.
      if (serial % 9 === 4) cautions.push("accessibility_steps");
      if (serial % 31 === 5) cautions.push("cash_only");

      if (clean) {
        facts.length = 0;
        cautions.length = 0;
      }

      places.push({
        placeId: `plc-${slug}`,
        slug,
        category,
        pin: offsetPoint(group.centre, group.radius, rng),
        hasStory: rng() < 0.45,
        recentSuggestions: Math.floor(rng() * 6),
        confirmed: rng() < 0.7,
        cautions,
        facts,
      });
    }
  }

  // A quiet corner on record in every town, so a change to "quieter" has places to draw (the facts
  // are added after the generator ran, so the world above is unchanged). Not on a clean place.
  let quiet = 0;
  places.forEach((place, index) => {
    const isClean = place.facts.length === 0 && place.cautions.length === 0;
    if (index % 7 === 2 && !isClean && !place.facts.some((f) => f.key === "quiet_room")) {
      quiet += 1;
      place.facts.push({
        key: "quiet_room",
        value: "yes",
        basis: quiet % 2 === 0 ? "member" : "post",
        day: "2026-10-15",
        factId: `test-fact-q${String(quiet).padStart(3, "0")}`,
      });
    }
  });

  return places.map((place) => deepFreeze(place));
}

/** The whole made-up world, frozen: an engine that changes a candidate throws. */
export const PLACES: readonly Candidate[] = buildPlaces();

export function placeById(placeId: string): Candidate | undefined {
  return PLACES.find((place) => place.placeId === placeId);
}

export type QueryLog = { near: LatLng; withinMetres: number }[];

/**
 * The world the engine is given. `places` is the list `candidates` filters, by real distance;
 * the default is the whole made-up world. A fresh array comes back on every call, in the same
 * order every time. `log` collects every spot the engine asks about.
 */
export function world(
  seed: string,
  options: { places?: readonly Candidate[]; log?: QueryLog; today?: string } = {},
): World {
  const places = options.places ?? PLACES;
  return {
    region: REGION,
    seed,
    today: options.today ?? TODAY,
    candidates(near, withinMetres) {
      options.log?.push({ near: { ...near }, withinMetres });
      return places.filter((place) => haversineMetres(near, place.pin) <= withinMetres);
    },
  };
}

/** Every candidate in the world, with a rating and a story count added (invariant 11). */
export function withRankingFields(places: readonly Candidate[], flavour: "high" | "low" | "mixed"): Candidate[] {
  return places.map((place, index) => {
    const base = { ...place };
    const rating = flavour === "high" ? 5 : flavour === "low" ? 1 : ((index * 37) % 50) / 10;
    const storyCount = flavour === "high" ? 400 : flavour === "low" ? 0 : (index * 13) % 97;
    return {
      ...base,
      rating,
      storyCount,
      reviewCount: storyCount * 3,
      popularity: rating * 100,
    } as unknown as Candidate;
  });
}

export function placesIn(town: string): Candidate[] {
  const centre = REGION.towns?.find((entry) => entry.id === town);
  if (centre === undefined) return [];
  return PLACES.filter((place) => haversineMetres(centre.center, place.pin) <= centre.radiusMetres);
}
