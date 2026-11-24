# Research: Trip agent

Decisions for [plan.md](./plan.md). Code references were read on 23 Nov 2026 at commit `e9f7d8c`, some through three read-only sweeps whose line numbers may be a few lines off. Outside facts come from `research/10`, `11` and `12`, written the same day. Items marked "verify" must be proven at build time before the step that depends on them.

## R1. One app, one map: Malaysia is a second region file, not a second site

- **Decision**: Noren stays one site, one database and one sign-in (owner, 23 Nov 2026: "the same app ... the whole global map ... we just expand out the support"). Malaysia is `regions/malaysia-west.json` beside `regions/nagasaki.json`. A region file is settings for an area. App-wide settings (feature switches, sign-up, search, the operator, the notice and terms, the interface languages, stewards) keep coming from the home region, which is Nagasaki's file.
- **What changes**: `src/lib/region/registry.ts:4` imports both files, and `activeRegionConfig()` returns the home region when `REGION_ID` is unset instead of throwing. Place-scoped code already reads `regionConfig(place.regionId)` at about 91 Convex call sites and needs nothing. The call sites that are truly about an area get fixed one by one: the map (R2), a place found by its slug (R3), place search (`src/app/api/geo/search/route.ts:6`), the sitemap and `llms.txt` (`src/lib/seo/*`), the takedown form's place lookup (`convex/takedown.ts:116`) and the found-post check's "Nagasaki" wording (`src/lib/story-finder/check.ts`).
- **Rationale**: Of the roughly 60 `getActiveRegion` and `activeRegionConfig` call sites in `src/`, most read settings that are the same for the whole app in the owner's model. Leaving them alone turns a 150 to 200 file rewrite into about a dozen targeted changes.
- **Alternatives**: A second site on a subdomain with the same or a second database (rejected by the owner). Choosing a region per request from the address (the 150 to 200 file rewrite, and it would put a region switcher in front of people).
- **Known limit**: Lists that are not tied to a place (the latest stories, steward queues) show both areas together. That is what one app means. A filter by what the map shows can come later.

## R2. The map loads what is in view

- **Decision**: Each place row gets `mapCell`, a five-character geohash of its pin (a square about 5 km across), written by the trigger that already keeps `mapPin` (`convex/lib/rules/mapCopies.ts`). A new query `places.inCells` returns the public places in up to 32 cells. The map asks for the cells in view after each move (`src/components/map/place-map.tsx:390` already listens for `moveend`). **Revised 24 November 2026:** Nagasaki's map opens at zoom 12, where a desktop view spans 120 to 144 five-character cells, so 32 of them cannot cover the opening view. When more than 32 five-character cells cover the view, the map asks for four-character cells instead (about 39 by 20 km each, read as a range on the same index), up to 16 of them. Only past that does it show one marker for each town in the region files and load no places.
- **Rationale**: `places.listForMap` loads a whole region in one query capped at 5,000 rows (`convex/places.ts:182`, `MAP_PLACE_LIMIT`). Nagasaki has about 3,600 places; Malaysia's towns add several thousand more, so the cap would be hit silently. Loading by view was already recorded as needed before any large import. A plain indexed field needs no new dependency and works for any place on Earth, which is the owner's "global map".
- **Alternatives**: Convex's geospatial component (a real rectangle index, but a new dependency to learn and backfill inside three weeks; revisit if cells prove clumsy). A `town` field per place (ties the map to region files). Raising the cap (a query may read 32,000 documents, so it only postpones the problem).
- **Kept**: `listForMap` stays for Plan my day and the collection pages, which are per neighbourhood in Nagasaki.
- **Verify**: backfilling `mapCell` on about 3,600 rows in batches, and that the new index deploys without blocking (stage the index if the table is large, per the Convex guidelines).

## R3. A place is found by its slug across regions

- **Decision**: `places.bySlug({ slug })` tries each region file's id on the existing `by_regionId_and_slug` index and returns the first match. Importers and "add a place" refuse a slug that another region already uses. Place addresses stay `/{lang}/places/{slug}`.
- **Rationale**: Slugs are unique per region today (`convex/places.ts:243`). Two lookups cost nothing, and no address changes.
- **Alternatives**: A region segment in the address (breaks every shared link and the sitemap). A new global index on `slug` alone (needs a uniqueness sweep first; do it if a third region arrives).

## R4. Names in more scripts; interface languages stay the app's

- **Decision**: `SCRIPTS` (`src/lib/domain/constants.ts:17`) gains `hanzi` and `tamil`. A region file gains `nameLanguages` (Malaysia: `ms`, `en`, `zh`, `ta`), the languages a place name may be stored in, separate from `locales`. The importers read `name:ms`, `name:zh` and `name:ta` as well as `name`, `name:en` and `name:ja` (`src/lib/osm/tags.ts`, `src/lib/osm/listings.ts`, `src/lib/overture/place.ts`). `nameFallback` for an English reader in Malaysia is `latin` first, then `hanzi`, then `tamil`. The interface stays in Japanese and English.
- **Rationale**: Today a Chinese name would be stored as `kanji` and a Tamil one as `latin`, which is wrong on its face. Adding Malay as an interface language means a new table in all 34 message files (`defineMessages` requires every key in every language), which is not needed for the first release.
- **Verify**: every page renders for a place whose only name is in `hanzi`.

## R5. Seeding the Malaysian towns

- **Decision**: Seed with the existing importers, per town box instead of the whole region box: OpenStreetMap first for every town (`scripts/seed-osm-candidates.ts`, `scripts/publish-osm-listings.ts`), then Overture only where OpenStreetMap is thin (Sungai Petani, Kuala Kangsar, Taiping, Kuala Sepetang, Gopeng), at confidence 0.7 or more and within a row budget (`scripts/import-overture-places.ts --min-confidence --map-budget --bbox`). Kuala Lumpur is a start and end point only and is not seeded. The Japan-only chain tooling (`src/lib/chains/*`, `scripts/data/chain-evidence-japan.json`) is not run for Malaysia; the import-time "not for visitors" filter still applies. Everything runs on the dev deployment first.
- **Rationale**: `research/12` counted about 5,000 visitor-facing OpenStreetMap places across the towns, and several times more in Overture, most of them derived from business pages of unknown age. Starting small keeps the "Not yet confirmed" label honest and the database inside its plan.
- **Owner's call**: how far to go with Overture is a cost and quality choice, as it was in Nagasaki.
- **Verify**: the Overpass query and category rows give sensible results for a Malaysian town (kopitiam, hawker centre, mamak, temple, mosque, clan house, wet market); new category keys go in the region file.

## R6. Driving times come from a table in the region file

- **Decision**: `regions/malaysia-west.json` holds `roads`: the towns as points on the road network and the driving minutes and kilometres between neighbours, built once by a script from open road data and committed with its source and date. A stop inside or near a town is reached by an estimate: straight-line distance times a detour factor at a town speed. Each drive in a plan opens in the person's own maps app for the real route and traffic (FR-326). Noren calls no routing service while planning.
- **Rationale**: Google's Routes terms forbid using its results with a non-Google map (`research/12`, section 3.3), and ours is MapLibre. No open engine models live traffic or toll prices, so a live service would add a vendor without adding what a party most wants to know. The corridor is one highway with a few branches, so about 15 road segments describe it. Any routing vendor is the owner's choice, and this needs none.
- **How the table is built**: a one-off local run of an open routing engine over the Geofabrik Malaysia extract (242 MB, ODbL), writing the segment table. Nothing is served from the build machine.
- **Alternatives**: A hosted routing API (free allowances exist, see `research/12`; adds a vendor, an account and terms). A self-hosted routing service (ruled out: nothing is served from the box).
- **Known limit**: Times are for an ordinary day. On days the region calendar marks as busy the plan says so in words (R14) and adds nothing to the numbers, because a margin would be a guess.
- **Verify**: an open engine can be installed and run locally for the one-off build. Fallback: the four leg times measured in `research/12` plus hand-measured segments, each marked with its source.

## R7. The plan is made by code with a seeded draw; no model is in that path

- **Decision**: A pure TypeScript engine in `src/lib/trip/` turns a trip request into a plan, in this order: lay out the days from the nights and the road table; give each day its meal, rest and need slots and as many turn slots as the party's fullness allows; for each slot gather the places within reach, drop any that fail a hard rule of a traveller who is there (R10), and draw one with `drawStops` (`src/lib/draw/sample.ts`); order each town's stops with `orderAsWalk`; work out the times; then run a separate checker over the whole plan. If the checker finds a fault the engine redraws that slot a bounded number of times, and if it still fails it reports what could not be met. Every random choice takes an `Rng` (`src/lib/draw/rng.ts`), so a seed fixes the plan.
- **Rationale**: In 2026 tests, AI models made a workable plan for one traveller but fewer than 12 in 100 valid group plans, tiring pace in 99 in 100, and poor mid-trip changes (`research/11`, section 1). Rules, pace, turns and times are exactly what a program can check. The existing rule, "code decides, the model words it", already holds for Plan my day (`src/lib/planner/resolve.ts`).
- **Size**: about 300 candidate places over four days is small for this kind of problem; published heuristics handle thousands (`research/11`, section 2). Greedy filling with a checker is enough, and no solver is added.
- **Consequence**: Making a plan costs no model call. It is fast (SC-307), it cannot invent a place (FR-314), and it still works when the AI service is down.

## R8. What the model does

- **Decision**: The model reads the organiser's typed or spoken words and returns structured suggestions, never a plan. Three uses: (1) from words about the party, suggestions for a traveller's needs, likes and rhythm, each with the exact words it rests on; (2) up to three follow-up questions about concrete cases (FR-308); (3) from words about a change ("we're tired", "skip the museum"), a list of change operations from a fixed set. Code checks each one: the quoted words must appear in the organiser's last message (as `checkProposals` does in `src/lib/planner/resolve.ts`), a need or like must be in the vocabulary, and a change operation must name a slot that exists. The engine then applies the operations.
- **Model and limits**: the existing `plan` capability (`AI_MODEL_PLAN`, `src/lib/ai/config.ts`). No new AI provider. The model is sent the organiser's messages, an outline of the plan (day, slot, place name, kind) and the vocabulary. It is not sent the party's description, the travellers' labels as data, or anyone's rules (FR-336). A label reaches it only if the organiser types it, and the device matches a label back to a traveller.
- **Not used**: Convex's agent component, which stores a conversation. Nothing about a trip chat is stored on the server.

## R9. The party and the trips stay on the device

- **Decision**: A second stored object under its own key, `noren.trips.v1`, following `src/lib/memory/storage.ts`: a zod schema, entries validated one by one, caps, and a store built on `useSyncExternalStore`. A request to the server carries a party snapshot with no labels: travellers as `t1`, `t2`, their age bands, need and like tags, rhythm, and the party's limits. The server stores none of it; the action keeps only rate-limit counters, as `convex/planner.ts` does.
- **Rationale**: The owner's decision of 10 Nov 2026 that hard rules stay on the device, `research/11` section 7, and the Malaysian law's treatment of health as sensitive data (`research/12`, section 5.1).
- **Known limits**: A lost phone or cleared storage loses the party and the plans. A plan shared by link survives (R16). A trip does not follow the organiser between phones.

## R10. How a rule is checked

- **Decision**: For each traveller's rule at each candidate place, code gives one of three verdicts: met, not met, or not known. It reads the owner's published cautions (`publishedCautionKeys`, `convex/connector.ts:191`) and the live practical facts (R11). **Revised 24 November 2026:** a place's category is not a record. It can only leave a place out, as Plan my day leaves bars out for `no-alcohol`; it is never what a met verdict rests on (FR-341, Principle III). The exact steps are in `contracts/engine.md`, "How a rule is checked". The region file's fact list says which rule each fact meets or fails. A place with a not-met rule for someone who is there is dropped. Met and not known both stay, and the stop shows which is which and what a met verdict rests on. Records that disagree count as not met. A member's report or a post older than the region's limit (365 days for Malaysia) counts as not known.
- **Open listing notes**: OpenStreetMap's `wheelchair` and `diet:halal` tags are not imported. They sit on about 100 places in the corridor and must not count as a check (FR-348), so there is nothing to gain from storing them.
- **A reading the owner should confirm**: among the places that stay, one that is known to meet a must-have of someone present is drawn `FIT_TILT` times as often as one where it is not known (a new constant beside `TASTE_TILT` in `src/lib/draw/weights.ts`, starting at 3). Without it, a party that needs step-free places would be sent to an unchecked place as often as to one a member reported as step-free. This tilts a draw for one party's own rule. It ranks nothing and shows no number.
- **While real businesses are draft-only**: owners' cautions are not shown publicly, so they do not filter (`withoutCautionRules`, `src/lib/draw/rules.ts:131`). In Malaysia, with no owners yet, checks rest on members' reports and found posts.

## R11. Practical facts are a new table

- **Decision**: A `placeFact` table holds one fact about one place: a key from the region's fixed list, yes or no, what it rests on (a member's report or a found post), who and which day, and for a post the quoted words. See [data-model.md](./data-model.md).
- **Rationale**: Owner cautions are `claim` rows bound to an interview, a consent record and the owner's confirmation (`convex/tables/interviews.ts`, `convex/claims.ts:254`). A member's report has none of those. "Still here" (`placeCheck`, `convex/checks.ts:19`) is the nearer pattern: any signed-in member who can read the place, rate-limited, shown with their name.
- **Alternatives**: `claim` with `kind: "fact"` (the kind exists in `CLAIM_KINDS`, but every rule on a claim assumes an owner).

## R12. Facts from found posts come after the first real trips

- **Decision**: The found-post check (`src/lib/story-finder/check.ts`, schema in `decide.ts`) gains an optional `facts` list: a key from the region's list, yes or no, and the words in the post that say it. Code accepts a fact only when those words are verbatim in the post (`isVerbatim`), pass the existing refusals (contact details, a person's health or death, private people) and fit the quote limit. An accepted fact becomes a `placeFact` row that points at the found post and is erased with it (`eraseFoundPost`, `convex/lib/foundPosts.ts:89`).
- **Why later**: Collection for Malaysia has not been run, it costs money, and the check was written for Japanese and English. `guessLang` cannot tell Malay from English or recognise Tamil (`src/lib/story-finder/mention.ts:166`). It needs real Malaysian samples before anyone trusts it, and members' reports (R11) cover the first trips.
- **Owner's call**: whether and how much to collect for the Malaysian towns.

## R13. Turns

- **Decision**: The engine keeps a count of turns per traveller for the trip. Each turn slot goes to the traveller present with the fewest so far, ties broken by a fixed order rotated by the seed, and the draw for that slot tilts toward that traveller's likes. Travellers with no likes take no turns. Where a traveller has said they are bored by something another loves, the engine looks for a place for them within a short walk of the other's turn and adds it as a paired stop when one exists.
- **Rationale**: No way of blending a group's wishes wins in the research, and people care that each person gets their pick over a sequence (`research/11`, section 4). The existing exposure ledger gives quiet places a turn; this gives each traveller one.
- **Never shown**: the counts. The page says whose a stop is, and says in words when someone has gone a day without one (FR-321, Principle I).

## R14. The calendar is in the region file

- **Decision**: `calendar` in the region file lists public holidays by state, school holidays by state group, fasting months and busy travel days, each with a source and a `verified` flag. A day in a plan shows what the calendar holds for it. Unverified entries show with "not confirmed".
- **Rationale**: Malaysia publishes no open holiday dataset (`research/12`, section 2.1). The entries for December 2026 to March 2027 are already collected with their sources in `research/12`, section 6.2. Kedah's weekend could not be confirmed there and goes in as unverified.

## R15. The private trial

- **Decision**: `features.trip` in the home region file is `"off"`, `"trial"` or `"open"`. In `"trial"`, the pages and functions answer only for a person whose row has `trials` containing `"trip"`, and are "not found" for everyone else. An internal mutation sets it, run from the command line by the owner. No account identifier goes in the repository (Principle VII).
- **Rationale**: Nothing like an allowlist exists today. A field on `person` is the smallest thing that works and is not personal data in a file.

## R16. The private link copies the postcard

- **Decision**: A `tripShare` table like `postcard` (`convex/tables/postcard.ts`): a 24-character code from `newPostcardCode` (`src/lib/postcard/rules.ts:31`), the organiser, and a copy of the plan (stops, times, the labels on turns, pins as the organiser's own words). It holds no hard rule's owner. Each read works out what still shows: a place no longer public drops out, and quotes are looked up at read time. The page is under `PRIVATE_SECTIONS` (`src/lib/seo/site.ts:15`). Deleting the trip on the device, switching the link off or deleting the account removes the row.

## R17. One notice and one set of terms, with new parts

- **Decision**: The notice and terms stay one document for the app (`src/lib/i18n/messages/legal-documents.ts`). New `NoticeSwitch` values `malaysia`, `facts` and `trip` add: who the notice covers in Malaysia and under which law, that data is kept in Australia and sent to AI services in the United States, what a member's report shows, and (when the trip agent opens) what a trip sends and keeps. A Malay version of the privacy notice is added as a document of its own, linked from the English one, without making Malay an interface language. The release that turns `malaysia` on sets a new `documentsVersion`.
- **Owner's calls, both on the path to the release**: the wording, and the position on whether Malaysia's data protection act reaches a project that takes no money (`TODO(PDPA_POSITION)` in the constitution). The draft assumes the cautious reading: it names the transfers, asks for a clear yes before a member reports anything, and gives a contact.
- **Verify**: section 7(3) of the Act (notice in Malay and English) against the official text; the Malay wording needs a Malay speaker's read and ships labelled as unreviewed until it has one, as the Japanese did.

## R18. How it is tested

- **Decision**: Fixtures of 20 made-up parties on the sample route, each planned with five seeds. Code checks every plan against the engine's invariants ([contracts/engine.md](./contracts/engine.md)). Pairs that differ in one answer are compared stop by stop with the seed fixed. A scripted model (`tests/fixtures/planner.ts:271`) covers the interpretation step. Convex functions are tested with `convex-test`. Pages are tested on the dev deployment. Real trips are the field test, and the list of changes a party makes is the result (SC-310).
- **Rationale**: The cheapest strong test of "personalised" is the counterfactual one, with graders written in code and several seeds because the draw is random (`research/11`, section 6). Templates: `tests/unit/draw.test.ts`, `convex/connector.test.ts`, `tests/unit/planner.test.ts`.

## R19. Cost and limits

- **Decision**: Planning and changing a plan by tapping cost no model call. Interpreting words costs one call. Limits per person: 5 interpretations a minute and 40 a day (the planner's numbers), 30 plans or changes a minute and 300 a day (the daily limit FR-343 asks for; added 24 November 2026), 20 links a day and 50 kept, 30 fact reports a day through `limitContribution`.

## Verify at build time

1. `mapCell` backfill and index deploy on production-sized data (R2).
2. An open routing engine runs locally for the one-off road table (R6).
3. Category rows and the visitor filter on a Malaysian town (R5).
4. Pages with a `hanzi`-only or `tamil`-only place name (R4).
5. Section 7(3) of Malaysia's Act in the official text, and the Kedah weekend (R17, R14). **Checked 24 November 2026 (T017):**
   - **Section 7(3): CONFIRMED in an official text.** Source: Act 709, the Commissioner's own bilingual reprint on pdp.gov.my (`https://www.pdp.gov.my/wp-content/uploads/2024/07/UNDANG-UNDANG-MALAYSIA_AKTA_PERLINDUNGAN_DATA_PERIBADI_2010_709_MALAY_AND-ENG_V2022.pdf`), read 24 November 2026. English column, section 7 (Notice and Choice Principle): "(3) A notice under subsection (1) shall be in the national and English languages, and the individual shall be provided with a clear and readily accessible means to exercise his choice, where necessary, in the national and English languages." The Malay column reads: "(3) Suatu notis di bawah subseksyen (1) hendaklah dalam bahasa kebangsaan dan bahasa Inggeris, dan individu itu hendaklah diberi cara yang jelas dan mudah diakses untuk membuat pilihannya, jika perlu, dalam bahasa kebangsaan dan bahasa Inggeris." The national language is Malay. So if the Act reaches Noren, the notice must exist in Malay and English, and the means of choice (for example the "yes" before a first report) must be offered in both. The Japanese does not satisfy it and does not need to.
   - **Did Act A1727 change it? No, on the text read.** The Amendment Act's list of amended sections (4, 5, 9, 16, 21, 48, 67, 129, 136, plus the general change of "data user" to "data controller" in section 2 of A1727) does not include section 7. The only change that reaches section 7 is the new name, so today's wording says "data controller" where the 2022 reprint says "data user". Caveat: the A1727 text was read from a law firm's copy of the Printer's text (`christopherleeong.com`), not from the Attorney General's Chambers portal (`lom.agc.gov.my`, not opened). The Commissioner's reprint predates A1727, so no single official document read shows section 7 as amended; "unchanged" rests on A1727's own list of amended sections. Open the Chambers' consolidated text to close this.
   - **Kedah's weekend in December 2026: NOT CONFIRMED by a primary source.** Found, and what each is:
     - Kedah state gazette notices on public holidays (the Warta Kerajaan Negeri Kedah, as mirrored by the Sinar Project archive, which is a copy and not the state's own site): No. 1136 of 19 December 2019 (holidays for 2020) and the notice for 2017. Both say a state holiday that falls on a Friday is moved to the next working day, and one that falls on a Saturday stays on the Saturday and is not moved. That fits a Friday and Saturday weekend, but it is a holiday-moving rule for 2017 and 2020, it does not name the weekly rest days, and no 2026 gazette was found.
     - Secondary only: Bernama's report on the Hybrid Workday policy that started on 2 August 2026 puts Kedah among the Friday-and-Saturday states (office days Sunday and Thursday); a 2024 Malay Mail article lists Kedah, Kelantan and Terengganu as the states that keep Friday and Saturday. One blog says Kedah changed to Saturday and Sunday in 2022; it contradicts its own text and the other reports, and is not used.
     - Not found: a federal list of state rest days, or a Kedah notice naming the weekly rest days.
     - **Treat as unverified.** Best supported working reading: Friday and Saturday. To close it, ask the Kedah State Secretary's office or read the current Warta. For a trip it matters little: Friday and Saturday are the days a Kedah state office or counter is shut, and 25 December 2026 falls on a Friday.
   - **For `regions/malaysia-west.json` (not edited here):** the Section 7(3) fact is not a region-file flag. Keep `verified` false (or leave it unset) for Kedah's weekend; no primary source confirms it, only an inference from gazette notices for other years. Change it only when a 2026 Kedah notice, or the State Secretary's office, names the days.
   - The PDF copies were read in `.scratch/trip-agent/notice-dl/` (git-ignored). No query sent anything about the project: the searches named the laws and places only.
6. The found-post check on real Malay, Chinese and mixed-language posts (R12).
7. Signed-in pages can only be seen on the deployed site, because production Clerk keys are refused on localhost. The region switch is how they are seen first.
