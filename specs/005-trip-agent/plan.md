# Implementation Plan: Trip agent

**Branch**: `trip-agent`, to be cut from `main` when building starts | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-trip-agent/spec.md` with its five clarifications of 23 Nov 2026, constitution v3.0.0, the research in `research/10`, `11` and `12`, three read-only sweeps of the code at commit `e9f7d8c`, and the owner's direction of 23 Nov 2026: Noren is one app with one map, and Malaysia is added coverage, not a second site.

## Summary

An organiser tells Noren who is going on a trip and why, and gets a day-by-day plan for a car trip of up to seven days: drives, stops, meals, rests. Each stop says whose turn it is or which need it serves, quotes what people wrote there with the source, and lists which of the party's must-haves Noren checked, on what, and which it could not check. The plan changes when the organiser says what changed. The sample route used in tests is Kuala Lumpur, Alor Setar, George Town, Ipoh and back, five days.

Technical approach, in four parts:

1. **One map, more coverage.** Malaysia is a second region file. The map loads the places in view instead of a whole region, and a place is found by its slug wherever it is. App-wide settings stay app-wide.
2. **Code makes the plan.** A pure engine lays out the days from a road table in the region file, filters places by each traveller's hard rules, draws stops with the existing weighted draw, gives each traveller turns, and checks the result. A seed fixes the plan, so "same route, different party" can be tested. No model is in this path.
3. **The model only reads the organiser's words.** It turns them into suggestions and change requests that code checks and the organiser accepts.
4. **The party stays on the phone.** The server is sent a description with no labels for each request and stores none of it. Members report practical facts about places (steps at the door, a halal sign) from a fixed list, shown with their name and the day, and those are what a check rests on.

It ships in stages, in the order below.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 LTS.

**Primary Dependencies**: Next.js 16.4 (App Router), React 19, Convex ^1.48 with `convex-helpers`, `@clerk/nextjs` 7, MapLibre GL 6, the AI SDK (`ai` 7) through the existing `plan` capability, zod 4, Tailwind 4. No new runtime dependency, no new AI provider and no routing or mapping vendor. One build-time tool, run once on the build machine, makes the road table (research R6).

**Storage**: Convex tables (prod `careful-bee-139`, dev `brazen-gull-39`): two new, four changed ([data-model.md](./data-model.md)). The party, trips and plans in the browser's localStorage under `noren.trips.v1`. Settings in `regions/nagasaki.json` (home) and the new `regions/malaysia-west.json`.

**Testing**: Vitest (`unit` project in node, `convex` project with `convex-test` in edge-runtime), a scripted model for the interpretation step, axe for accessibility, pages checked on a phone and a desktop screen on the deployed site, and real trips as the field test.

**Target Platform**: Phone browsers first, desktop too, over HTTPS on Vercel. No app.

**Project Type**: Web application (one Next.js project with Convex).

**Performance Goals**: A first plan within 2 minutes when the questions are skipped and 10 with them (SC-301). A change answered within a minute, 19 times in 20 (SC-307); a change by button involves no model call, so it should take seconds.

**Constraints**: Nothing about a party is stored on the server or sent to an AI service as data (FR-335, FR-336). No ratings, counts of travellers' turns or ranking anywhere (Principle I). Every stop is a real place or the organiser's pin (FR-314). Driving times are estimates for an ordinary day with no live traffic, and the trip falls in the school holidays. Production Clerk keys do not work on localhost, so signed-in pages are seen first on the deployed site behind the trial flag. Production Convex redacts error messages, so the client relies on `ConvexError` codes. The Malaysian region cannot be switched on until the notice covers it.

**Scale/Scope**: About 12 towns and, to begin with, a few thousand listed places in Malaysia beside Nagasaki's 3,600. Trips of up to 7 days, 8 travellers and 12 pins. About 14 new pages or page sections.

## Constitution Check

*GATE: passed before research and re-checked after design.*

Against version 3.0.0, amended on 23 Nov 2026 for this feature. Its wording is not yet read by the owner and it is not yet committed; landing it is the first build step.

| Principle | Gate | How the design satisfies it | Pre | Post |
|---|---|---|---|---|
| I. Stories, not scores | No rating, count or ranking of a place, a person or a post. Facts from a fixed list, never counted | The engine reads no rating, popularity or number of stories (engine invariant 11). Stops are drawn, not ranked. A stop says whose turn it is; turn counts exist only inside the engine and are never shown. Facts come from `factVocabulary` and change no count or order. **One reading for the owner to confirm**: a place known to meet a must-have of someone present is drawn more often than one where it is not known (research R10) | Pass, one reading to confirm | Pass, one reading to confirm |
| II. Real data only | Everything shown as real is real; listings labelled until checked | Every stop is a place on the map or the organiser's pin (invariant 1). Malaysian listings carry "Not yet confirmed" and "Still here". A member who reports a fact is the human who confirms it. Demo accounts cannot report at real places | Pass | Pass |
| III. Humans are the source of truth | A check says what it rests on; a missing record is not known; a listing note is no check | Three verdicts, with the basis shown for "met". Disagreeing records count as not met. Listing notes are not imported at all | Pass | Pass |
| IV. Link out, don't copy | Third-party posts only under the found-post exception | A fact from a found post keeps the visitor's own words, the source and a link, passes the existing refusals, and is erased with its post. Built after the trip (research R12) | Pass | Pass |
| V. AI is an editor, on permitted text | AI reads only permitted text; AI text is labelled; nothing unsourced about a place | The model reads what the organiser types and an outline of their own plan. It reads no member's story for this feature: code picks the quotes. It writes no sentence about a place. Its suggestions are labelled as Noren's AI's and take effect only on the organiser's yes | Pass | Pass |
| VI. Original language first | Original words kept; machine translation labelled; names in every script | Quotes and reports show in the language written, with labelled translations as today. Names gain `hanzi` and `tamil`. The Malay notice is labelled as unreviewed until a Malay speaker reads it | Pass | Pass |
| VII. Region is configuration; one app, one map | Area settings in a region file; no region on before the notice covers it; no credentials or personal data in the repository | A second region file holds towns, roads, calendar, fact list and every number the engine uses. One site, one map, one sign-in. The trial list is on `person` rows, not in a file. OpenStreetMap, Overture and the road table keep their licences and credits apart | Pass | Pass |
| Privacy, consent and legal | Travellers described without name, birth date, diagnosis or reason; private; a child described by an adult; the shared page names no one's needs; the notice says where it is kept and what AI is sent | The device schema has no such fields. The server receives `t1`, `t2` and tags, and stores nothing. The shared copy holds no rule's owner. **Open**: `TODO(PDPA_POSITION)` and the notice wording must be settled before Malaysia is switched on. They block that release step, not the build | Pass, one item open | Pass, one item open |
| Development workflow | Clarify, then plan, then build; technology in the plan; trial rule; hackathon line | Five clarifications are recorded in the spec. The trip agent opens to no one until its notice wording is live (no trial: it opens in the Malaysia release). Nothing here is entered in the hackathon as work done on the day | Pass | Pass |

No unjustified violations. Two things need the owner before a release, and both are listed under "Only the owner can do".

## Project Structure

### Documentation (this feature)

```text
specs/005-trip-agent/
├── spec.md
├── plan.md              # this file
├── research.md          # 19 decisions and what to verify at build time
├── data-model.md        # tables, device storage, region file fields
├── quickstart.md        # how each stage is proven
├── contracts/
│   ├── engine.md            # the engine's input, output and invariants
│   ├── convex-functions.md
│   ├── pages-and-routes.md
│   └── region-file.md
├── checklists/requirements.md
└── tasks.md             # made by /speckit-tasks, not by this plan
```

### Source Code (repository root)

```text
regions/
├── nagasaki.json                    # home region; gains features.trip
└── malaysia-west.json               # NEW: towns, roads, calendar, fact list, trip numbers

src/lib/
├── region/{registry,schema,names}.ts    # both files load; new optional fields; home region
├── geo/geohash.ts                       # NEW: pin to cell, cells for a view
├── domain/constants.ts                  # SCRIPTS gains hanzi, tamil
├── osm/{tags,listings,categories}.ts    # names in ms, zh, ta; Malaysian category rows
├── overture/place.ts                    # the same for Overture names
├── draw/weights.ts                      # FIT_TILT
├── trip/                                # NEW: the engine and what surrounds it
│   ├── types.ts  vocabulary.ts  request.ts
│   ├── roads.ts  days.ts  slots.ts  times.ts  calendar.ts
│   ├── checks.ts  turns.ts  pick.ts  checker.ts  change.ts  engine.ts
│   ├── snapshot.ts  storage.ts          # the device side
│   └── interpret.ts                     # the model step and its checks
├── facts/rules.ts                       # NEW: which rule a fact meets or fails; age and disagreement
├── seo/{site,sitemap,llms}.ts           # every region that is on; trip under PRIVATE_SECTIONS
├── story-finder/{check,decide,mention}.ts   # Stage 5: facts from found posts; region name in the prompt
└── i18n/messages/{trip,facts,legal-documents}.ts

convex/
├── tables/{facts,trip}.ts               # NEW: placeFact, tripShare
├── tables/places.ts                     # place.mapCell + index; person.trials
├── lib/rules/mapCopies.ts               # keeps mapCell
├── places.ts                            # inCells, coverage, bySlug, backfillMapCell
├── facts.ts                             # NEW: forPlace, report, remove, hide
├── trips.ts  tripActions.ts             # NEW: the gate, candidates, plan, interpret
├── tripShare.ts                         # NEW
├── people.ts  takedown.ts               # setTrial; target type fact; place found across regions
└── *.test.ts

src/app/[lang]/
├── trip/{page,new,[id],[id]/change,[id]/party,[id]/after,shared/[code]}
├── places/[slug]/page.tsx               # bySlug; the facts section
└── privacy/ms/page.tsx                  # NEW: the notice in Malay

src/components/
├── map/place-map.tsx, public/home-container.tsx   # load by view; town markers
├── trip/*                               # NEW: questions, party cards, plan, stop card, change, shared view
└── facts/*                              # NEW: the list and the tick list

scripts/
├── build-road-table.mts                 # NEW: one-off, writes roads into the region file
└── seed-osm-candidates.ts, import-overture-places.ts   # per-town boxes

tests/
├── fixtures/{trip-parties,trip-world}.ts    # NEW: 20 parties, a fixed set of places
└── unit/trip-*.test.ts, geohash.test.ts, region-*.test.ts
```

**Structure Decision**: The existing single Next.js project with Convex. New code follows the planner's layout: pure logic under `src/lib/`, a thin gate and actions under `convex/`, pages under `src/app/[lang]/`, components beside their feature. Plan my day, walk mode and the connector are not changed.

## Stages

The stages go in this order. Stages 1 and 2 share no files and run side by side.

| Stage | What ships | Proven by |
|---|---|---|
| 0. Ground | Constitution 3.0.0 and this spec and plan landed. Both region files load. `malaysia-west.json` with towns, name languages, categories, calendar, fact list and trip numbers. The road table built. Notice and terms wording drafted in English and Malay for the owner | Region tests; the owner's read |
| 1. One map, more coverage | Places load by view; town markers when zoomed out; a place found across regions; search, sitemap and `llms.txt` cover both; names in more scripts. Malaysian towns seeded on dev, looked at, then on production | [quickstart.md](./quickstart.md) Stage 1 |
| 2. The engine | `src/lib/trip/` with the 20 test parties, five seeds each, the one-answer pairs and the change tests. No page yet | Stage 2 |
| 3. The planner | Reports on place pages. The questions, the party on the device, the plan page with reasons and "not checked", turns, draw another, pins, done and skipped. `trips.plan`, `trips.interpret`, the region switch | Stage 3 |
| 4. On the road | Changing a plan in words and by button, undo, the list of changes, the private link | Stage 4 |
| Release | One release switches Malaysia on, turns reports on and opens the trip agent to every signed-in member, with the notice and terms live (no trial; see `tasks.md`) | `validation-log.md` |
| 5. After | Facts from found posts in Malaysia. Inviting a traveller to answer for themselves. The after-trip page, the kept party and what Noren noticed. Notice wording for trips | To be planned from what the first real trips show |

If time runs short, cut in this order and say so: follow-up questions (FR-308), paired stops for a traveller who is bored by another's turn (User Story 4, scenario 2), typed changes (the buttons stay), the private link.

## Only the owner can do

1. **Read the constitution's new wording** (Principles III, IV, V and the two new privacy bullets) before it lands.
2. **The notice and terms for Malaysia, and the position on Malaysia's data protection act** (`TODO(PDPA_POSITION)`). A draft comes in Stage 0. This is on the path to the release.
3. **Confirm the reading in research R10**: a place known to meet someone's must-have is drawn more often than an unchecked one.
4. **How far to seed with Overture** (research R5), and a look at the Convex plan's usage before the seed runs, given the warning of 15 November.
5. **A Malay speaker to read the Malay notice and the fact list's wording**, if one is to hand. Otherwise they ship labelled as unreviewed.
6. **A real party to try the planner** and say what was wrong with it.
7. **Whether to collect public posts for the Malaysian towns** (Stage 5), which costs money.
8. **Fifteen minutes with Mindtrip** and a made-up mixed party, since it is the nearest thing to this and nobody has tried it for us (`research/10`).

## Risks

- **The legal wording is on the path to the release.** If it slips, Stage 3 can still be tried on the dev deployment's data, but members' stories and reports cannot go public in Malaysia until it is live.
- **Most checks will read "not checked" at first.** The corridor has almost no accessibility or halal records (`research/12`). The plan says so plainly, members' own reports are the first records, and SC-304 tests that Noren does not pretend.
- **The roads will be busy on some days.** School holidays and the days before festivals fill them. Estimates are for an ordinary day, the page says so, and each drive opens in the person's maps app. What the estimates got wrong is part of what real trips show.
- **Listings in Malaysia may be stale**, above all those from Overture. They are labelled, "Still here" confirms them, and a stop whose place is gone can be redrawn.
- **A short build.** Stages 1 and 2 are independent, the engine needs no page to be tested, and the cut order above is agreed in advance.
- **Nobody has shown that deeper questions make a party happier** (`research/11`). The record of what a party changes (SC-310) is how the owner can know.

## Complexity Tracking

No violation needs justifying. One departure from the smallest possible change is recorded for the reader:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| The map loads by view through a new `mapCell` field, instead of raising the 5,000-row cap | Malaysia's listings would pass the cap, and the owner's model is one map of everywhere | Raising the cap only postpones it, and a whole-region query has no meaning once the map is not about one region |
