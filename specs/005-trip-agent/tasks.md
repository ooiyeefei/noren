---

description: "Task list for the trip agent"
---

# Tasks: Trip agent

**Input**: Design documents from `specs/005-trip-agent/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md), constitution 3.0.0

**Tests**: Included, because quickstart.md lists them stage by stage and the engine's contract says each invariant is a test. For the engine the tests come first and must fail before the code is written.

**Organization**: Grouped by user story, in the stage order from plan.md. User Story 4 is in three parts because its pieces ship at three different times: turns (first), the private link (second) and inviting a traveller (after the first real trips).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run beside the tasks around it (different files, nothing unfinished it depends on)
- **[Story]**: the user story a task serves (US1 to US6)
- **OWNER** at the start of a description: only the owner can do it
- Paths are from the repository root. Convex code follows `convex/_generated/ai/guidelines.md`; every write uses `mutation` or `internalMutation` from `convex/lib/gate.ts`; errors are `appError` codes from `convex/lib/errors.ts`, because production redacts messages

## Standing rules for every task

- On 24 November 2026 the owner said to build this end to end with agents working side by side. Work is committed on the branch `trip-agent` and its track branches. Each stage still lands through a PR merged into `main`, then a check on the live site, and nothing is switched on without the owner's word.
- No new runtime dependency, AI provider or mapping vendor (plan.md, Technical Context).
- No rating, count of turns or ranking anywhere, on screen or in a stored field (Principle I).
- Nothing about a party is stored on the server or sent to an AI service as data (FR-335, FR-336). The one thing kept is what the organiser chooses to share on the private link, with no rule tied to a traveller.
- Every page is looked at on a phone and on a desktop screen before its task is ticked.

---

## Phase 1: Setup

**Purpose**: A branch, the documents landed, a green baseline.

- [X] T001 Cut branch `trip-agent` from the latest `origin/main` as a worktree under `.worktrees/trip-agent`, and carry over the uncommitted work from the main checkout: `.specify/memory/constitution.md`, `.specify/feature.json`, `specs/005-trip-agent/` and `research/10-trip-planner-landscape.md`, `research/11-trip-agent-design.md`, `research/12-malaysia-road-trip-ground.md`. Leave `research/08`, `research/09` and `.playwright-mcp/` where they are
- [ ] T002 OWNER: read the new wording in `.specify/memory/constitution.md` (Principles III, IV, V and VII and the two new privacy bullets) and say what to change, if anything
- [ ] T003 After T002: delete the Sync Impact Report comment at the top of `.specify/memory/constitution.md`, then land the constitution, `specs/005-trip-agent/` and the three research files through a documents-only PR
- [X] T004 [P] Bring two stale lines in step with constitution 3.0.0: `SPEC.md` line 32 and the comment in `src/lib/ports/index.ts` still say "consented text only". Reword both to "permitted text only (Principle V)"
- [X] T005 [P] Record a green baseline in a new `specs/005-trip-agent/validation-log.md`: with Node 24 on the path run the four commands at the top of quickstart.md (`pnpm test`, the Convex `tsc`, the eslint line, `pnpm build`) and write down the date, the commit and the test counts
- [ ] T006 OWNER: confirm or refuse the reading in research R10: a place known to meet someone's must-have is drawn more often than an unchecked one. Write the answer under R10 in `specs/005-trip-agent/research.md`. On "no", T053 sets `FIT_TILT` to 1

---

## Phase 2: Foundational A, the ground (Stage 0)

**Purpose**: Both region files load, the Malaysian settings exist, the shared types and words exist.

**⚠️ CRITICAL**: No later phase starts before T007 to T015 are done.

- [X] T007 Extend `src/lib/region/schema.ts` as in [contracts/region-file.md](./contracts/region-file.md). New optional area fields: `enabled`, `nameLanguages`, `towns[].state`, `towns[].onRoad`, `roads` (`points`, `segments`, `source`), `factVocabulary` (`key`, `labels`, `meets`, `fails`, `noMeets`, `noFails`, `serves`, `labelsReviewedBy`), `factMaxAgeDays`, `calendar` (`publicHolidays`, `schoolHolidays`, `fasting`, `busyDays`, `weeklyRest`, each entry with `source` and `verified`) and `trip`. New app-wide fields: `features.trip` as `"off"`, `"trial"` or `"open"` with default `"off"`, and `features.facts` as a boolean with default `false`. Export a second schema, `areaRegionSchema`, for a region that is not the home region: it takes the area fields only and refuses the app-wide blocks (`locales`, `defaultLocale`, `legal`, `features`, `sharing`, `photos`, `voice`, `minimumAge`, `takedown`, `demo`, `consent`, `retention`, `collection.newAccount`). Enforce the contract's rules word for word: "`factVocabulary` keys are unique, and each has at least one of `meets`, `fails`, `noMeets`, `noFails` or `serves`"; "`trip.foodCategories` and `trip.indoorCategories` name categories the region has"; "Every `towns[].onRoad` and every `roads.segments[].from` and `to` names a point in `roads.points`"; "`roads` is connected: every point can be reached from every other"; "Calendar dates are `YYYY-MM-DD`, `from` is not after `to`, and every entry has a `source`"; "Labels exist in every one of the app's languages"; "A region with `enabled: true` has `towns`, `nameLanguages` and `categories`"; "`trip` numbers are positive and within sane bounds (a day start before its end; speeds between 10 and 80)". Tests in a new `tests/unit/region-schema.test.ts`: a road point no segment reaches is refused; a fact with none of the five lists is refused; `regions/nagasaki.json` is valid unchanged
- [X] T008 Create `regions/malaysia-west.json` with `id: "malaysia-west"`, names in English and Japanese, a `bbox` and `defaultCenter` for Kedah, Penang, Perak and the road north from Kuala Lumpur, `geo.countrycodes: ["my"]` with its attribution, `nameLanguages: ["ms", "en", "zh", "ta"]`, `nameFallback` (English reader: `latin`, `hanzi`, `tamil`; Japanese reader: `kanji`, `kana`, `latin`, `hanzi`, `tamil`), the app's `categories` and `cautionVocabulary` keys, `collection.utcOffsetHours: 8`, `towns` with `state` for each town counted in `research/12-malaysia-road-trip-ground.md` section 1.1, `factVocabulary` holding the 17 facts of the table in [contracts/region-file.md](./contracts/region-file.md), each with its `meets`, `fails`, `noMeets`, `noFails` and `serves` as the table says, labels in English and Japanese, and `labelsReviewedBy: null`, `factMaxAgeDays: 365`, `calendar` from `research/12` section 6.2 with Kedah's weekly rest as `verified: false`, the `trip` block as the contract gives it (its starting values, with `foodCategories` and `indoorCategories`), and `enabled: false`. Fill `roads` and each town's `onRoad` by hand from the four measured legs in `research/12` section 6.1, with a point for each town, Kuala Lumpur, and the junctions and rest areas between them, so the file is valid and the engine can be built on it; say in `roads.source.text` that the table is hand-measured. T009 replaces it when a routing engine has run. No account identifier, key or person's name goes in this file
- [X] T009 Create `scripts/build-road-table.mts`, a one-off run on the build machine. It reads the Geofabrik Malaysia extract from `.scratch/roads/` (never committed, never `/tmp`), runs one of the open routing engines in `research/12` section 3.2 locally, and writes into `regions/malaysia-west.json`, in place of the hand-measured table from T008: `roads.points` (each town, Kuala Lumpur as a start and end point, and the junctions and rest areas between them, each with `pin` and `offRoadMinutes`), `roads.segments` (`from`, `to`, `minutes`, `kilometres`, `road`), `roads.source` (`text`, `builtOn`, `licence: "ODbL-1.0"`) and each town's `onRoad`. The engine is not added to `dependencies` in `package.json` and nothing is served from the build machine. Compare the four legs with `research/12` section 6.1 and write the differences to `specs/005-trip-agent/validation-log.md`. If no engine installs (research "Verify at build time" item 2), fall back to those four measured legs plus hand-measured segments and say so in `roads.source.text`
- [X] T010 Change `src/lib/region/registry.ts` to load both files. The home region is `regions/nagasaki.json`, or the one `REGION_ID` names; it is parsed with `regionSchema` and every other file with `areaRegionSchema`. `getRegionConfig(id)` for a region that is not home returns its area fields laid over the home region's app-wide settings, so the roughly 91 `regionConfig(place.regionId)` call sites in `convex/` keep getting a whole config. `activeRegionConfig()` returns the home region when `REGION_ID` is unset instead of throwing. Add `homeRegionConfig()` and `enabledRegionConfigs()`: `enabled` counts as true for the home region when absent and false for any other, and a region named in the `REGIONS_PREVIEW` environment variable also counts (set on the dev deployment and in `.env.local` only, never in production). Extend `tests/unit/region-registry.test.ts`: both ids are registered; with `REGION_ID` unset the home region is Nagasaki; `malaysia-west` is not in `enabledRegionConfigs()` until enabled or previewed; every existing Nagasaki test still passes
- [X] T011 Add to `convex/lib/region.ts`: `homeRegion()`, `enabledRegionIds()`, `isFactKey(region, key)`, `tripSwitch()` (the home region's `features.trip`) and `factsOn()` (the home region's `features.facts`), with tests in `convex/region.test.ts`
- [X] T012 Add `"trip": "off"` and `"facts": false` to `features` in `regions/nagasaki.json`. Nothing else in that file changes
- [X] T013 [P] Add `hanzi` and `tamil` to `SCRIPTS` in `src/lib/domain/constants.ts` (line 17), let the `placeName.script` validator in `convex/lib/validators.ts` follow, and teach `src/lib/region/names.ts` the new scripts: a name in Han characters is `hanzi` in a region whose `nameLanguages` holds `zh` and `kanji` otherwise; a name in the Tamil block is `tamil`. Tests in a new `tests/unit/region-names.test.ts`: an English reader in Malaysia gets the Latin name first, then `hanzi`, then `tamil`; Nagasaki's order is unchanged
- [X] T014 [P] Create `src/lib/trip/types.ts` with the types of [contracts/engine.md](./contracts/engine.md) exactly as written there: `TripRequest`, `Pin`, `KeptStop`, `PartySnapshot`, `World`, `Candidate`, `ChangeOp`, `Plan`, `Drive`, `Rest`, `Stop`. A stop's `verdict` is only ever `"met"` or `"not_known"`
- [X] T015 [P] Create `src/lib/trip/vocabulary.ts`, extending `src/lib/memory/vocabulary.ts`: hard-rule tags for FR-304 (`step-free`, `short-walks`, `sit-often`, `quiet`, `toilet-near`, `high-chair`, `pork-free`, `vegetarian`, `vegan`, `halal`, `no-alcohol`), each with its scope (`food` for `high-chair`, `pork-free`, `vegetarian`, `vegan` and `halal`; `any` for the rest), the need kinds `prayer`, `work` and `rest`, like and skip tags from `TASTE_PRESETS`, the age bands `baby`, `toddler`, `child`, `teen`, `adult`, `older`, and fullness `light`, `steady`, `full`, each with English and Japanese labels. Tests in a new `tests/unit/trip-vocabulary.test.ts`: every hard-rule tag a party can choose is named by at least one of `meets`, `fails`, `noMeets` or `noFails` in `regions/malaysia-west.json`, and every need kind by at least one `serves` (FR-344), and no label names a diagnosis or a reason (FR-304)
- [X] T016 [P] Draft the notice and terms wording for the owner in a new `specs/005-trip-agent/notice-draft.md`, in English, Japanese and Malay, as three switched parts (research R17). `malaysia`: who the notice covers in Malaysia and under which law, that data is kept in Australia and sent to AI services in the United States, and a contact. `facts`: what a member's report shows (their name and the day) and the clear yes asked before a first report. `trip`: what a trip sends and keeps. Mark the Malay as machine-drafted and not yet read by a Malay speaker
- [X] T017 [P] Check two facts against primary sources and write the result under "Verify at build time" item 5 in `specs/005-trip-agent/research.md`: section 7(3) of Malaysia's Personal Data Protection Act in the official text, and Kedah's weekend. Change `verified` in `regions/malaysia-west.json` only where a primary source confirms
- [ ] T018 OWNER: read `specs/005-trip-agent/notice-draft.md`, settle the wording, and settle the position on Malaysia's data protection act. The position is then written into `.specify/memory/constitution.md` in place of `TODO(PDPA_POSITION)`, as a patch version, because the constitution says it MUST be recorded there before the Malaysian region is switched on. Also confirm or change the reading in T037 and T077 of what a member is told on the trip pages before the notice describes trips. This blocks T043 and T105, and through T043 it blocks planning a Malaysian trip on production (T104). It does not block the build

**Checkpoint (Stage 0)**: `pnpm test` is green with two region files, and the owner has the notice draft.

---

## Phase 3: Foundational B, one map with more coverage (Stage 1)

**Purpose**: The map loads what is in view, anywhere. A place is found by its slug in any region. The Malaysian towns are seeded and public.

**Blocks** every story on real data. It shares no file with the engine tasks (T045 to T060), which run beside it.

- [X] T019 [P] Create `src/lib/geo/geohash.ts`: `cellOf(pin)` gives a five-character geohash; `cellsForView(bounds)` gives the five-character cells covering a box when 32 or fewer do, otherwise the four-character cells when 16 or fewer do, otherwise `null`; `cellsAround(pin, metres)` gives the five-character cells a circle touches. Tests in a new `tests/unit/geohash.test.ts`: known pins give known cells; a box across the antimeridian does not throw; Nagasaki's opening view (the centre and zoom 12 in `regions/nagasaki.json`, at 1440 by 900 and at 390 by 844 pixels) gives cells and never `null`; every cell of a view holds every pin inside the view
- [X] T020 Add `mapCell: v.optional(v.string())` to `place` in `convex/tables/places.ts`, with the index `by_visibility_and_mapCell`. Stage the index if the deploy would block (Convex guidelines)
- [X] T021 Keep `mapCell` wherever `mapPin` is kept in `convex/lib/rules/mapCopies.ts`. Extend `convex/mapCopies.test.ts`: known pins give known cells; moving a pin changes the cell; a place with no pin has none
- [X] T022 Add the internal `places.backfillMapCell({ cursor })` to `convex/places.ts`: it fills `mapCell` in batches and schedules its own continuation. Test in `convex/places.test.ts`
- [X] T023 Add the query `places.inCells({ cells, category? })` to `convex/places.ts`: as [contracts/convex-functions.md](./contracts/convex-functions.md) says: cells of 5 characters read by equality and cells of 4 characters read as a range on `by_visibility_and_mapCell`, all of one length, "At most 32 cells, and at most `MAP_PLACE_LIMIT` (5,000) places in all". It returns the row shape `places.listForMap` returns, and a signed-in member also gets what they may read, as now. Tests in `convex/places.test.ts`: only places in those cells, for both cell lengths; never more than the cap; never a place the caller may not read; never a place of a region that is off; cells of mixed length and 33 cells are refused with an `appError` code
- [X] T024 Add the query `places.coverage({})` to `convex/places.ts`: the towns of every region that is on, each with id, names, centre and radius, and no counts. Test in `convex/places.test.ts`
- [X] T025 Add the query `places.bySlug({ slug })` to `convex/places.ts`: it tries each region that is on (`enabledRegionIds()`) on the `by_regionId_and_slug` index and returns the first match or null, with the return shape and read rules of `places.getBySlug`. `getBySlug` stays, for the connector and Plan my day. Tests in `convex/places.test.ts`: it finds a Malaysian and a Nagasaki place when both regions are on, and does not find the Malaysian place while its region is off
- [X] T026 Refuse a slug another region already uses, in `convex/lib/slug.ts` and in each caller that inserts a `place` (`convex/osmSeed.ts`, `convex/overtureSeed.ts` and the add-a-place mutation in `convex/places.ts`). Test in `convex/places.test.ts`: an importer refuses a slug the other region uses
- [X] T027 Make the map load by view in `src/components/public/home-container.tsx` (line 93 reads `places.listForMap`) and `src/components/map/place-map.tsx` (the `moveend` listener near line 390), with the cell arithmetic in `src/components/map/map-helpers.ts`. After each move, ask `api.places.inCells` for the cells `cellsForView` gives for the view (five-character cells, or four-character ones when the view is wider) and keep the places already loaded so nothing flickers. When `cellsForView` returns `null`, show one marker for each town from `api.places.coverage` and no places; pressing a marker zooms to the town. The map opens where it opens today, on `/[lang]` and `/[lang]/map` alike, and there is no "switch region" control. At Nagasaki's opening view the map shows the same places as it does today. Extend `tests/unit/home-ui.test.tsx`
- [X] T028 Use `api.places.bySlug` on the place page: `src/components/public/place-container.tsx` (line 117) and the server-side read in `src/app/[lang]/places/[slug]/page.tsx` and `src/lib/seo/place-data.ts`. The page takes its area settings from the place's own `regionId`
- [X] T029 [P] Make place search cover every region that is on: `src/app/api/geo/search/route.ts`, `src/lib/geo/search-route.ts` and `src/lib/geo/nominatim.ts` take country codes and boxes from `enabledRegionConfigs()`, and no place of a region that is off is ever in a result. Extend `tests/unit/geo-route.test.ts`
- [X] T030 [P] Make the sitemap and `llms.txt` list places from every region that is on: `src/lib/seo/listing.ts`, `src/lib/seo/llms.ts`, `src/app/sitemap.xml/route.ts`, `src/app/llms.txt/route.ts`. Tests in a new `tests/unit/seo.test.ts`: the sitemap lists a place from each region, and none from a region that is off
- [X] T031 [P] Find the place across regions in the takedown form's lookup in `convex/takedown.ts` (near line 116). Extend `convex/takedown.test.ts`
- [X] T032 [P] Take the region's name from the place's own region, not the word "Nagasaki", in the found-post check's prompt in `src/lib/story-finder/check.ts`. Extend its unit test
- [X] T033 [P] Read `name:ms`, `name:zh` and `name:ta` beside `name`, `name:en` and `name:ja`, following the region's `nameLanguages`, in `src/lib/osm/tags.ts`, `src/lib/osm/listings.ts` and `src/lib/overture/place.ts`, storing them with scripts `latin`, `hanzi` and `tamil`. Tests in a new `tests/unit/osm-tags.test.ts` and in `tests/unit/osm-listings.test.ts`
- [X] T034 Give the importers a region and a box per town: `scripts/seed-osm-candidates.ts`, `scripts/publish-osm-listings.ts` and `scripts/import-overture-places.ts` take `--region malaysia-west` and loop the region's towns (centre and `radiusMetres`) instead of one region box, with the query built in `src/lib/osm/overpass.ts`. Kuala Lumpur is skipped. The Japan-only chain tooling in `src/lib/chains/` is not run; the "not for visitors" filter still applies
- [X] T035 Check the categories on real data (research "Verify at build time" item 3): dry-run the OpenStreetMap query for Ipoh and Alor Setar and see that a kopitiam, a hawker centre, a mamak, a temple, a mosque, a clan house and a wet market land in sensible categories. Add rows to `src/lib/osm/categories.ts` and `src/lib/overture/categories.ts`, and any new category key to `regions/malaysia-west.json`. Extend `tests/unit/osm-categories.test.ts`
- [X] T036 Create `convex/regions.test.ts`: with one place in each region, Plan my day, walk mode and the collection in Nagasaki never return the Malaysian place; and while `malaysia-west` is off, `places.inCells`, `places.bySlug`, `places.coverage` and the takedown lookup never return it either (Principle VII)
- [X] T037 Add the new switches to the notice: in `src/lib/i18n/messages/legal-documents.ts` the type `NoticeSwitch` gains `malaysia`, `facts` and `trip`, with the lines the owner settled in T018. `src/components/legal/documents.ts` sets `malaysia` on when `malaysia-west` is enabled, `facts` from `features.facts`, and `trip` on only when `features.trip` is `"open"`. While it is `"trial"` the public notice does not describe trips; the trial member is told the same things on the trip pages before they first describe a traveller (T077). The owner confirms or changes this reading in T018
- [X] T038 Create `src/app/[lang]/privacy/ms/page.tsx`: the privacy notice in Malay, held as its own document in `src/lib/i18n/messages/legal-documents.ts` without making Malay an interface language. It is linked from `src/app/[lang]/privacy/page.tsx` when `malaysia` is on, and labelled as not yet reviewed until a Malay speaker has read it
- [ ] T039 OWNER: say how far to seed with Overture (research R5) and look at the Convex plan's usage first, given the warning of 15 November. Write the row budget in `specs/005-trip-agent/validation-log.md`
- [ ] T040 Seed on the dev deployment (`brazen-gull-39`, with `REGIONS_PREVIEW=malaysia-west`): run `places.backfillMapCell`, then OpenStreetMap for every town, then Overture at confidence 0.7 or more only for Sungai Petani, Kuala Kangsar, Taiping, Kuala Sepetang and Gopeng, inside the budget from T039. Write the count for each town and a look at twenty places a town in `specs/005-trip-agent/validation-log.md`
- [ ] T041 Check names in other scripts on dev (research "Verify at build time" item 4): open a place whose only name is in Chinese characters and one whose only name is in Tamil, in English and in Japanese. The place page, the share card and the search result must all render. Fix what breaks and note it in `specs/005-trip-agent/validation-log.md`
- [ ] T042 Land Stage 1 with `enabled: false` in `regions/malaysia-west.json`: PR, merge, deploy with `.scratch/deploy-prod.sh`, run `places.backfillMapCell` on production (`careful-bee-139`) and confirm the index is ready (research "Verify at build time" item 1). Nagasaki's map must look as it did
- [ ] T043 Switch Malaysia on (needs T018 with the owner's position written into the constitution and no `TODO(PDPA_POSITION)` left there, T039, and the owner's word): seed the towns on production, set `enabled: true` in `regions/malaysia-west.json`, and set a new `legal.documentsVersion` in `regions/nagasaki.json` so the `malaysia` part of the notice is live in the same release (FR-349)
- [ ] T044 Walk the six by-hand steps of quickstart.md Stage 1 on production, on a phone and a desktop screen. Update `tests/e2e/map.spec.ts` for loading by cell and run it with `--workers=2`. Write the result in `specs/005-trip-agent/validation-log.md`

**Checkpoint (Stage 1)**: one map shows Japan and Malaysia; every Malaysian place says "Not yet confirmed".

---

## Phase 4: User Story 1, say who is going and why, and get a plan that fits (Priority: P1) 🎯 MVP

**Goal**: An organiser gives a route and days, describes the party, and gets a day-by-day plan with drives, stops, meals and rests that holds to the party's hard rules and driving limits.

**Independent Test**: Enter Kuala Lumpur, Alor Setar, Penang, Ipoh, Kuala Lumpur for two made-up parties, one with a grandparent who avoids stairs and a child who naps, one of four adults. The two plans differ, and each difference is explained.

### Engine tests for User Story 1 (write first; they must fail)

- [X] T045 [P] [US1] Create `tests/fixtures/trip-world.ts`: the trip settings and road table read from `regions/malaysia-west.json`, and about 300 made-up places spread over the towns, with categories, a mix of `hasStory` and `confirmed`, owner cautions, and facts that cover every case: `steps_at_door` yes, `level_entrance` yes, `halal_sign` yes, two reports that disagree, and a report 14 months old. Export `world(seed)` returning a `World` with that `seed`
- [X] T046 [P] [US1] Create `tests/fixtures/trip-parties.ts`: 20 parties on the sample route and test dates (Kuala Lumpur, Alor Setar, George Town, Ipoh and back; Sunday 13 to Thursday 17 December 2026: five days and four nights). They include a party of one; two adults; four adults; a grandparent who needs step-free with a child who rests after lunch; a halal family; a vegetarian; a wheelchair user; a toddler and a teen; a party of eight; a party with no likes at all; a party whose only rule no record can check; a traveller who joins on day 3; and a party that sets no limits
- [X] T047 [P] [US1] Create `tests/fixtures/trip-check.ts`, a checker written apart from the engine's own, and `tests/unit/trip-invariants.test.ts`: plan each of the 20 parties with five seeds and assert invariants 1 to 5, 9 and 11 of [contracts/engine.md](./contracts/engine.md) on all 100 plans (SC-302). One fault is a failure. Invariant 1 is FR-314. For invariant 11, a rating or story-count field added to a candidate changes nothing
- [X] T048 [P] [US1] Create `tests/unit/trip-route.test.ts`: Kuala Lumpur to Alor Setar on day 1 with a five-hour daily limit the organiser set comes back with no days and `unmet` holding `what: "route"` with three choices (drop a town, add a day, raise the limit); the same route with no limits set gets the region's guesses, `guessed` names them, the plan is made, and `unmet` names day 1 as over the guess with the same choices (invariant 3); a round trip with `via` towns and no nights has its nights chosen among them; a drive longer than the stretch limit is split with rests; a day that is mostly driving carries the note `mostly_driving`
- [X] T049 [P] [US1] Create `tests/unit/trip-pairs.test.ts` with the seed held fixed (SC-303, SC-304, invariant 10). At least eight pairs that differ in one answer: add a traveller who needs step-free; add a toddler who rests after lunch; halve the longest drive; lower the daily driving limit; change `light` to `full`; add `halal`; move lunch by an hour; add a prayer time. For each, every changed stop has one of the dependencies invariant 10 allows, and the test names which. One more pair: a party with a rule no record can check gets the same stops as one without it, and every stop lists that rule as not checked

### The engine for User Story 1

- [X] T050 [P] [US1] Create `src/lib/trip/request.ts`: zod schemas for `TripRequest` and `PartySnapshot` with the sizes "7 days, 8 travellers, 12 pins, 20 ops" and "8 rules, 8 likes and 4 skips each"; every tag must be in `src/lib/trip/vocabulary.ts`; traveller keys are `t1` to `t8`. Where the party set no limit, meal time or fullness, fill it from the region's `trip.guesses` and name it in `guessed` (FR-305)
- [X] T051 [P] [US1] Create `src/lib/trip/roads.ts`: the quickest path between two road points over `roads.segments`, in minutes and kilometres, and the estimate for a stop off the road (`offRoadMinutes`, or straight-line distance times `detourFactor` at `townSpeedKmh`). No network call
- [X] T052 [P] [US1] Create `src/lib/trip/calendar.ts`: for a date and a state, what the region's `calendar` holds (public holiday, school holiday, fasting month, weekly rest day, busy travel day), each with its `verified` flag
- [X] T053 [P] [US1] Add `FIT_TILT = 3` beside `TASTE_TILT` in `src/lib/draw/weights.ts` (or 1 if the owner refused it in T006), and let `drawWeight` multiply by it when the context says a must-have of someone present is known to be met. Extend `tests/unit/draw.test.ts`. Plan my day's weights do not change
- [X] T054 [P] [US1] Create `src/lib/facts/rules.ts`: from a place's facts and owner cautions, the verdict for one rule tag, following "How a rule is checked" in [contracts/engine.md](./contracts/engine.md) step by step: `met` with what it rests on (`owner`, `member` or `post`, never the place's category), `not_met`, or `not_known` with a reason (`no_record`, `too_old`, `not_recorded_here`). Records that disagree give `not_met`. A member's report or a post older than `factMaxAgeDays` gives `not_known`. Leaving a bar out for `no-alcohol` by its category is a separate function that only leaves a place out. Also export which needs a place serves. Tests in a new `tests/unit/trip-checks.test.ts` (FR-341 to FR-348, SC-312): a member's "steps at the door" removes the place for a step-free traveller; two reports that disagree remove it; a 14-month-old report makes it not known; a "no" on `halal_sign` fails `halal` and says nothing about `pork-free`; the function has no input for a listing's note or a rating; no `met` rests on a category; every `met` names what it rests on
- [X] T055 [US1] Create `src/lib/trip/checks.ts`: for a candidate and the travellers present, the verdict for each of their rules, using `src/lib/facts/rules.ts`. It drops a candidate with any `not_met` and returns the `checks` list for a stop, which never names a traveller. A missing record is `not_known`, never a pass or a fail (FR-315)
- [X] T056 [US1] Create `src/lib/trip/days.ts`: lay out the days from the nights and the road table, through as many towns as the route has (FR-339), choosing the nights among the `via` towns when none are given. Split any drive longer than `limits.stretchMinutes` with rests at road points. When the route cannot be driven within `limits.dayDriveMinutes`: if the organiser set that limit, return no days and `unmet` with `what: "route"` and the three choices; if it is one of Noren's guesses, lay the days out and name each day over the guess in `unmet` with the same choices (FR-317, invariant 3)
- [X] T057 [US1] Create `src/lib/trip/slots.ts`: give each day its slots: lunch and dinner at the party's meal times, a rest after lunch for each traveller who has one, each need (prayer, work, rest) at its time, each pin at its place and time, every slot with the id the contract gives it (`d2.lunch`, `d2.open1`), and as many open slots as the region's `trip.turnsPerDay` allows for the party's fullness. In this story an open slot is a wild card; turns arrive in T088
- [X] T058 [US1] Create `src/lib/trip/times.ts`: clock times for every item from `dayStart`, the drives, `minutesAtStop` by category and getting between stops in a town (`orderAsWalk` and `walkingLeg` from `src/lib/draw/route.ts`): a walk when the distance times `detourFactor` is at most `walkLimitMetres`, a drive at `townSpeedKmh` otherwise, recorded as the stop's `legBefore`. A day that would run past `dayEnd` loses its last open slot
- [X] T059 [US1] Create `src/lib/trip/pick.ts`: for a slot, take the candidates within reach of its anchor, drop those `src/lib/trip/checks.ts` drops, leave out places already in the plan, kept or in `avoid`, and draw one with `sampleWithoutReplacement` (`src/lib/draw/sample.ts`), `drawWeight`, and `keyedUniform(seed + "|" + slot, placeId)` from `src/lib/draw/rng.ts` as the random number for each candidate, so no slot's draw depends on another's. `drawStops` is not used: its shared sequence would reshuffle every later stop. A meal slot draws from the region's `trip.foodCategories`. A need draws a place whose facts serve it when one is in reach, and otherwise becomes a `Rest` with `why: "need"`. It reads no rating, review count, popularity or number of stories, and nothing is ranked (FR-318)
- [X] T060 [US1] Create `src/lib/trip/checker.ts` (it reports every fault against invariants 1 to 5 in a finished plan) and `src/lib/trip/engine.ts` with `planTrip(request, world): Plan` and `anchorsFor(request, region)` (at most 12 anchors, as the contract says): validate, lay out, fill, time, check; redraw a faulty slot a bounded number of times, then report it in `unmet`. A kept stop held by time keeps its place and time; one held by place keeps its place and may be re-timed; a kept place that is gone or now not met is replaced and listed in `moved` (invariant 5). A pin with a `placeId` is checked and a not-met verdict is reported in `unmet`, never dropped. Add the notes `mostly_driving`, `busy_travel_day` and `no_stories_in_town`. Export from a new `src/lib/trip/index.ts`. T047, T048 and T049 now pass

**Checkpoint (engine, part 1)**: 100 plans without a fault, with no page and no server.

### The device, the server and the pages for User Story 1

- [X] T061 [P] [US1] Create `src/lib/trip/storage.ts` on the pattern of `src/lib/memory/storage.ts`: one localStorage key, `noren.trips.v1`, a zod schema, each entry validated by itself, a store for `useSyncExternalStore`. Caps as in data-model.md: "6 kept parties"; "8 travellers; 8 rules, 8 likes and 4 skips each; label 40 characters"; "12 trips; 7 days; 12 pins"; purpose "280 characters"; changes "60 a trip, oldest dropped". `ageBand` is one of `baby`, `toddler`, `child`, `teen`, `adult`, `older`; a trip's `status` is `planning`, `under_way` or `finished`. Tests in a new `tests/unit/trip-storage.test.ts`: a bad entry is dropped by itself; the caps hold; the schema has no field for a name, a birth date or free text about a traveller
- [X] T062 [P] [US1] Create `src/lib/trip/snapshot.ts`: turn a stored party and trip into a `TripRequest` with no labels (travellers as `t1` to `t8`, age bands, tags, rhythm, limits; pins as coordinates), and map `t1` back to the organiser's label for the page. Tests in a new `tests/unit/trip-snapshot.test.ts`: no label, purpose or pin label is in the request
- [X] T063 [US1] Add `trials: v.optional(v.array(v.string()))` to `person` in `convex/tables/places.ts` ("array of strings, at most 8"), and the internal `people.setTrial({ clerkUserId, trial, on })` in `convex/people.ts`, which writes an audit entry through `convex/lib/audit.ts`. Let `people.current` also return `trip: boolean`, true when the caller can open trips. Tests in `convex/people.test.ts`
- [X] T064 [US1] Create `convex/trips.ts` with the gate every trip function uses, in the planner's order (`convex/planner.ts`): the switch, then sign-in, then the trial, then the limits. Everything answers "not found" when `features.trip` is `"off"`, and when it is `"trial"` and the caller's `trials` does not hold `"trip"`. Add the internal query `trips.candidates({ regionId, anchors })`: "At most 12 anchors and 400 places an anchor"; for each anchor the public places in the cells that cover it (`by_visibility_and_mapCell`), with category, pin, `confirmedAt`, `hasStory`, recent exposure, and published cautions when they may be shown. `facts` is an empty list until T097
- [X] T065 [US1] Create `convex/lib/tripStops.ts` (the public details of a list of places: names, category, pin, whether confirmed; null for a place that is no longer public) and `convex/tripActions.ts` with the action `trips.plan({ request })`: validate with `src/lib/trip/request.ts`, pass the gate with the limits "30 a minute and 300 a day a person", load the region's settings, read the candidates for the anchors `anchorsFor` gives, run `planTrip` with a random seed or the one given, and return the `Plan`, the seed and each stop's details. It calls no model and writes nothing but its rate-limit counters: a trip's draw does not add to `placeExposure`, so it changes nothing anyone else is shown (FR-334). The party snapshot is never written to a log or put in an error message
- [X] T066 [US1] Create `convex/trips.test.ts`: off means not found for everyone; trial means not found for a member without the flag and works for one with it; a signed-out caller learns nothing; after `trips.plan` the only new rows are rate-limit counters, and no `placeExposure` row changed
- [X] T067 [US1] Create `src/lib/i18n/messages/trip.ts` with `defineMessages` in Japanese and English for every trip page of this story: the questions, the traveller card, the read-back, the plan, the drives, the rests, the guesses line, the "Noren knows nothing about your party yet" line, the choices when a route cannot be driven, and the line saying trips are kept on this phone. Later tasks add their own keys to this file
- [X] T068 [US1] Open the door: add `trip` to `PRIVATE_SECTIONS` in `src/lib/seo/site.ts`; add `trip` to `FeatureLinks` in `src/components/layout/features.tsx`, fed from `people.current`; show "Plan a trip" in `src/components/layout/account-menu.tsx` only to people who can open it. Create `src/lib/convex/trip-gate.ts`, a server-only helper beside `src/lib/convex/server.ts` (which already reads `people.current` with the caller's token). Every trip page calls it before anything streams, as `src/app/[lang]/plan/page.tsx` does for the planner, so the answer is a real 404 while the switch is `"off"`, and while it is `"trial"` for anyone not on the trial, signed out or not. When the switch is `"open"` a signed-out visitor is sent to sign in and back
- [X] T069 [US1] Create `src/components/trip/use-trips.ts` (a hook over the store, as `src/components/memory/use-memory.ts` is) and the list page `src/app/[lang]/trip/page.tsx` with `src/components/trip/trips-view.tsx`: trips under way first, then planned, then finished; "Plan a trip"; a line saying trips are kept on this phone; the state for no trips yet
- [X] T070 [US1] Create `src/app/[lang]/trip/new/page.tsx` with `src/components/trip/new-trip-container.tsx`, `route-step.tsx` and `purpose-step.tsx`: where from and to, how many days and when, where you sleep each night, then what the trip is for, what would make it good and what would spoil it, kept in the organiser's own words (FR-301, FR-302). Every answer is saved to the device as it is given, so stopping and coming back loses nothing. Every step can be skipped and "Plan now" is on every step (FR-306)
- [X] T071 [US1] Create `src/components/trip/traveller-card.tsx` and `party-step.tsx`: one card for each traveller with a label the organiser chooses, an age band, needs from the tick list in `src/lib/trip/vocabulary.ts`, likes, skips and an afternoon rest (FR-303, FR-304). Hard rules and likes are separate lists on the card (FR-312). No field asks for a legal name, a date of birth, a diagnosis or a reason
- [X] T072 [US1] Create `src/components/trip/travel-step.tsx` and `rules-readback.tsx`: the longest drive without a stop, the most driving in a day, how full a day should be, meal times, and times kept for prayers, rest or work (FR-305), then one plain screen that reads the party's hard rules back for the organiser to confirm or correct before the first plan (FR-310)
- [X] T073 [US1] Create the plan page `src/app/[lang]/trip/[id]/page.tsx` with `src/components/trip/plan-container.tsx`, `plan-view.tsx`, `day-view.tsx`, `drive-row.tsx` and `unmet-banner.tsx`. It sends the snapshot to `api.tripActions.plan`, stores the plan and the seed on the device, and shows each day: weekday and date, each drive with its estimated time and distance and "Open in maps" (`src/lib/geo/maps-link.ts`, FR-326), the stops in order with an estimated time at each, meals, rests, spare time and the day's total driving (FR-313). Times are labelled as estimates for an ordinary day (FR-322). At the top: what could not be met, with the choices; which settings are Noren's guesses, with a way to change them; and, when no party was described, a line saying so. A stop shows its name, category and "Not yet confirmed" where it applies; the full stop card comes in T082. Opening a trip's address on another device shows "This trip is kept on the phone it was planned on"
- [X] T074 [US1] Create `src/app/[lang]/trip/[id]/party/page.tsx` with `src/components/trip/party-container.tsx`: everything Noren holds about the trip and the party in one place, to change or delete, including deleting the whole trip (FR-311)
- [X] T075 [P] [US1] Create `src/lib/trip/interpret.ts`: the prompt and the zod schema for the model's answer, and the checks code makes on it. The model is sent the organiser's messages ("at most 8 turns of 700 characters"), the outline (day, slot, place name, kind) and the vocabulary, and never the party snapshot. Code drops any proposal whose `saidAs` is not in the latest message or whose tag is not in the vocabulary, as `checkProposals` does in `src/lib/planner/resolve.ts`. A typed health detail yields only the practical rule, never the condition. Proposals are capped at 6. Tests in a new `tests/unit/trip-interpret.test.ts` with the scripted model from `tests/fixtures/planner.ts`: the request holds the message, the outline and the vocabulary and no party snapshot; a suggestion whose quoted words are not in the message is dropped; a model failure gives `state: "plain"` with empty lists
- [X] T076 [US1] Add the action `trips.interpret({ messages, outline, language })` to `convex/tripActions.ts`, using the existing `plan` capability (`AI_MODEL_PLAN` in `src/lib/ai/config.ts`) and `src/lib/trip/interpret.ts`. Limits: "5 a minute and 40 a day a person". When `AI_MODEL_PLAN` is unset it answers `conflict` and spends no slot. It stores nothing. Extend `convex/trips.test.ts`
- [X] T077 [US1] Create `src/components/trip/own-words-box.tsx` and put it on the questions: a box to type or say it in your own words (the existing voice input in `src/components/voice/`), with each thing Noren took from it shown as a suggestion beside the words it rests on, labelled as Noren's AI's, and kept only on yes (FR-309). `about` ("my mum") is matched to a traveller on the device, and Noren asks when it cannot match. Purpose words may yield suggested settings the same way (FR-302). Before the organiser first describes a traveller, by ticking or typing, tell them once where the description is kept (on this phone), what is sent to Noren's servers (a party with no labels, to make the plan, and not stored) and what is sent to an AI service (only what they type or say in the box, never the party) (FR-336, and the constitution's privacy bullet during the trial). When the AI step fails, a plain line says typing is not being read just now and the buttons still work
- [X] T078 [US1] Add up to three follow-up questions about concrete cases (FR-308): a fixed list of questions with ids in `src/lib/trip/vocabulary.ts` and their wording, written by people, in `src/lib/i18n/messages/trip.ts`; `questions` ("at most 3") in `src/lib/trip/interpret.ts`, where the model only names which ids are worth asking and what a yes and a no would set, and code drops an id that is not on the list; shown in `src/components/trip/new-trip-container.tsx`. No sentence written by the model is shown (Principle V). Every question must be one whose answer can change the plan (FR-307). **First to cut if time is short**
- [X] T079 [US1] Create `tests/unit/trip-ui.test.tsx` with axe, on the pattern of `tests/unit/planner-ui.test.tsx`: the questions can all be skipped; a plan from a route alone says it knows nothing about the party; a route that cannot be driven shows its choices before any plan; guesses are named as guesses; no accessibility fault on the list, the questions, the plan and the party page

**Checkpoint (US1)**: a route and a party give a plan that holds to the rules and limits, behind the region switch.

---

## Phase 5: User Story 2, see why each stop is there, for whom, and what Noren could not check (Priority: P1)

**Goal**: Under each stop: whose it is or which need it serves, what people wrote there with the source, what Noren checked and on what, what it could not check, and "Draw another".

**Independent Test**: Open any plan and check every stop for the three parts: who it is for, what people wrote, what was and was not checked.

- [X] T080 [US2] Extend `convex/lib/tripStops.ts`: for each stop, up to two quotes with their sources (members' stories first, then found posts, as on the place page; `QUOTES_PER_STOP` in `src/lib/planner/resolve.ts`), chosen by code with the seeded draw and never by a model or by merit, and for each `met` check the public details of what it rests on. Add the query `trips.stops({ placeIds })` to `convex/trips.ts` behind the gate, "at most 84 places", so an open plan reads its quotes afresh and a removed story leaves at once. Quotes are never written to the device. Extend `convex/trips.test.ts`: a hidden story's quote is not returned; a place no longer public comes back null
- [X] T081 [US2] Create `tests/unit/trip-change.test.ts` and `src/lib/trip/change.ts` with the first three ops, applied by re-running the engine with every other stop in `keep`: `redraw` (another place for the same slot and the same turn; the place it replaces joins `avoid`; the rest of the day keeps its stops, held by place, with new times), `skip` (the stop leaves, its place joins `avoid`, and the day is re-timed) and `add_pin`, as the table "What each change does" in [contracts/engine.md](./contracts/engine.md) says. Tests: after `redraw` only that stop differs; stops held by time (done stops and pins with a time) never move (invariant 5); an op naming a slot that does not exist is refused and the plan is unchanged
- [X] T082 [US2] Create `src/components/trip/stop-card.tsx` and use it in `src/components/trip/day-view.tsx`. Each stop shows one of: a need (meal, rest, prayers, time to work), a pin, or "Wild card — not picked for you" in Plan my day's wording (FR-319); up to two quotes with who wrote them or where they came from and a link to the place's page, or "Nobody has written here yet" with an invitation to tell the first story; the rules checked, each with what it rests on (the owner's word, a member's report with their name and the date, a visitor's own words with the source); the rules not checked, each with the plain reason; and "hours not known, check before you go" unless Noren holds the hours with a source (FR-316, FR-322, FR-323). When offline the card says quotes need a connection. Add the keys to `src/lib/i18n/messages/trip.ts`
- [X] T083 [US2] Add the stop's buttons to `src/components/trip/stop-card.tsx` and `plan-container.tsx`: "Draw another" (`redraw`), "Skip" (the `skip` op: the stop leaves the plan and the day is re-timed, and the device keeps a note that it was skipped, for the record after the trip) and "Done" (the stop is held by time from then on) (FR-324, FR-328). Each of these is written to the trip's list of changes on the device from now on, not only once T109 is built. Add "Add a stop from the map" and "Pin a place or a time" to `src/components/trip/plan-view.tsx`: a pin holds a place from the map (sent with its `placeId`, so its rules are checked), or a spot and a label that stay on the device and never become a place on Noren. A trip moves from `planning` to `under_way` when its first stop is marked done or its start date arrives
- [X] T084 [US2] Show the calendar in `src/components/trip/day-view.tsx`: beside the weekday, what the region's calendar holds for the day, with "not confirmed" on unverified entries; on a busy travel day, a line saying the driving times are for an ordinary day and this is not one. In `src/components/trip/plan-view.tsx`, when almost no rule could be checked, say so once at the top and still list the unchecked rules under each stop
- [X] T085 [US2] Extend `tests/unit/trip-ui.test.tsx` (SC-305, SC-312): every stop in a test plan says whom or what it is for; every sentence about a place is a quote with its source or a fact from Noren's records; every check names what it rests on; a rule with no record reads as not checked and never as passed; "Draw another" changes one stop

**Checkpoint (US2)**: every stop can be questioned.

---

## Phase 6: User Story 4, part 1: everyone gets a turn (Priority: P2)

**Goal**: Each traveller with likes gets stops chosen for them, spread evenly, and the plan says whose each one is. No hard rule is traded for a turn.

**Independent Test**: Plan for three travellers with different likes. Each has a stop marked as theirs on each full day.

- [X] T086 [P] [US4] Create `tests/unit/trip-turns.test.ts` (write first): over the 20 parties and five seeds, turn counts among travellers with likes who are on the same days differ by at most one (invariant 6, SC-306); on a day with at least as many open slots as such travellers each has one, and otherwise those left out go first the next day; a traveller with no likes takes no turn; a traveller who joins on day 3 has rules and turns only on their days; no turn puts a not-met place in a plan (invariant 7). Add at least four pairs to `tests/unit/trip-pairs.test.ts`, making twelve or more in all: add a like; swap two travellers' likes; put a traveller on days 1 and 2 only; add a skip
- [X] T087 [US4] Create `src/lib/trip/turns.ts`: a count of turns for each traveller for the trip; each open slot goes to the traveller present with the fewest so far, ties broken by a fixed order rotated by the seed (research R13, FR-320). The counts never leave the engine
- [X] T088 [US4] Wire turns in: `src/lib/trip/slots.ts` hands each open slot to `turns.ts`; `src/lib/trip/pick.ts` tilts that slot's draw toward the turn-taker's likes and away from their skips, and the stop carries `because: { kind: "turn", for, likes }`; a slot nobody takes stays a wild card; `src/lib/trip/checker.ts` gains invariant 6; `src/lib/trip/engine.ts` reports `unmet` with `what: "turn"` when a traveller goes a full day without one though the day had room. T086 now passes and T047 still does
- [X] T089 [US4] Show turns on the page: `src/components/trip/stop-card.tsx` says "For {label}" in the organiser's own label, mapped from `t1` on the device, with the likes it was chosen on. `src/components/trip/day-view.tsx` says in words when a traveller has gone a whole day without a turn and offers to change it. `src/components/trip/traveller-card.tsx` lets the organiser say which days each traveller is on (FR-325). Extend `tests/unit/trip-ui.test.tsx`: no count, score or ranking of travellers or turns appears anywhere (FR-321)
- [X] T090 [US4] Add paired stops (User Story 4, scenario 2): when the turn-taker's like is another traveller's skip, `src/lib/trip/pick.ts` looks for a place for that other traveller within `walkLimitMetres` and adds it with `because: { kind: "paired", for, with }`; `src/components/trip/stop-card.tsx` words it. Test in `tests/unit/trip-turns.test.ts`. **Second to cut if time is short**

**Checkpoint (engine, part 2)**: the engine is complete but for the changes in Phase 9.

---

## Phase 7: User Story 5, plan a part of the country Noren barely knows (Priority: P2)

**Goal**: Noren says when a town has no stories, plans with labelled listings, and lets the party be the first to report what they found. Their reports are what the next plan's checks rest on.

**Independent Test**: Make a plan through a town with listings and no stories. Check the labels. Tick what you found at one stop and see it on the place's page and in the next plan's checks.

- [X] T091 [US5] Create `convex/tables/facts.ts` with `placeFact` exactly as in data-model.md and spread it into `convex/schema.ts`: `placeId`; `regionId`; `key` ("Must be in the region's `factVocabulary` (checked on write)"); `value` `"yes"` or `"no"`; `basis` `"member"` or `"post"`; optional `personId` ("Set when `basis` is `"member"`"); optional `sourceId` ("Set when `basis` is `"post"`; the found post"); optional `quote` ("at most the found-post quote limit; only for `"post"`"); `day` as `YYYY-MM-DD` in the region's time; `status` `"live"`, `"removed"` or `"hidden"`; `isMock`. Indexes: `by_placeId_and_status`, `by_personId_and_placeId_and_key`, `by_sourceId`, `by_regionId_and_status`
- [X] T092 [US5] Create `convex/facts.ts`. `facts.forPlace({ placeId })`: live facts for a place the caller can read, "at most 60", with key, value, basis, day, the reporter's display name or the post's source and quote, and whether the record is older than the region's limit; a hidden or removed fact is not returned. `facts.report({ placeId, key, value })`: signed in; refused when `features.facts` is off, the key is not in the region's list, the place is not readable, a real account reports at a demo place or a demo account at a real place, or the daily limit of 30 is reached (`limitContribution` in `convex/lib/rateLimit.ts`); it replaces the caller's earlier report of the same key at that place and writes an audit entry. `facts.remove({ factId })`: the writer removes their own. `facts.hide({ factId, reason })`: a steward, with an audit entry. A fact never changes `place.confirmedAt`, any count or any order (FR-345)
- [X] T093 [US5] Create `convex/facts.test.ts`: a key outside the list is refused; a second report replaces the first; the writer can remove theirs and a steward can hide any; a hidden fact is not returned; a demo account cannot report at a real place, nor a real account at a demo place; nothing about a report changes a count or an order
- [X] T094 [P] [US5] Add `fact` to `TAKEDOWN_TARGET_TYPES` in `src/lib/domain/constants.ts` (line 111) and let a takedown with that target call the path `facts.hide` uses, in `convex/takedown.ts`. Extend `convex/takedown.test.ts`
- [X] T095 [US5] Remove a person's reports when their account is deleted, in the deletion path in `convex/people.ts` (`deletePerson` and `continueDeletion`). Extend `convex/people.test.ts`
- [X] T096 [US5] Show a takedown request about a fact in the stewards' takedowns queue, in `src/components/steward/takedowns-logic.ts` and `src/components/steward/takedowns-view.tsx`: the fact's wording, yes or no, the place and the reporter's display name, with a "Hide" that calls `facts.hide`. Extend the steward page's unit test
- [X] T097 [US5] Fill `facts` in `trips.candidates` in `convex/trips.ts` with each candidate's live facts (key, value, basis, day, `factId`). Extend `convex/trips.test.ts`: a member's "steps at the door" keeps that place out of a plan for a step-free traveller, and a member's "level way in" shows as a met check resting on a member's report
- [X] T098 [P] [US5] Create `src/lib/i18n/messages/facts.ts` in Japanese and English, and the components `src/components/facts/fact-list.tsx` (each fact with who reported it and the day, or the visitor's words with a link to their post; a record over the age limit marked as old; records that disagree shown side by side with their dates, FR-347; a steward also sees "Hide" beside each fact) and `src/components/facts/fact-tick-list.tsx` (the region's fixed list as ticks for yes and no, with the clear yes asked before a first report)
- [X] T099 [US5] Add the section "What people found here" to the place page, between the About panel and the stories, in `src/components/public/place-view.tsx` and `src/components/public/place-container.tsx`: the fact list for everyone, and "Tell us what you found" for a signed-in member. The section is absent while `features.facts` is off or the place's region has no `factVocabulary`. Extend the place page's unit test with axe
- [X] T100 [US5] On `src/components/trip/stop-card.tsx`: "Tell us what you found" opens the tick list for that place; a stop from an unconfirmed listing carries "Not yet confirmed" and the "Still here" button from `src/components/place/place-check.tsx`
- [X] T101 [US5] In `src/components/trip/plan-view.tsx`, for a town with the note `no_stories_in_town`, say in one line that nobody has written about this town on Noren yet and that its stops come from open listings (FR-340). On the stop card, link "Tell the first story" to the place's add-story form; once a traveller with an account has shared a story there, the stop shows it as told by them, through the quotes `trips.stops` returns
- [X] T102 [US5] Extend `tests/unit/trip-ui.test.tsx`: a town with no stories is named once at the top; an unconfirmed stop shows its label and "Still here"; a reported fact appears in the stop's checks with the reporter's name and the day

**Checkpoint (US5)**: a party can plan through towns nobody has written about and leave the first records.

---

## Phase 8: Stage 3 release

- [ ] T103 Not needed: no trial (owner, 24 November 2026). Noren is already public, so the trip agent has no private trial; see the changes at the end
- [ ] T104 Run every automated check in quickstart.md Stages 2 and 3, then land Stage 3 through a PR for the one release that switches Malaysia on, turns reports on (T105) and opens the trip agent to every signed-in member (`"trip": "open"` in `regions/nagasaki.json`, with the new `legal.documentsVersion`), and deploy with `.scratch/deploy-prod.sh`. No trial stage: `"trial"` stays in the code as a switch value, unused
- [ ] T105 Turn reports on (needs T018 and the owner's word): `"facts": true` in `regions/nagasaki.json` with a new `legal.documentsVersion`, so the `facts` part of the notice is live in the same release
- [ ] T106 Walk the seven by-hand steps of quickstart.md Stage 3 on production in that release, on a phone and a desktop screen, and time a first plan with and without the questions (SC-301: 10 minutes and 2 minutes). Write the result in `specs/005-trip-agent/validation-log.md`

**Checkpoint (Stage 3)**: a signed-in member plans a trip for a real party with the party's details.

---

## Phase 9: User Story 3, change the plan by saying what changed (Priority: P2)

**Goal**: The organiser says or taps what changed. Noren changes what has to change, keeps what is done and pinned, shows what moved, and can undo.

**Independent Test**: Take a four-day plan, mark two stops of day 2 as done, say "we're tired", and check what changed and what stayed.

- [X] T107 [US3] Extend `tests/unit/trip-change.test.ts` (write first; invariants 5, 7 and 8, SC-307): after `lighten` on day 2 with two stops done, the done stops and every pin are untouched, day 2 has fewer stops, and every later day is identical; `quieter`, `shorter_walks`, `more_for`, `stay_longer`, `move_night` and `weather` each do what the table "What each change does" in [contracts/engine.md](./contracts/engine.md) says and change only what they bear on, and every other stop that still fits is the same place; an op that would break a hard rule, a driving limit or a rest is refused in `unmet` with choices and the plan is unchanged (FR-329); no op loosens a hard rule; `moved` lists every stop that changed with its reason
- [X] T108 [US3] Finish `src/lib/trip/change.ts` with the remaining ops of [contracts/engine.md](./contracts/engine.md): `lighten`, `quieter`, `shorter_walks`, `more_for`, `stay_longer`, `move_night`, `weather`. Each re-runs the engine with every stop the op does not bear on in `keep`, then fills `moved` (FR-327). A request holds "20 ops" at most. T107 now passes
- [X] T109 [US3] Keep the changes on the device in `src/lib/trip/storage.ts`: each change with `at`, `saidAs` (the organiser's words or the button pressed), `ops` and `moved`, "60 a trip, oldest dropped" (FR-330), and the plan before the last change, so undo restores it exactly (FR-328). Extend `tests/unit/trip-storage.test.ts`
- [X] T110 [US3] Create `src/app/[lang]/trip/[id]/change/page.tsx` with `src/components/trip/change-container.tsx` and `change-view.tsx`: the plan with the quick buttons "quieter", "shorter walks", "more for …", "we're tired" and "it's raining", the list of what moved, the reason and the choices when a change is refused, and "Undo". A change by button calls `api.tripActions.plan` with `keep` and `ops` and no model. Add the keys to `src/lib/i18n/messages/trip.ts`
- [X] T111 [US3] Read typed or spoken changes: add `ops` ("at most 6") to `src/lib/trip/interpret.ts`, dropping any op that names a slot not in the outline or whose `saidAs` is not in the latest message, and a box on `src/components/trip/change-view.tsx` that shows each op as a suggestion before it is applied. Extend `tests/unit/trip-interpret.test.ts`. **Third to cut if time is short; the buttons stay**
- [X] T112 [US3] Handle what time does to a plan, in `src/components/trip/plan-container.tsx`: a stop whose place `trips.stops` returns as null is marked as gone, with "Draw another"; with no connection the last plan still shows and a change waits for a connection; a trip becomes `finished` when the organiser says so or its last day passes
- [X] T113 [US3] Extend `tests/unit/trip-ui.test.tsx`: after "we're tired" the page lists what moved; "Undo" puts the plan back; a refused change names the rule and offers choices; a gone stop is marked; no accessibility fault on the change page

**Checkpoint (US3)**: the plan bends on the road without starting again.

---

## Phase 10: User Story 4, part 2: the private link for the party (Priority: P2)

**Goal**: The party reads the plan with no account, from a link the organiser can switch off. The page never says whose hard rule is whose.

**Independent Test**: Send the link to another phone, read the plan signed out, and look for any list of who needs what.

**Last to cut if time is short.**

- [X] T114 [US4] Create `convex/tables/trip.ts` with `tripShare` exactly as in data-model.md and spread it into `convex/schema.ts`: `code` ("24 characters, from `newPostcardCode`"), `ownerPersonId`, `regionId`, `title` ("The organiser's words, at most 80 characters"), `days` ("At most 7 days and 12 items a day"; each stop holds a `placeId` or a pin label, the estimated time, minutes, the kind, the organiser's label for a turn, and the rules checked and not checked with no traveller named), `deviceTripId`. Indexes: `by_code`, `by_ownerPersonId`. Not stored: any traveller's rules as theirs, age bands, likes, the purpose, the chat, the changes
- [X] T115 [P] [US4] Create `src/lib/trip/share.ts`: turn the device's plan into the `tripShare` fields, with the organiser's labels on turns, pins as the organiser's own words, and checks with no traveller named. Tests in a new `tests/unit/trip-share.test.ts`: no rule's owner, age band, like or purpose is in the result
- [X] T116 [US4] Create `convex/tripShare.ts`. `create` and `remove` are behind the trip gate; `read` is for anyone with the code whenever the switch is not `"off"`. `tripShare.create({ deviceTripId, title, days })` makes or replaces the link for one trip and returns its code from `newPostcardCode` (`src/lib/postcard/rules.ts`), limited to "20 a day, 50 kept". `tripShare.read({ code })` is for anyone with the code: the plan, or null when the code is unknown, the feature is off or the owner is gone; each read drops a place that is no longer public and looks quotes up afresh through `convex/lib/tripStops.ts`. `tripShare.remove({ code })` deletes the row in the same transaction. Deleting an account deletes its links, in `convex/people.ts`
- [X] T117 [US4] Create `convex/tripShare.test.ts`: a 24-character code; null for a wrong code, for a deleted owner and when the feature is off; a place made private drops out on the next read; no hard rule's owner in any stored field; removing deletes at once
- [X] T118 [US4] Create `src/app/[lang]/trip/shared/[code]/page.tsx` with `src/components/trip/shared-view.tsx`: the plan to read, with the organiser's labels on turns and the checks listed with no traveller named (User Story 4, scenario 6). No account is needed: this page checks only that the switch is not `"off"` (`src/lib/convex/trip-gate.ts`), and an unknown code is a 404 (FR-331). The page is `noindex` with `referrer: same-origin`. Extend `tests/unit/seo.test.ts`: the shared page is `noindex` and under `PRIVATE_SECTIONS`
- [X] T119 [US4] Add "Share with the party" to `src/components/trip/plan-view.tsx`: make the link, copy it, re-share after a change, and switch it off. Deleting a trip in `src/components/trip/party-container.tsx` removes its link too (FR-337)

**Checkpoint (US4, part 2)**: the party reads the plan on their own phones.

---

## Phase 11: The last checks and the Stage 4 release

- [X] T120 [P] Create `convex/tripPrivacy.test.ts` (SC-308, FR-334): after a plan, an interpretation and a share, nothing about a party is in any public query, the connector's answers (`convex/connector.ts`), the sitemap, `llms.txt` or the account export, and no other person's draw or page changes
- [X] T121 [P] Check the limits of research R19 (FR-343) in `convex/trips.test.ts`, `convex/facts.test.ts` and `convex/tripShare.test.ts`: 5 interpretations a minute and 40 a day, 30 plans or changes a minute and 300 a day, 20 links a day and 50 kept, 30 reports a day; each refusal is an `appError` code the page turns into plain words
- [ ] T122 Look at every trip page and the place page's new section on a phone and on a desktop screen, in English and in Japanese, with the states of [contracts/pages-and-routes.md](./contracts/pages-and-routes.md): signed out, trip agent off, no trips yet, planning in progress, something unmet, the AI step failed, no connection, a stop's place gone. Write what was fixed in `specs/005-trip-agent/validation-log.md`
- [ ] T123 Run every automated check in quickstart.md, land Stage 4 through a PR, deploy, and walk its by-hand steps on production: say "we're tired" on day 2 with two stops done, read what moved, press Undo, send the link to a second phone and read it signed out. Time twenty changes by button (SC-307: within a minute, 19 times in 20). Run `tests/e2e/` against production with `--workers=2`
- [ ] T124 OWNER: try the planner with a real party and note what was wrong in `specs/005-trip-agent/validation-log.md`

---

## Phase 12: The first real trips

- [ ] T125 OWNER: make a real trip with a plan on `/[lang]/trip/[id]`. Change it on the road at least once, mark stops done or skipped, write first stories and tick what you found
- [ ] T126 After the first real trips, record in `specs/005-trip-agent/validation-log.md`: SC-309 (a trip was made with the plan, changed on the road without starting again, and each adult can point to a stop that was theirs); SC-310 (every change the party made, and where the owner judges the first plan was generic); SC-311 (first stories at five or more stops, reports at ten or more); and what the estimates got wrong against the real drives

---

## Phase 13: User Story 6, keep the trip, the party and what was learnt (Priority: P3, after the first real trips)

**Goal**: A finished trip is a private record. The party can be kept for the next trip. What Noren noticed comes only as suggestions.

**Independent Test**: Finish a trip, accept one suggestion, start a new trip with the kept party and check the suggestion is in it.

- [ ] T127 [US6] Create `src/app/[lang]/trip/[id]/after/page.tsx` with `src/components/trip/after-view.tsx`: what was planned, done, skipped and changed, from the device, and the stories and reports the party wrote at those stops, from `trips.stops`
- [ ] T128 [US6] Keep a party for another trip: a "Keep this party" switch in `src/components/trip/party-container.tsx` ("6 kept parties") and, in `src/components/trip/party-step.tsx`, the kept travellers to pick from and edit when a new trip starts
- [ ] T129 [P] [US6] Create `src/lib/trip/noticed.ts`: from a finished trip's marks and changes, on the device and with no model, what Noren noticed ("you skipped three museums"), each as a suggested like, skip or setting. Show them in `src/components/trip/after-view.tsx` to accept or decline; nothing about the party changes until the organiser says yes (FR-338). Tests in a new `tests/unit/trip-noticed.test.ts`
- [ ] T130 [US6] Prove deletion in `tests/unit/trip-storage.test.ts` and `convex/tripShare.test.ts`: deleting a trip removes its plan, its changes, its private link and its copy of the party; deleting an account removes every link and report Noren holds for it (FR-337)

---

## Phase 14: After the first real trips, what Stage 5 holds

**Purpose**: The parts the plan leaves until real trips have shown what matters. Re-read `specs/005-trip-agent/validation-log.md` and re-plan these before starting; they are listed so that no requirement is without a task.

- [ ] T131 [US4] Design the invitation for an adult traveller to answer for themselves (FR-332, FR-333) and add it to `specs/005-trip-agent/contracts/convex-functions.md` and `contracts/pages-and-routes.md`: a private link that shows one person only the questions about themselves, answers that reach the party only when the organiser accepts them, nothing kept once they are handed over, and never a link for a child
- [ ] T132 [US4] Build the invitation as designed in T131, with its page under `src/app/[lang]/trip/` and its tests in `convex/trips.test.ts`
- [ ] T133 OWNER: say whether to collect public posts for the Malaysian towns, which costs money (research R12). Write the answer under R12 in `specs/005-trip-agent/research.md`
- [ ] T134 [US2] If T133 is yes: add an optional `facts` list to the found-post check in `src/lib/story-finder/check.ts` and `src/lib/story-finder/decide.ts` (a key from the region's list, yes or no, and the words in the post that say it). Code accepts a fact only when those words are verbatim in the post (`isVerbatim`), pass the existing refusals and fit the quote limit (FR-346). Teach `guessLang` in `src/lib/story-finder/mention.ts` Malay and Tamil. Try it on real Malay, Chinese and mixed-language posts before anyone trusts it (research "Verify at build time" item 6)
- [ ] T135 [US2] If T133 is yes: write an accepted fact as a `placeFact` row with `basis: "post"`, its `sourceId` and `quote`, in the found-post attach step in `convex/storyFinder.ts`, and erase it with its post in `convex/lib/foundPosts.ts` (`eraseFoundPost`). Tests in `convex/storyFinder.test.ts`
- [ ] T136 Open the trip agent (FR-342) to every signed-in member in the same release that switches Malaysia on and turns reports on (T043, T105), once the `trip` part of the notice is settled: `"trip": "open"` in `regions/nagasaki.json` with a new `legal.documentsVersion`. No trial stage (owner, 24 November 2026)

---

## Phase 15: Polish

- [ ] T137 [P] Check that `.specify/memory/constitution.md` holds the owner's position on Malaysia's data protection act and no `TODO(PDPA_POSITION)`. It was written there under T018, before T043; this task only confirms it
- [X] T138 [P] Add the trip agent, the one map and members' reports to `SPEC.md`, and the new tables and functions to `convex/README.md`
- [ ] T139 Run every check in `specs/005-trip-agent/quickstart.md` once more against production and close `specs/005-trip-agent/validation-log.md` with what passed, what was cut and what is left

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1** starts at once. T002 and T006 wait on the owner and block only T003 and the value in T053.
- **Phase 2** blocks everything. Inside it: T007, then T008, then T009, then T010, then T011 and T012. T013 to T017 can run beside them.
- **Phase 3** (the map) and the engine tasks of Phase 4 (T045 to T060) share no file. Run them side by side, as plan.md says of Stages 1 and 2.
- **Phase 4** server and page tasks (T063 onward) need `mapCell` and the index from T020 to T022, because `trips.candidates` reads by cell.
- **Phases 5, 6 and 7** each need Phase 4. They touch `stop-card.tsx`, `trips.ts` and `engine.ts` in turn, so run them in order, or agree who holds those files.
- **Phase 8** needs Phases 3 to 7. T105 also needs the owner's wording (T018).
- **Phases 9 and 10** need Phase 5 (`change.ts` and the stop card). They do not need each other.
- **Phase 11** needs whichever of Phases 9 and 10 were not cut.
- **Phases 13 and 14** start only after T126.

### The stages of plan.md, as tasks

| Stage | Tasks |
|---|---|
| 0. Ground | T001 to T018 |
| 1. One map, more coverage | T019 to T044 |
| 2. The engine | T045 to T060, then T081, T086 to T088, T090, T107 and T108 |
| 3. The planner | T061 to T080, T082 to T085, T089, T091 to T106 |
| 4. On the road | T109 to T124 |
| First real trips | T125, T126 |
| 5. After | T127 to T139 |

The engine tasks listed under Stage 2 need no page and no server. Pull them forward so the engine closes with its change tests, even though they sit in later story phases.

### User story dependencies

- **US1**: needs Phase 2. Its pages on real data need Phase 3.
- **US2**: needs US1.
- **US4, part 1 (turns)**: needs US1. Its page task (T089) needs the stop card from US2.
- **US5**: its server tasks (T091 to T096) need only Phases 2 and 3 and can run beside US1. T097 and T100 to T102 need US1 and US2.
- **US3**: needs US2 (T081 starts `change.ts`).
- **US4, part 2 (the link)**: needs US2.
- **US6** and **US4, part 3**: after the trip.

### If time runs short

Cut in this order and say so (plan.md): T078 (follow-up questions), T090 (paired stops), T111 (typed changes; the buttons stay), then Phase 10 (the private link).

### What waits on the owner

T002, T006, T018, T039, T124, T125 and T133 (T103 is not needed). Of these, T018 is on the path to the release three times: it blocks switching Malaysia on (T043), turning reports on (T105), and, through T043, planning a Malaysian trip on production (T104). Trying it on the dev deployment's data is not a way round, because sign-in only works on the deployed site. If the wording is not settled, the release waits: Malaysia stays off and the trip agent with it.

---

## Parallel examples

```text
# Phase 2, once T007 is in:
T013  scripts hanzi and tamil            src/lib/domain/constants.ts, src/lib/region/names.ts
T014  engine types                       src/lib/trip/types.ts
T015  trip vocabulary                    src/lib/trip/vocabulary.ts
T016  notice draft                       specs/005-trip-agent/notice-draft.md

# Two tracks after Phase 2:
Track A (map)     T019 → T020 → T021 → T022 → T023, T024, T025 → T027, T028   (T029 to T033 beside them)
Track B (engine)  T045, T046, T047, T048, T049 together → T050 to T054 together → T055 → T056 → … → T060

# User Story 1, once the engine passes:
T061  device storage                     src/lib/trip/storage.ts
T062  the snapshot                       src/lib/trip/snapshot.ts
T075  the interpretation step            src/lib/trip/interpret.ts

# User Story 5, beside User Story 1:
T091 → T092 → T093                       convex/tables/facts.ts, convex/facts.ts
T094  takedown target                    src/lib/domain/constants.ts, convex/takedown.ts
T098  messages and components            src/lib/i18n/messages/facts.ts, src/components/facts/
```

---

## Implementation strategy

### First, the smallest thing that is the feature

1. Phases 1 and 2.
2. The engine for User Story 1 (T045 to T060). **Stop and check**: 100 plans without a fault.
3. The rest of User Story 1 behind the region switch. **Stop and check**: the sample route gives a plan on a phone.

That is the MVP: a plan that holds to a party's rules and limits. It is not yet what sets Noren apart; User Stories 2, 4 (turns) and 5 are, and the owner's order asks for all of them in the first release.

### Then, in the owner's order

1. User Story 2, turns, User Story 5, then the Stage 3 release.
2. User Story 3 and the private link, then the Stage 4 release.
3. The trip, and its record.
4. User Story 6 and Stage 5, re-planned from what the trip showed.

### With agents working side by side

Track A (the map, Phase 3), Track B (the engine) and User Story 5's server tasks share no files. Give each to one agent in its own worktree under `.worktrees/`, rebase each onto the latest `main` before its PR, and keep `src/components/trip/stop-card.tsx`, `convex/trips.ts` and `src/lib/i18n/messages/trip.ts` with one agent at a time.

---

## Notes

- A task marked **OWNER** is ticked by the owner's answer, written where the task says.
- Engine tests are written first and must fail before the code they test.
- `[P]` means different files and nothing unfinished it depends on. Tasks that touch `stop-card.tsx`, `trips.ts`, `engine.ts` or `trip.ts` (messages) are never `[P]` with each other.
- Signed-in pages can only be seen on the deployed site, because production Clerk keys are refused on localhost. The region switch is how they are seen first.
- Two small additions to the contracts were made while writing this list, and are in [contracts/convex-functions.md](./contracts/convex-functions.md) and [contracts/region-file.md](./contracts/region-file.md): the query `trips.stops`, `people.current` returning `trip`, and the switch `features.facts`.

---

## Changes after the analysis (24 November 2026)

`/speckit-analyze` found 2 critical and 11 high issues. The owner asked for the two critical ones to be resolved before building. The others below were fixed with them because the tasks could not all pass as written. Where a fix is a choice the owner may want to make differently, it says so.

**Critical**

- **The data-law position comes before Malaysia is switched on.** T018 now ends with the position written into the constitution, T043 needs it, and T137 only confirms it.
- **A place's category is never what a met check rests on.** `restsOn.kind` is `owner`, `member` or `post`. A category can only leave a place out, as Plan my day does for bars (contracts/engine.md, T054).

**Fixed so the build holds together**

- The map asks for four-character cells when the view is too wide for 32 five-character ones, so Nagasaki's opening view keeps its places (R2, T019, T023, T027).
- One fact list of 17 facts covers every must-have a party can choose, a "no" answer has its own meaning, and a fact can serve a need (contracts/region-file.md, T007, T008, T015). `high-chair` is a new must-have, so that the high-chairs fact means something.
- Each slot's draw is keyed by the seed and the slot, not taken from one shared sequence (contracts/engine.md, T045, T059).
- A kept stop is held by time or by place (contracts/engine.md, T060, T081).
- A route over a limit the organiser set is refused with choices; a route over one of Noren's guesses is planned and named as over the guess (T048, T056).
- Plans and changes have a daily limit of 300 a person beside the 30 a minute (R19, T065, T121).
- A place of a region that is off is never returned by the map, the slug lookup or search (T023, T025, T029, T036).
- A trip can name towns to pass through (`via`), so a round trip with no nights given has somewhere to go. A pin from the map carries its `placeId`. What each change does is written down in one table.

**The orchestrator's calls, which the owner can switch**

- A trip's draw does not add to the exposure counts that tilt everyone's draws (T065). That keeps FR-334 as written. The other choice is to count them and say so in FR-334.
- The trip part of the notice is live in the release that opens the trip agent; a member is also told on the trip pages before describing a traveller (T037, T077).
- Follow-up questions come from a fixed list people wrote; the model only chooses among them (T078).
- A demo account cannot report at a real place, nor a real account at a demo place (T092).

Still open from the analysis and not blocking the build: what an age band changes (U2), allergies as must-haves (G2), reading the plan with no signal after the tab is closed (U5), tying the device's store to the account (G3), the terms beside the notice (G4), and the wording and duplication items.

- **No trial (owner, 24 November 2026).** Noren is already public, so the trip agent has no private trial. It opens to every signed-in member in the same release that switches Malaysia on and turns reports on, with a new `legal.documentsVersion`. T103 is not needed. T104, T106 and T136 describe that one release instead of a trial stage. The trial code (`features.trip: "trial"`, `person.trials`, `people.setTrial`) stays in place, unused, as a switch value.
- **Documents made neutral (24 November 2026).** The feature documents no longer describe any real person's trip; they describe Malaysia coverage and the trip agent, with a sample route and test dates.
