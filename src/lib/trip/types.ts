import type { RegionConfig } from "../region/schema";

// The trip engine's input and output, exactly as contracts/engine.md writes them. Pure data: the
// engine reads no network, database or clock. Days and nights count from 1.

export type RoadPointId = string;
export type LatLng = { lat: number; lng: number };

/** The part of a region file the engine reads. */
export type RegionTripSettings = Pick<
  RegionConfig,
  "roads" | "towns" | "calendar" | "trip" | "factVocabulary" | "factMaxAgeDays" | "categories"
>;

export type Pin = {
  id: string;
  day: number;
  at?: string; // "HH:MM"
  minutes: number;
  pin: LatLng;
  /** Set when the pin is a place on Noren's map, so its rules can be checked. */
  placeId?: string;
};

export type KeptStop = {
  slot: string;
  day: number;
  place: { placeId: string; slug: string } | { pinId: string };
  /** "time": place and clock time stay. "place": the place stays and may be given a new time. */
  hold: "time" | "place";
  at: string; // "HH:MM"
  minutes: number;
  because: Stop["because"];
};

export type AgeBand = "baby" | "toddler" | "child" | "teen" | "adult" | "older";
export type Fullness = "light" | "steady" | "full";
export type NeedKind = "prayer" | "work" | "rest";

export type PartySnapshot = {
  travellers: {
    key: string; // "t1" to "t8"; no label
    ageBand: AgeBand;
    rules: string[]; // hard rules, as tags
    likes: string[];
    skips: string[]; // tilts away, never removes
    rests?: { after: "lunch"; minutes: number };
    days?: number[]; // days this traveller is on; all when absent
  }[];
  limits: { stretchMinutes: number; dayDriveMinutes: number };
  /** Which of these are Noren's starting guesses. */
  guessed: ("stretch" | "dayDrive" | "meals" | "fullness")[];
  fullness: Fullness;
  meals: { lunch: string; dinner: string }; // "HH:MM"
  needs: { kind: NeedKind; at: string; minutes: number; who?: string[] }[];
};

export type Candidate = {
  placeId: string;
  slug: string;
  category?: string;
  pin: LatLng;
  hasStory: boolean;
  recentSuggestions: number;
  confirmed: boolean;
  /** Owner-confirmed, when they may be shown. */
  cautions: string[];
  facts: { key: string; value: "yes" | "no"; basis: "member" | "post"; day: string; factId: string }[];
};

export type World = {
  region: RegionTripSettings;
  candidates(near: LatLng, withinMetres: number): Candidate[];
  /** Every draw is keyed from this text. */
  seed: string;
  /** The day the plan is made, YYYY-MM-DD in the region's time. The engine has no clock of its own. */
  today: string;
};

/** A spot the engine may ask `World.candidates` about. `anchorsFor` lists them before planning. */
export type Anchor = { near: LatLng; withinMetres: number };

export type ChangeOp =
  | { op: "lighten"; day: number }
  | { op: "quieter" | "shorter_walks"; day?: number }
  | { op: "more_for"; who: string; day?: number }
  | { op: "skip"; slot: string }
  | { op: "redraw"; slot: string }
  | { op: "stay_longer"; slot: string; minutes: number }
  | { op: "add_pin"; pin: Pin }
  | { op: "move_night"; night: number; to: RoadPointId }
  | { op: "weather"; day: number; kind: "rain" | "heat" };

export type TripRequest = {
  regionId: string;
  start: RoadPointId;
  end: RoadPointId;
  days: number; // 1 to 7
  startDate?: string; // YYYY-MM-DD
  nights?: RoadPointId[]; // one per night, days - 1 of them
  via?: RoadPointId[];
  party: PartySnapshot;
  pins: Pin[]; // no labels
  keep?: { stops: KeptStop[] };
  /** placeIds not to offer again in this trip; at most 60. */
  avoid?: string[];
  ops?: ChangeOp[];
};

export type Drive = {
  kind: "drive";
  from: RoadPointId;
  to: RoadPointId;
  minutes: number;
  kilometres: number;
  estimated: true;
};

export type Rest = {
  kind: "rest";
  at: string;
  minutes: number;
  /** "meal": time kept for a meal where Noren holds no place to eat within reach. */
  why: "stretch" | "after_lunch" | "need" | "meal";
};

export type Stop = {
  kind: "stop";
  slot: string;
  at: string;
  minutes: number;
  place: { placeId: string; slug: string } | { pinId: string };
  /** Getting here from the item before, inside a town. */
  legBefore?: { how: "walk" | "drive"; minutes: number; metres: number };
  because:
    | { kind: "turn"; for: string; likes: string[] }
    | { kind: "paired"; for: string; with: string }
    | { kind: "need"; need: "meal" | "prayer" | "work" | "rest" }
    | { kind: "pin" }
    | { kind: "wild" };
  /** Rules of the travellers at this stop; never names a traveller. Never "not_met". */
  checks: (
    | { rule: string; verdict: "met"; restsOn: { kind: "owner" | "member" | "post"; factId?: string } }
    | { rule: string; verdict: "not_known"; reason: "no_record" | "too_old" | "not_recorded_here" }
  )[];
  /** False shows "Not yet confirmed". */
  confirmed: boolean;
  hasStory: boolean;
};

export type Plan = {
  days: {
    index: number;
    date?: string;
    weekday?: string;
    calendar: { text: string; verified: boolean }[];
    night?: RoadPointId;
    items: (Drive | Stop | Rest)[];
    driveMinutes: number;
    /** Reason codes: "mostly_driving", "busy_travel_day", "no_stories_in_town". */
    notes: string[];
  }[];
  unmet: {
    what: "route" | "rule" | "stretch" | "dayDrive" | "rest" | "turn" | "change";
    day?: number;
    slot?: string;
    detail: string;
    choices: string[];
  }[];
  /** When ops were applied. */
  moved?: { slot: string; was?: string; now?: string; why: string }[];
};
