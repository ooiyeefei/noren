# Contract: the trip engine (`src/lib/trip/`)

Pure functions. No network, no database, no clock: the caller passes the places, the facts, the region file's settings, the date and a seed. The same input gives the same plan. This is the contract the tests bind to.

Revised 24 November 2026 after the analysis (see "Changes after the analysis" in [tasks.md](../tasks.md)).

## Input

```ts
type TripRequest = {
  regionId: string;
  start: RoadPointId;            // a point in the region's roads
  end: RoadPointId;
  days: number;                  // 1 to 7
  startDate?: string;            // YYYY-MM-DD; gives weekdays and the calendar
  nights?: RoadPointId[];        // one per night, days - 1 of them; absent when the engine is to choose
  via?: RoadPointId[];           // towns to pass through, in order; the engine chooses nights among them
  party: PartySnapshot;
  pins: Pin[];                   // no labels
  keep?: { stops: KeptStop[] };  // done stops and stops to leave alone, when changing a plan
  avoid?: string[];              // placeIds not to offer again in this trip (drawn away or skipped); at most 60
  ops?: ChangeOp[];              // what the organiser asked to change
};

type Pin = {
  id: string; day: number; at?: "HH:MM"; minutes: number;
  pin: { lat: number; lng: number };
  placeId?: string;              // set when the pin is a place on Noren's map, so its rules can be checked
};

type KeptStop = {
  slot: string; day: number;
  place: { placeId: string; slug: string } | { pinId: string };
  hold: "time" | "place";        // "time": place and clock time stay (a done stop, a pin with a time).
                                 // "place": the place stays and may be given a new time.
  at: "HH:MM"; minutes: number;
  because: Stop["because"];
};

type PartySnapshot = {
  travellers: {
    key: string;                 // "t1" to "t8"; no label
    ageBand: "baby" | "toddler" | "child" | "teen" | "adult" | "older";
    rules: string[];             // hard rules, as tags
    likes: string[];
    skips: string[];             // tilts away, never removes
    rests?: { after: "lunch"; minutes: number };
    days?: number[];             // days this traveller is on; all when absent
  }[];
  limits: { stretchMinutes: number; dayDriveMinutes: number };
  guessed: ("stretch" | "dayDrive" | "meals" | "fullness")[];   // which of these are Noren's starting guesses
  fullness: "light" | "steady" | "full";
  meals: { lunch: "HH:MM"; dinner: "HH:MM" };
  needs: { kind: "prayer" | "work" | "rest"; at: "HH:MM"; minutes: number; who?: string[] }[];
};

type World = {
  region: RegionTripSettings;                    // roads, towns, calendar, trip numbers, fact list
  candidates(near: LatLng, withinMetres: number): Candidate[];
  seed: string;                                  // every draw is keyed from this text
  today: string;                                 // YYYY-MM-DD in the region's time; the engine has no clock
};

type Anchor = { near: LatLng; withinMetres: number };

type Candidate = {
  placeId: string; slug: string; category?: string; pin: LatLng;
  hasStory: boolean; recentSuggestions: number; confirmed: boolean;
  cautions: string[];                            // owner-confirmed, when they may be shown
  facts: { key: string; value: "yes" | "no"; basis: "member" | "post"; day: string; factId: string }[];
};

type ChangeOp =
  | { op: "lighten"; day: number }
  | { op: "quieter" | "shorter_walks"; day?: number }
  | { op: "more_for"; who: string; day?: number }
  | { op: "skip"; slot: string }
  | { op: "redraw"; slot: string }
  | { op: "stay_longer"; slot: string; minutes: number }
  | { op: "add_pin"; pin: Pin }
  | { op: "move_night"; night: number; to: RoadPointId }
  | { op: "weather"; day: number; kind: "rain" | "heat" };
```

Days and nights count from 1.

## Output

```ts
type Plan = {
  days: {
    index: number; date?: string; weekday?: string;
    calendar: { text: string; verified: boolean }[];
    night?: RoadPointId;
    items: (Drive | Stop | Rest)[];
    driveMinutes: number;
    notes: string[];             // reason codes: "mostly_driving", "busy_travel_day", "no_stories_in_town"
  }[];
  unmet: {
    what: "route" | "rule" | "stretch" | "dayDrive" | "rest" | "turn" | "change";
    day?: number; slot?: string; detail: string; choices: string[];
  }[];
  moved?: { slot: string; was?: string; now?: string; why: string }[];   // when ops were applied
};

type Drive = { kind: "drive"; from: RoadPointId; to: RoadPointId; minutes: number; kilometres: number; estimated: true };
type Rest  = { kind: "rest"; at: "HH:MM"; minutes: number; why: "stretch" | "after_lunch" | "need" | "meal" };
type Stop  = {
  kind: "stop"; slot: string; at: "HH:MM"; minutes: number;
  place: { placeId: string; slug: string } | { pinId: string };
  legBefore?: { how: "walk" | "drive"; minutes: number; metres: number };   // getting here from the item before, inside a town
  because:
    | { kind: "turn"; for: string; likes: string[] }
    | { kind: "paired"; for: string; with: string }
    | { kind: "need"; need: "meal" | "prayer" | "work" | "rest" }
    | { kind: "pin" }
    | { kind: "wild" };
  checks: (
    | { rule: string; verdict: "met"; restsOn: { kind: "owner" | "member" | "post"; factId?: string } }
    | { rule: string; verdict: "not_known"; reason: "no_record" | "too_old" | "not_recorded_here" }
  )[];                           // rules of the travellers at this stop; never names a traveller
  confirmed: boolean;            // false shows "Not yet confirmed"
  hasStory: boolean;
};
```

A stop never carries `verdict: "not_met"`: such a place is not offered. `unmet.detail` and `moved.why` are reason codes, never sentences; the page words them.

## Where the engine looks for places

`anchorsFor(request, region): Anchor[]` gives the spots the engine will ask `World.candidates` about, at most 12: each town on the route (its centre and `radiusMetres`), and each road point where a meal, a need or a rest may fall on a driving day (its pin and `trip.roadPointReachMetres`). The server loads the candidates for exactly these anchors before calling `planTrip`, and `planTrip` asks about no other spot. When a route would need more than 12, the towns come first and the road points nearest the meal times next.

A meal slot with no place to eat within reach becomes a `Rest` with `why: "meal"`: the time is kept and the page says Noren holds no place to eat near there. A need with no place that serves it becomes a `Rest` with `why: "need"`.

## Slots

Every stop has a slot id that stays the same through any change: `d{day}.lunch`, `d{day}.dinner`, `d{day}.open{n}`, `d{day}.need{n}`, `d{day}.pin.{pinId}`, and `d{day}.open{n}.pair` for a paired stop. `n` counts from 1 in the order of the day.

## How a place is drawn

Each slot's draw is its own: `sampleWithoutReplacement` (`src/lib/draw/sample.ts`) over the candidates in reach that pass the rules, with `drawWeight`, and the random number for a candidate is `keyedUniform(seed + "|" + slot, placeId)` (`src/lib/draw/rng.ts`). No sequence of random numbers is shared between slots, so a change in one slot cannot reshuffle another. A place already in the plan, kept, or listed in `avoid` is not offered. Slots are filled in day order. The order of turn-takers when counts tie is a fixed order rotated by a number taken from the seed.

## How a rule is checked (`src/lib/facts/rules.ts`)

A rule is checked against three kinds of record and no other (FR-341): what the place's owner confirmed, what a member reported from the region's fixed list, and what a visitor's own quoted words say. A place's category and a note in an open listing are never a record.

For a rule tag `R` at a place, with the region's `factVocabulary` (see [region-file.md](./region-file.md)):

- A record **for** `R`: a fresh fact with value `yes` whose key lists `R` in `meets`, or with value `no` whose key lists `R` in `noMeets`.
- A record **against** `R`: a fresh fact with value `yes` whose key lists `R` in `fails`, or with value `no` whose key lists `R` in `noFails`; or an owner-confirmed caution that Plan my day maps to `R` (`AVOID_RULES` in `src/lib/draw/rules.ts`: `accessibility_steps` against `step-free`).
- **Fresh** means the fact's `day` is at most `factMaxAgeDays` before the trip's start date (or today when there is none). Owner cautions do not age.
- Two fresh facts with the same key and different values disagree. Every rule that key names in any of its four lists is **not met** (FR-347).

The verdict:

1. Any record against, or a disagreement: `not_met`. The place is left out.
2. Otherwise any record for: `met`, resting on the newest such record (`member` or `post`, with its `factId`).
3. Otherwise `not_known`: `too_old` when the only records bearing on `R` are past the age limit; `not_recorded_here` when no key in the region's list names `R`; else `no_record`.

`restsOn.kind: "owner"` is kept for the day an owner can confirm a fact that meets a rule. Today owners confirm cautions only, and a caution can only leave a place out.

**Leaving out by category.** As Plan my day does, a traveller with `no-alcohol` is not offered a place whose category is `bar`. This only leaves a place out. It is never what a `met` check rests on, and it is not listed as a check (FR-341, Principle III).

**Which stops a rule applies to.** Each rule tag has a scope in `src/lib/trip/vocabulary.ts`: `food` (`halal`, `pork-free`, `vegetarian`, `vegan`, `high-chair`) or `any`. A food rule is checked, and listed in `checks`, only at a stop whose category is one of the region's `trip.foodCategories`.

**A pinned place.** A pin with a `placeId` is checked like any stop. It is never removed, because the organiser chose it; a not-met verdict is reported in `unmet` with `what: "rule"` and the slot.

**A need.** A fact whose key lists a need under `serves` (`prayer`, `work`, `rest`) and whose fresh value is `yes` makes the place one that serves the need.

**The tilt.** A candidate with at least one `met` verdict among the rules of the travellers present is drawn `FIT_TILT` times as often.

## What each change does

Every op re-runs the engine with every stop it does not bear on in `keep`. "Open stop" means a stop in an `open` slot that is not held by time.

| Op | Bears on | What happens |
|---|---|---|
| `redraw` | that slot | Another place is drawn for the slot, with the same `because`. The place it replaces joins `avoid`. |
| `skip` | that slot | The stop leaves. Nothing is drawn in its place. The place joins `avoid`. |
| `add_pin` | the pin's day | The pin is added. If the day then runs past `dayEnd`, its last open stop leaves. |
| `lighten` | that day's open stops | The day's last open stop leaves. Refused when the day has none. |
| `stay_longer` | that slot and the items after it that day | The stop is that much longer. If the day then runs past `dayEnd`, its last open stop leaves. Refused when a stop held by time would have to move. |
| `shorter_walks` | open stops on the day (every day when absent) reached by a walk over half of `walkLimitMetres` | Each is drawn again from places within that shorter walk of the item before it. When none is in reach the stop stays and `unmet` says so. |
| `quieter` | open stops on the day (every day when absent) with no record that meets `quiet` | Each is drawn again from places with a record that meets `quiet`. When none is in reach the stop stays and `unmet` says so. No place is called quiet without a record. |
| `more_for` | the next open stop on the day (or on the next day that has one) that is not already `who`'s | It becomes `who`'s turn and is drawn again on their likes. Invariant 6 does not count a turn given this way. |
| `weather` | open stops on that day whose category is not in `trip.indoorCategories` | Each is drawn again from places whose category is in that list. When none is in reach the stop stays and `unmet` says so. `rain` and `heat` do the same. |
| `move_night` | that night, the day before it and the day after | The night moves, and those two days are laid out again; stops in towns still on those days stay. |

An op that cannot be done is reported in `unmet` with `what: "change"`, and the plan comes back as it was.

The engine exports one function for this:

```ts
applyChange(request: TripRequest, plan: Plan, op: ChangeOp, world: World): { request: TripRequest; plan: Plan }
```

It takes the request and the plan as they are now and one op, and returns the plan after the op, with `moved` filled, and the request to send next time (`keep`, `avoid` and `pins` brought up to date). A refused op returns the plan given, with one more entry in `unmet`, and the request unchanged. Marking a stop done is not an op: the caller puts it in `keep` with `hold: "time"`. `planTrip` given a request that carries `ops` applies them in order through the same code.

## Invariants (each one is a test)

1. **Real places only.** Every stop's `placeId` came from `World.candidates`, or it is one of the request's pins.
2. **Hard rules.** No drawn stop is a place with a not-met verdict for any traveller who is on that day. Disagreeing records count as not met. A record older than `factMaxAgeDays` counts as not known.
3. **Driving.** No run of drives without a stop or rest is longer than `limits.stretchMinutes`. When the organiser set the daily limit and the route cannot be driven inside it, the plan has no days and `unmet` holds `what: "route"` with three choices: drop a town, add a day, raise the limit. When the daily limit is one of Noren's guesses (`guessed` holds `"dayDrive"`), the plan is made, and `unmet` names each day that is over the guess, with the same choices.
4. **Rests and needs.** A traveller with `rests` has a rest after lunch on every day they are on. Every need has its slot.
5. **Pins and kept stops.** A stop held by time keeps its place and its time through any change. A stop held by place keeps its place and may be given a new time. A kept place that is no longer among the candidates, or that now has a not-met verdict, is replaced and listed in `moved`, unless it is held by time.
6. **Turns.** Over the trip, among travellers with likes who are on the same days, turn counts differ by at most one. On a day with at least as many turn slots as such travellers, each has one.
7. **No rule is traded.** No op and no turn can put a not-met place in the plan. An op that cannot be done within invariants 2 to 5 is refused in `unmet` with choices, and the plan is unchanged.
8. **Closest plan.** After an op, every stop that the op does not bear on, and that still fits, is the same place.
9. **Same seed, same plan.** Equal inputs give equal outputs.
10. **Explained differences.** With the seed and the candidates fixed, changing one field of the party changes only stops whose `because`, `checks`, times or presence depend on that field, or whose place was taken by an earlier stop that changed for such a reason. The test names the dependency for each changed stop.
11. **Nothing ranked.** The engine reads no rating, review count, popularity or number of stories. The only weights are `drawWeight` (`src/lib/draw/weights.ts`), the turn-taker's likes, and `FIT_TILT` for a met must-have.

## What the engine does not do

It writes no words about a place, picks no quotes, talks to no model and stores nothing. The page adds names, quotes with their sources and the organiser's labels.
