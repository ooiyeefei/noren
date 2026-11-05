# Contract: Convex functions

Nothing in this contract takes a person as an argument except the steward role check, which reads the verified token. No public function returns another person's progress.

## Public, no account needed

Signed-out callers get the same shape with nothing dyed.

### `collection.book({ regionId })`

The list of live sets and the caller's badges.

```ts
{
  sets: {
    id, neighbourhoodId, names, center, panelCount, dyedCount,
    panels: { index, dyed, artUrl }[], // artUrl only for panels the caller has dyed
  }[],
  badges: { setId, names, wholeArtUrl, finishedOn }[], // empty when signed out
}
```

`dyedCount` is always 0 when signed out.

### `collection.set({ regionId, neighbourhoodId })`

One set with its panels, or null when it has none. A draft is visible only to a steward.

```ts
{
  id, neighbourhoodId, names, status, panelCount, center, finished: boolean,
  finishedOn: string | null,       // YYYY-MM-DD
  wholeArtUrl: string | null,      // only when finished
  panels: {
    index,
    dyed: boolean,
    artUrl: string | null,         // only when dyed by the caller
    places: { placeId, slug, names, pin, line: { en, ja, postsRead } | null }[],
  }[],
  lastVisitedPlaceId: Id<"place"> | null, // the most recent entry in the caller's visits, for R7
}
```

`places` leaves out anything the caller can't read. A panel may therefore show no places while a steward replaces one. `line` is the picked line if it is still live, otherwise the first live sentence, otherwise null (FR-116).

### `collection.forPlace({ placeId })`

What the place page needs. Returns null when the place isn't in a live set.

```ts
{
  setId, neighbourhoodId, setNames, panelIndex, panelCount,
  visited: boolean,     // the caller has checked in here
  panelDyed: boolean,
  dyedPanels: number[], // the caller's own, for the small progress marks on the card
  pickedLine: { en, ja, postsRead } | null, // only when picked and still live (FR-117)
}
```

## Member

### `collection.checkIn({ placeId })`

Takes no coordinates (R1).

```ts
{
  outcome: "dyed" | "already_dyed" | "already_here",
  setId, panelIndex, dyedCount, panelCount,
  finished: boolean,
}
```

Errors, sent as `ConvexError` codes because production redacts messages: `unauthenticated`, `not_found` (not in a live set or not readable), `forbidden` (demo account at a real place).

Writes no audit entry (R2). Adds the badge once, in the same transaction as the last panel.

### `people.setMyDisplayName({ displayName })`

Changes the caller's own name and sets `nameConfirmedAt`. Errors: `invalid_input`.

### `people.confirmMyDisplayName({})`

Sets `nameConfirmedAt` without changing the name, for "Yes, show this name".

### `people.current` (changed)

Adds `nameConfirmed: boolean`.

### `people.ensureCurrent` (changed)

Also creates the `personCollection` row, for a new person and for an existing person who has none. Still takes nothing from the client.

### `people.deleteMine({})`

For `role === "user"` only, called only through the account route. See [the deletion table](../data-model.md#account-deletion). Errors: `unauthenticated`, `forbidden`.

## Changed limits and rules

| Function | Change |
|---|---|
| `lib/rateLimit.limitContribution` | New `check` and `report` kinds. For `role === "user"` in the first 7 days, uses the region's `newAccount.perDay` |
| `checks.confirm` | Calls `limitContribution(ctx, person, "check")`, after the existing no-op for a repeat press in one day |
| `checks.report` | Calls `limitContribution(ctx, person, "report")` |
| `places.create` | A new member's `onMap` place is stored as `draft` and keeps `sharedAt`. Returns `waiting: true` so the form can say so. Refuses with `name_not_confirmed` when the name isn't confirmed |
| `stories.add`, `sources.add` | Refuse with `name_not_confirmed` when the name isn't confirmed |

## Steward

All use `requireRole(ctx, ["steward"])` and `writeAudit`.

| Function | Purpose |
|---|---|
| `collection.listForSteward({ regionId })` | All sets with panels, places, picked lines, and any two places closer than 50 m (FR-114) |
| `collection.swapPlace({ setId, panelIndex, removePlaceId?, addPlaceId? })` | Keeps 1 to 3 places per panel. A place must pass the public and no-chains checks |
| `collection.pickLine({ placeId, en })` | `en` must match a live sentence. Null clears it |
| `collection.setStatus({ setId, status })` | Going live needs art on every panel and a public place with a pin on every panel |
| `places.listWaiting({ regionId })` | Drafts with `sharedAt` and no `hiddenReason` (FR-129) |

Publishing a waiting place uses the existing `places.setVisibility`.

## Internal, CLI only

| Function | Purpose |
|---|---|
| `collection.createSet` | Creates a draft set with panels and places from a checked list |
| `collection.generateArtUploadUrl`, `collection.attachArt` | Used by `scripts/upload-set-art.mts` |
| `collection.repeatVisitTotals` | Returns two totals only, for SC-105 (R17) |
| `people.backfillNameConfirmed` | One-off for members who have already shared (R13) |
| `people.continueDeletion` | Scheduled continuation of `deleteMine` |
