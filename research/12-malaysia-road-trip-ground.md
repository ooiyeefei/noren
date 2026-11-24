# 12. Malaysia road trip: data, routing and legal ground (Kedah, Penang, Perak)

Lane: what open data, routing options and legal ground exist for a multi-day family road trip planner in northern Peninsular Malaysia (Kuala Lumpur, Alor Setar, Penang, Ipoh and the towns between). Competitor products and agent design are covered by other researchers and are not repeated here.
Access date for every fact below: **2026-11-23** (today). Prices, terms and counts change often, so re-check before committing money.

Method and caveats:
- Primary sources first: official sites, statute and gazette PDFs, licence and terms pages, the data itself. Search was used only to find them. Where a primary page would not open, the fact is marked **UNVERIFIED** and says what was seen instead (usually a search snippet of the primary page, or a law-firm copy).
- Public Overpass endpoints (overpass-api.de, and overpass.kumi.systems for retries): one query per town returning counts only, 12 areas, 12 to 45 second pauses, a generic user agent (`desk-research-bot/0.1`). Several first tries returned HTTP 502 and were retried. No data was downloaded in bulk.
- Overture Maps: one DuckDB query over the 2026-11-18.0 release for a bounding box (read-only, aggregates only, no rows saved). One more query for category counts.
- Single read-only calls were also made to: the OSRM public demo server (4 route requests), the data.gov.my open API (about 8 calls, under its 4 per minute limit), the Wikipedia and Wikivoyage APIs, and the Geofabrik download page. No sign-ups, no paid API, no logins.
- Counts use rectangular boxes, not administrative boundaries. "George Town core" is inside "Penang island", so do not add them. Box edges and tags are approximate. Raw numbers are in `.scratch/research-12/counts.json`.
- No place is rated or scored in this file. Where a count is given it is a count of mapped objects, not a quality statement.
- The model that wrote this file is Claude (Anthropic). Section 5 is a technical reading of primary texts, not legal advice. Ask a Malaysian lawyer before launch.

---

## Summary table

| # | Item | What it gives a trip planner | Verdict | One line why |
|---|---|---|---|---|
| 1.1 | OpenStreetMap, Penang island and George Town | Hand-mapped places, many tags | **use** | About 1,700 eating places on the island, names in several scripts, but only 22% have opening hours |
| 1.2 | OpenStreetMap, Alor Setar, Ipoh, Perak towns | Places and worship sites | **use with care** | Decent for names and food types; opening hours 3% to 16%; wheelchair data almost absent |
| 1.3 | Overture Maps Places (2026-11-18.0) | Many more candidate businesses | **use with care** | 3 to 8 times more food places than OSM, but no hours, no accessibility, mostly Meta-derived, duplicates likely |
| 1.4 | Halal, wheelchair, baby facilities in OSM | Family planner filters | **avoid as a filter** | `diet:halal=yes` on 5% to 9% of food places; `wheelchair` on a few dozen places in the whole corridor |
| 2.1 | data.gov.my | Weather forecast, GTFS bus and rail, population | **use (weather, GTFS)**; tourism, holidays: none | CC BY 4.0. 367 datasets listed; none for tourism, holidays, heritage, halal or accessibility |
| 2.2 | MET Malaysia forecast via data.gov.my | 7-day forecast by district | **use** | Free, no key, 4 requests per minute, text mostly in Malay |
| 2.3 | National heritage register (Jabatan Warisan Negara) | Authoritative heritage list | **use with care (link out)** | PDF lists only; no licence stated; undated PDFs disagree about Kedah |
| 2.4 | Tourism Malaysia, Perak, Kedah, Penang bodies | Event and attraction text | **avoid copying; link out** | Terms not readable here (403 or not found); marketing copy |
| 2.5 | GTWHI and Think City | George Town heritage knowledge | **avoid as data; contact first** | Acknowledgement asked (GTWHI); Think City says approval needed (UNVERIFIED primary) |
| 2.6 | Wikipedia, Wikivoyage, Wikidata | Background text, listings | **use with care** | CC BY-SA text; Wikivoyage Ipoh is rich, Alor Setar and Kuala Kangsar thin |
| 2.7 | JAKIM halal directory | Is a food premises JAKIM-certified | **use with care (link out, no copying)** | Search form only; no API or terms page found; absence is not "not halal" |
| 2.8 | Official OKU (disability) facility data | Accessible venues | **none found** | Biggest data gap. MyTQA list of 136 products exists but was not located |
| 2.9 | PLUS highway operator | Rest areas, tolls, traffic advisories | **use with care** | Rest area page has nappy room and surau filters; no accessible-toilet filter; toll calculator not scriptable |
| 3.1 | OSRM, Valhalla, GraphHopper (self-hosted) | Drive times and routes from OSM | **options** | BSD-2, MIT, Apache-2.0. Malaysia extract is only 242 MB. No live traffic, no toll prices |
| 3.2 | Google Routes API | Times with live traffic | **option with a hard map rule** | Terms 19.2: must not be used with a non-Google map |
| 3.3 | Mapbox, HERE, TomTom, openrouteservice, Stadia, Geoapify | Hosted times and routes | **options** | Free allowances range from 500 matrix calls a day to 100,000 per month; traffic is a paid add-on in several |
| 4 | Where Malaysians write | First-hand place writing | **plan for Facebook, TikTok, YouTube, Google reviews, Xiaohongshu** | Ad-reach figures only; no platform survey with unique users found |
| 5.1 | PDPA 2010 as amended by Act A1727 | Law for personal data | **in force; scope for a non-commercial project is open** | DPO and breach duties live since 2025-06-01; cross-border rewritten 2025-04-01 |
| 5.2 | Copyright Act 1987 s.13(2) | Short quotes with credit | **use with care** | Fair dealing and a quotation clause, both need attribution; four-factor test includes commercial nature |
| 6 | Route fact sheet and calendar | Test case for the planner | **ready, tolls not confirmed** | Four legs, about 902 km; school holidays confirmed from the Ministry; tolls only from a secondary source |

---

## 1. Open place data along the corridor

### 1.1 OpenStreetMap counts by town (Overpass, 2026-11-23)

What each column means: objects (nodes, ways, relations) with the tag. "Eat" is `amenity=restaurant|fast_food|food_court`. "Attraction" is `tourism=attraction|viewpoint|gallery|zoo|theme_park`. "Worship" is `amenity=place_of_worship`. Box sizes are in the scratch script `.scratch/research-12/ovq.py`.

| Area | Eat | Cafe | Museum | Attraction etc. | Worship | Marketplace | Public toilets |
|---|---|---|---|---|---|---|---|
| George Town core | 639 | 250 | 35 | 36 | 162 | 18 | 33 |
| Penang island (includes core) | 1,238 | 438 | 43 | 171 | 461 | 55 | 111 |
| Seberang Perai (mainland Penang) | 890 | 207 | 1 | 38 | 583 | 57 | 56 |
| Alor Setar | 429 | 74 | 3 | 17 | 148 | 7 | 24 |
| Sungai Petani | 129 | 29 | 0 | 3 | 70 | 9 | 6 |
| Ipoh | 534 | 133 | 11 | 51 | 226 | 32 | 15 |
| Kuala Kangsar | 43 | 9 | 2 | 2 | 27 | 2 | 0 |
| Taiping | 98 | 29 | 15 | 21 | 82 | 4 | 5 |
| Kuala Sepetang | 6 | 0 | 0 | 2 | 3 | 0 | 0 |
| Gopeng | 14 | 2 | 2 | 0 | 11 | 2 | 5 |
| Kampar | 128 | 22 | 1 | 1 | 12 | 3 | 15 |
| Tanjung Malim | 49 | 14 | 0 | 1 | 26 | 2 | 1 |

Plain reading:
- George Town and Penang island are well mapped. Ipoh and Alor Setar are usable. Sungai Petani is thin for a city of its size (129 eating places). Kuala Sepetang is nearly empty (6 eating places, 0 cafes).
- Museums and heritage sights are very uneven: Taiping 15 museums, Sungai Petani 0.
- Kampar and Gopeng are small towns. The counts there are small but they match small towns. The real gap is detail, not existence.

### 1.2 Tag completeness for a family planner

Base set: eating places plus cafes in each area (the "n" column). Percent is the share of that set carrying the tag. Counts of 5 or less are shown as numbers only.

| Area | n | name | opening_hours | wheelchair (any value) | wheelchair=yes | diet:halal (any) | diet:halal=yes | cuisine | name:en | name:ms | name:zh | name:ta | toilets:wheelchair | changing_table | highchair | website | phone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| George Town core | 889 | 97% | 27% | 23 | 12 | 16 | 13 | 40% | 64% | 15% | 16% | 0 | 4 | 2 | 5 | 9% | 12% |
| Penang island | 1,676 | 95% | 22% | 72 | 28 | 44 | 39 | 44% | 45% | 12% | 17% | 2 | 11 | 5 | 10 | 8% | 11% |
| Seberang Perai | 1,097 | 94% | 9% | 7 | 5 | 39 | 38 | 57% | 9% | 5% | 29% | 0 | 0 | 0 | 1 | 3% | 6% |
| Alor Setar | 503 | 91% | 9% | 18 | 17 | 47 | 32 | 59% | 7% | 4% | 4% | 0 | 3 | 1 | 2 | 1% | 4% |
| Sungai Petani | 158 | 94% | 16% | 2 | 1 | 10 | 6 | 58% | 4% | 3% | 4% | 0 | 0 | 0 | 0 | 2% | 8% |
| Ipoh | 667 | 96% | 15% | 3 | 2 | 13 | 12 | 33% | 10% | 7% | 18% | 0 | 0 | 0 | 0 | 2% | 11% |
| Kuala Kangsar | 52 | 87% | 19% | 0 | 0 | 2 | 2 | 52% | 6% | 2% | 4% | 0 | 0 | 0 | 0 | 4% | 6% |
| Taiping | 127 | 92% | 7% | 0 | 0 | 3 | 3 | 29% | 9% | 2% | 4% | 0 | 0 | 0 | 1 | 3% | 2% |
| Kuala Sepetang | 6 | 100% | 1 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Gopeng | 16 | 81% | 0 | 1 | 1 | 0 | 0 | 8 | 1 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Kampar | 150 | 99% | 3% | 1 | 1 | 2 | 2 | 27% | 47% | 33% | 7% | 0 | 0 | 0 | 0 | 3% | 1% |
| Tanjung Malim | 63 | 83% | 3% | 0 | 0 | 2 | 2 | 38% | 21% | 24% | 8% | 0 | 0 | 0 | 0 | 0% | 0% |

Sights, museums, markets and places of worship together (base set "visit"):

| Area | n | name | opening_hours | wheelchair (any) | name:en | name:ms | name:zh | name:ta | wikidata |
|---|---|---|---|---|---|---|---|---|---|
| George Town core | 249 | 83% | 6% (15) | 23 | 55% | 23% | 37% | 1 | 24 |
| Penang island | 726 | 76% | 3% (25) | 36 | 35% | 16% | 24% | 4 | 34 |
| Seberang Perai | 678 | 66% | 1% (6) | 2 | 7% | 5% | 15% | 4 | 4 |
| Alor Setar | 175 | 82% | 6% (10) | 4 | 11% | 8% | 9% | 1 | 5 |
| Sungai Petani | 82 | 79% | 1% (1) | 1 | 12% | 9% | 9% | 0 | 0 |
| Ipoh | 317 | 82% | 3% (9) | 1 | 18% | 10% | 19% | 7 | 10 |
| Kuala Kangsar | 33 | 82% | 6% (2) | 0 | 15% | 0% | 0% | 0 | 3 |
| Taiping | 122 | 74% | 2% (3) | 1 | 20% | 11% | 14% | 0 | 3 |
| Kampar | 17 | 88% | 0% (0) | 0 | 47% | 18% | 18% | 0 | 0 |
| Tanjung Malim | 29 | 69% | 0% (0) | 0 | 14% | 28% | 3% | 1 | 0 |

**What is too thin to rely on (plain statement):**
- **Opening hours.** Best case is George Town core at 27% of food places and 6% of sights. Everywhere else it is 15% or less. A planner must treat hours as unknown and say so, or ask the person to check.
- **Wheelchair access.** Across all 12 areas there are about 100 food places with any `wheelchair` tag and about 70 with `wheelchair=yes`. For sights, worship sites and markets together the count is 36 on Penang island (23 of those inside George Town core), 4 in Alor Setar, 1 in Ipoh, 1 in Taiping, 0 in Kuala Kangsar. This cannot support an OKU-friendly filter. Not one place in the corridor gives a verified step-free route or toilet.
- **Accessible toilets, baby changing, highchairs.** `toilets:wheelchair` appears on 4 places in George Town core and 11 on Penang island. `changing_table` appears on 5 on the island. `highchair` on 10. Zero in Ipoh and Alor Setar.
- **Halal.** `diet:halal=yes` is on 5% (Penang island) to 9% (Alor Setar's 32 of 503) of food places. Most halal places are simply not tagged, because mappers often leave out what is assumed. The absence of a tag means "unknown", never "not halal". `cuisine` is more complete (29% to 59%) and is a weak hint (for example `cuisine=malay`) but is not a halal statement.
- **Tamil names.** `name:ta` is 0 to 2 on any food set and 0 to 7 on sights. Tamil text is effectively missing.
- **Names in other scripts.** `name:en` is high in George Town core (64%) and Kampar (47%) but 4% to 10% in Alor Setar, Sungai Petani, Ipoh. `name:zh` reaches 29% in Seberang Perai (likely a bulk import) and 4% in Alor Setar. In many places the single `name` tag is the only name, and it can be in Malay, English or Chinese.
- **Contact data.** Website 1% to 9%, phone 0% to 12%. Do not expect to contact or link out to a place from OSM.
- Mapping effort is lopsided. The towns between the big cities (Sungai Petani, Kuala Kangsar, Taiping, Kuala Sepetang, Gopeng) have very few attributes at all.

### 1.3 Overture Maps Places for the corridor (release 2026-11-18.0)

Read from `s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/` with a bounding box. The latest release id was read from `https://stac.overturemaps.org/catalog.json` (`latest` = 2026-11-18.0).

| Area (box) | All places | Food and drink (taxonomy level 1) | With a website | With a phone | With a social link | Confidence 0.7 or more |
|---|---|---|---|---|---|---|
| George Town core | 12,355 | 4,042 | 4,228 | 9,557 | 12,072 | 6,206 |
| Penang island (outside the core box) | 20,246 | 5,144 | 6,319 | 14,488 | 19,686 | 10,240 |
| Alor Setar | 9,900 | 2,341 | 2,324 | 7,028 | 9,807 | 4,373 |
| Sungai Petani | 8,346 | 1,837 | 2,080 | 6,356 | 8,229 | 3,690 |
| Ipoh | 20,974 | 5,486 | 5,561 | 16,269 | 20,723 | 9,730 |
| Taiping | 5,111 | 1,223 | 1,142 | 3,623 | 5,047 | 2,430 |
| Kuala Kangsar | 1,664 | 373 | 348 | 1,110 | 1,648 | 774 |
| Kampar | 1,554 | 523 | 306 | 1,081 | 1,544 | 770 |
| Tanjung Malim | 1,231 | 338 | 272 | 802 | 1,214 | 619 |
| Gopeng | 499 | 140 | 110 | 307 | 490 | 247 |
| Kuala Sepetang | 97 | 40 | 16 | 49 | 96 | 62 |

Selected category counts (Overture `taxonomy.primary`): Ipoh restaurant 1,194, cafe 446, coffee_shop 337, chinese_restaurant 678, malaysian_restaurant 211, halal_restaurant 28, museum 13. George Town core restaurant 789, cafe 480, museum 34, halal_restaurant 19. Alor Setar restaurant 607, cafe 266, halal_restaurant 22, museum 8. Taiping restaurant 332, cafe 111, museum 2.

What this says:
- Overture lists several times more food places than OSM in every town. Ipoh has 667 eating places and cafes in OSM and 5,486 "food and drink" entries in Overture. "Food and drink" is wider (stalls, bakeries, bars, catering), and duplicates are likely, so do not read it as 8 times more restaurants. A sample comparison on the ground has not been done.
- Source mix in the same box (counts are per source record, one place can have several): `Overture` 167,240 and `meta` 163,601, both CDLA-Permissive-2.0; Foursquare 2,091 (Apache-2.0); Microsoft 717; AllThePlaces 692 (CC0-1.0). So most Malaysian places are derived from Meta business pages. That is licensed permissively by Overture, but the underlying pages are often stale; only 306 places in the box carry `operating_status=open`, one is permanently closed, and 166,932 carry no status at all.
- The Overture place schema read here has name, categories, addresses, phones, websites, socials, emails, brand and sources. **There is no opening-hours field and no accessibility or diet field.** (Confirmed from the DuckDB `describe` of the release.) Overture's `halal_restaurant` category exists, but it has 28 places in Ipoh against 5,486 food entries, so it is not a usable halal filter.
- Per research/02, Overture has no multi-year retention promise (only the 60-day release retention). Same for Malaysia.
- Carries over unchanged from Japan: licence is permissive, no share-alike; treat as candidate places that a human confirms. Does not carry over: in Malaysia, Overture is far richer than OSM, so it may be the main candidate source, which raises the duplicate and staleness problem.

---

## 2. Other open or official Malaysian sources

### 2.1 data.gov.my

- Licence: the portal page says "License: CC BY 4.0" (`https://developer.data.gov.my/`). The linked Guiding Principles document was not read. No separate terms page is linked.
- Rate limit: 4 requests per minute for each of Data Catalogue, OpenDOSM, Weather, GTFS Static and GTFS Realtime. No key. Over the limit returns HTTP 429 (`https://developer.data.gov.my/rate-limit`).
- **Catalogue content.** `https://api.data.gov.my/data-catalogue?id=datasets` returned 367 datasets. By category: Labour 43, Economic sectors 41, Demography 40, Prices 35, Healthcare 33, Households 29, National accounts 29, Public administration 24, Transportation 14, Environment 14, Public safety 13, and others. Searching titles for holiday, tourism, heritage, hotel, halal, disability, toll, highway, rest area, accessibility found **nothing relevant**. No tourism, public-holiday, heritage, halal or OKU dataset is on the portal. (Public holiday dates must come from the Cabinet Division PDFs in section 6.)
- **Weather API.** `https://api.data.gov.my/weather/forecast` returned a live 7-day forecast. Fields: morning, afternoon, night, summary, minimum and maximum temperature, keyed by location ids with prefixes St (state), Ds (district), Tn (town), Rc (recreation centre), Dv (division). Source is MET Malaysia. Forecast text is mostly Malay only; warnings are in Malay and English. Marine forecast is "currently unavailable" per the docs. CC BY 4.0 (`https://developer.data.gov.my/realtime-api/weather`). One test call returned Langkawi (Ds001) for 28 and 29 November 2026 with thunderstorms forecast.
- **GTFS.** Static feeds exist for KTMB (trains), Prasarana (including Rapid Penang buses), and MyBAS city buses including `mybas-alor-setar` and `mybas-ipoh`. Useful for a car-free day in a city; not needed for the road legs (`https://developer.data.gov.my/realtime-api/gtfs-static`).
- **Population by state and ethnicity** (`population_state`, latest year in the rows returned: 2023, thousands): Kedah 2,187.5 (Malay 76.8%, Chinese 11.4%, Indian 5.9%); Perak 2,540.4 (Malay 55.5%, Chinese 25.0%, Indian 10.7%); Pulau Pinang 1,771.6 (Malay 41.1%, Chinese 40.2%, Indian 8.7%). Non-citizens are 4.6% to 8.9%. Used in section 4.
- Verdict: **use** for weather and GTFS, with attribution and a cache that keeps well under 4 requests a minute. No tourism data here.

### 2.2 National heritage register (Jabatan Warisan Negara)

- The register is published as PDF lists under `https://www.heritage.gov.my/images/05_daftarwarisan/` (buildings, archaeological sites and so on). No API, no stated licence or reuse terms found.
- The undated "buildings by state" PDF lists Pulau Pinang 6, Perak 11, Kedah 0 (dash), Kuala Lumpur 30. A search summary of newer gazettes says Kedah has gazetted items (a post office in Alor Setar, a police station in Sungai Petani), so the PDF is probably out of date. **UNVERIFIED which list is current.** Candi Bukit Batu Pahat at Lembah Bujang is on the archaeological list.
- What it gives a planner: a trustworthy "this is a gazetted heritage building or site" fact with a name. It does not give opening hours or access.
- Verdict: **use with care.** Cite and link out. Do not copy the lists until the department states terms.

### 2.3 Tourism Malaysia and the state bodies

- Tourism Malaysia's `malaysia.travel` returned HTTP 403 to a plain request. Terms and copyright notice were **not read**. The Visit Malaysia 2026 page on that site could not be opened. Facts about VM2026 below come from MOTAC's own page and a Bernama release.
- Perak: the state tourism board runs `tourismperakmalaysia.com` (Tourism Perak Management Berhad). It lists themed material (coffee trails, a mosque guidebook, a fun map). Terms **not read**.
- Kedah and Penang tourism bodies: **not located or read** in this session.
- Verdict: **avoid copying.** Link out for events. Brochure text is marketing copy and its terms are unknown.

### 2.4 George Town World Heritage Incorporated and Think City

- GTWHI's FAQ asks users to acknowledge GTWHI in any publication that uses its material (`https://gtwhi.com.my/frequently-asked-questions/`, seen in search; page not opened). No data licence found. GTWHI sells its Special Area Plan.
- Think City runs an Urban Analytics Portal with a George Town land-use census (2009, 2013, 2019). A search summary says material needs Think City's prior approval; the portal page itself was **not read: UNVERIFIED**.
- Verdict: **avoid as a bulk source.** Ask both for permission if the planner wants their heritage inventory or census.

### 2.5 Wikipedia, Wikivoyage, Wikidata

- Licences as in research/02: Wikipedia and Wikivoyage text are CC BY-SA 4.0 (attribution, say what changed, adapted text stays share-alike); Wikidata is CC0. For the planner this means: facts and IDs from Wikidata are free to reuse; quoting or summarising a Wikipedia or Wikivoyage paragraph makes that paragraph share-alike, so prefer to link out or write fresh sentences from cited facts.
- English Wikipedia geosearch within 10 km: George Town 246 articles, Ipoh 56, Alor Setar 28, Taiping 25, Kuala Kangsar 16.
- English Wikivoyage listings (counts of listing templates on the page): Ipoh 24 see, 8 do, 26 eat, 5 drink, 19 sleep (71,668 characters, the richest). Alor Setar 10 see, 1 eat, 7 sleep. Kuala Kangsar 10 see, 1 eat. The "Penang" page has 8 generic listings. The page names for George Town and Taiping did not match the titles tried, so their listing counts are not known.
- Wikidata: not queried in this session. OSM `wikidata` tags exist on 24 sights in George Town core and 10 in Ipoh.
- Verdict: **use with care.** Wikidata IDs and Wikipedia titles as stable references. Wikivoyage for Ipoh listings only as leads, each confirmed by a person.

### 2.6 JAKIM halal directory

- The Halal Malaysia Portal (`https://myehalal.halal.gov.my/portal-halal/`) has a "Verify Halal Status" search with categories including "Premis Makanan" (food premises). MYeHALAL is the application system for certification, not a public data feed.
- No API, bulk download, terms of use or copyright page was found on the portal. (The page has a search endpoint in its script, but calling it automatically would not be a "single read-only request to a free public endpoint" under its own terms, which are unknown, so it was not called.)
- Important for design: JAKIM certification covers certified premises. Many Muslim-owned stalls are halal in practice and not certified, and many Chinese kopitiams are not halal. A planner must not turn "not found in the directory" into "not halal".
- Verdict: **use with care.** Show "check the JAKIM directory" as a link out on a venue, and let people add what they confirmed (with a source). Do not copy the directory.

### 2.7 Accessibility (OKU) facility data

- No official, searchable OKU-friendly attractions database from MOTAC, JKM or Tourism Malaysia was found. The Malaysia government portal lists the typical OKU facilities in public buildings (OKU parking, lanes, lifts, toilets), which is a checklist, not data (`https://www.malaysia.gov.my/en/personas/person-with-disabilities/...`, seen in search).
- One lead: an RTM report says 136 tourism products certified under MyTQA have OKU-friendly facilities (`https://berita.rtm.gov.my/?p=727137`, seen in search; not opened). The list itself was not found. **UNVERIFIED.**
- Verdict: **none found.** This is the biggest data gap in this lane. The planner will have to collect accessibility facts from people (each with a source and a date) and ask MOTAC for the MyTQA list.

### 2.8 PLUS highway operator (rest areas, tolls, traffic)

- Rest areas: `https://www.plus.com.my/our-facilities/` has filters by state, direction and facility: ATM, EV charging, foodcourt, **nappy room**, petrol, **surau**, toilet, Touch 'n Go reload and spot. Each entry gives name, direction, kilometre and facilities. The page is paginated in script (5 pages of 10). Only page 1 was read, so about 40 entries were not read. Lay-bys are every 25 to 50 km and are smaller than R&Rs, per PLUS.
- **No wheelchair-accessible toilet filter exists.** That is a gap for OKU planning.
- Entries read on page 1 on the Kuala Lumpur to north corridor: Tapah northbound km 331.8 and southbound km 331.6 (ATM, EV, foodcourt, nappy room, petrol, surau, toilet, Touch 'n Go kiosk); Ulu Bernam southbound km 398.00 (EV, foodcourt, petrol, toilet); Tanjong Malim northbound km 396.4 (petrol, toilet); Tikam Batu southbound lay-by in Kedah km 112.5 (toilet only).
- PLUS describes the North-South Expressway as spanning 748 km with 112 interchanges (`https://www.plus.com.my/our-expressways/`). A secondary page says 772 km. Use the operator's figure and say road distance varies by route.
- Tolls: the official toll calculator is script-driven and was not run. Payment methods include Touch 'n Go, SmartTAG, RFID, and tap-to-pay with cards at Jitra (NSE) and Kubang Semang and Lunas (BKE) toll plazas (`https://www.plus.com.my/plan-your-journey/`).
- Traffic advisories on the home page (November 2026): see section 3.4.
- Verdict: **use with care** as link-outs and for rest-area names, not as a copied dataset. Terms of the site were not read.

---

## 3. Drive times and routes

### 3.1 What a planner needs

For each leg: distance, free-flow time, the route to draw, and ideally a time at a given day and hour. For ordering stops it needs a matrix of times between candidate stops (for example 20 stops gives 400 pairs). This lane did not run any paid call.

Measured here with the **OSRM public demo server** (one request per leg, OSM data, car profile, no live traffic, no stops, route from the city centre point to the city centre point; the demo server is for testing and must not be used in production):

| Leg | Road distance | Free-flow time | Main road (distance on it) |
|---|---|---|---|
| Kuala Lumpur to Alor Setar | 433.3 km | 315 min (5 h 15) | Lebuhraya Utara-Selatan E1, 408.9 km |
| Alor Setar to George Town | 114.6 km | 91 min | E1, 87.2 km, then Penang Bridge E36, 9.9 km, then Lim Chong Eu expressway 6.1 km |
| George Town to Ipoh | 156.9 km | 123 min | Penang Bridge E36 10.6 km, then E1, 127.8 km |
| Ipoh to Kuala Lumpur | 197.3 km | 148 min | E1, 171.7 km, then NKVE and city streets |

### 3.2 Self-hosted open engines on the Malaysia extract

Extract: Geofabrik `malaysia-singapore-brunei-latest.osm.pbf` is **242 MB** (file `...-261122.osm.pbf` on the 2026-11-23 page; data is ODbL 1.0; attribution "Data processed by Geofabrik GmbH and created by OpenStreetMap Contributors"). For scale, the whole-planet file on planet.openstreetmap.org is 95.9 GB, so the Malaysia extract is about 0.25% of it.

| Engine | Licence | What it needs (source) | Tolls and traffic | Matrix |
|---|---|---|---|---|
| OSRM (osrm-backend) | BSD-2-Clause (repo LICENSE.TXT) | Extract and contract the PBF, run `osrm-routed`. No official Malaysia memory or disk figure was found | Car profile marks `toll` as an excludable class; it does not price tolls. No live traffic | `/table` service; the maximum size is a server option `--max-table-size` |
| Valhalla | MIT (repo COPYING) | Build tiles from the PBF, run the service. No Malaysia figure found | Cost option `use_tolls` biases routes toward or away from tolled roads (source `autocost.cc`); it does not price them. No live traffic from OSM | Matrix endpoint; the default config script sets `max_matrix_distance` 400,000 m and `max_matrix_location_pairs` 2,500 (can be raised) |
| GraphHopper | Apache-2.0 (repo LICENSE) | Java, import PBF. Docs give only planet figures: about 60 GB RAM for the planet import and about 120 GB more for contraction preparation | Toll handling not checked. No live traffic | Matrix is in the commercial Directions API; the open server's matrix support was not checked |

What can be said without measuring: the Malaysia file is small, so a single small server should be enough, but **memory and disk were not measured** and must be tested (a day of work). All three engines take free-flow times from road class and speed limit tags, so their times for the North-South Expressway will be close to the demo results above and optimistic at peak.

A self-hosted engine gives an unlimited matrix, no per-call price, and no terms about storing results. The costs are running a server, updating the extract, and getting no toll price and no traffic.

### 3.3 Hosted services (options, no choice made)

| Service | Free allowance | Price today | Matrix limits | Traffic | Terms that matter here |
|---|---|---|---|---|---|
| Google Routes API | 10,000 calls a month for Essentials, 5,000 for Pro, 1,000 for Enterprise, per SKU | Essentials $5.00 per 1,000 (first 100,000); Pro $10.00; Enterprise $15.00. Matrix is billed per element (origins x destinations) at the same rates | 625 elements per request; 100 with `TRAFFIC_AWARE_OPTIMAL`; 50 origins and 50 destinations by address or place id; 25 intermediate waypoints; 3,000 elements a minute | Traffic-aware requests fall in the Pro SKU | Service terms 19.2: "must not use Google Maps Content from the Routes API in conjunction with a non-Google map". 19.3: lat/lng may be cached up to 30 days. General terms 3.2.3: no pre-fetching, indexing, or storing of directions or distance matrix results except as the specific terms allow; also no use of Google content to train, test or fine-tune ML models (3.2.3(c)(vii)). Using a Google time on a MapLibre map is therefore not allowed |
| Mapbox | 100,000 free Directions requests and 100,000 free Matrix elements a month | $2.00 per 1,000 from 100,001 to 500,000; $1.60 to 1,000,000; $1.20 to 5,000,000 | 25 coordinates for `driving`; 10 for `driving-traffic`; 60 requests a minute (30 for traffic) | `driving-traffic` uses historical and live traffic when `depart_at` is near the current time (docs) | Terms on storing results and on non-Mapbox maps: **UNVERIFIED** (the legal pages read did not state them). Research/01 already found Mapbox GL v2 and above is not open source and Mapbox Search forbids a general POI database |
| HERE Routing and Matrix | UNVERIFIED (pricing page returned 403) | UNVERIFIED. A search result said the Base plan's free daily allowance excludes Matrix Routing; a reseller listed 2,500 free matrix transactions a month at about 4.40 euro per 1,000 after (unverified, may be old) | UNVERIFIED | Yes (HERE Routing with traffic) | Not read |
| TomTom | Routing 20,000 requests a month; Matrix 2,500 a month (pricing page) | Paid per-1,000 prices not read | Not read | Routing "with traffic" per the page | Not read |
| openrouteservice (HeiGIT public API) | Per the plans page quoted in a search snippet: Directions 2,000 a day, Matrix 500 a day, both 40 a minute | Free ("will stay free"), higher quotas on request by email | 3,500 locations per request (50 x 50) | None (OSM based) | Terms page text could not be read. Page itself not opened: **UNVERIFIED** |
| Stadia Maps | Free plan 200,000 credits a month, **commercial use not allowed** | Paid plans from $20 a month for 1,000,000 credits (commercial allowed), $80 for 7,500,000 | Standard route 20 credits; matrix 10 credits per element; so 20,000 matrix elements a month on the free plan | Traffic-influenced profiles 60 credits per request or element | Terms 15: server-side proxying or caching is not allowed except stated cases; free plan has "temp storage", persistent storage starts on the Standard plan (pricing table). No ban on other maps seen |
| Geoapify | 3,000 credits a day; commercial use allowed in production with attribution | Paid plans from $59 a month for 10,000 credits a day | Matrix up to 1,000 elements per call; credits = max(sources, targets) x min(sources, targets, 10) | Not stated on the pages read | Storage terms not found; service may be changed or suspended without notice (terms) |

Not checked: GraphHopper Directions API, Azure Maps, AWS Location, Baidu, and any Malaysian vendor.

A worked count so the numbers mean something: a four-day trip with 6 candidate stops a day (24 stops) needs a 24 x 24 matrix, 576 elements, plus a few detail routes. On Google that is one Essentials matrix call of 576 elements per trip build (625 limit), about 0.6 of a cent at the first tier; the 10,000 element free cap covers about 17 such builds a month. On the Geoapify free plan it is about 240 credits (24 x 10) out of 3,000 a day.

### 3.4 What a planner loses with free-flow times only

- Free-flow means the time on an empty road. The leg times in 3.1 are the best case.
- PLUS expects up to **2.24 million vehicles a day** across its network on the peak days around Deepavali (8 November 2026) and school holidays (7 to 10 November 2026), up to 17% above the 1.92 million daily average, and 68% more on LPT2 (42,000 against 25,000). It advises people to use its MyPLUS Travel Time Advisory (in the PLUS App from 31 October 2026) to choose a departure time and says higher traffic towards the Klang Valley is expected on the return days (PLUS media statement, 5 November 2026).
- PLUS itself says it will switch on "Smart Lanes" at 32 locations when traffic is heavy, and tells drivers to plan rest stops because R&Rs and lay-bys can be congested at peak.
- Roadworks that change times on this route right now: emergency lane closed at KM 329.9 to 329.35 northbound between Bidor and Tapah until **15 January 2027** (both main lanes stay open); the Juru-Sungai Dua traffic dispersal project near Penang (Package 1 at 54.61% on 8 November 2026; packages 2 to 5 still at tender) (PLUS statements, 13 and 17 November 2026).
- What a planner without traffic gets wrong: it may promise a 5 h 15 drive to Alor Setar on the first day of the year-end school holiday (Group A states start 4 December, Group B 5 December 2026). It cannot tell a family with a toddler or a grandparent that the stop plan will fail. It also cannot tell that lunch at 13:00 near Tapah will land in an R&R queue.
- Option to partly close the gap without live traffic: keep a table of "peak days" from the Ministry of Education calendar and the holiday lists (section 6) and add a safety margin to the free-flow time on those dates. This is a design choice, not data from a vendor; the margin would need real observations. Where a vendor's traffic-aware time is paid, request it only for the few final legs, not for the whole matrix.

---

## 4. Where Malaysians write about places

Published figures (these are **advertising reach in each company's ad tools, not unique people**, and they overlap):

| Platform | Malaysia figure (late 2025) | Source |
|---|---|---|
| Social media user identities | 30.7 million, 85.0% of the population (October 2025) | DataReportal, Digital 2026: Malaysia (Kepios) |
| Internet users | 35.4 million, 98.0% of the population | same |
| TikTok | 30.7 million users aged 18 and over | same |
| YouTube | 23.6 million | same |
| Facebook | 23.0 million | same |
| Instagram | 16.1 million | same |

- **The named official survey (MCMC Internet Users Survey 2024) could not be opened.** A news item says it ran from 1 October to 31 December 2024; the report with platform shares was not found. The 2018 MCMC survey had WhatsApp account ownership at 98.1%, Facebook 97.3%, Instagram 57.0% (search snippet of the MCMC PDF, not opened; there is no TikTok in that year). These are old. **No survey figure for Xiaohongshu in Malaysia was found.**
- First-hand writing about small local places in Kedah, Penang and Perak is most likely on: Google Maps reviews (the largest, but not storable or usable for AI, see research/04 and research/01), Facebook (pages, food groups and posts), TikTok (short videos with place tags, no text to quote), Instagram (captions), YouTube (food and travel vloggers, with captions), Xiaohongshu (Chinese-language itineraries for Penang and Ipoh, likely, **UNVERIFIED**), personal blogs, and forums such as Lowyat and Reddit (r/malaysia style threads). This list is a reasoned expectation, not a measured result.
- Platform terms: **no change** from research/03 and 04 for Meta, Google, TikTok, X and Reddit (no automated collection, embeds only, no AI use of Google content). New here and **not read**: Xiaohongshu terms, Lowyat forum terms. Do not scrape either until read.
- Languages. Malaysia's state populations (data.gov.my, 2023): Kedah 76.8% Malay, 11.4% Chinese, 5.9% Indian; Perak 55.5% Malay, 25.0% Chinese, 10.7% Indian; Pulau Pinang 41.1% Malay, 40.2% Chinese, 8.7% Indian. So expect Malay, English and Chinese text on the corridor, Tamil in smaller amounts, and mixed speech (Malay and English in one sentence, Chinese with English food names, Hokkien or Cantonese place names romanised in several ways). The share of each language in reviews was not measured.
- What this means for a product built for Japanese and English:
  - The **story writer** (people write or speak stories) needs Malay, Chinese and Tamil input and output, and must keep the person's own language as the record, as in Japan.
  - The **translation and grounding check** compares each sentence with its cited source. It must handle code-switching inside one source sentence, Chinese without spaces, Tamil script, and several romanisations of one name (for example Penang Hokkien names). Check on real Malaysian samples before trusting it. The Japan tests do not predict Malay or Tamil behaviour.
  - **Voice transcription** (research/05, 07) needs a fresh bake-off on Malaysian English, Manglish and Malay audio. No Malay speech result is in this lane.
  - Place names need a name-fallback chain per place, as in the region file's `nameFallback`. Today the best guess for a Penang food place is `name` (often Chinese or Malay) with `name:en` for 45% to 64% in the busiest parts and under 10% elsewhere.

---

## 5. The law: a technical reading of primary texts (not legal advice)

### 5.1 PDPA 2010 (Act 709) as amended by the Personal Data Protection (Amendment) Act 2024 (Act A1727)

Primary texts read: Act 709 reprint on the Commissioner's site and Act A1727 and the commencement order P.U.(B) 522 (the A1727 and P.U.(B) 522 PDFs were read from a law firm's copy of the Printer's text and gazette; the Attorney General's Chambers copy was not opened).

**What is in force today (2026-11-23).** Order P.U.(B) 522, 24 December 2024, under s.1(2) of Act A1727, appoints:
- **1 January 2025:** sections 7, 11, 13, 14 of A1727 (small and saving provisions, electronic service of notices).
- **1 April 2025:** sections 2, 3, 4, 5, 8, 10, 12. These: rename "data user" to "data controller" (s.2); add the definition "biometric data" and put it into "sensitive personal data" (s.3); make data processors directly bound by the Security Principle, with a higher fine of up to RM1,000,000 or 3 years or both (ss.4, 5); and rewrite s.129 on transfers abroad (s.12).
- **1 June 2025:** sections 6 and 9 of A1727. These insert the **data protection officer duty (new s.12A)**, the **breach notification duty (new s.12B)**, and the **right to data portability (new s.43A)**.
- Everything in A1727 is therefore in force. **Nothing in A1727 is still to come.** (Commissioner guidelines were issued after the Act: a search summary of law-firm notes says guidelines on DPO appointment and on breach notification in February 2025, effective 1 June 2025; cross-border transfer guidelines 29 April 2025; DPO competency 21 July 2025; and, per a 2026 Baker McKenzie alert, guidelines on impact assessments, data protection by design and automated decision-making. **These were not read from pdp.gov.my. UNVERIFIED.**)

**Does the Act reach a non-commercial open-source project?**
- s.2(1) of Act 709: the Act applies to a person who processes, or who controls or authorises processing of, "any personal data in respect of commercial transactions". s.4 defines "commercial transactions" as "any transaction of a commercial nature, whether contractual or not, which includes any matters relating to the supply or exchange of goods or services, agency, investments, financing, banking and insurance".
- Personal data is itself defined in s.4 as "information in respect of commercial transactions". So the Act's scope turns on a commercial purpose, not on whether the controller makes a profit.
- s.45(1) exempts personal data processed by an individual "only for the purposes of that individual's personal, family or household affairs, including recreational purposes". That exempts a person's own private use. It is hard to see it covering a public web service run for strangers.
- s.2(2): it reaches a person established in Malaysia (an individual present 180 days a year, a company under the Companies Act) and a person outside Malaysia who uses equipment in Malaysia, who must nominate a Malaysian representative (s.2(3)). The owner lives in Malaysia now, so the "established" limb is easy to meet.
- Reading: a free, unpaid story platform with no sale of goods or services sits in a grey area. If the product ever takes money from partners, sells trips, takes commission, or shows paid placements, it is within "commercial transactions". The Commissioner's reading of non-profit platforms is **UNVERIFIED**. This is the first question for counsel (carried from research/06 item 21).

**Sensitive personal data.** s.4: "physical or mental health or condition", "political opinions", "religious beliefs or other beliefs of a similar nature", "the commission or alleged commission of any offence", plus any data the Minister orders, plus (since 1 April 2025) "biometric data". So:
- A person's disability or mobility need is "physical or mental health or condition": **sensitive**. Age is not on the list.
- Diet that implies religion (halal, vegetarian for religious reasons) could reveal "religious beliefs": treat as sensitive when linked to an identifiable person (an inference, not a Commissioner statement).
- Voice recordings that are technically processed to identify a person are "biometric data" ("any personal data resulting from technical processing relating to the physical, physiological or behavioural characteristics of a person").
- s.40(1): sensitive data may be processed only with the data subject's **explicit consent**, or under one of the narrow listed conditions (employment, vital interests, medical purposes and so on).

**Children.** s.4 "relevant person": for a data subject **below 18**, the parent, guardian or person with parental responsibility. The Act has no separate age of digital consent in the text read. A trip party that lists children's ages is personal data about children; the safe design is that the adult account holder gives the details, with no child accounts. (Research/06 recommends 16+ accounts for the Online Safety Act. That is a separate law, see research/06 item 15.)

**Cross-border transfer.** The service stores data in Australia and sends text to AI services in the United States. Under s.129 as amended by A1727 s.12 (in force 1 April 2025): the old Minister's white list (s.129(1)) is deleted; a controller "may transfer" personal data abroad if the destination has a law substantially similar to the Act or ensures an adequate equivalent level of protection (s.129(2)), or if one of the listed conditions in s.129(3) applies: (a) the data subject has consented; (b) necessary for a contract with the data subject; (c) necessary for a contract in the data subject's interest; (d) legal proceedings; (e) avoiding adverse action where consent is impracticable; (f) the controller took all reasonable precautions and exercised due diligence so the data will not be processed abroad in a way that would break the Act; (g) vital interests. (Old paragraph (h), "public interest as determined by the Minister", is deleted.) For a small product the practical routes are (a) named consent and (f) contract terms plus checks. Whether Australia or the United States count as "substantially similar" under (2) is not decided in the text; the Commissioner's cross-border guidelines (29 April 2025) were not read. **UNVERIFIED.**

**Data protection officer.** New s.12A: a controller "shall appoint one or more data protection officers"; a processor too; the controller must notify the Commissioner (s.12A(3)). Duty applies to controllers within the Act. Whether a small controller is exempt by a size or volume threshold is in the Commissioner's guideline, **not read**. A search summary says qualifying organisations must register the DPO on the Commissioner's portal within 21 days of appointment (UNVERIFIED).

**Breach notice.** New s.12B: if the controller has reason to believe a personal data breach has occurred it shall notify the Commissioner "as soon as practicable"; if the breach causes or is likely to cause **significant harm** it shall notify affected data subjects "without unnecessary delay". Failing to notify the Commissioner is an offence: fine up to RM250,000 or 2 years or both (s.12B(3)). A "personal data breach" is defined in s.4 as any breach, loss, misuse or unauthorised access of personal data. A search summary puts the time limit in the guideline at 72 hours (UNVERIFIED, not read).

**Official texts and the regulator.**
- Act 709 (Commissioner's copy, Malay and English): `https://www.pdp.gov.my/wp-content/uploads/2024/07/UNDANG-UNDANG-MALAYSIA_AKTA_PERLINDUNGAN_DATA_PERIBADI_2010_709_MALAY_AND-ENG_V2022.pdf`. This copy predates A1727 (it still says "data user" and has the old s.129).
- Act A1727: Royal Assent 9 October 2024, gazetted 17 October 2024 (copy read: `https://christopherleeong.com/wp-content/uploads/2024/12/PDPA-Amendment-Act-A1727.pdf`). Commencement order: `https://christopherleeong.com/wp-content/uploads/2024/12/PDPA-Amendment-PUB.pdf` (P.U.(B) 522, dated 19 December 2024, gazetted 24 December 2024). The official gazette is published by the Attorney General's Chambers (`https://lom.agc.gov.my`); that copy was not opened.
- Regulator: Jabatan Perlindungan Data Peribadi (Personal Data Protection Commissioner's office), `https://www.pdp.gov.my`.

### 5.2 Copyright Act 1987 (Act 332): quoting a public review or post

Text read: the AGC "online version of updated text of reprint", Act 332 as at 30 June 2022, on WIPO Lex (`https://www.wipo.int/wipolex/en/text/597931`). Later amendments after that date were not checked.

- **s.13(2)(a): fair dealing.** The right to control copying and communication "does not include the right to control the doing of any of the acts referred to in subsection (1) by way of fair dealing including for purposes of research, private study, criticism, review or the reporting of news or current events", with a proviso: "it is accompanied by an acknowledgement of the title of the work and its authorship" (no acknowledgement needed for reporting news by sound recording, film or broadcast).
- **s.13(2A): the four factors**, which must be considered for fair dealing under 13(2)(a): the purpose and character of the dealing, "including whether such dealing is of a commercial nature or is for non-profit educational purposes"; the nature of the work; the amount and substantiality of the part used; and the effect on the market for the work.
- **Quotation clause** in s.13(2) (paragraph letter lost in the text conversion): "the making of quotations from a published work if they are compatible with fair practice and their extent does not exceed that justified by the purpose, including quotations from newspaper articles and periodicals in the form of press summaries", provided "mention is made of the source and of the name of the author which appears on the work".
- What this means for the product: a short quote with the author's name, the source and a link, used to discuss or report on a place, is in the shape the Act allows. The wording "published work" and the commercial-nature factor mean it is not a licence to reproduce reviews in bulk. The test is open; there is no Malaysian case in this research. Whether a social media post or a review is a "published work" for this clause was not decided here. **UNVERIFIED.**
- No clause on **text and data mining** was found in the text read (a search for "text and data" and "data mining" in the reprint returned no hit). Research/04 notes a 2026 MyIPO consultation on this, not read. So an AI claim extraction run over third-party reviews has no explicit Malaysian exception; the platform terms (research/04, 06) are the stronger limit anyway.
- **Moral rights and attribution:** the Act's acknowledgement proviso is the main attribution rule. Moral rights provisions were not read. Research/06's Japan point about inline display and attribution should be re-asked for Malaysia.

### 5.3 Collecting public reviews

- No Malaysian statute or case on collecting publicly visible reviews was found. Computer Crimes Act 1997 and Communications and Multimedia Act 1998 s.233 were not re-read here; section 233 and Online Safety Act 2025 are in research/06 items 15 and 16.
- The strongest limits are **platform terms** (research/03, 04: Meta, TikTok, X and Google ban automated collection) and **PDPA** if the review text names a person. A review with a username is personal data about that person; the Act applies only when it is "in respect of commercial transactions", and a review of a business plausibly is. Treat it as personal data.

---

## 6. Fact sheet for the sample route (test case)

### 6.1 The four legs

| Leg | Road distance (OSRM, free-flow) | Usual drive time | Highway | Tolls for a private car (Class 1) | Main rest areas |
|---|---|---|---|---|---|
| Kuala Lumpur to Alor Setar | 433.3 km | 5 h 15 free-flow (315 min). Real time is longer with stops; not measured | E1 North-South Expressway (PLUS), 408.9 km of it | **Not confirmed.** Secondary source: Damansara to Juru RM35.26 (Class 1); no Alor Setar fare found | PLUS R&Rs and lay-bys. On the part read: Ulu Bernam S km 398, Tanjong Malim N km 396.4, Tapah N/S km 331.8/331.6. Full list not read |
| Alor Setar to George Town | 114.6 km | 91 min | E1 then Penang Bridge E36 (9.9 km), then Lim Chong Eu expressway | **Not confirmed.** Penang Bridge toll not found; Jitra plaza has card tap-to-pay (PLUS) | Tikam Batu lay-by S km 112.5 (Kedah) is on the Kedah section, direction and exact route to be checked |
| George Town to Ipoh | 156.9 km | 123 min | Penang Bridge E36, then E1 (127.8 km) | **Not confirmed.** | Tapah is south of Ipoh, not on this leg. Full list not read |
| Ipoh to Kuala Lumpur | 197.3 km | 148 min | E1, then NKVE and city streets | Secondary source: Jalan Duta to Ipoh toll plaza **RM21.73** (Class 1), same corridor reversed | Tapah, Tanjong Malim, Ulu Bernam read. Full list not read |
| **Loop total** | **902.1 km** | **about 11 h 17 min of free-flow driving** | | | |

Sources for tolls: `https://www.motorist.my/article/2829/list-of-malaysia-highway-toll-rates-plus-klk-lpt-and-others` (updated 22 May 2026; a car magazine site, **secondary**). PLUS says it offers a toll fare calculator on its site and app; it was not run, so no official fare was confirmed. Do not show a toll total as fact until read from PLUS.

Practical note for the test case: the legs above are city-centre to city-centre. The sample route also has "other stops along the way" (for example Tapah, Kuala Kangsar, Taiping, Kuala Sepetang, Sungai Petani). Re-run the legs with those stops when they are listed.

### 6.2 Calendar for the next three months (23 November 2026 to about 23 February 2027)

**School holidays (Ministry of Education calendar; primary).**
- Kedah is in **Kumpulan A** (Kedah, Kelantan, Terengganu). Perak, Pulau Pinang, Selangor, Kuala Lumpur and the others are **Kumpulan B**. Source: Ministry of Education circular and calendar PDFs on `https://www.moe.gov.my/takwim` pages.
- **Year-end school holiday 2026:** Group A 4 December to 31 December 2026; Group B 5 December to 31 December 2026 (2026 calendar, annexes A and B). Schools reopen **4 January 2027** for both groups (2027 calendar circular, ref. KPM.100-1/3/2 JLD.14(11), 2 October 2026).
- **Chinese New Year 2027** (6 and 7 February, Saturday and Sunday): the Ministry gives extra school holidays: Group A Kedah three days (9, 10, 11 February); Group A Kelantan and Terengganu four days (8 to 11 February); Group B five days (5 February and 9 to 12 February). The next term holiday after that: Group A 5 to 13 March 2027, Group B 6 to 14 March 2027 (outside the three months).
- Earlier year (for context): Deepavali on 8 November 2026 got an extra school day for both groups (Group A 9 November, Group B 10 November except Sarawak).
- **Kedah's weekend.** The Ministry's table still puts Kedah in the group with Kelantan and Terengganu. News results through 2025 to 2026 still describe Kedah, Kelantan and Terengganu as Friday and Saturday weekend states; Johor moved to Saturday and Sunday on 1 January 2025 (the Johor Regent's announcement was reported in October 2024). **No change for Kedah was found, but no official Kedah statement was read, so UNVERIFIED.** Check the Kedah State Secretary's Office before planning a Kedah leg that starts on a Friday or Saturday. If Kedah still has a Friday and Saturday weekend, government offices there follow it, so a Kedah stop that depends on an office or a state-run site needs a check; private shops were not researched.

**Public holidays (Cabinet Division gazette tables, primary).** The state tables list columns in this order: Kuala Lumpur, Labuan, Putrajaya, Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu. The column order was confirmed from the 2027 PDF image.

| Date | Holiday | National? | Kedah | Penang | Perak |
|---|---|---|---|---|---|
| Sat 5 Dec 2026 onwards | Year-end school holiday starts (not a public holiday) | no | yes (4 Dec) | yes (5 Dec) | yes (5 Dec) |
| Fri 25 December 2026 | Christmas | yes | yes | yes | yes |
| Fri 1 January 2027 | New Year (state holiday) | no | **no** | yes | yes |
| Wed 6 January 2027 | Israk and Mikraj | no | **yes** | no | no |
| Fri 22 January 2027 | Thaipusam | no | **no** | yes | yes |
| Sat 6 and Sun 7 February 2027 | Chinese New Year (second day is a state holiday only in Kelantan and Terengganu; elsewhere it is on the federal list) | yes | yes | yes | yes |
| Mon 8 February 2027 | Awal Ramadan (state holiday, marked * subject to change) | no | **yes** (and Johor) | no | no |
| Wed 24 February 2027 | Nuzul Al-Quran | no | no | yes | yes |

Notes: 6 November 2026 (Sultan of Perak's birthday, Perak only) and 8 November (Deepavali) have passed. The federal list has no other national holiday between 25 December 2026 and 6 February 2027. All dates come from `HKA-2026.pdf` and `HKA_2027.pdf` on kabinet.gov.my. Items marked * (Hari Raya, Awal Ramadan and similar) are "subject to change" per the Cabinet Division. **Ramadan 2027 begins about 8 February**: expect changed restaurant hours and many Muslim-owned eateries closing by day for the month. Hari Raya Puasa 2027 is listed on 10 and 11 March (outside the window).

**Monsoon for the north-west coast.**
- MET Malaysia describes two regimes: the Southwest Monsoon from late May to September and the Northeast Monsoon from November to March; the Northeast Monsoon brings heavy rain mainly to the east coast; the west coast is drier then. (Seen in a search snippet of the MET Malaysia page `https://www.met.gov.my/en/pendidikan/fenomena-cuaca/`; the page would not open from here: connection refused. **UNVERIFIED.**)
- MET Malaysia's long-range outlook (`https://www.met.gov.my/data/climate/tinjauancuacajangkapanjang_en.pdf`, seen in a search snippet, not opened) says the Northeast Monsoon began on 27 October 2026 and lasts to March 2027, with three to five episodes of prolonged heavy rain, and slightly below-average rainfall expected in northern Peninsular Malaysia through April 2027. **UNVERIFIED.**
- Practical use: for Kedah, Penang and Perak the planner should use the live 7-day forecast from data.gov.my (section 2.1), not a season average. Heavy-rain advice from PLUS applies to the highway (slow down, stop at R&R if visibility drops).

**Visit Malaysia Year.**
- Yes, **2026 is Visit Malaysia Year (VM2026)**. The Prime Minister launched the campaign on 6 January (reported by Bernama through the MREM press service, `https://mrem.bernama.com/viewsm.php?idm=50102`; it unveiled the logo, mascot, theme song and aircraft livery and signed collaboration agreements with partners including Malaysia Airlines, AirAsia, Batik Air, airports, Mastercard, Marriott, and hotel and travel associations). MOTAC's page describes the "Kempen Mesra Malaysia" hospitality campaign launched on 11 February 2026 at KL Sentral as a key VM2026 initiative (`https://www.motac.gov.my/en/motac-launches-mesra-malaysia-campaign-to-elevate-hospitality-standards-for-visit-malaysia-2026/`).
- What the campaign provides to a planner: a brand, events, airline and hotel partnerships and a hospitality-service campaign. **No open dataset, event feed or API was found** in this research. The official `malaysia.travel` VM2026 page returned 403 and was not read. The year ends on 31 December 2026, which is five weeks from today.

---

## What carries over from the Japan research and what does not

**Carries over unchanged:**
- Map stack from research/01: MapLibre, a self-hosted PMTiles or OpenFreeMap basemap, and "do not use tile.openstreetmap.org in production". Region as configuration works for tiles, bounding box, name-script fallbacks.
- Google Places and Maps content rules (research/01, 04, 06): store only the place id, no reviews stored, no AI on Google content, and for Routes the extra rule 19.2 below.
- ODbL for OSM (attribution, share-alike on a derived database) and the Overture permissive licences. Research/02's "candidate list a person confirms" model stays.
- Platform terms on automated collection (Meta, TikTok, X, Google): no change found. Apify and scraping verdicts stand.
- CC BY-SA 4.0 for Wikipedia and Wikivoyage, CC0 for Wikidata, CC BY 4.0 for data.gov.my.

**Does not carry over:**
- **There is no national open tourism dataset.** Japan had BODIK city portals, MLIT and JTA datasets. Malaysia's portal has 367 datasets and none on places. Seeds must come from OSM and Overture, then people. Research/02's open-data seed list shrinks to OSM, Overture, Wikidata, Wikipedia, the heritage PDFs.
- **Overture is the richer set in Malaysia, OSM is the richer-tagged set only in George Town.** In Japan the reverse looked likely. Opening hours exist in neither for most places.
- **Halal and OKU facts are new needs with no data source.** Japan had no equivalent; the Malaysian product turns on them.
- **Routing.** Japan work did not look at routing. Here Google's Routes rule 19.2 (no non-Google map) conflicts with the MapLibre decision in research/01, and PLUS tolls are not priced by any open engine.
- **Law.** Research/06 row 14 said DPO and breach duties exist "since 2025-06-01": confirmed from the gazette order. Updates: the cross-border rule is now a "may transfer" test with listed conditions (s.129(2), (3)), not a Minister's white list; "biometric data" is sensitive from 1 April 2025; health and disability are sensitive under the original s.4. Japan's APPI consent for transfer abroad names the country; Malaysia's consent route is s.129(3)(a). Age: Malaysia's "relevant person" is parent or guardian for under 18, not under 16.
- **Languages.** The story writer and translation check were built for Japanese and English. Malaysia needs Malay, Chinese, Tamil and mixed speech.
- **Calendar.** School calendars have two state groups (A and B), Kedah's weekend differs, and Ramadan and Chinese New Year change hours; none of this exists in the Japanese region file.

---

## Decisions only the owner can make

1. **Routing vendor or self-host.** Options in 3.2 and 3.3. Key trade-offs: Google Routes gives live traffic but forbids use with a non-Google map and storing results; self-hosting gives no traffic and no toll price but no per-call cost; Stadia free plan forbids commercial use; Mapbox, HERE and TomTom storage terms were not read. The owner picks. This research did not.
2. **Whether to pay for traffic-aware times** for the final legs, or to use a peak-date margin (3.4).
3. **Legal position on the PDPA.** Whether to operate as if the Act applies (appoint a DPO, register it, write a breach plan, record explicit consent for disability and religion-linked diet data) or to take counsel's view that a non-commercial project is outside s.2(1). The answer changes if partners ever pay.
4. **Where trip profiles live.** Ages, disability needs and diet of the people in the car are sensitive (health, possibly religion). Decide whether they are stored on the person's device or in the service, and the consent text (s.40, s.129(3)(a)) naming Australia and the AI provider country.
5. **Use of Overture's Meta-derived places in Malaysia** as candidate seeds, and whether to dedupe against OSM first.
6. **Halal handling.** Link out to JAKIM only, or let people add and cite halal confirmations; never turn a missing tag into "not halal".
7. **Approaching organisations:** MOTAC and Tourism Malaysia (MyTQA OKU list, event feed), Think City and GTWHI (heritage inventories), Perak, Kedah and Penang tourism bodies (terms), and PLUS (full rest-area list and an official toll fare).
8. **Whether the product keeps its "quote briefly with a link back" rule** for Malaysian posts as written for Japan (Copyright Act s.13(2) differs from Japan's Art. 32) or asks counsel for a Malaysian version.
9. **Kedah weekend and Ramadan hours:** whether the planner may assume them from this research or must verify with Kedah authorities first.

---

## What could not be verified

- MCMC Internet Users Survey 2024 platform shares. Xiaohongshu use in Malaysia. Lowyat and Xiaohongshu terms.
- Official PLUS toll fares for any leg (calculator not scriptable); Penang Bridge toll; full PLUS R&R list (only page 1 of 5 read).
- Kedah's current weekend (no official statement read). Kedah and Penang tourism bodies. Tourism Malaysia terms (403).
- MET Malaysia monsoon pages (connection refused; only search snippets).
- Commissioner's guidelines on DPO, breach and cross-border transfer (secondary summaries only). Official AGC copy of A1727.
- JAKIM directory terms (none found). Think City and GTWHI terms (not read). MyTQA list of 136 OKU-friendly products.
- Mapbox, HERE, TomTom storage and non-proprietary-map terms and paid per-1,000 prices (HERE and TomTom); ORS plan page text (snippet only); self-hosted engine memory on the Malaysia extract (not measured); GraphHopper toll handling.
- Which heritage register list is current. Wikidata counts for the corridor (not run). Wikivoyage listing counts for George Town and Taiping (title mismatch).

---

## Sources (all read 2026-11-23 unless marked)

Place data:
- Overpass API (`https://overpass-api.de/api/interpreter`, `https://overpass.kumi.systems/api/interpreter`): count queries, scratch script `.scratch/research-12/ovq.py`, results `counts.json`.
- Overture Maps release catalogue `https://stac.overturemaps.org/catalog.json`; places `s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/` (scripts `ov.py`, `ov2.py`).
- Geofabrik Malaysia, Singapore, Brunei: `https://download.geofabrik.de/asia/malaysia-singapore-brunei.html`; planet file size from `https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf` (header only).
- Wikipedia and Wikivoyage APIs: `https://en.wikipedia.org/w/api.php`, `https://en.wikivoyage.org/w/api.php`.

Malaysian sources:
- `https://developer.data.gov.my/`, `https://developer.data.gov.my/rate-limit`, `https://developer.data.gov.my/realtime-api/weather`, `https://developer.data.gov.my/realtime-api/gtfs-static`, `https://api.data.gov.my/data-catalogue?id=datasets`, `https://api.data.gov.my/weather/forecast`, `https://api.data.gov.my/data-catalogue?id=population_state`.
- Heritage register: `https://www.heritage.gov.my/images/05_daftarwarisan/BANGUNAN_Warisan%20Kebangsaan.pdf`, `https://www.heritage.gov.my/images/05_daftarwarisan/TAPAK%20ARKEOLOGI_Warisan%20Kebangsaan.pdf`.
- Halal portal: `https://myehalal.halal.gov.my/portal-halal/`.
- MOTAC: `https://www.motac.gov.my/en/motac-launches-mesra-malaysia-campaign-to-elevate-hospitality-standards-for-visit-malaysia-2026/`; Bernama via MREM: `https://mrem.bernama.com/viewsm.php?idm=50102`; Tourism Malaysia VM2026 page (403): `https://malaysia.travel/page/visit-malaysia-2026`.
- Perak tourism board: `https://tourismperakmalaysia.com/` (listing only, seen in search).
- GTWHI FAQ (seen in search): `https://gtwhi.com.my/frequently-asked-questions/`; Think City portal (seen in search): `https://thinkcity.com.my/urban-analytics-portal/`.
- PLUS: `https://www.plus.com.my/`, `https://www.plus.com.my/our-facilities/`, `https://www.plus.com.my/our-expressways/`, `https://www.plus.com.my/plan-your-journey/`, media statements of 5, 13 and 17 November 2026 under `https://www.plus.com.my/wp-content/uploads/2026/11/`.
- Toll rates (secondary): `https://www.motorist.my/article/2829/list-of-malaysia-highway-toll-rates-plus-klk-lpt-and-others`.
- Ministry of Education: `https://www.moe.gov.my/kalendar-akademik-semasa`; circular `https://www.moe.gov.my/storage/files/shares/pekeliling_dan_garis_panduan/surat_siaran/SS%20KPM%20Bil.%201%20Tahun%202026%20-%20Kalendar%20Akademik%20Tahun%202027.pdf`; calendars `.../Takwim/Takwim%20Persekolahan/Kalendar%20Akademik%202026.pdf` and `.../Kalendar%20Akademik%20Tahun%202027.pdf`.
- Cabinet Division public holidays: `https://www.kabinet.gov.my/hari-kelepasan-am/` with `https://www.kabinet.gov.my/storage/2025/08/HKA-2026.pdf` and `https://www.kabinet.gov.my/storage/2026/08/HKA_2027.pdf`.
- MET Malaysia (not opened): `https://www.met.gov.my/en/pendidikan/fenomena-cuaca/`, `https://www.met.gov.my/data/climate/tinjauancuacajangkapanjang_en.pdf`.
- DataReportal Digital 2026 Malaysia: `https://datareportal.com/reports/digital-2026-malaysia`.

Law:
- Act 709: `https://www.pdp.gov.my/wp-content/uploads/2024/07/UNDANG-UNDANG-MALAYSIA_AKTA_PERLINDUNGAN_DATA_PERIBADI_2010_709_MALAY_AND-ENG_V2022.pdf`.
- Act A1727 and order P.U.(B) 522 (law firm copies of the official text): `https://christopherleeong.com/wp-content/uploads/2024/12/PDPA-Amendment-Act-A1727.pdf`, `https://christopherleeong.com/wp-content/uploads/2024/12/PDPA-Amendment-PUB.pdf`. Regulator: `https://www.pdp.gov.my`. Attorney General's Chambers law portal: `https://lom.agc.gov.my` (not opened).
- Copyright Act 1987 (Act 332), AGC updated text as at 30 June 2022: `https://www.wipo.int/wipolex/en/text/597931`.
- Commissioner guidelines (secondary summaries, search only): CMS, Baker McKenzie, DLA Piper, Mayer Brown notes on DPO, breach notification and cross-border guidelines.

Routing and hosted services:
- OSRM: `https://github.com/Project-OSRM/osrm-backend` (LICENSE.TXT, `profiles/car.lua`, `src/tools/routed.cpp`); public demo `https://router.project-osrm.org/`.
- Valhalla: `https://github.com/valhalla/valhalla` (COPYING, `src/sif/autocost.cc`, `scripts/valhalla_build_config`).
- GraphHopper: `https://github.com/graphhopper/graphhopper` (LICENSE.txt, `docs/core/deploy.md`, README).
- Google: `https://developers.google.com/maps/documentation/routes/usage-and-billing`, `https://developers.google.com/maps/documentation/routes/compute_route_matrix`, `https://developers.google.com/maps/billing-and-pricing/pricing`, `https://cloud.google.com/maps-platform/terms/maps-service-terms` (Routes API section 19, last modified 28 October 2026), `https://cloud.google.com/maps-platform/terms` (3.2.3, last modified 26 August 2026).
- Mapbox: `https://www.mapbox.com/pricing`, `https://docs.mapbox.com/api/navigation/matrix/`, `https://docs.mapbox.com/api/navigation/directions/`, `https://www.mapbox.com/legal/tos`.
- TomTom: `https://developer.tomtom.com/pricing`. HERE: pricing page returned 403; search only.
- openrouteservice: plans page (search snippet, redirect to `https://account.heigit.org/info/plans`, content not rendered).
- Stadia: `https://stadiamaps.com/pricing/`, `https://stadiamaps.com/terms-of-service/`. Geoapify: `https://www.geoapify.com/pricing/`, `https://www.geoapify.com/pricing-details/`, `https://www.geoapify.com/terms-and-conditions/`.

Earlier research files used for comparison: research/01-maps-geocoding.md, 02-open-data-seed.md, 03-social-embed-import.md, 04-scraping-bootstrap.md, 05-ai-layer.md (format), 06-legal-policy-gaps.md.
