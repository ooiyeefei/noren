# Contract: Region configuration

One JSON file per region under `regions/`, validated with Zod at start-up (invalid config stops the app with a clear error). Adding a region means adding a file and setting that region's keys in the environment; no core code changes (FR-027, Principle VII). Keys and secrets never appear here.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Region key, for example `nagasaki` |
| `name` | per-locale strings | Display names |
| `bbox` | [west, south, east, north] | Search and map bounds |
| `defaultCenter` | {lat, lng, zoom} | Initial map view |
| `locales` | string[] | UI languages, for example `["ja", "en"]` |
| `defaultLocale` | string | Used when none is chosen |
| `nameFallback` | map | Which script to show first per UI language |
| `geo` | object | `mapStyle` adapter and URL; `search` adapter chain; `countrycodes`; attribution list |
| `enabledSourceAdapters` | string[] | Platforms offered to creators |
| `cautionVocabulary` | [{ key, labels per locale }] | The fixed list of cautions (see below) |
| `consent` | object | `textVersion` and text per locale; required scopes |
| `minimumAge` | number | 16 for Japan |
| `retention` | object | `audioDays`: null means delete audio once the transcript is corrected and claims are confirmed (provisional; second clarify) |
| `takedown` | object | Contact and response targets (acknowledge in 24 hours, decide in 7 days; proposals from the spec) |
| `demo` | object | `publicDemoEnabled`, mock account labels |
| `legal` | object | `operatorName` (working assumption: the project owner), `launchPackComplete` (false until the launch pack exists) |

## Nagasaki starter vocabulary

`closed_days` (closed days or irregular hours), `cash_only`, `reservation_required`, `english_support` (English menu or English spoken), `small_space` (small space or limited seats), `no_photography` (owner asks for no photography), `accessibility_steps` (steps or accessibility), `seasonal` (seasonal availability). Labels in Japanese and English are for a Japanese speaker to review; until then they show as unreviewed.

## Rules

- `launchPackComplete: false` forces: invite-only accounts, noindex on every page, no `pilot` visibility, real businesses in `draft` only.
- Malaysia would add `ms` and `zh` locales, its own caution labels, its minimum age and consent text, and its own geo adapter chain, as new data only.
