# Data model: Trip agent

Decisions behind this are in [research.md](./research.md). All tables follow `convex/_generated/ai/guidelines.md`, and all writes go through the gate in `convex/lib/gate.ts`. Three places hold data: Convex tables, the organiser's device, and the region file.

## New tables

### placeFact (`convex/tables/facts.ts`)

One practical fact about one place (R11, FR-341 to FR-347).

| Field | Type | Notes |
|---|---|---|
| `placeId` | id of `place` | |
| `regionId` | string | Copied from the place, for steward lists |
| `key` | string | Must be in the region's `factVocabulary` (checked on write) |
| `value` | `"yes"` or `"no"` | |
| `basis` | `"member"` or `"post"` | An owner's caution stays a `claim` and is read beside these |
| `personId` | optional id of `person` | Set when `basis` is `"member"` |
| `sourceId` | optional id of `source` | Set when `basis` is `"post"`; the found post |
| `quote` | optional string | The visitor's own words, at most the found-post quote limit; only for `"post"` |
| `day` | string `YYYY-MM-DD` | The day it was reported or the post was written, in the region's time |
| `status` | `"live"`, `"removed"` or `"hidden"` | Removed by its writer, hidden by a steward |
| `isMock` | boolean | As everywhere |

Indexes: `by_placeId_and_status`, `by_personId_and_placeId_and_key`, `by_sourceId`, `by_regionId_and_status`.

Rules, enforced in code:
- One live report per member, place and key. Reporting again replaces the earlier one.
- A `"post"` fact is written only by the found-post attach step, and erased with its post.
- A fact never changes `place.confirmedAt`, any count or any order (FR-345).
- Deleting an account removes that person's reports.

### tripShare (`convex/tables/trip.ts`)

A plan the organiser shared by private link (R16, FR-331).

| Field | Type | Notes |
|---|---|---|
| `code` | string | 24 characters, from `newPostcardCode` |
| `ownerPersonId` | id of `person` | |
| `regionId` | string | |
| `title` | string | The organiser's words, at most 80 characters |
| `days` | array of day objects | At most 7 days and 12 items a day. Each stop holds a `placeId` or a pin label, the estimated time, minutes, the kind, the organiser's label for a turn, and the list of rules checked and not checked with no traveller named |
| `deviceTripId` | string | The trip's id on the organiser's device, so a new share replaces the old one |

Indexes: `by_code`, `by_ownerPersonId`.

Not stored: any traveller's rules as theirs, age bands, likes, the purpose, the chat, the changes.

## Changed tables

| Table | Change | Why |
|---|---|---|
| `place` | New optional `mapCell` (string, a five-character geohash of the pin), kept by `convex/lib/rules/mapCopies.ts`. New index `by_visibility_and_mapCell` | The map and the trip engine load places by where they are (R2) |
| `person` | New optional `trials` (array of strings, at most 8) | The private trial (R15) |
| `placeName` | `script` accepts `hanzi` and `tamil` as well | Names in Malaysia (R4) |
| `takedownRequest` | Target type `fact` | A person can ask for a report to be removed |

No row is added per plan, per question or per change. The planning action writes rate-limit counters and the anonymous `placeExposure` counts the draw already writes.

## On the organiser's device (`noren.trips.v1`)

Follows `src/lib/memory/storage.ts`: one localStorage key, a zod schema, each entry validated by itself, a version number, and a new key if the shape ever changes.

| Object | Fields | Caps |
|---|---|---|
| **Party** | `id`, `name` (the organiser's words), `travellers`, `limits`, `fullness`, `meals`, `needs`, `kept` | 6 kept parties |
| **Traveller** | `key` (`t1` to `t8`), `label`, `ageBand`, `rules` (tags), `likes` (tags), `skips` (tags), `rests`, `days` | 8 travellers; 8 rules, 8 likes and 4 skips each; label 40 characters |
| **Trip** | `id`, `regionId`, `start`, `end`, `days`, `startDate`, `nights`, `purpose` (the organiser's words, 280 characters), `partyId`, `pins`, `plan`, `seed`, `changes`, `status` (`planning`, `under_way`, `finished`), `shareCode` | 12 trips; 7 days; 12 pins |
| **Plan** | The engine's output ([contracts/engine.md](./contracts/engine.md)), plus `done` and `skipped` marks | |
| **Change** | `at`, `saidAs` (the organiser's words or the button pressed), `ops`, `moved` (what the engine reported) | 60 a trip, oldest dropped |

`ageBand` is one of `baby`, `toddler`, `child`, `teen`, `adult`, `older`. There is no name field, no date of birth and no free-text field about a traveller (FR-304). Rules and likes come from a vocabulary in `src/lib/trip/vocabulary.ts`, which extends `src/lib/memory/vocabulary.ts`.

What leaves the device, and when:
- **Planning or changing**: a party snapshot with no labels (`t1`, `t2`, age bands, tags, rhythm, limits), the trip's route, pins as coordinates with no label, and the seed. Nothing is stored.
- **Interpreting words**: the organiser's message and an outline of the plan. Nothing is stored.
- **Sharing**: the `tripShare` fields above, kept until the link is switched off.

## In the region file (`regions/malaysia-west.json`, and new optional fields in the schema)

| Field | Shape | Notes |
|---|---|---|
| `nameLanguages` | list of language tags | Languages a place name may be stored in. Defaults to `locales` |
| `towns` | existing shape, plus `state` and `onRoad` | `onRoad` names the town's point in `roads` |
| `roads.points` | id, name, pin, `offRoadMinutes` | A town, a junction or a rest area |
| `roads.segments` | from, to, minutes, kilometres, road name | About 15 for the corridor |
| `roads.source` | text, date, licence | How the table was built (R6) |
| `factVocabulary` | key, labels, `meets` (rule tags), `fails` (rule tags), `labelsReviewedBy` | The fixed list for reports and checks (Principle I) |
| `factMaxAgeDays` | number | 365 for Malaysia |
| `calendar` | public holidays by state, school holidays by group, fasting months, busy days; each with `source` and `verified` | R14 |
| `trip` | day start and end, meal windows, minutes at a stop by category, town speed, detour factor, walking limit, stops by fullness, starting guesses for the driving limits | Every number the engine uses, so none is in code (Principle VII) |
| `features.trip` | `"off"`, `"trial"` or `"open"` | In the home region file |

## State changes

- **Trip**: `planning` to `under_way` when the organiser marks the first stop done or the start date arrives; to `finished` when they say so or the last day passes. All on the device.
- **Stop**: `planned` to `done` or `skipped`, and back by undo.
- **placeFact**: `live` to `removed` (its writer) or `hidden` (a steward or a takedown). Neither comes back; a new report is a new row.
- **tripShare**: exists or does not. Switching the link off deletes the row.
