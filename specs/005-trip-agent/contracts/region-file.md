# Contract: the region file

`regions/malaysia-west.json` is new. `src/lib/region/schema.ts` gains the optional fields below, so `regions/nagasaki.json` stays valid as it is. `src/lib/region/registry.ts` imports both files. The home region (Nagasaki's file, or `REGION_ID` when set) supplies everything that is the same for the whole app.

## What stays app-wide (read from the home region)

`locales`, `defaultLocale`, `legal.*`, `features.*`, `sharing.*`, `photos.*`, `voice.*`, `minimumAge`, `takedown`, `demo`, `consent`, `retention`, `collection.newAccount`.

`features.trip` is new there: `"off"`, `"trial"` or `"open"`. So is `features.facts`, true or false: whether members can report what they found.

A region file that is not the home region holds area fields only. The registry lays them over the home region's app-wide settings, so code that asks for a place's region still gets a whole configuration.

`enabled` counts as true for the home region when it is absent, and false for any other. A region named in the `REGIONS_PREVIEW` environment variable also counts as on; that variable is set on the dev deployment and on a developer's machine only, never in production, so a region can be looked at before its notice is live.

## What a region file says about its own area

Existing: `id`, `name`, `bbox`, `defaultCenter`, `geo.countrycodes`, `geo.attribution`, `nameFallback`, `categories`, `cautionVocabulary`, `towns`, `neighbourhoods`, `collection.utcOffsetHours`.

New, all optional:

```jsonc
{
  "enabled": true,                         // a region is on the map only when true (FR-349)
  "nameLanguages": ["ms", "en", "zh", "ta"],
  "towns": [
    { "id": "alor-setar", "names": { "en": "Alor Setar", "ja": "アロースター" },
      "center": { "lat": 6.12, "lng": 100.37 }, "radiusMetres": 6000,
      "state": "kedah", "onRoad": "alor-setar" }
  ],
  "roads": {
    "points": [ { "id": "ipoh", "names": { "en": "Ipoh", "ja": "イポー" }, "pin": { "lat": 4.60, "lng": 101.08 }, "offRoadMinutes": 12 } ],
    "endpoints": [ "ipoh" ],
    "segments": [ { "from": "ipoh", "to": "kuala-kangsar", "minutes": 35, "kilometres": 48, "road": "E1" } ],
    "source": { "text": "Built from OpenStreetMap road data", "builtOn": "2026-11-25", "licence": "ODbL-1.0" }
  },
  "factVocabulary": [
    { "key": "steps_at_door", "labels": { "en": "Steps at the door", "ja": "入口に段差" },
      "fails": ["step-free"], "noMeets": ["step-free"], "labelsReviewedBy": null },
    { "key": "halal_sign", "labels": { "en": "Halal sign or certificate shown", "ja": "ハラール表示あり" },
      "meets": ["halal", "pork-free"], "noFails": ["halal"], "labelsReviewedBy": null },
    { "key": "prayer_room", "labels": { "en": "A prayer room (surau)", "ja": "礼拝室あり" },
      "serves": ["prayer"], "labelsReviewedBy": null }
  ],
  "factMaxAgeDays": 365,
  "calendar": {
    "publicHolidays": [ { "date": "2026-12-25", "name": { "en": "Christmas" }, "states": "all",
                          "source": "Cabinet Division list for 2026", "verified": true } ],
    "schoolHolidays": [ { "from": "2026-12-05", "to": "2026-12-31", "states": ["perak", "penang", "kuala-lumpur"],
                          "source": "Ministry of Education calendar", "verified": true } ],
    "fasting": [ { "from": "2027-02-08", "to": "2027-03-09", "source": "Cabinet Division list, subject to change", "verified": false } ],
    "busyDays": [ { "date": "2027-02-05", "why": { "en": "The eve of Chinese New Year" }, "verified": false } ],
    "weeklyRest": [ { "states": ["kedah"], "days": ["fri", "sat"], "source": "News reports, not confirmed", "verified": false } ]
  },
  "trip": {
    "dayStart": "09:00", "dayEnd": "20:30",
    "minutesAtStop": { "restaurant": 60, "cafe": 45, "museum": 75, "attraction": 60, "shop": 30, "other": 45 },
    "townSpeedKmh": 30, "detourFactor": 1.4, "walkLimitMetres": 800, "roadPointReachMetres": 3000,
    "turnsPerDay": { "light": 2, "steady": 3, "full": 4 },
    "foodCategories": ["restaurant", "cafe"],
    "indoorCategories": ["museum", "gallery", "cafe", "restaurant", "shop", "music_shop"],
    "guesses": { "stretchMinutes": 120, "dayDriveMinutes": 300, "fullness": "steady", "lunch": "12:30", "dinner": "19:00" }
  }
}
```

`roads.endpoints` lists road points where a trip may start or end although no town is seeded there; the trip pages offer the towns and these points as a start and an end, and towns only for nights and towns to pass through.

The roads, towns and calendar above are examples of shape; their real values come from the build steps and from `research/12`. The `trip` numbers above are the starting values for `regions/malaysia-west.json`. A guess never refuses a route: Kuala Lumpur to Alor Setar measured 315 minutes, over the 300-minute guess, so that day is planned and named as over the guess ([engine.md](./engine.md), invariant 3). Every label ships with `labelsReviewedBy: null` until a person has read it.

## The fact list for `malaysia-west`

`meets` and `fails` say what a "yes" does to a rule. `noMeets` and `noFails` say what a "no" does. `serves` names a need (`prayer`, `work`, `rest`) a "yes" serves. How these become a verdict is in [engine.md](./engine.md), "How a rule is checked".

| Key | English label | A yes | A no | Serves |
|---|---|---|---|---|
| `steps_at_door` | Steps at the door | fails `step-free` | meets `step-free` | |
| `level_entrance` | Level way in, no steps | meets `step-free` | fails `step-free` | |
| `ramp` | A ramp at the entrance | meets `step-free` | | |
| `dropoff_at_door` | You can be dropped off at the door | meets `short-walks` | fails `short-walks` | |
| `seats_to_rest` | Seats to rest on | meets `sit-often` | fails `sit-often` | `rest` |
| `shade_to_sit` | Shade to sit in | | | `rest` |
| `quiet_room` | A quiet room or corner | meets `quiet` | | `work` |
| `table_to_work` | A table and Wi-Fi to work at | | | `work` |
| `toilet_on_site` | A toilet for visitors | meets `toilet-near` | fails `toilet-near` | |
| `wheelchair_toilet` | A toilet a wheelchair fits | meets `toilet-near` | | |
| `high_chairs` | High chairs | meets `high-chair` | fails `high-chair` | |
| `halal_sign` | Halal sign or certificate shown | meets `halal`, `pork-free` | fails `halal` | |
| `pork_served` | Pork is served | fails `pork-free`, `halal` | meets `pork-free` | |
| `vegetarian_dishes` | Vegetarian dishes on the menu | meets `vegetarian` | fails `vegetarian`, `vegan` | |
| `vegan_dishes` | Vegan dishes on the menu | meets `vegan`, `vegetarian` | fails `vegan` | |
| `alcohol_served` | Alcohol is served | fails `no-alcohol` | meets `no-alcohol` | |
| `prayer_room` | A prayer room (surau) | | | `prayer` |

Every must-have a party can choose (`src/lib/trip/vocabulary.ts`: `step-free`, `short-walks`, `sit-often`, `quiet`, `toilet-near`, `high-chair`, `pork-free`, `vegetarian`, `vegan`, `halal`, `no-alcohol`) is named by at least one key (FR-344).

## Rules the schema enforces

- `factVocabulary` keys are unique, and each has at least one of `meets`, `fails`, `noMeets`, `noFails` or `serves`.
- `trip.foodCategories` and `trip.indoorCategories` name categories the region has.
- Every `towns[].onRoad` and every `roads.segments[].from` and `to` names a point in `roads.points`.
- Every `roads.endpoints` entry names a point in `roads.points`.
- `roads` is connected: every point can be reached from every other.
- Calendar dates are `YYYY-MM-DD`, `from` is not after `to`, and every entry has a `source`.
- Labels exist in every one of the app's languages.
- A region with `enabled: true` has `towns`, `nameLanguages` and `categories`.
- `trip` numbers are positive and within sane bounds (a day start before its end; speeds between 10 and 80).

## What must not be in a region file

Account identifiers, keys, people's names or anything about a traveller. The trial list lives on `person` rows.
