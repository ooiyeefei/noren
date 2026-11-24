import type { PartySnapshot, Pin, TripRequest } from "@/lib/trip/types";
import { PLACES, REGION } from "./trip-world";

// Twenty parties on the sample route: start and end Kuala Lumpur, nights at Alor Setar,
// George Town, George Town and Ipoh, five days from 2026-12-13 (a Sunday). Every party is a request
// the engine must plan without a fault, with each of five seeds (SC-302).
//
// Day 1 drives Kuala Lumpur to Alor Setar: 315 minutes by the road table, over the region's
// 300-minute guess. A party that sets its own daily limit therefore sets it at 360 or more, so its
// route can be driven; the party that sets no limits gets the guess and day 1 is named as over it.

type Traveller = PartySnapshot["travellers"][number];

const GUESSES = REGION.trip!.guesses;

export const SEEDS = ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"] as const;

export const SAMPLE_NIGHTS = ["alor-setar", "george-town", "george-town", "ipoh"];

function traveller(key: string, ageBand: Traveller["ageBand"], extra: Partial<Traveller> = {}): Traveller {
  return { key, ageBand, rules: [], likes: [], skips: [], ...extra };
}

/** Limits the organiser set (nothing guessed): the route can be driven, day 1 included. */
export function setParty(travellers: Traveller[], extra: Partial<PartySnapshot> = {}): PartySnapshot {
  return {
    travellers,
    limits: { stretchMinutes: 120, dayDriveMinutes: 360 },
    guessed: [],
    fullness: "steady",
    meals: { lunch: GUESSES.lunch, dinner: GUESSES.dinner },
    needs: [],
    ...extra,
  };
}

/** A party that sets nothing: every starting value is the region's guess, and says so. */
export function guessedParty(travellers: Traveller[]): PartySnapshot {
  return {
    travellers,
    limits: { stretchMinutes: GUESSES.stretchMinutes, dayDriveMinutes: GUESSES.dayDriveMinutes },
    guessed: ["stretch", "dayDrive", "meals", "fullness"],
    fullness: GUESSES.fullness,
    meals: { lunch: GUESSES.lunch, dinner: GUESSES.dinner },
    needs: [],
  };
}

export function sampleRoute(party: PartySnapshot, pins: Pin[] = []): TripRequest {
  return {
    regionId: "malaysia-west",
    start: "kuala-lumpur",
    end: "kuala-lumpur",
    days: 5,
    startDate: "2026-12-13",
    nights: [...SAMPLE_NIGHTS],
    party,
    pins,
  };
}

/** A made-up George Town place with no record and no caution, to use as a pinned place. */
function cleanPlace(town: string, category: string) {
  const centre = REGION.towns!.find((entry) => entry.id === town)!;
  const found = PLACES.find(
    (place) =>
      place.category === category &&
      place.facts.length === 0 &&
      place.cautions.length === 0 &&
      Math.abs(place.pin.lat - centre.center.lat) < 0.02 &&
      Math.abs(place.pin.lng - centre.center.lng) < 0.02,
  );
  if (found === undefined) throw new Error(`No clean ${category} near ${town} in the test world`);
  return found;
}

const PINNED_PLACE = cleanPlace("george-town", "attraction");

export const PIN_FREE: Pin = {
  id: "pin-free",
  day: 2,
  at: "15:30",
  minutes: 60,
  pin: { lat: 5.4161, lng: 100.3327 },
};
export const PIN_KNOWN: Pin = {
  id: "pin-known",
  day: 3,
  at: "10:30",
  minutes: 60,
  pin: { ...PINNED_PLACE.pin },
  placeId: PINNED_PLACE.placeId,
};

export type PartyCase = {
  name: string;
  request: TripRequest;
  /** The rule tags the party carries, for the coverage check. */
  rules: string[];
};

function party(name: string, request: TripRequest): PartyCase {
  const rules = new Set<string>();
  for (const member of request.party.travellers) for (const rule of member.rules) rules.add(rule);
  return { name, request, rules: [...rules] };
}

export const PARTIES: PartyCase[] = [
  party(
    "one adult",
    sampleRoute(setParty([traveller("t1", "adult", { likes: ["history", "coffee"] })])),
  ),
  party(
    "two adults",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["food", "history"] }),
        traveller("t2", "adult", { likes: ["nature", "coffee"], skips: ["drinks"] }),
      ]),
    ),
  ),
  party(
    "four adults",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { likes: ["food"] }),
          traveller("t2", "adult", { likes: ["art"] }),
          traveller("t3", "adult", { likes: ["history", "craft"] }),
          traveller("t4", "adult", { likes: ["music"], skips: ["nature"] }),
        ],
        { fullness: "full" },
      ),
    ),
  ),
  party(
    "grandparent step-free with a child who rests",
    sampleRoute(
      setParty([
        traveller("t1", "older", { rules: ["step-free"], likes: ["history"] }),
        traveller("t2", "child", { likes: ["food"], rests: { after: "lunch", minutes: 45 } }),
        traveller("t3", "adult", { likes: ["coffee"] }),
      ]),
    ),
  ),
  party(
    "halal family",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { rules: ["halal"], likes: ["food"] }),
          traveller("t2", "adult", { rules: ["halal"], likes: ["history"] }),
          traveller("t3", "child", { rules: ["halal"], likes: ["nature"] }),
          traveller("t4", "toddler", { rules: ["halal", "high-chair"], rests: { after: "lunch", minutes: 60 } }),
        ],
        { fullness: "light" },
      ),
    ),
  ),
  party(
    "vegetarian",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { rules: ["vegetarian"], likes: ["food", "nature"] }),
        traveller("t2", "adult", { likes: ["coffee"] }),
      ]),
    ),
  ),
  party(
    "wheelchair user",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { rules: ["step-free", "toilet-near", "short-walks"], likes: ["art"] }),
          traveller("t2", "adult", { likes: ["food"] }),
        ],
        { fullness: "light" },
      ),
    ),
  ),
  party(
    "toddler and teen",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["food"] }),
        traveller("t2", "toddler", { rules: ["high-chair"], rests: { after: "lunch", minutes: 60 } }),
        traveller("t3", "teen", { likes: ["music", "craft"] }),
      ]),
    ),
  ),
  party(
    "party of eight",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { likes: ["food"] }),
          traveller("t2", "adult", { likes: ["history"] }),
          traveller("t3", "older", { rules: ["sit-often"], likes: ["nature"] }),
          traveller("t4", "older", { rules: ["sit-often", "toilet-near"], likes: ["coffee"] }),
          traveller("t5", "teen", { likes: ["music"] }),
          traveller("t6", "child", { likes: ["craft"] }),
          traveller("t7", "child", { likes: ["art"] }),
          traveller("t8", "adult", { likes: ["history", "food"] }),
        ],
        { fullness: "full", limits: { stretchMinutes: 150, dayDriveMinutes: 400 } },
      ),
    ),
  ),
  party(
    "no likes at all",
    sampleRoute(setParty([traveller("t1", "adult"), traveller("t2", "adult")])),
  ),
  party(
    "a rule no record can check",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { rules: ["vegan"], likes: ["food"] }),
        traveller("t2", "adult", { likes: ["history"] }),
      ]),
    ),
  ),
  party(
    "traveller who joins on day 3",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["history"] }),
        traveller("t2", "adult", { rules: ["pork-free"], likes: ["food"], days: [3, 4, 5] }),
      ]),
    ),
  ),
  party("no limits set", sampleRoute(guessedParty([traveller("t1", "adult", { likes: ["food"] }), traveller("t2", "adult", { likes: ["art"] })]))),
  party(
    "older couple",
    sampleRoute(
      setParty(
        [
          traveller("t1", "older", { rules: ["sit-often", "toilet-near", "short-walks"], likes: ["history"] }),
          traveller("t2", "older", { rules: ["sit-often"], likes: ["coffee"] }),
        ],
        { fullness: "light", limits: { stretchMinutes: 90, dayDriveMinutes: 360 } },
      ),
    ),
  ),
  party(
    "prayer times",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { rules: ["halal"], likes: ["food"] }),
          traveller("t2", "adult", { rules: ["halal"], likes: ["history"] }),
        ],
        { needs: [{ kind: "prayer", at: "13:30", minutes: 20 }, { kind: "prayer", at: "16:45", minutes: 20 }] },
      ),
    ),
  ),
  party(
    "work and rest needs",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { rules: ["quiet"], likes: ["coffee"] }),
          traveller("t2", "adult", { likes: ["nature"] }),
        ],
        {
          needs: [
            { kind: "work", at: "10:30", minutes: 60, who: ["t1"] },
            { kind: "rest", at: "15:00", minutes: 20 },
          ],
        },
      ),
    ),
  ),
  party(
    "no alcohol and no pork",
    sampleRoute(
      setParty(
        [
          traveller("t1", "adult", { rules: ["no-alcohol", "pork-free"], likes: ["drinks", "food"] }),
          traveller("t2", "adult", { rules: ["no-alcohol"], likes: ["craft"] }),
        ],
        { fullness: "full" },
      ),
    ),
  ),
  party(
    "pins, one a place on the map",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["history", "food"] }),
        traveller("t2", "adult", { likes: ["art"] }),
      ]),
      [PIN_FREE, PIN_KNOWN],
    ),
  ),
  party(
    "early and late meals, short stretches",
    sampleRoute(
      setParty([traveller("t1", "adult", { likes: ["nature"] }), traveller("t2", "teen", { likes: ["music"] })], {
        limits: { stretchMinutes: 90, dayDriveMinutes: 360 },
        meals: { lunch: "13:30", dinner: "18:30" },
        fullness: "full",
      }),
    ),
  ),
  party(
    "two travellers, one leaves after day 3",
    sampleRoute(
      setParty([
        traveller("t1", "adult", { likes: ["food", "history"] }),
        traveller("t2", "adult", { rules: ["step-free"], likes: ["art"], days: [1, 2, 3] }),
      ]),
    ),
  ),
];

/**
 * The base party for the pair tests: two adults with likes, limits the organiser set, a light day
 * and no rules, so that a single added answer is the only difference between two plans.
 */
export function pairBase(): TripRequest {
  return sampleRoute(
    setParty(
      [
        traveller("t1", "adult", { likes: ["history", "food"] }),
        traveller("t2", "adult", { likes: ["coffee", "nature"] }),
      ],
      { limits: { stretchMinutes: 120, dayDriveMinutes: 420 }, fullness: "steady" },
    ),
  );
}

export { traveller };
