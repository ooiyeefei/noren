# Contract: pages and routes

Addresses keep their shape: `/{lang}/…` with `lang` one of the app's languages. No address carries a region. Every trip page answers 404 while `features.trip` is `"off"`, and while it is `"trial"` for anyone not on the trial.

## The map (everyone)

- `/{lang}` and `/{lang}/map`: one map. It loads the places in view (`places.inCells`) after each move. Zoomed out, it shows one marker for each town Noren covers (`places.coverage`), in Japan and Malaysia alike, and pressing one zooms in. It opens where it opens today.
- Place search covers every region's area.
- `/{lang}/places/{slug}`: finds the place in any region (`places.bySlug`). New section "What people found here", between the About panel and the stories: each practical fact with who reported it and the day, or the visitor's words with a link to their post. A signed-in member sees "Tell us what you found" with the region's tick list. A record over the age limit is marked as old.
- `sitemap.xml` and `llms.txt` list places from every region that is switched on.

## Trips (signed in)

| Address | What it shows |
|---|---|
| `/{lang}/trip` | The trips on this device: under way first, then planned, then finished. "Plan a trip". A line saying trips are kept on this phone |
| `/{lang}/trip/new` | The questions, in this order, each skippable: where from and to, how many days and when, where you sleep; what the trip is for, what would make it good and what would spoil it; who is coming (one card per traveller: label, age band, needs from a tick list, likes); how you travel (longest drive, most in a day, how full, meals, rest, prayers, work). A box to type or say it in your own words instead, with each thing Noren took from it shown as a suggestion to accept. Then one screen that reads the hard rules back. "Plan now" is on every step |
| `/{lang}/trip/{id}` | The plan, day by day. Per day: weekday, date and what the calendar holds; drives with their estimates and "Open in maps"; stops in order; rests; total driving. Per stop: whose it is in the organiser's label, or the need, pin or wild card; up to two quotes with sources, or "Nobody has written here yet"; what was checked and what it rests on; what was not checked and why; "Not yet confirmed" and "Still here" where they apply; "Draw another", "Skip", "Done", "Tell us what you found". At the top: what Noren could not meet, with choices; a line when a town has no stories; a line when a day is a busy travel day |
| `/{lang}/trip/{id}/change` | The same plan with a box to say what changed, quick buttons ("quieter", "shorter walks", "more for …", "we're tired", "it's raining"), the list of what moved, and "Undo" |
| `/{lang}/trip/{id}/party` | Everything Noren holds about the party and the trip, to change or delete, in one place (FR-311) |
| `/{lang}/trip/{id}/after` | After the trip: what was planned, done, skipped and changed; the stories and reports the party wrote; what Noren noticed, as suggestions |

`{id}` is the trip's id on the device. Opening such an address on another device shows "This trip is kept on the phone it was planned on".

## The shared plan (anyone with the link)

- `/{lang}/trip/shared/{code}`: the plan to read, with the organiser's labels on turns and the checks listed with no traveller named. No account needed. `noindex`, `referrer: same-origin`, and `trip` is added to `PRIVATE_SECTIONS` (`src/lib/seo/site.ts`).

## Notice and terms

- `/{lang}/privacy` and `/{lang}/terms`: new parts shown by the `malaysia`, `facts` and `trip` switches.
- `/{lang}/privacy/ms`: the privacy notice in Malay, linked from the English notice, labelled as not yet reviewed until a Malay speaker has read it.

## Entry points

- Account menu: "Plan a trip", shown only to people who can open it.
- Place page and map: nothing new for people who cannot open trips.
- Steward pages: reports and found-post facts appear in the existing hide and takedown queues.

## States every trip page handles

Signed out (sign-in, then back); not on the trial (404); no trips yet; planning in progress; the engine could not meet something (choices shown); the AI step failed (buttons still work, a plain line says typing is not being read just now); no connection (the last plan shows, changes wait); a stop's place is gone (marked, with "Draw another").

Each page is checked on a phone and on a desktop screen before it is called done.
