# 01 - Maps, geocoding, tiles, place search (research lane)

Access date for every source in this file: **2026-10-29** (today). Facts were read from primary pages (official docs, ToS, licence files, source repos, official GitHub issue replies). Anything I could not confirm from a primary source is marked **UNVERIFIED**. This is research, not legal advice.

Project constraints used to judge each item: open-source app; region is configuration (Nagasaki now, Malaysia later: Malay/Chinese/English names); a human pins each place on the map by hand; stories not scores; seed data must be real; demo content only under an explicitly labelled mock user; plan to rely on the stack for about 3 years.

## Summary table

| # | Item | What it does for us | Cost today | Verdict | Why (one line) |
|---|------|---------------------|-----------|---------|----------------|
| 1 | Google Maps JavaScript API | Interactive map where users drop the pin | 10,000 free map loads/month, then $7.00 per 1,000 | **avoid** (as default) | Proprietary, billing account per deployer, and it locks Places content to a Google map. |
| 2 | Google Places API (New): Autocomplete, Text Search, Place Details | Place search and details; reviews | Free caps 10,000 / 5,000 / 1,000 per SKU; reviews cost $25 per 1,000 after 1,000 free | **avoid** (as data source) | Only place_id may be stored; lat/lng 30 days; no reviews storage, no AI use, no non-Google map, "no directory service" clause. |
| 3 | Apple MapKit JS | Interactive Apple map in any browser | Free to 250,000 map views + 25,000 service calls per day, needs $99/year membership | **avoid** (as default) | Paid developer account per deployer; map data may only be shown on an Apple map; no caching. |
| 4 | Apple Maps Server API | Server-side search, geocode, autocomplete, place lookup | 25,000 service calls/day (shared with MapKit JS) | **avoid** | Same Apple terms: no storage, no secondary database, must display on Apple map. |
| 5 | Mapbox GL JS v2+ | Vector map renderer | 50,000 free map loads/month | **avoid** | Not open source since v2 (Mapbox TOS licence); MapLibre is the open fork. |
| 6 | Mapbox Search Box / Geocoding API | Place and address search incl. Japan | Temporary geocoding 100,000 free/month; permanent $5 per 1,000, sales contact | **avoid** (for MVP) | Temporary results cannot be stored; permanent only for own use; bans a general POI database and ML use. |
| 7 | MapLibre GL JS | Open-source vector map renderer | Free | **MVP** | BSD-3-Clause, v6.16.0 released 2026-10-25, active. |
| 8 | Protomaps / PMTiles | Single-file OSM basemap you host yourself | Free self-hosted; hosted API free for non-commercial | **MVP** (as the self-host escape hatch) | Static file on cheap storage removes the third-party dependency; but bundled fonts lack CJK glyphs. |
| 9 | OpenFreeMap (public instance) | Free, keyless OSM vector tiles | Free, unlimited, commercial use allowed | **MVP** (default tiles) | Zero keys, MIT, CJK-capable glyphs; risk is one maintainer and no SLA, so keep a PMTiles fallback. |
| 10 | MapTiler Cloud | Hosted tiles and geocoding with SLA option | Free plan non-commercial; Flex $30/month | **later** | Good paid swap-in; free plan forbids commercial use and video export. |
| 11 | OSM standard tile server (tile.openstreetmap.org) | Raster tiles | Free, best effort | **avoid** (production) | Policy allows withdrawal at any time; no offline or prefetch; dev only. |
| 12 | Nominatim (public + self-host) | Search and reverse geocode on OSM data | Free; public API max 1 req/s | **MVP** (default geocoder) | Kanji queries worked in my tests, kana and romaji were lossy; public API forbids autocomplete, so search on submit and self-host later. |
| 13 | Photon | Typeahead search on OSM data | Free; public demo "reasonable use" | **later** | Needed for search-as-you-type but public instance has no Japanese output and returned 0 hits for a kana query; self-host with `ja`. |
| 14 | Pelias | Heavy self-hosted geocoder (OSM, OpenAddresses, WOF, Geonames) | Free software (MIT) | **later** | Candidate for Malaysia's multi-script names; too heavy for MVP. |
| 15 | GSI tiles (国土地理院タイル) | Japanese government raster basemap | Free | **later** | Live use needs only a citation; Japanese labels only (English tile exists only at zoom 5-11). |
| 16 | GSI address search API (AddressSearch) | Japanese address and place-name search | Free | **later** (optional JP adapter) | GSI says it is for GSI Maps and may change or vanish without notice. |
| 17 | Overture Maps Places (extra) | Open places dataset for candidate suggestions | Free download | **later** | Permissive licences (CDLA-Permissive-2.0, Apache-2.0, CC0); Japan coverage UNVERIFIED. |

### Findings that contradict or constrain the plan

1. **"Paste Google Maps review URLs and import them" cannot be done through Google's API.** Places returns at most 5 reviews per place, sorted by relevance, with a star `rating` on each. Google's terms forbid copying or saving user reviews, caching Places content (only place_id, and lat/lng for 30 days), and using Google content to train, test, validate or fine-tune ML models or to create content based on it. Review text may only be shown live with author attribution and a Google link. Claims extraction by AI from Google review text is therefore not allowed through the official API route. (Scraping Google is out of scope for this task and for the project rules.)
2. **Google "No Creating Content From Google Maps Content" plus "no listings or directory service"** is a risk for a place-page product even if we only store place_id.
3. **Open-source plus proprietary map SDKs do not mix as defaults.** Google, Apple and Mapbox all need every fork to hold its own account (Apple: $99/year; Google: billing-enabled project) and all forbid storing or redistributing their data, so they cannot feed an open dataset.
4. **Nominatim's public API forbids autocomplete** (policy text: "you must not implement such a service on the client side"). The "pin by hand" flow is compatible (search on submit); typeahead needs Photon or self-hosting.
5. **The Protomaps basemap's bundled font assets contain no CJK glyphs** (measured: the CJK range file in `protomaps/basemaps-assets` is 29 bytes; OpenFreeMap's is 192,358 bytes). Japanese labels on a self-hosted Protomaps map need glyph hosting or MapLibre's `localIdeographFontFamily`.
6. **GSI's address search is not a supported public API.** GSI's own reply says server-side features such as place-name search are mainly meant for GSI Maps, may stop being provided, and may change without notice.
7. **Romaji search is lossy even on OSM.** "Meganebashi Nagasaki" returned a tram stop in Nominatim and Photon and did not return the famous 眼鏡橋 at all (see "Real queries"). A human pin must stay the source of truth for location.
8. **Nominatim's usage policy has a clause addressed to LLMs**: LLMs may only suggest the service if they prominently point to the policy and explain its restrictions. This file does so: https://operations.osmfoundation.org/policies/nominatim/ (max 1 req/s, identifying User-Agent, no autocomplete, no systematic or bulk queries, cache results, attribution, ODbL).

---

## 1. Google Maps JavaScript API

**(a) What it does for us.** Interactive map in the browser with markers, click-to-pin, and the Places widgets. SKU: **Dynamic Maps**, billed per successful map load.

**(b) Auth / onboarding.** Needs a Cloud project with billing enabled, enabled APIs, and an API key to restrict (Get started page). Google Cloud offers a $0-charge trial that ends after 90 days or $300 of charges. The Get started page summary still advertises "a $200 monthly credit", which is stale: the billing overview says the credit was replaced by free usage caps on 2025-03-01 (see below).

**(c) Free tier and pricing (pricing page "Last updated 2026-10-28 UTC").** Dynamic Maps (Essentials): 10,000 free map loads per month, then $7.00 per 1,000 up to 100,000, falling through $5.60, $4.20, $2.10, $0.53 per 1,000 at higher volume tiers. Static Maps: 10,000 free, $2.00 per 1,000. Since 2025-03-01 each SKU has its own monthly free cap (Essentials about 10,000, Pro 5,000, Enterprise 1,000; resets on the 1st at midnight US Pacific) and the old $200 monthly credit is gone. Subscriptions are an alternative: Starter $100/month for 50,000 combined calls, Essentials $275/month for 100,000, Pro $1,200/month for 250,000.

**(d) Stability / longevity.** No multi-year free or credit commitment found; free caps can change with the price list. Policy: deprecations normally run about 12 months, Legacy services get at least 12 months notice. History: March 2025 pricing change; Places API (Legacy), Directions (Legacy), Distance Matrix (Legacy) became Legacy on 2025-03-01 and are not available in new projects; Heatmap Layer deprecated 2025-05-27 and unavailable from May 2026; KmlLayer removed from 2026-04-30; `google.maps.Marker` deprecated February 2024 in favour of `AdvancedMarkerElement`. Expect forced migrations roughly every year or two.

**(e) ToS on caching, storing, redistributing, AI.** Maps Platform Terms (last modified 2026-08-26), section 3.2.3: no scraping (explicitly no pre-fetch, index, store, reshare or rehost; no copying and saving business names, addresses or user reviews); no caching except as allowed in the Service Specific Terms; no creating content from Google Maps Content, including "use Google Maps Content to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune the models"; no re-creating Google products, including "use the Google Maps Core Services in a listings or directory service"; no use with a non-Google map (Places content may not be shown on a non-Google map). Section 3.2.2: the app's own terms must notify users and point to the Google Maps End User Additional Terms and Google Privacy Policy; attribution may not be removed. Pre-GA features can change without notice.

**(f) Licence compatibility.** Closed service; no code licence is forced on our repo. But every self-hoster must accept the Google terms with their own billing account, and nothing from Google can enter an open dataset.

**(g) Japanese / Malay / Chinese.** Japanese, Malay and Chinese (Simplified and Traditional) appear in Google's supported-language table (FAQ page). Quality benchmarks: **UNVERIFIED** (no primary source).

**Demo / video rules.** Google's geo guidelines: an online video made primarily for educational, instructional, recreational or entertainment use needs no permission but must follow the attribution rules; a promotional or advertising video must be submitted for approval; you may not alter the look of the product or remove attribution. A hackathon pitch video is arguably promotional: ask or avoid.

**(h) Verdict: avoid as the default.** Excellent product, wrong fit for an open, region-configurable, store-your-own-data project. Optional later adapter only for a deployer who accepts the terms.

## 2. Google Places API (New): Autocomplete, Text Search, Place Details

**(a) What it does for us.** Search by text (`languageCode`, `regionCode` supported), autocomplete, and place details including `displayName`, `location`, `formattedAddress`, `googleMapsUri`, and (Enterprise + Atmosphere) `reviews`, `rating`, `reviewSummary`.

**(b) Auth / onboarding.** Same as item 1 (billing-enabled Cloud project, API key). Places API (Legacy) is not available in new projects, so only the New API is an option.

**(c) Free tier and pricing (2026-10-28 price list; first paid tier per 1,000, after the monthly free cap).**

| SKU | Free per month | Price per 1,000 |
|---|---|---|
| Autocomplete Requests (Essentials) | 10,000 | $2.83 |
| Autocomplete Session Usage | unlimited | no charge (see session rule below) |
| Text Search Essentials (IDs Only) | unlimited | - |
| Text Search Pro | 5,000 | $32.00 |
| Text Search Enterprise | 1,000 | $35.00 |
| Place Details Essentials (IDs Only) | unlimited | - |
| Place Details Essentials | 10,000 | $5.00 |
| Place Details Pro | 5,000 | $17.00 |
| Place Details Enterprise | 1,000 | $20.00 |
| Place Details Enterprise + Atmosphere (includes `reviews`) | 1,000 | $25.00 |
| Nearby Search Pro / Enterprise | 5,000 / 1,000 | $32.00 / $35.00 |
| Geocoding | 10,000 | $5.00 |
| Places UI Kit Query / Autocomplete per session / UI Kit Pro | 10,000 / 10,000 / 5,000 | $1.00 / $10.00 / $5.00 |

Session rule from the SKU page: if a session ends with a Place Details request using only Essentials fields, the first 12 Autocomplete requests are billed as Autocomplete Requests and the rest as Session Usage; ending with an IDs-Only request is treated like no session (all billed as Autocomplete Requests); a session ended with a call requesting any Pro or Enterprise field bills that call at Enterprise + Atmosphere. The field mask drives the price: the highest SKU among requested fields is charged. Volume tiers drop the price by about 20% at 100,000, then further at 500,000, 1M and 5M.

**(d) Stability / longevity.** See item 1. Legacy move on 2025-03-01 shows the pattern: old Places endpoints frozen, new ones repriced.

**(e) ToS limits.**
- **place_id:** exempt from the caching restriction and may be stored (Places docs: "Place IDs are exempt from the caching restrictions ... You can therefore store place ID values for later use"; Service Specific Terms A.3). Google recommends refreshing IDs older than 12 months, free via a Place Details call requesting only the ID field. Obsolete IDs return NOT_FOUND.
- **lat/lng:** Service Specific Terms 14.3: "Customer may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values." Nothing else (names, addresses, ratings, photos, reviews) may be cached.
- **Non-Google maps:** 14.2 "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map." 14.1 allows use without a map. Places UI Kit (15.1) is the exception that may be used with or without any map, including a non-Google map; UI Kit lat/lng caching is the same 30 days.
- **Attribution (Places policies page):** Google Maps logo (minimum height 16dp, maximum 19dp) or text "Google Maps" when space is tight; results must be on a Google Map with the logo, or show the logo when no map; never remove included attribution; third-party attributions must be shown as returned. Photos and reviews: always credit the author (avatar, name, profile link; for reviews at minimum the avatar when space is limited), link each item to `googleMapsUri`, show a notice on how reviews are ordered and filtered, show a notice when a review is translated (offer `originalText`), show `visitDate` for places in France, report link `flagContentUri` recommended.
- **Reviews:** the Place resource says `reviews[]` is the "List of reviews about this place, sorted by relevance. A maximum of 5 reviews can be returned." Each review carries `text`, `originalText`, `rating` (1.0 to 5.0), `authorAttribution`, `publishTime`, `googleMapsUri`, `flagContentUri`, `visitDate`. They can be **shown** live under the attribution rules above; they cannot be **stored** (Terms 3.2.3(a)(iii) bans copying and saving user reviews; caching bans) and cannot be **AI-processed** into stored claims (3.2.3(c)). Each review's rating field comes with it, which conflicts with "stories not scores" unless the UI hides it.

**(f) Licence compatibility.** Same as item 1: nothing forced on our code; our data cannot include Google fields beyond place_id.

**(g) Japanese / Malay / Chinese.** `languageCode` accepted; supported-language table lists ja, ms, zh. Real-world quality for tiny Nagasaki businesses: **UNVERIFIED**.

**Demo / video.** Showing Places data in a demo means live calls with logo and attribution on a Google map; stored copies are not allowed even for a demo.

**(h) Verdict: avoid as a data source.** Only place_id is safely storable, and reviews cannot feed the claims pipeline.

## 3. Apple MapKit JS

**(a) What it does for us.** Embeddable Apple Maps in web pages "across platforms and operating systems, including iOS and Android" (developer.apple.com/maps/web), with annotations, overlays, built-in search and geocoding services.

**(b) Auth / onboarding.** Apple Developer Program membership (US$99 annual per developer.apple.com/programs), a Maps ID, a private key, and server-side signed JWTs (the key must stay off the client). Keys are created in the Certificates, Identifiers and Profiles portal; whether a free (non-paid) Apple developer account can create MapKit JS keys is **UNVERIFIED**, so budget for the $99/year membership. Apple publishes the private key for download once only.

**(c) Free tier and pricing.** "MapKit JS provides a free daily limit of 250,000 map views and 25,000 service calls per Apple Developer Program membership." Snapshots: 25,000 unique requests per day. More capacity: contact Apple. No price list for overage found (**UNVERIFIED**).

**(d) Stability / longevity.** DPLA Attachment 6, 3.1: Apple "may at any time, with or without prior notice" modify or remove features, and has "no express or implied obligation to provide, or continue to provide, the Apple Maps Service". 2.7 and 4: Apple may limit usage or revoke keys at its sole discretion. No multi-year commitment.

**(e) ToS (Apple Developer Program License Agreement, Attachment 6).** 2.2: no bulk downloads or feeds, and no use "as part of any secondary or derived database". 2.3: no copying, modifying, translating, creating derivative works or publishing Map Data. 2.4: Map Data may only be displayed "on an Apple map" and must not be surfaced without the corresponding map. 2.5: Map Data "may not be cached, pre-fetched, or stored ... other than on a temporary and limited basis". 2.6: you may not charge end users solely for access to Apple Maps. 1.2: MapKit JS on non-Apple hardware may not be used for fleet management, asset tracking, enterprise route optimisation or vehicle-insurance risk. No explicit AI clause found; the derivative-work and caching clauses make AI processing of Map Data inadvisable (**UNVERIFIED** reading).

**(f) Licence compatibility.** Proprietary script loaded from Apple's CDN; each deployer needs their own paid membership. Data cannot go in an open dataset.

**(g) Japanese / Malay / Chinese.** `lang` takes any BCP 47 code; MapKit JS picks the best match. Japanese place quality: **UNVERIFIED**.

**Demo / video.** No Apple Maps screenshot or video rule found on developer.apple.com (**UNVERIFIED**). Attribution may not be removed (2.1, 4).

**(h) Verdict: avoid as default; maybe later as an optional adapter.** Generous free quota, but a mandatory paid account and the Apple-map-only display rule break the open, fork-friendly model.

## 4. Apple Maps Server API

**(a) What it does for us.** Server-side `search`, `searchAutocomplete`, `geocode`, `reverseGeocode`, place lookup by ID and `alternateIds`, `directions`, `etas`. Parameters include `lang`, `limitToCountries`, `searchLocation`, `searchRegion`, POI category filters.

**(b) Auth.** Same Maps ID, key and JWT as MapKit JS; same membership.

**(c) Free tier.** "Up to 25,000 service calls per day per team between Apple Maps Server API and MapKit JS"; over quota returns HTTP 429; ask Apple for more.

**(d) Stability.** Same as item 3 (Apple may change or remove at any time).

**(e) ToS.** Same Attachment 6: no caching beyond temporary use, no secondary database, results must be shown on an Apple map. Whether Apple place IDs may be stored: **UNVERIFIED** (not addressed in the agreement text I read).

**(f) Licence.** Proprietary service; nothing forced on our code.

**(g) Language.** `lang` BCP 47. Japan quality **UNVERIFIED**.

**(h) Verdict: avoid.** Not usable as a place-data source for an open dataset.

## 5. Mapbox GL JS (v2 and later)

**(a) What it does for us.** Vector map renderer. Equivalent to MapLibre.

**(b) Auth.** Mapbox account and access token. The licence says use is allowed only "with the relevant Mapbox product(s)" by "developers with a current active Mapbox account".

**(c) Free tier and pricing.** 50,000 map loads per month free; then $5.00, $4.00, $3.00, $2.50 per 1,000 through 5M (Mapbox pricing page). A map load includes unlimited Vector and Raster Tiles API requests.

**(d) Stability.** The licence file shows the history: "Version v1.13 of mapbox-gl-js and earlier are licensed under a BSD-3-Clause license"; v2.0 and later are under the Mapbox TOS. Product Terms 1.14: Mapbox gives at least 12 months notice before a material deprecation only for customers that "use and pay for a Service Offering in production under an active Order".

**(e) ToS (Product Terms, Last Updated 2026-10-20; Terms of Service last updated 2024-03-31).** 1.5: no using the service "to train, operate or improve machine-learning or artificial intelligence (AI) technologies". 1.10: no redistribution of content or data. 1.13: no linking, merging or integrating a Service Offering with open-source, open-data or "share-alike" software or data "in any way that would cause a Service Offering ... to become subject to those licenses". 2.8.1: tile caching only on the end user's device for up to 30 days. 1.7.1: no-charge promotional print and video rights, as long as map content is shown only incidentally. If your principal place of business is in Japan, the Japan Terms of Service apply.

**(f) Licence compatibility.** Source-available under the Mapbox TOS, not open source. A fork of our repo would need each user to hold a Mapbox account, and clause 1.13 is a live conflict risk with an ODbL data pipeline.

**(g) Language.** Not applicable to the renderer.

**(h) Verdict: avoid.** MapLibre GL JS (item 7) is the open-source fork of the BSD v1.13 code (its LICENSE.txt carries that notice).

## 6. Mapbox Search Box API and Geocoding API (v6)

**(a) What it does for us.** Geocoding v6 for addresses and places (no POIs in v6: "no longer provides POI data (use the Search Box API for POI search)"), Search Box for POIs and typeahead sessions. Japan: set both `language=ja` and `country=jp` to get the "new, high-accuracy and high-coverage Japan search", with a `block` feature type for Japanese addressing and a `reading` object with `ja-Kana` and `ja-Latn` readings. The readings are a useful feature for English-speaking travellers.

**(b) Auth.** Mapbox account and token; permanent storage "requires that you have a valid credit card on file or an active enterprise contract".

**(c) Free tier and pricing (pricing page).** Temporary Geocoding: 100,000 requests free per month, then $0.75 per 1,000 (down to $0.45). Permanent Geocoding: from $5.00 per 1,000 with no free tier shown, "contact Mapbox sales", "only available for your own personal or business use, and cannot be used for distribution or sublicense". Search Box sessions: introductory preview pricing with 500 free sessions per month, then $3.00 per 1,000; standard pricing 2,500 free then $11.50 per 1,000 (a session is up to 50 suggest calls plus 1 retrieve). Search Box requests (/category, /reverse): 50,000 free (introductory) or 25,000 free (standard).

**(d) Stability.** See item 5. The "introductory preview pricing" label means Search Box prices are explicitly not final.

**(e) ToS (Product Terms 2.7).** Temporary geocodes: "Customer shall not export, store, or cache Temporary Geocodes"; may display them (but not the latitude and longitude) and position results on a map. Permanent geocodes: may be stored, but "only use Permanent Geocodes for Customer's own internal business use", with an exception where use is ancillary, a separate request is made per end-user account, and lat/lng are not exposed to end users. 2.7.1: no using results "to develop a general database of points-of-interest, locations, addresses", no developing or testing another geocoder, no reselling or re-syndicating, and no displaying latitudes or longitudes directly to end users. 2.7.5: POI results only in conjunction with a Mapbox Map. Search Box docs: "all data returned by the Search Box API endpoints is only available for temporary use. If your use case requires storing position data, contact Mapbox sales." 1.5 bars AI use (see item 5).

**(f) Licence compatibility.** Permanent-geocode restrictions are incompatible with publishing an open place dataset.

**(g) Language.** Strong Japan-specific features documented; real-world Nagasaki small-business coverage **UNVERIFIED**.

**(h) Verdict: avoid for the MVP.** Best-documented Japan address handling of the commercial options, but it cannot store or republish results, which is the core of this project.

## 7. MapLibre GL JS

**(a) What it does for us.** The browser map renderer for vector tiles (OpenFreeMap, Protomaps, MapTiler, others) and raster sources (GSI). Handles click-to-pin and markers. `localIdeographFontFamily` option: "Defines a CSS font-family for locally overriding generation of Chinese, Japanese, and Korean characters", so CJK labels can come from the user's system fonts without hosting CJK glyph files.

**(b) Auth.** None. Install from npm.

**(c) Cost.** Free.

**(d) Stability.** Latest release v6.16.0 on 2026-10-25; repo pushed 2026-10-28. v6.0.0 was a breaking release: ESM-only distribution, UMD and CSP bundles dropped (CHANGELOG, with a v5 to v6 migration guide). Community-governed fork of Mapbox GL JS 1.13, so a licence change like Mapbox's 2020 move is structurally unlikely (BSD-3).

**(e) ToS.** None beyond the licence; no data is served.

**(f) Licence compatibility.** BSD-3-Clause (`package.json` and `LICENSE.txt`; the file also carries the Mapbox GL JS 1.13 BSD notice). Keep the copyright notices. Compatible with any open-source licence we pick.

**(g) Language.** Renders any script supported by glyphs or local fonts. Protomaps documents that MapLibre has built-in support for CJK, and lists Malay among supported Latin-script languages.

**(h) Verdict: MVP.** Default renderer.

## 8. Protomaps and PMTiles

**(a) What it does for us.** PMTiles is a single-file tile archive served by HTTP range requests from any static host or object store. The Protomaps basemap is a ready-made OSM-derived vector basemap in that format. `pmtiles extract` cuts a region (for example Nagasaki or Malaysia) out of the planet file, so "region is configuration" works by pointing at a different file.

**(b) Auth.** None when self-hosting. The hosted API (api.protomaps.com) needs an API key with CORS rules.

**(c) Free tier and pricing.** Hosted API: free for non-commercial use, soft limit of 1,000,000 tile requests per month, "Commercial use of this API requires becoming a GitHub Sponsor"; going over triggers nothing automated, sustained overuse leads to being asked to self-host. Planet file about 120 GB (zooms 0 to 15); regional extracts are much smaller (size for Nagasaki or Japan: **UNVERIFIED**).

**(d) Stability.** Docs describe daily builds at maps.protomaps.com/builds (last week retained, plus latest per patch version) and tell users to copy the tileset to their own storage because "URLs may change and hotlinking to these downloads are discouraged". Basemap schema versions change (v3 to v4 URLs, style v5 in the docs). The project is run by one primary maintainer funded by GitHub Sponsors (FAQ). Because the tiles are a file you own, the dependency risk over 3 years is low once copied.

**(e) Licence of content.** Basemap "distributed as an Open Database License Produced Work (OpenStreetMap attribution required)". No caching or AI restrictions beyond ODbL.

**(f) Licence compatibility.** Code BSD-3-Clause; PMTiles spec public domain / CC0; style design CC0; tile schema derived from Tilezen (MIT). Data ODbL: attribution "© OpenStreetMap" in the map. Nothing share-alike is forced on our code. Self-hosted tile data stays under ODbL if we modify the database.

**(g) Language.** Protomaps exports `name`, `name:{code}` for 41 languages including Japanese (`ja`) and Chinese (`zh-Hans`, `zh-Hant`), and splits mixed-script names. **Malay is not in the 41-language translation list** (Indonesian is), although MapLibre's script table lists Malay as supported for rendering; whether `name:ms` is carried through is **UNVERIFIED**. **CJK glyph gap (measured 2026-10-29):** in `protomaps/basemaps-assets` the `Noto Sans Regular` range file `19968-20223.pbf` (core CJK ideographs) is 29 bytes and `12288-12543.pbf` (kana) is 6,939 bytes, versus 192,358 and 147,462 bytes for the same files on OpenFreeMap. Plan on `localIdeographFontFamily` or hosting CJK glyphs.

**(h) Verdict: MVP as the self-host escape hatch** (copy a regional extract to our own bucket); not the day-one default because of the glyph gap.

## 9. OpenFreeMap (public instance)

**(a) What it does for us.** Free hosted OSM vector tiles in the OpenMapTiles schema with ready MapLibre styles (Positron, Bright, Liberty, Dark, Fiord, 3D). Style URL example: `https://tiles.openfreemap.org/styles/liberty`.

**(b) Auth.** None: "no registration, no user database, no API keys, and no cookies".

**(c) Cost.** "Completely free ... no limits on the number of map views or requests"; commercial use allowed. Funded by donations and optional support plans.

**(d) Stability.** One maintainer (Hyperknot Software Kft., Hungary). ToS (last updated 2026-10-14): "We aim to maintain the Site's availability but may discontinue it at any time without notice." No SLA ("I don't offer SLA guarantees or personalized support"). Whole stack is open source, so self-hosting is possible, and weekly planet downloads (Btrfs, MBTiles) exist.

**(e) ToS.** "Collect data from the service in automated ways" is forbidden except offline downloads of at most 3,000 tiles or 50 MB per download, at most 4 parallel requests, with a unique User-Agent. Attribution required (MapLibre adds it automatically): "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"; the OpenFreeMap part is optional, but the rest is mandatory in print and video too.

**(f) Licence.** MIT for the project; data ODbL.

**(g) Language.** I inspected the Liberty style: labels use `name:latin` plus `name:nonlatin` where both exist (romanised first, Japanese second), else `name_en` then `name`. That suits English-speaking travellers on Japanese maps. Glyph files include real CJK shapes (measured sizes above). Malay and Chinese would need a style tweak (other `name:*` keys): behaviour **UNVERIFIED**.

**Demo / video.** Allowed with the attribution above.

**(h) Verdict: MVP, default tiles.** Zero-friction for any fork; mitigate the single-maintainer risk with the PMTiles fallback and a config-driven style URL.

## 10. MapTiler Cloud (free tier)

**(a) What it does for us.** Hosted vector and raster tiles, static maps, and a Search and Geocoding API with autocomplete.

**(b) Auth.** Account and API key; the free plan needs no credit card.

**(c) Pricing (maptiler.com/cloud/pricing).** Free plan: "Suitable for testing, PoC, prototyping, personal, or non-commercial use", 100,000 API requests per month, 5,000 map sessions, 1,000 search sessions; MapTiler logo required; if you exceed the free limit the service pauses until next month. The comparison table shows Commercial use and Export for videos and games unchecked for Free. Flex: $30/month, 500,000 requests, 25,000 sessions, 3,000 search sessions; extra at $0.15 per 1,000 requests, $2.50 per 1,000 sessions and search sessions. Custom plan: SLA 99.9%, volume discounts, reselling only on Custom.

**(d) Stability.** Commercial vendor with SLA only on Custom. No multi-year free commitment; free quotas are plan-defined and can change.

**(e) ToS.** Free accounts may only use the free-tier quota (multi-account tricks are a breach). Section 4: "you may not produce commercial derivative works ... This includes ... the training of machine learning algorithms for feature extraction or any other purpose"; derivative vector datasets for non-commercial purposes or for OpenStreetMap are permitted; no reselling or sublicensing; no manipulation of map content. Section 6: for databases created using the search services the attribution must be marked as part of the database or in a separate file attached to it, so storing geocoding results appears to be possible with attribution (explicit storage and caching permission **UNVERIFIED**). Video: attribution required for printed maps, images or video recording.

**(f) Licence compatibility.** Service, not code. Free plan being non-commercial matters if the project ever monetises.

**(g) Language.** Geocoding supports multiple languages; Japan and Malaysia quality **UNVERIFIED**.

**(h) Verdict: later.** A sensible paid swap-in when an SLA matters.

## 11. OSM standard tile server (tile.openstreetmap.org)

**(a) What it does for us.** Free raster OSM tiles for development.

**(b) Auth.** None, but you must send an identifying User-Agent (library defaults are blocked) and a valid Referer from web pages.

**(c) Cost.** Free, "Availability is best-effort: there is no SLA or guarantee."

**(d) Stability.** "This policy may change at any time ... Commercial services, or those that seek donations, should be especially aware that access may be withdrawn at any point." Access may be blocked without notice.

**(e) Policy.** Use exactly `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; visible attribution "© OpenStreetMap contributors"; honour cache headers (at least 7 days if you cannot); do not scrape tiles, offer prefetch or offline download, or build tile archives; do not send no-cache headers; do not hide the Referer.

**(f) Licence.** ODbL data; nothing forced on our code beyond attribution.

**(g) Language.** Carto style renders OSM `name` (local script); no per-language control.

**(h) Verdict: avoid for production, dev only.** Use a vector source we can control.

## 12. Nominatim (OSMF public instance and self-hosted)

**(a) What it does for us.** Forward and reverse geocoding on OSM data: search "福砂屋 長崎" and get candidates; reverse geocode a hand-dropped pin into a nearby name and address suggestion.

**(b) Auth.** None on the public API. Must provide "a valid HTTP Referer or User-Agent identifying the application (stock User-Agents as set by http libraries will not do)".

**(c) Cost.** Public API free with an "absolute maximum of 1 request per second". Self-host: latest release 5.3.3; installation docs: minimum 2 GB RAM or installation fails; full planet needs 128 GB RAM or more and 1 TB disk; a Japan-only or Nagasaki-only extract needs far less (exact sizes **UNVERIFIED**).

**(d) Stability.** The policy "may change without notice" and "you might have your access withdrawn", with a warning to commercial users. Self-hosting removes this. Nominatim has had breaking migrations between major versions (migration guide; for example pip-only installation and no bundled osm2pgsql in newer releases).

**(e) Policy and data licence.** Requirements: max 1 req/s; identifying User-Agent or Referer; clear attribution; data under ODbL. Allowed: end-user-triggered searches from moderate numbers of users, sum of traffic per application; apps must be able to switch service without a software update; set up a proxy and cache. **Strictly forbidden:** autocomplete (client-side or otherwise), systematic queries (reverse queries in a grid, downloading all POIs), scraping the details page, reselling geocoding results. Bulk: single thread, one machine, results cached, 4 requests per minute for long-running scripts. LLM clause quoted in "Findings".

**OSMF Geocoding Guideline (endorsed 2017-08-24):** individual geocoding results are insubstantial extracts; storing them next to other data does not trigger ODbL share-alike so long as the results are not aggregated into a database containing a substantial part of OSM (a collection of names, addresses and lat/lng is not substantial if it is not "a systematic attempt to aggregate all or substantially all Primary Features of a given type ... within a geographic area city-sized or larger"). Attribution to OpenStreetMap is still required where the geocoder is used. Our hand-pinned places are small, non-systematic and mostly human-placed, which fits.

**(f) Licence compatibility.** Nominatim software is GPL-3.0 (`COPYING`). Calling it over HTTP imposes nothing on our code; embedding or redistributing a modified copy would (our reading, not legal advice). Data is ODbL.

**(g) Japanese / Malay / Chinese.** See "Real queries": kanji queries for a landmark and a shop worked; romaji "Fukusaya" for a shop worked; a hiragana and a romaji query for a landmark returned a different feature (a tram stop) instead of the landmark. `accept-language=ja,en` returned Japanese display names. Katakana-only queries were not tested. Malay and Chinese depend on OSM `name:ms`, `name:zh*` tags; **UNVERIFIED** with a test.

**(h) Verdict: MVP, default geocoder.** Search on submit (never typeahead), server-side proxy with cache and our own User-Agent, public instance only at hackathon volume; self-host a Japan extract before real traffic.

## 13. Photon (komoot)

**(a) What it does for us.** Search-as-you-type on OSM data, with location bias, filtering and reverse geocoding. The only open option here that is built for typeahead.

**(b) Auth.** None on the public demo. Self-host needs Java 21+ (README), embedded or external OpenSearch 3.x, and about 95 GB disk for the planet database as of 2026 (README); 64 GB RAM recommended for the planet; country filters shrink it (`-country-codes`).

**(c) Cost.** Public demo "welcome to use the API for your project as long as the number of requests stay in a reasonable limit. Extensive usage will be throttled or completely banned. We do not give guarantees for availability and reserve the right to implement changes without notice."

**(d) Stability.** No guarantees (above). Backend is OpenSearch (README); I did not verify its release or migration history (**UNVERIFIED**).

**(e) ToS.** No stated storage or caching limits beyond "be fair"; OSM data under ODbL.

**(f) Licence.** Apache-2.0 (software); data ODbL.

**(g) Japanese / Malay / Chinese.** Self-host imports "translations in English, German, French and Italian" by default (`-languages` changes this). On the public instance my Japanese-locale requests came back in English (see queries) and a hiragana query returned nothing, which is consistent with no `ja` index there (inference).

**(h) Verdict: later.** Self-host with `-languages ja,en` when typeahead matters.

## 14. Pelias

**(a) What it does for us.** Modular self-hosted geocoder that imports OpenStreetMap, OpenAddresses, Who's On First and Geonames, with libpostal address parsing. The most flexible choice for a multi-language, multi-region setup such as Malaysia.

**(b) Auth.** None when self-hosted. Hosted option: Geocode Earth (maintainers' commercial service).

**(c) Cost.** Free software; hosting cost and Geocode Earth pricing **UNVERIFIED**.

**(d) Stability.** Started at Mapzen, maintained by the Geocode Earth team since 2013 (README). Resource needs are heavy (several services); numbers **UNVERIFIED**.

**(e) ToS.** Depends on each data source (OSM ODbL, OpenAddresses sources, WOF, Geonames).

**(f) Licence.** MIT (software).

**(g) Language.** Multilingual by design; Japan and Malaysia coverage **UNVERIFIED**.

**(h) Verdict: later.** Revisit for the Malaysia region.

## 15. GSI tiles (国土地理院 地理院タイル)

**(a) What it does for us.** Official Japanese basemap tiles (standard `std`, pale `pale`, photos, hazard overlays). Example: `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` (zoom 5 to 18 for Japan). Useful as an optional Japan baselayer or overlay (hazard maps, old photos).

**(b) Auth.** None.

**(c) Cost.** Free.

**(d) Stability.** Government service, no stated service-level commitment (**UNVERIFIED**). GSI Vector (地理院地図Vector) is explicitly a "provision experiment" (ベクトルタイル提供実験); national data last updated 2026-09-16 (July 2026 data), updated quarterly since at least 2021.

**(e) Terms.** The tile list page: tiles are usable under the GSI Content Terms of Use. For tiles that are "Basic Survey Results" (such as `std`), "an application under the Survey Act may be needed", but "when loading GSI tiles in real time on a website, software or application, GSI tiles can be used with citation only, no application needed". Cite "国土地理院" or "地理院タイル" and link to https://maps.gsi.go.jp/development/ichiran.html. Tiles that include third-party data follow those parties' terms. Copying or redistributing tiles (offline packs) is outside the real-time case (**UNVERIFIED**: check the Survey Act procedure first). The GSI Content Terms apply the Public Data License v1.0 (PDL1.0), which says it is compatible with CC BY 4.0 (Digital Agency page).

**(f) Licence compatibility.** PDL1.0 is CC BY compatible; edited content needs an "edited" statement and must not look like it was made by GSI.

**(g) Language.** Japanese labels only for `std` and `pale` at street level; the `english` tile exists only for zoom 5 to 11, so it cannot serve street-level English users in Nagasaki city.

**(h) Verdict: later.** Optional Japan layer through config; not the default because labels are Japanese-only.

## 16. GSI address search API (msearch.gsi.go.jp AddressSearch)

**(a) What it does for us.** Free Japanese address and place-name search that returns GeoJSON with title and coordinates (and `mreversegeocoder.gsi.go.jp` for reverse). In my two test calls it ranked the real Nagasaki 眼鏡橋 first (see queries).

**(b) Auth.** None.

**(c) Cost.** Free.

**(d) Stability.** GSI's official reply on GitHub (gsi-cyberjapan/gsimaps issue #29, 2015, account `johofukyu`): server-side dynamic features such as place-name search are "mainly intended for use from GSI Maps. Therefore, please understand that they may not always be provided, and may not be provided in the long term. Also, specifications and usage may change without notice." (my translation of the Japanese reply). It adds that the address search uses CSIS (University of Tokyo) simple geocoding and suggests considering that instead. I found no newer official terms page for this endpoint (**UNVERIFIED** whether policy changed since 2015).

**(e) ToS.** No dedicated terms found. Content is under the GSI Content Terms (PDL1.0, citation required) as general content; whether results may be stored is **UNVERIFIED**.

**(f) Licence.** PDL1.0 (CC BY compatible) for GSI content generally.

**(g) Language.** Japanese only.

**(h) Verdict: later, optional Japan adapter behind a flag.** Not a dependency: the provider itself says not to count on it.

## 17. Overture Maps Places (extra, for a future candidate gazetteer)

**(a) What it does for us.** Open global POI dataset that could offer place-name candidates before a human pins the location. Includes a `confidence` score and sources.

**(b) Auth.** None; downloadable.

**(c) Cost.** Free.

**(d) Stability.** Releases continue (attribution page last updated 2026-05-15). Japan coverage and quality: **UNVERIFIED**.

**(e) Licence per the attribution page.** Places sources: Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery, Birdeye, Uberall, OpenTravel Alliance under CDLA Permissive 2.0; Foursquare under Apache 2.0; AllThePlaces under CC0 1.0. No share-alike on Places (the ODbL themes are Base, Buildings, Divisions, Transportation).

**(f) Licence compatibility.** Permissive; compatible with an open-source project. Attribution lines needed.

**(g) Language.** Places have multilingual names; Japanese coverage **UNVERIFIED**.

**(h) Verdict: later.** Not needed while humans pin each place.

---

## Real queries (Nominatim, Photon, GSI)

Run 2026-10-29 from this machine. Spacing: 2.5 seconds between calls (Nominatim limit is 1/s), single thread, results saved so no query was repeated. User-Agent: `NagasakiStoryLayer-research/0.1 (one-off research queries, <=1 req/s, results cached)`. Nominatim: `format=jsonv2&limit=3&accept-language=ja,en`. Photon: `limit=3`, default language. 12 calls in total (5 Nominatim, 5 Photon, 2 GSI). I did not ground-truth the coordinates against the shops or the bridge; the point is how each geocoder handles scripts.

| Query | Nominatim (OSMF public) | Photon (komoot public) | GSI AddressSearch |
|---|---|---|---|
| A. kanji `眼鏡橋 長崎` | 3 hits: way 496841322 (footway named 眼鏡橋, 魚の町, 長崎市), node 5336401732 (`historic=monument` 眼鏡橋, same place), and a different 眼鏡橋 in 諫早市 (about 13 km north). Display names in Japanese. | Same two OSM objects ranked 1 and 2 but named in English ("Megane Bridge"), plus a 眼鏡橋 way in Isahaya. | Query `眼鏡橋` only: 4 hits at different coordinates across Kyushu; the first is at 32.7471, 129.8803 (Nagasaki city). |
| B. hiragana `めがねばし 長崎` | 1 hit: node 1326681370, a tram stop named "めがね橋 (賑橋)" (長崎市, near 袋橋). The landmark bridge was **not** returned. | **0 results.** | not run |
| C. romaji `Meganebashi Nagasaki` | Same single tram stop (node 1326681370). Landmark bridge **not** returned. | Tram stop "Meganebashi Bridge (Nigiwaibashi)" twice (nodes 1326681370 and 6786874773) plus "Megane-bashi Bridge" in Isahaya. Landmark **not** returned. | not run |
| D. kanji shop `福砂屋 長崎` | 3 shop nodes: 4636761889 (bakery, 尾上町), 5365772662 (confectionery, 浜町アーケード), 5808528653 (bakery, 大黒町 by 国道202号). Names in Japanese. | Two of the same nodes (4636761889, 5808528653, the latter labelled "Fukusaya") plus a building named 福砂屋 in 大村 (way 831228241). | not run |
| E. romaji shop `Fukusaya Nagasaki` | 2 hits: nodes 5808528653 and 5365772662. | 2 hits: nodes 5808528653 and 5365772662, labelled "Fukusaya". | not run |
| F. address `長崎市魚の町` | not run | not run | 1 hit: "長崎県長崎市魚の町" at 32.7487, 129.8799. |

What this shows:

1. **Kanji works on both OSM geocoders.** Same OSM IDs on both, so Photon and Nominatim index the same data.
2. **Kana and romaji are the weak spots.** A hiragana query matched a different feature (tram stop) in Nominatim and nothing in Photon. A romaji query for a landmark found the tram stop and missed the monument, because OSM's English name for the monument is "Megane Bridge" (visible in Photon A), not "Meganebashi". A Nagasaki-specific alias table (kana and romaji variants) or a human pin is required; do not trust romaji search to find the intended place.
3. **Small shops are present for a famous brand with several branches** (three Fukusaya nodes), so disambiguation by the user is mandatory. Whether tiny, no-web-presence businesses are in OSM at all is **UNVERIFIED** and probably patchy; the project design (human pin plus typed name) already handles absence.
4. **Photon's public server did not return Japanese** even with `Accept-Language: ja,en;q=0.8`. Self-hosting with `-languages` including `ja` is a prerequisite for using it in Japan (Photon docs: defaults are en, de, fr, it).
5. **Latency** 0.2 to 0.8 seconds per call, fine for search-on-submit.
6. **GSI is accurate on the one place I tried and returns only a title and coordinates**, with no category and no stable ID, so it is a lookup aid, not a place record.

Raw responses were kept in the session scratchpad only (not part of this deliverable).

---

## Recommended GeoProvider abstraction

**Principle.** The map, search and reverse-geocode concerns are three separate ports. The app never stores provider-supplied coordinates as truth: the **human pin** is the location. Provider output is only a suggestion (name, address, optional OSM reference), kept with `provider`, `retrievedAt`, `licence`, `attribution` so licences stay auditable. This also keeps the app clear of the "no caching" terms of the proprietary providers.

**Ports (what each adapter must supply):**

| Port | Method (conceptual) | Notes |
|---|---|---|
| MapStyle | `styleUrl(region, theme, lang)`; `attribution`; `glyphs`; `cjkMode` (`hosted-glyphs` or `localIdeographFontFamily`) | Returns a MapLibre style. Lets Japan use a ja/en label expression and Malaysia a ms/zh/en one. |
| Search | `search(query, {bbox, countrycodes, languages, mode: "submit" or "typeahead"})` returns candidates | Candidate = display name per language, lat/lng suggestion, category, `providerRef`, `attribution`. `typeahead` raises an error unless the adapter allows it. |
| Reverse | `reverse(lat, lng, {languages})` | Used only after a human drops a pin, to propose a name or address. |
| Policy | `rateLimit`, `userAgent`, `cacheTtl`, `storage: "none" or "reference-only" or "full"` | Enforced centrally so a new adapter cannot silently break its provider's rules. |

**Region configuration (per region, not code).** `region.json` with: id, bbox and default map centre, `countrycodes` (`jp`, later `my`), UI language order (Japan: en with ja names shown; Malaysia: en, ms, zh-Hans, zh-Hant), name-language fallback chain per field, MapStyle adapter plus URL, search adapter chain, attribution list, and the Nominatim/Photon `User-Agent` and contact string. Nagasaki becomes one file; Malaysia becomes another.

**Default for the MVP (Nagasaki):**
- **Renderer:** MapLibre GL JS (BSD-3).
- **MapStyle:** OpenFreeMap (Liberty or Positron style, romanised-plus-Japanese labels already built in). No key, no limit, commercial use allowed, CJK glyphs hosted.
- **Search and Reverse:** Nominatim, called from our server (proxy plus cache plus our User-Agent), **search on submit only**, user-triggered. Public instance for the demo; self-host a Japan extract before real traffic.
- **Storage:** the human pin lat/lng, user-typed or user-confirmed names per language, and an optional OSM `type/id` reference. No bulk geocoding, no aggregating a city's worth of OSM features (OSMF Geocoding Guideline).
- **Attribution:** "© OpenStreetMap contributors" always; "OpenFreeMap © OpenMapTiles" via MapLibre.

**Why this default.** It is the only combination where every piece is open source or open data, needs no per-fork account, allows storing what we need, places no limits on AI processing of our own content, and handled Japanese kanji in my tests. Costs about nothing at MVP volume.

**Swap-ins, and when:**
1. **Tiles durability (do early):** replace the OpenFreeMap URL with a self-hosted **Protomaps PMTiles** regional extract on object storage (with CJK glyph hosting or `localIdeographFontFamily`). Trigger: first real users, or any sign OpenFreeMap changes terms. Cost: storage plus bandwidth.
2. **Tiles with an SLA:** **MapTiler Flex ($30/month)** when commercial use needs a contract. The free plan forbids commercial use and video export.
3. **Typeahead:** **Photon self-hosted** with `-languages ja,en` (later `ms,zh`). Trigger: the submit-only flow is too slow for users.
4. **Another region (Malaysia):** keep the same ports; change `region.json`; evaluate **Pelias** (multi-source, multi-script) or Photon with `ms,zh,en` once real Malaysian queries are tested; run the same kana/romaji-style test for `name:ms` and Chinese. Protomaps' 41-language list has no Malay translation, so plan to rely on local `name` or add keys in the style.
5. **Japan-only extras (optional):** **GSI tiles** as an extra layer (citation: 国土地理院 plus link) and **GSI AddressSearch** as a secondary search adapter behind a feature flag, because of its accuracy on a Japanese test but with GSI's own "may disappear" statement.
6. **Candidate gazetteer (later):** **Overture Places** for suggestion lists, not as a source of record.

**Why not Google, Apple, Mapbox as swap-ins in the open core.** Each makes the map or results display depend on that vendor's map, forbids storing the content we need, and needs every self-hoster to hold a paid or billing-enabled account. If an operator wants one, it should live in a separate, clearly licence-labelled plugin outside the open core, with `storage: "none"`.

**Demo and video rule for this stack.** All the default pieces allow demo and video use with attribution (OSM, OpenFreeMap; Mapbox allows incidental promotional video; Google needs approval for promotional video; MapTiler free forbids video export). Demo content must still come from the labelled mock user, with pins placed by hand on real places; no fabricated places.

---

## Unverified / open questions

1. Apple Maps and Google Places coverage and name quality for tiny Nagasaki businesses (no primary benchmark found; would need a test with developer keys, which I did not create).
2. Whether Apple Place IDs may be stored (agreement text silent); whether Apple has any screenshot or video rule for developer demos.
3. Exact Apple wording that MapKit JS keys require the paid Developer Program membership (flow implies it; the $99/year figure is from the membership page).
4. Regional extract sizes and RAM for self-hosting Nominatim, Photon and Pelias for Japan or Nagasaki only; Protomaps regional PMTiles size.
5. Whether OSM contains the tiny, no-web-presence Japanese businesses the project targets (my 5-query test only covers well-known places).
6. Photon public instance language set (my inference from the docs and results); whether `name:ms` and Chinese keys behave in Nominatim, Photon, Protomaps and OpenFreeMap styles for Malaysia (no test run).
7. GSI: whether address search results may be stored; whether the 2015 reply (not guaranteed, may change) has been superseded; terms for GSI Vector tiles beyond "experiment"; whether bulk or offline use of `std` tiles needs a Survey Act application.
8. MapTiler: explicit permission to store or cache geocoding results (terms only imply it through the attribution-on-databases clause).
9. Mapbox: whether a Mapbox Japan KK contract changes the Product Terms for a Japan-based operator (the ToS says Japan Terms of Service apply; I did not read the Japan Product Terms PDF).
10. Legal reading of "No Creating Content From Google Maps Content" and the "listings or directory service" clause for a stories-over-places product that stores only place_id: needs Google or a lawyer.
11. Whether OSM-derived `name:*` values stored per place and exported in an open dataset could ever count as substantial (OSMF guideline suggests not, unless systematic; a published dataset of all Nagasaki places would need review).
12. Pelias and Geocode Earth pricing, hardware needs, and Japan data quality.
13. Third-party stability beyond the documented history: OpenFreeMap (single maintainer, donations); Protomaps (one primary maintainer, sponsors); neither offers a multi-year commitment, so the self-host fallback is the plan.
14. Process note: some early page fetches in this session (Google, Apple, Mapbox, GitHub, and similar) were sent with a User-Agent that included a contact email address; later fetches and all geocoder queries used no email. No effect on the findings.

---

## Sources (all accessed 2026-10-29)

**Google**
- Pricing and billing overview (page says last updated 2026-10-28): https://developers.google.com/maps/billing-and-pricing/overview
- Price list (global; last updated 2026-10-28): https://developers.google.com/maps/billing-and-pricing/pricing
- SKU details: https://developers.google.com/maps/billing-and-pricing/sku-details
- Getting started (stale $200 credit note, trial): https://developers.google.com/maps/get-started
- Maps Platform Terms of Service (last modified 2026-08-26): https://cloud.google.com/maps-platform/terms
- Maps Platform Service Specific Terms (last modified 2026-10-28): https://cloud.google.com/maps-platform/terms/maps-service-terms
- Places API policies and attribution: https://developers.google.com/maps/documentation/places/web-service/policies
- Place IDs (storage and refresh): https://developers.google.com/maps/documentation/places/web-service/place-id
- Place Details (New): https://developers.google.com/maps/documentation/places/web-service/place-details
- Place resource reference (reviews, max 5): https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
- Deprecations: https://developers.google.com/maps/deprecations
- Legacy products: https://developers.google.com/maps/legacy
- Supported languages (FAQ): https://developers.google.com/maps/faq
- Geo guidelines (screenshots, video): https://about.google/brand-resource-center/products-and-services/geo-guidelines/

**Apple**
- MapKit JS overview and free limits: https://developer.apple.com/maps/web/
- Apple Maps Server API documentation (25,000 calls per day): https://developer.apple.com/documentation/applemapsserverapi (read through https://developer.apple.com/tutorials/data/documentation/applemapsserverapi.json and the search, geocode, place, autocomplete and token pages under the same path)
- MapKit JS language property: https://developer.apple.com/documentation/mapkitjs/mapkit/language
- Apple Developer Program License Agreement (Attachment 6, Apple Maps Service): https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- Apple Developer Program ($99 annual): https://developer.apple.com/programs/

**Mapbox**
- Pricing: https://www.mapbox.com/pricing
- Terms of Service (last updated 2024-03-31): https://www.mapbox.com/legal/tos
- Product Terms PDF (last updated 2026-10-20), linked from https://www.mapbox.com/legal/product-terms
- Geocoding API docs (storage, Japan): https://docs.mapbox.com/api/search/geocoding/
- Search Box API docs: https://docs.mapbox.com/api/search/search-box/
- Mapbox GL JS licence: https://raw.githubusercontent.com/mapbox/mapbox-gl-js/main/LICENSE.txt

**Open renderers and tiles**
- MapLibre GL JS licence: https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/LICENSE.txt
- MapLibre changelog (v6.16.0, v6.0.0 ESM-only): https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/CHANGELOG.md
- MapLibre MapOptions (`localIdeographFontFamily`): https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/
- GitHub API for MapLibre release and package metadata: https://api.github.com/repos/maplibre/maplibre-gl-js
- Protomaps docs: https://docs.protomaps.com/
- Protomaps basemap downloads: https://docs.protomaps.com/basemaps/downloads
- Protomaps localization: https://docs.protomaps.com/basemaps/localization
- Protomaps hosted API and usage policy: https://protomaps.com/api
- Protomaps FAQ (About): https://protomaps.com/about
- Protomaps basemaps licence: https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE.md
- PMTiles licence: https://raw.githubusercontent.com/protomaps/PMTiles/main/LICENSE
- Protomaps font assets (glyph sizes): https://github.com/protomaps/basemaps-assets/tree/main/fonts
- OpenFreeMap: https://openfreemap.org/
- OpenFreeMap Terms of Service (last updated 2026-10-14): https://openfreemap.org/tos/
- OpenFreeMap Liberty style and glyphs: https://tiles.openfreemap.org/styles/liberty
- MapTiler pricing: https://www.maptiler.com/cloud/pricing/
- MapTiler terms: https://www.maptiler.com/terms/
- OSM Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/

**Geocoders**
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- Nominatim home (release 5.3.3): https://nominatim.org/
- Nominatim installation requirements: https://nominatim.org/release-docs/latest/admin/Installation/
- Nominatim migration guide: https://nominatim.org/release-docs/latest/admin/Migration/
- Nominatim licence (GPL-3.0): https://raw.githubusercontent.com/osm-search/Nominatim/master/COPYING
- OSMF Geocoding Guideline: https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline
- Photon: https://photon.komoot.io/ , README https://raw.githubusercontent.com/komoot/photon/master/README.md , usage https://raw.githubusercontent.com/komoot/photon/master/docs/usage.md , licence https://raw.githubusercontent.com/komoot/photon/master/LICENSE
- Pelias README and licence: https://raw.githubusercontent.com/pelias/pelias/master/README.md , https://raw.githubusercontent.com/pelias/pelias/master/LICENSE
- Real queries (live endpoints): https://nominatim.openstreetmap.org/search , https://photon.komoot.io/api/ , https://msearch.gsi.go.jp/address-search/AddressSearch

**Japan (GSI)**
- GSI tile list and usage notes: https://maps.gsi.go.jp/development/ichiran.html
- About GSI tiles: https://maps.gsi.go.jp/development/siyou.html
- GSI Vector experiment: https://maps.gsi.go.jp/development/vt.html
- GSI Website Terms of Use (English): https://www.gsi.go.jp/ENGLISH/page_e30286.html
- GSI Content Terms (Japanese): https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- Public Data License v1.0 (CC BY compatibility statement): https://www.digital.go.jp/resources/open_data/public_data_license_v1.0
- GSI reply on external use of the address search API: https://github.com/gsi-cyberjapan/gsimaps/issues/29

**Overture**
- Attribution and licensing: https://docs.overturemaps.org/attribution/
- Places schema: https://docs.overturemaps.org/schema/reference/places/place/
