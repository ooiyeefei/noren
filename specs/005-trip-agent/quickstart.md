# Quickstart: proving the trip agent works

This is a validation guide. Details are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

```sh
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm test
npx tsc -p convex/tsconfig.json
npx eslint --no-warn-ignored --ignore-pattern '.scratch/**' --ignore-pattern '.worktrees/**' .
pnpm build
```

Signed-in pages can only be seen on the deployed site, because production Clerk keys are refused on localhost. The region switch is how they are seen first. Run any end-to-end check against production with `--workers=2`.

## Stage 1: one map, more coverage

### Automated checks

| Proves | Where | Expected |
|---|---|---|
| Two region files load; the home region supplies app-wide settings | `tests/unit/region-registry.test.ts` | Both ids are registered; with `REGION_ID` unset the home region is Nagasaki; every existing Nagasaki test still passes |
| Region file rules | `tests/unit/region-schema.test.ts` | A road point no segment reaches is refused; a fact with neither `meets` nor `fails` is refused; `nagasaki.json` is valid unchanged |
| `mapCell` | `tests/unit/geohash.test.ts`, `convex/mapCopies.test.ts` | Known pins give known cells; moving a pin changes the cell; a place with no pin has none |
| The map loads by view | `convex/places.test.ts` | `inCells` returns only places in those cells, never more than the caps, and never a place the caller may not read; 33 cells are refused |
| A place is found across regions | `convex/places.test.ts` | `bySlug` finds a Malaysian and a Nagasaki place; an importer refuses a slug the other region uses |
| Names | `tests/unit/osm-tags.test.ts`, `tests/unit/region-names.test.ts` | `name:ms`, `name:zh` and `name:ta` are kept with scripts `latin`, `hanzi` and `tamil`; an English reader gets the Latin name first |
| Nothing leaks the wrong way | `convex/regions.test.ts` | With one place in each region: Plan my day, walk mode and the collection in Nagasaki never return the Malaysian place; the sitemap lists both |

### By hand, on dev then production

1. Open the map zoomed out. See a marker for each town in Japan and in Malaysia, and no "switch region" control anywhere.
2. Press Ipoh. The map zooms in and places appear, each "Not yet confirmed" with its source behind the button.
3. Pan from Ipoh to Taiping. Places load as you go; the network tab shows cell queries, not one whole-region query.
4. Open a place whose only name is in Chinese characters. The page, the share card and the search result all render.
5. Open `/ja/places/{a Malaysian slug}`. The page is in Japanese with the place's own names.
6. Read the notice in English, then the Malay version. Both name Malaysia and where data goes.

## Stage 2: the engine

### Automated checks

All in `tests/unit/trip-*.test.ts`, with the 20 parties in `tests/fixtures/trip-parties.ts` and a fixed candidate set in `tests/fixtures/trip-world.ts`. Each party is planned with five seeds.

| Proves | Expected |
|---|---|
| Invariants 1 to 7 of [contracts/engine.md](./contracts/engine.md) (SC-302) | No fault in any of the 100 plans. One fault is a bug, not a number |
| Same seed, same plan (invariant 9) | Byte-for-byte equal output |
| One answer changed (SC-303, invariant 10) | For each of at least 12 pairs (add a traveller who needs step-free; add a toddler who rests after lunch; halve the longest drive; change "light" to "full"; add a like), the changed stops are exactly the ones the test names, and each carries the reason |
| Differences where Noren can act, sameness where it cannot (SC-304) | A party with a rule no record can check gets the same stops as one without it, and every stop lists that rule as not checked |
| Turns (SC-306, invariant 6) | Counts differ by at most one; nobody with likes goes a full day without a turn when the day has room |
| A route that cannot be driven | Kuala Lumpur to Alor Setar on day 1 with a five-hour daily limit comes back in `unmet` with three choices, and no plan pretends otherwise |
| Changes (invariants 5, 7 and 8; SC-307) | After "lighten day 2" with two stops done: the done stops and every pin are untouched, day 2 has fewer stops, days 3 and 4 are identical. An op that would break a rule is refused and the plan is unchanged |
| Checks (FR-341 to FR-348) | A member's "steps at the door" removes the place for a step-free traveller; two reports that disagree remove it; a 14-month-old report makes it not known; a listing note changes nothing |
| Nothing ranked (invariant 11) | The engine's inputs hold no rating, count of stories or popularity field, enforced by its types and by a test that such a field on a candidate is ignored |

## Stage 3: the planner

### Automated checks

| Proves | Where | Expected |
|---|---|---|
| The switch and the trial | `convex/trips.test.ts` | Off: not found for everyone. Trial: not found for a member without the flag, works for one with it. The order of checks leaks nothing to a stranger |
| Nothing is stored | `convex/trips.test.ts` | After `trips.plan` and `trips.interpret`, the only new rows are rate-limit counters |
| What the model is sent (FR-336) | `tests/unit/trip-interpret.test.ts` | With a scripted model, the request holds the organiser's message, the outline and the vocabulary, and no party snapshot |
| Suggestions are checked | same | A suggestion whose quoted words are not in the message is dropped; an op naming a missing slot is dropped; a model failure gives `state: "plain"` |
| Reports | `convex/facts.test.ts` | A key outside the list is refused; a second report replaces the first; the writer can remove theirs and a steward can hide any; a hidden fact is not returned; deleting the account removes them; nothing about a report changes a count or an order |
| Device storage | `tests/unit/trip-storage.test.ts` | A bad entry is dropped by itself; caps hold; there is no field for a name, a birth date or free text about a traveller |
| Pages | `tests/unit/trip-ui.test.tsx`, axe | Every stop shows whose it is, what was checked and what was not; no count of turns appears anywhere; no accessibility fault |

### By hand, on production (the owner)

1. Plan the sample route: Kuala Lumpur, Alor Setar, George Town, Ipoh, Kuala Lumpur, five days from Sunday 13 December 2026. Skip every question. A plan appears within two minutes and says it knows nothing about the party (SC-301).
2. Add a made-up party. Read the hard rules back. Plan again within ten minutes of starting.
3. Check day 1. Either the drive north is split with rests inside the limit, or Noren says it cannot be done and offers choices.
4. On three stops, read who each is for, the quotes or "Nobody has written here yet", and the not-checked list.
5. Press "Draw another" on one stop. Only that stop changes.
6. At a real place, tick what you found. See it on the place's page with your name and the day, and in the next plan's checks.
7. With `features.trip` off, every trip address is "not found".

## Stage 4: on the road

| Proves | Where | Expected |
|---|---|---|
| The link | `convex/tripShare.test.ts` | A 24-character code; null for a wrong code, for a deleted owner and when the feature is off; a place made private drops out on the next read; no hard rule's owner in any stored field; deleting removes it in one transaction |
| Out of search | `tests/unit/seo.test.ts` | The shared page is `noindex` and under `PRIVATE_SECTIONS` |

By hand: say "we're tired" on day 2 with two stops done; read what moved; press Undo. Send the link to another phone; they read the plan signed out and see no list of who needs what.

## The first real trips

Afterwards, record in `validation-log.md`:

- SC-309: a trip was made with the plan, changed at least once on the road without starting again, and each adult can point to a stop that was theirs.
- SC-310: the list of every change the party made, and where the owner judges the first plan was generic.
- SC-311: first stories at five or more stops, reports at ten or more.
- What the estimates got wrong against the real drives, since some days are busy (for example Friday 5 February 2027, the eve of Chinese New Year).
