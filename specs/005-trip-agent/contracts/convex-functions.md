# Contract: Convex functions

No function here takes a person as an argument; the caller comes from the verified token. No function stores a party, a purpose, a chat or a plan, except `tripShare.create`, which stores what the organiser chose to share. Errors are `ConvexError` codes, because production redacts messages.

## The map, for everyone

### `places.inCells({ cells, category? })` query

The public places in `cells`, in regions that are switched on. A cell is a geohash of 5 characters or of 4, all of one length in a call: a 5-character cell is read by equality on `mapCell`, a 4-character cell as a range on the same index (`mapCell` from the cell up to the cell followed by `~`). At most 32 cells, and at most `MAP_PLACE_LIMIT` (5,000) places in all, with the warning `listForMap` logs when the cap is reached. Returns the row shape `places.listForMap` returns today, so the map's components do not change. A signed-in member also gets what they may read, as now. A place whose region is off is never returned (Principle VII, FR-349).

### `places.coverage({})` query

The towns of every region file that is switched on: id, names, centre, radius. No counts. Used for the markers the map shows when zoomed out.

### `places.bySlug({ slug })` query

The place with that slug in any region that is switched on, or null. A place whose region is off is not found, whoever asks. Replaces `places.getBySlug({ regionId, slug })` on the place page, the sitemap and the takedown form.

## Practical facts

### `facts.forPlace({ placeId })` query, for everyone

Live facts for a place the caller can read, at most 60: key, value, basis, day, the reporter's display name or the post's source and quote, and whether the record is older than the region's limit. A hidden or removed fact is not returned.

### `facts.report({ placeId, key, value })` mutation, signed in

A member who has been there says what they found. Refused when `features.facts` is off (it is turned on in the same release as the `facts` part of the notice), the key is not in the region's list, the place is not readable, a real account reports at a demo place or a demo account at a real place, or the daily limit is reached. Replaces the caller's earlier report of the same key at that place. Writes an audit entry.

### `facts.remove({ factId })` mutation, signed in

The writer removes their own report.

### `facts.hide({ factId, reason })` mutation, steward

Hides a report or a fact taken from a post. Writes an audit entry. A takedown with target type `fact` calls the same path.

## Trips (behind `features.trip`)

Every function below answers "not found" when the switch is `"off"`, and when it is `"trial"` and the caller's `person.trials` does not hold `"trip"`. The one exception is `tripShare.read`, which anyone with the code may call whenever the switch is not `"off"`. The order of checks is the planner's (`convex/planner.ts`): the switch, then sign-in, then the trial, then the limits, so a stranger learns nothing.

### `trips.plan({ request, consentVersion })` action

`consentVersion` is `TRIP_CONSENT_VERSION` from `src/lib/trip/consent.ts`, sent when the organiser presses a button whose text says what is sent and where. `trips.begin` refuses a plan or interpret call without the current version (`invalid_input`) and records `person.tripConsent = { version, at }` the first time a version is accepted; account deletion clears it (constitution 3.1.0, Malaysian sensitive data).

`request` is the engine's `TripRequest` ([engine.md](./engine.md)) without `World`. The action validates sizes, loads the region's settings, reads the candidates for each town on the route through the internal query `trips.candidates`, runs the engine with a random seed (or the seed given), and returns the `Plan` and the seed with each stop's public details: names, category, pin, whether it is confirmed, and up to two quotes with their sources (members' stories first, then found posts, as on the place page). It calls no model. It writes nothing but its rate-limit counters: a trip's draw does not add to the exposure counts that tilt other people's draws, so a party's plan changes nothing anyone else is shown (FR-334). It reads those counts, so quiet places still get their turn.

Limits: 30 a minute and 300 a day a person (FR-343). Sizes: 7 days, 8 travellers, 12 pins, 20 ops.

### `trips.stops({ placeIds })` query

The present public details of the stops of a plan kept on the device, at most 84 places: names, category, pin, whether confirmed, up to two quotes with their sources, and what each met check rests on. A place that is no longer public comes back null, so the page can mark the stop as gone. The plan page calls it each time a plan is opened; quotes are never written to the device, so a removed story leaves every plan at once. `trips.plan` and `tripShare.read` use the same helper (`convex/lib/tripStops.ts`).

### `people.current` (existing query) also returns `trip: boolean`

True when the caller can open trips. The account menu shows "Plan a trip" from it.

### `trips.interpret({ messages, outline, language, consentVersion })` action

Turns the organiser's words into suggestions. `messages` is at most 8 turns of 700 characters, as for the planner. `outline` is the plan as day, slot, place name and kind, or empty before a plan exists. Returns:

```ts
{
  proposals: { about: string; kind: "rule" | "like" | "skip" | "rhythm" | "limit"; tag: string; minutes?: number; saidAs: string }[],  // at most 6
  questions: { id: string; ifYes: Proposal; ifNo?: Proposal }[],     // at most 3
  ops: { op: ChangeOp; saidAs: string }[],                          // at most 6
  state: "ai" | "plain"
}
```

`about` is the organiser's own words for a traveller ("my mum"); the device matches it to a traveller and asks when it cannot. Code drops any item whose `saidAs` is not in the latest message, whose tag is not in the vocabulary, or whose op names a slot not in `outline`. If the model fails, `state` is `"plain"` and the lists are empty; the page still offers the buttons.

A question's `id` names one of a fixed list of questions in `src/lib/trip/vocabulary.ts`, whose wording people wrote and which is held in the messages file. The model only chooses which of them are worth asking; code drops an `id` that is not on the list. No sentence written by the model reaches the screen (Principle V, FR-314).

The model is sent `messages`, `outline` and the vocabulary. It is not sent the party snapshot.

Limits: 5 a minute and 40 a day a person. Needs `AI_MODEL_PLAN`; when it is unset the action answers `conflict` and spends no slot.

### `tripShare.create({ deviceTripId, title, days })` mutation

Makes or replaces the link for one trip and returns its code. Limits: 20 a day, 50 kept.

### `tripShare.read({ code })` query, for anyone with the code

The shared plan, or null when the code is unknown, the feature is off, or the owner is gone. Each read drops a place that is no longer public and looks quotes up afresh, so a removed story leaves at once.

### `tripShare.remove({ code })` mutation, the owner

Deletes the row; the link stops working in the same transaction. Deleting an account deletes its links.

## Internal

- `people.setTrial({ clerkUserId, trial, on })`: adds or removes a trial on a person's row. Run from the command line by the owner. Writes an audit entry.
- **Revised 24 November 2026 after measuring:** the read is split so no one query passes Convex's limit on index ranges. `trips.candidatePlaces` reads one anchor's places, `trips.candidates` reads the details of a batch of up to 50 places, and `trips.candidateExposure` reads two weeks of exposure counts once. Worst case measured on test data (12 anchors of 400 places): about 3 seconds for a plan. What follows describes the three together.
- `trips.candidates({ regionId, anchors })`, an internal query: for each anchor (a pin and a radius), the public places in the cells that cover it, with category, pin, `confirmedAt`, `hasStory`, recent exposure, published cautions when they may be shown, and live facts. At most 12 anchors and 400 places an anchor.
- `places.backfillMapCell({ cursor })`: fills `mapCell` in batches and schedules its own continuation.

## Unchanged

`api.plannerActions.ask`, `api.connector.*` and `api.places.listForMap` keep their contracts. Plan my day and walk mode are untouched.
