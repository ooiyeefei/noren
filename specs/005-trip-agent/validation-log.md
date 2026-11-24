# Validation log: trip agent

What was run, when, and what it showed. Newest entries at the bottom of each section.

## Baseline (T005)

- **Date**: 24 November 2026
- **Commit**: `e9f7d8c` (`origin/main`), in the worktree `.worktrees/trip-agent`, Node 24.21.0
- `pnpm test`: 225 test files, 4,697 tests, all passed
- `npx tsc -p convex/tsconfig.json`: no errors
- `npx eslint --no-warn-ignored --ignore-pattern '.scratch/**' --ignore-pattern '.worktrees/**' .`: no errors
- `pnpm build`: the first run compiled every route and then stopped with a notice that Next.js 16.4.3 has a known security advisory and should be upgraded. The second run finished without error. The upgrade was not made here; it is the owner's call.

## Road table (T009)

- **Date**: 24 November 2026
- **Data**: Geofabrik `malaysia-singapore-brunei-latest.osm.pbf` (254 MB), downloaded 24 November 2026, ODbL 1.0
- **Engine**: OSRM backend (Docker image `ghcr.io/project-osrm/osrm-backend:latest`, digest `sha256:e1929ae2…78278b`), car profile, MLD, bound to `127.0.0.1:5077` only. The container has been removed. Files are in `.scratch/roads/` (2.2 GB, git-ignored)
- **Script**: `scripts/build-road-table.mts`. Output: 27 points, 26 segments. Interchange and rest-area coordinates are OpenStreetMap nodes (Overpass, 24 November 2026); each pin is the engine's snap of that node onto the North-South Expressway carriageway heading north. Every segment takes the shorter of its two directions, because a pin sits on one carriageway and the other direction pays for an exit and a turn the road does not need
- **Checks the script makes**: connected; no stretch longer than 120 minutes between places to rest (towns and rest areas count; interchanges do not); every pin within 150 m of the given node and on the expressway. No warnings were raised

### The four legs of `research/12` section 6.1

"Table" is the sum of the segments along the quickest path between the two points. Ends are the table's points (for a town, its interchange), not the town centre. "Direct" is the engine run centre to centre on this machine, the same measurement as research/12.

| Leg | research/12 | Direct, this run | Table | Table plus off-road allowances of the two ends |
|---|---|---|---|---|
| Kuala Lumpur to Alor Setar | 315 min, 433.3 km | 315 min, 432.6 km | 311 min, 431.6 km | 324 min |
| Alor Setar to George Town | 91 min, 114.6 km | 91 min, 114.1 km | 95 min, 123.6 km | 108 min |
| George Town to Ipoh | 123 min, 156.9 km | 124 min, 157.6 km | 109 min, 145.4 km | 122 min |
| Ipoh to Kuala Lumpur | 148 min, 197.3 km | 152 min, 199.2 km | 151 min, 207.6 km | 164 min |

What the differences are:

- The local engine reproduces research/12 to within 1 to 4 minutes and 1.5 km on every leg (the demo server was likely on a slightly different extract). So the engine is the same one and the data is near the same.
- The table is within 4 minutes of the direct figure for Kuala Lumpur to Alor Setar (311 against 315) and for Alor Setar to George Town (95 against 91). It is 14 minutes short on George Town to Ipoh (109 against 123) and 3 over on Ipoh to Kuala Lumpur.
- Why the table differs from a centre-to-centre drive: a town point is an interchange, so the table leaves out the drive from the interchange to the town centre (`offRoadMinutes`: 13 for Ipoh and for Alor Setar; Kuala Lumpur and George Town are city-centre points, 0). Adding the allowances of the two ends gives the last column, which differs from the direct figure by +9, +17, -2 and +12 minutes. The allowance is measured from the interchange to the town centre, and the interchange is not always on the way (Alor Setar's point is its northern exit, so a drive south passes the town before it). A plan uses the allowance once, to reach a stop in town, not as part of the through-drive.
- Kilometres: 1 km low on Kuala Lumpur to Alor Setar, 9.5 high on Alor Setar to George Town, 12.2 low on George Town to Ipoh (the direct route enters Ipoh from the south; the table's Ipoh point is the northern interchange, exit 141) and 8.4 high on Ipoh to Kuala Lumpur.
- Free-flow only. No traffic, no tolls priced; the figures are best case (R6, "Known limit").

### Where the table leans on a choice

- **Kampar** has no named interchange in OpenStreetMap. Its point is the nearest place on the E1 carriageway to the town (4.337 N, 101.235 E), with 25 minutes of off-road allowance measured on the engine. The real Kampar interchange should be checked against PLUS before the table is called final.
- **Rest areas are directional** on the expressway. For Ulu Bernam (southbound; the northbound one is the Tanjung Malim lay-by 2 km on), Sungai Perak, Tapah, Gunung Semanggol, Sungai Bakap and Gurun the allowance is the shorter to either carriageway's rest area; Tikam Batu has one lay-by in OpenStreetMap, southbound according to research/12 (12 minutes to reach it going north).
- **Seberang Perai** is Seberang Jaya (exit 163) with 10 minutes to Butterworth centre. George Town is the city centre, reached from Juru by the Penang Bridge (22 minutes, 22.5 km).
- **Kuala Sepetang** hangs off Changkat Jering (exit 146) with 19 minutes, and **Taiping** off Taiping Utara (exit 148) with 15, so the two towns have separate points as the schema requires.

## Categories on real data (T035)

On 24 November 2026 the public Overpass endpoint returned 2,648 named nodes, ways and relations for the Ipoh box (7,500 m from centre to side) and 2,116 for Alor Setar (6,000 m). The importer query selected amenity, shop, craft, tourism and historic tags. The OSM snapshots were timestamped 08:49:02 and 08:51:03 UTC respectively. One Alor Setar POST returned HTTP 502. A subsequent GET of the same query succeeded. Both responses contained a complete elements array without a server remark. [Overpass API](https://overpass-api.de/api/interpreter)

| Check | Ipoh | Alor Setar | Result |
|---|---:|---:|---|
| Parsed candidates with a pin inside the box | 2,645 | 2,115 | Ways and relations use their centre |
| Kopitiam in a name or cuisine | 16 | 11 | Ipoh had 15 restaurants and one café. Alor Setar had four restaurants, four food courts and three fast-food places. The existing rules retain the mapped category |
| Hawker in a name or cuisine | 2 | 0 | Ipoh had one restaurant and one food court, both classified as restaurant |
| Mamak in a name or cuisine | 1 | 0 | Salaam Corner had restaurant and mamak cuisine, classified as restaurant |
| Named places of worship | 197 | 115 | 193 and 115 moved from other to worship. Existing attraction and other specific mappings take precedence |
| Named marketplaces | 33 | 7 | All moved from other to market. Three Ipoh names explicitly said “Wet Market” |
| Focus category and passing the visitor filter | 1,112 | 641 | Before duplicate checks, using each OSM object's own brand tags |

The mosque and temple check included Masjid Panglima Kinta and Loong Thow Ngam Temple. Both have the place-of-worship amenity. The map preserves a separately tagged attraction such as Ling Sen Tong Temple. A classification describes the mapped type and supplies no evidence about visitor access or provision for prayer.

The Perak Ku Kong Chow Association in Ipoh has only a name and a viewpoint tag. It already maps to attraction. The city heritage plan lists the association building on the trail. The query also returned a vape shop with “Kongsi” in its name. A name-based clan-house rule would misclassify it, so the visitor filter continues to exclude it. No Alor Setar clan house was identified by this check. [OSM association listing](https://www.openstreetmap.org/node/6755503490) · [Ipoh heritage plan, page 27](https://stag.planmalaysia.gov.my/planmalaysia/resources/epublisiti/turun/rt_ipoh2035/Laporan%20Eksekutif%20RTMBI%202035_3%20NOV%202021.pdf)

Market and place of worship are distinct visitor destinations in Malaysia's category list. The Overture taxonomy rules have fixture coverage for the corresponding terms. The measured counts above are OSM data only. © OpenStreetMap contributors, ODbL. [OSM attribution](https://www.openstreetmap.org/copyright)

## Build of 24 November 2026 (Stages 0 to 4, code only)

Built by agents working side by side in separate worktrees, each on a written brief, with every merge reviewed and checked by the orchestrator. Nothing was pushed to GitHub and nothing was deployed to production. The code was pushed to the dev deployment (`brazen-gull-39`) only, with `REGIONS_PREVIEW=malaysia-west` set there.

### Automated checks on the merged branch `trip-agent`

- `pnpm test`: 255 test files, 5,452 tests, all passed (the baseline was 4,697).
- `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p convex/tsconfig.json`: no errors.
- eslint: no errors.
- `pnpm build`: passes with `features.trip` `"off"` and with it set to `"trial"`. The trip pages are marked as per-request pages, because they check the visitor before anything streams. The build and the dev server stop now and then with a notice that Next.js 16.4.3 has a security advisory; a second run continues. The upgrade is the owner's call and was not made.
- The engine: 453 tests in ten files, written from the contract by a different agent from the one that wrote the engine. 100 plans (20 parties, five seeds) without a fault against invariants 1 to 5, 9 and 11; 110 turn tests; 53 pair tests; 29 change tests.
- `trips.plan` on test data, worst case of 12 anchors with 400 places each: about 3 seconds. Candidates are read one anchor at a time and details in batches of 50, after the first measurement showed one query would pass Convex's limit on index ranges.

### Looked at in a browser

Signed-in pages cannot be opened on localhost (production sign-in keys are refused there), so the trip pages were looked at through a preview page with made-up data that is git-ignored and never deployed. Each was opened in English and Japanese at 390 by 844 and 1440 by 900, checked with axe (no finding left), and looked at by the agent that built it; the orchestrator looked at a sample of each set.

- The map on dev data (9 places): opens on Nagasaki as before; dragging keeps the places; zoomed out it shows town markers that do not overlap; a town marker flies there; search finds a place outside the view; a place page opens by its slug; the heading and the name beside the logo follow the view.
- The questions, the list of trips, the party page; the plan page with every kind of stop, guesses named, a route that cannot be driven, a gone place, no connection; the own-words box with suggestions and with the AI step failed; the change page before and after a change, a refused change, undo; the share controls; the shared page signed out; the place page's "What people found here" in eleven states and the takedown form for one fact.

### Found by looking, and fixed

- The map page crashed in a real browser with "Too many re-renders". The unit tests had mocked the query hook and could not see it. Fixed, with a test that renders the container with the real hook.
- The production build refused the trip pages. Fixed as above.
- Town markers overlapped when zoomed out; the heading said "Nagasaki's local places" over Ipoh. Both fixed.
- The route step offered junctions as towns and lost the order of towns to pass through; with towns only, Kuala Lumpur could no longer start a trip. Fixed with `roads.endpoints` in the region file.
- A must-have line overstated what Noren knows. Reworded.
- A steward could add a place from another region to a Nagasaki collection panel. Fixed, with a test.
- The older map query, and about sixty other groups of public functions, took a region or a place from the caller without asking whether that region was switched on. Places seeded ahead of a region's notice could have been read or changed through them. One shared check now closes them all; the audit, function by function, is in [region-gate-audit.md](./region-gate-audit.md). Two items in the story finder's steward overview are left and written up there.

### Last checks on the final code

The map was opened in Chrome once more against the dev deployment at both sizes: it opens, shows its places, and zoomed out shows town markers (12 on a desktop screen, 8 on a phone after the ones that would overlap are left out), with no error in the console apart from sign-in messages that come from running on localhost. With the switches as shipped, `/en/trip`, `/en/trip/new` and a made-up shared link each answer 404.

### Not verified, and why

- **Nothing was seen on the deployed site.** The door (a real 404 when off, and during a trial for anyone not on it), sign-in and return, and every signed-in page as it really renders wait for Stage 3 on production (T104, T106, T122).
- **No plan was made against a live deployment.** `trips.plan`, `trips.interpret` with a real model, `trips.stops`, `tripShare` and voice input ran only in the local test backend. The dev deployment holds no Malaysian places.
- **No Malaysian place was seeded anywhere** (T040). Convex printed "Your projects are above the Free plan limits" on the dev push, and T039 asks the owner to look at usage first. T041 (names in Chinese and Tamil on real places) waits on seeding.
- **Nagasaki's map on production-sized data.** Dev has 9 places; production has about 3,600. The opening view reads four-character cells there and should show the same places, but that was not seen (T042, T044).
- Japanese wording throughout is a first draft with no native review. The Malay notice is machine-drafted and unreviewed.

### To settle before Malaysia is switched on (T043)

- The category chips above the map and "Latest stories" still come from the home region when the map is looking at Malaysia. Malaysia's two extra categories (market, place of worship) have no chip.
- The tick list of seventeen facts is long on a phone; grouping it needs a field in the region file.
- Opening hours: the server returns none, so every stop reads "hours not known, check before you go".

## Landing of 24 November 2026

- **Next.js 16.4.6** (PR #131): `next` and `eslint-config-next` from 16.4.3, the November security release. Type checks, eslint, 4,697 tests and the build passed; production reports `next.version` 16.4.6 and the map opened on a phone and a desktop screen with no console error.
- **Stage 1 to 4 code, switched off** (PR #132, T003, T042): two commits, code and documents. The documents were made neutral first: they describe Malaysia coverage and the trip agent with a sample route and test dates, and no real person's trip. Checked before landing: both type checks, eslint, 5,455 tests, the production build.
- **Production, in order**: Convex functions deployed (new indexes `placeFact.by_sourceId`, `tripShare.by_code`, `tripShare.by_ownerPersonId`); `places.backfillMapCell` run, and every one of the 5,276 places had a map cell within a minute; then the site deployed.
- **Looked at on production**: the map loads by cell on a phone and a desktop screen, zoomed out and zoomed in, with no console error. `/en/trip`, `/en/trip/new`, `/ja/trip` and a made-up shared link return 404. The privacy notice and terms show no Malaysian, reports or trips part, and `/en/privacy/ms` is a 404, as they should while the switches are off.
- **The data-law position (T018, T137)**: written into the constitution (3.1.0) on the owner's instruction to work it out: Noren treats Malaysia's Personal Data Protection Act 2010, as amended in 2024, as applying to its Malaysian coverage. The notice parts, their sources and what is still open are in `notice-draft.md`.
- **Convex usage**: the team that holds Noren is on the Free plan and over its November database I/O allowance (3.4 GB of 2 GB across its projects; Noren 2.6 GB, nearly all on 4 and 5 November). Noren's daily I/O since 9 November is 4 to 20 MB. The allowance resets on 1 December. Seeding the Malaysian towns (T040, T043) waits for that or for a plan change.

## Seeding and the switch-on release, 24 November 2026

- **Budget (T039)**: the owner chose to seed at once on the Free plan, though the team was over its November database I/O allowance. OpenStreetMap only for now; Overture for the thin towns is left for later.
- **OpenStreetMap (T040, T043)**: 16,023 entries in the 12 town boxes (Overpass answered 502 for a while; the daily cache let the fetch resume). The publish step kept 6,444 visitor-facing places: 2,861 restaurants, 1,094 places of worship, 633 cafés, 625 places to stay, 486 sights, 408 shops, 144 markets, 100 bars, 66 museums, 19 galleries, 8 music shops; 195 chain branches marked, 42 duplicates dismissed. Seeded on dev first, then production; every place has a map cell.
- **Names in other scripts (T041)**: 5,111 places are named in Latin script only, 1,044 in Latin and Chinese, 270 in Chinese only, 18 with Tamil beside another script, none in Tamil only. A Chinese-only place opened in English and in Japanese shows its name.
- **Found on the way and fixed**: a Malaysian place's slug clashing with a Nagasaki one stopped the production publish; slugs are now unique across regions (PR #135). Place pages said "in Nagasaki" for Malaysian places, and the map panel kept Nagasaki's chips and stories over Malaysia; both now follow the place or the view. A 69-character index name was refused by production (PR #136, with a test for the limit).
- **Convex I/O (PR #134)**: seven fixes for functions that read far more than their answer needs (map-copy triggers, the nightly story job, the checker's retries, the home page's missions, the daily slip, candidate uniqueness, the attach batch).
- **The release**: Malaysia enabled, the trip agent open to every signed-in member, members' reports on, documents version 2026-11-24. The by-hand steps that need a signed-in account (T104, T106, T122, T123) are for the owner on the deployed site.
