# Data model: Neighbourhood noren collection

Decisions behind this are in [research.md](./research.md). All tables follow `convex/_generated/ai/guidelines.md`, and all writes go through the gate in `convex/lib/gate.ts`.

## New tables (`convex/tables/collection.ts`)

### collectionSet

One neighbourhood's collection.

| Field | Type | Notes |
|---|---|---|
| `regionId` | string | |
| `neighbourhoodId` | string | Must exist in the region's `neighbourhoods` |
| `names` | record of locale to string | Every region locale required |
| `panelCount` | number | Copied from `collection.panelsPerSet` when created, and fixed after that |
| `status` | `"draft"` or `"live"` | |
| `wholeArtId` | optional storage id | Returned only to someone who has finished |

Indexes: `by_regionId_and_status`, `by_regionId_and_neighbourhoodId`. One set per neighbourhood (FR-101).

### collectionPanel

| Field | Type | Notes |
|---|---|---|
| `setId` | id of `collectionSet` | |
| `index` | number | 0 to `panelCount - 1` |
| `artId` | optional storage id | Returned only to someone who has dyed this panel |

Index: `by_setId_and_index`.

### collectionPlace

Which places fill which panel. One to three per panel (FR-101), and a place belongs to at most one panel.

| Field | Type | Notes |
|---|---|---|
| `setId` | id of `collectionSet` | |
| `panelIndex` | number | |
| `placeId` | id of `place` | |
| `pickedLineEn` | optional string | English text of a live sentence, chosen by a steward (R6) |

Indexes: `by_placeId`, `by_setId_and_panelIndex`.

### personCollection

One row per person, created with the person (R2).

| Field | Type | Notes |
|---|---|---|
| `personId` | id of `person` | |
| `visits` | array of `{ placeId, setId, panelIndex, day }` | One entry per place, the first visit. `day` is `YYYY-MM-DD` in the region's offset. No time of day and no coordinates |
| `badges` | array of `{ setId, names, wholeArtId, finishedOn }` | Copies the set's names and art so the badge survives later changes (FR-110) |

Index: `by_personId`.

A panel counts as dyed when any visit has its `setId` and `panelIndex`. The visit stores these so that swapping a place later doesn't undo a panel.

## Changed tables

- **person**: add optional `nameConfirmedAt` (R13). Deletion replaces `tokenIdentifier` and `clerkUserId` with `deleted:<personId>`, which keeps the unique rules and `.unique()` lookups working.
- **place**: no new fields. A new member's `onMap` place is stored as `draft` with `sharedAt` set (R11).

## Region config (`regions/nagasaki.json`, schema in `src/lib/region/schema.ts`)

```json
{
  "collection": {
    "panelsPerSet": 6,
    "checkInMetres": 50,
    "accuracyAllowanceMetres": 30,
    "utcOffsetHours": 9,
    "newAccount": {
      "days": 7,
      "perDay": { "story": 5, "place": 3, "post": 5, "preview": 20, "draft": 3, "check": 10, "report": 3 }
    }
  },
  "legal": {
    "accountsOpen": false,
    "documentsVersion": null
  }
}
```

The established-account limits stay in `CONTRIBUTIONS_PER_DAY` in `convex/lib/rateLimit.ts`, with `check: 100` and `report: 20` added.

Rules:

- `accountsOpen: true` needs non-null `documentsVersion`, `operatorName` and `takedown.contact`.
- `/terms` and `/privacy` answer 404 while `documentsVersion` is null.
- `launchPackComplete` is unchanged and stays false.

## Rules for a check-in

```text
press "I'm here"
  ├─ signed out            → ask to sign up (or sign in while accounts are closed); nothing read
  ├─ location read fails   → say what to do next; nothing recorded (FR-106)
  ├─ too far               → show the distance and the limit; nothing recorded (FR-106)
  └─ within reach          → collection.checkIn(placeId)
        ├─ place already in visits → unchanged, returns "already"
        ├─ panel already dyed      → adds the visit and stamp, panel unchanged
        └─ panel not dyed          → adds the visit, panel dyes
              └─ last panel        → adds the badge, once
```

Within reach means: `distance - min(accuracy, accuracyAllowanceMetres) <= checkInMetres`.

The mutation refuses a place that isn't in a live set, a place the caller can't read, and a demo account at a real place (the same rule as `checkablePlace` in `convex/checks.ts`). A set goes live only when every panel has art and at least one public place with a pin.

## Stamp book

`earliestByPlace` in `convex/stampBook.ts` gains a fourth source, the caller's visits, using `Date.UTC` of the visit's `day` (R3). It still takes no person argument and returns no total.

## Account deletion

`people.deleteMine` runs for `role === "user"` only. The person's row changes first, in the same transaction, and any remaining rows continue through a scheduled internal mutation.

| Record | What happens |
|---|---|
| `personCollection` | Deleted: check-ins, panels and badges |
| `person` | Kept as an empty row: name "Former member", `publicProfileUrl` cleared, identity fields set to `deleted:<id>` |
| `story` by them | Deleted. No table refers to a story by id |
| `source` added by them | Hidden through the same steps as `sources.remove`, including `eraseFoundPost`, because AI story citations may point at it |
| `placeCheck` by them | Deleted |
| `note` by them | Deleted, along with its `noteTranslation` rows |
| `place`, `pin`, `placeName` they made | Kept as facts about a place. The link to them now points at the empty row, so no name shows. The privacy notice says this |
| `auditLog` | Kept. Entries point at the empty row, so they no longer identify anyone |
| `rateLimit` | Left to expire in place. Keys hold an id only |
| Clerk user | Deleted by the route, after the steps above |

The build step checks this table against every `v.id("person")` field in `convex/tables/`.

## First set: Shinchi

The picture is the original art from the mock. The panels use the places from the mock, spread out so one spot can't reach most of them.

| Panel | Place | Slug in Noren |
|---|---|---|
| 1 | 音楽喫茶 わたべ | `overture-1c8dd8760834` |
| 2 | ワンワン. 1·1 | `wan-wan-1-1` |
| 3 | 中華菜館 福壽 | `osm-node-4585400452` |
| 4 | アンティークきもの べっぴん | `overture-bf3b20b23aaf` |
| 5 | 三栄製麺 | `osm-node-7106000584` |
| 6 | 泰安洋行 or 京華園 | `osm-node-7106000576`, `osm-node-4585400451` |

Picked lines are chosen by a steward on the deployed site, so they stay empty until then.
