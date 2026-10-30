# 02 - Open data for real seed places (Nagasaki city, Isahaya, Omura, Nomozaki, Hashima)

Researched 2026-10-29 (all access dates below are 2026-10-29). Primary sources only: official docs, ToS, licence texts, and live queries against the services themselves. Anything I could not confirm from a primary source is marked UNVERIFIED. No scraping of Instagram, Google, TikTok or X; no accounts or API keys were created; every live query was one request at a time with a descriptive User-Agent.

Region definitions used for counts (so they can be reproduced):
- Nagasaki city = OSM relation 4011885 (Overpass area 3604011885). Isahaya = relation 4012066, Omura = 4011808. Nomozaki and Hashima are inside Nagasaki city (merged 2005) and have no OSM boundary, so Nomozaki = bbox (32.54,129.70)-(32.66,129.84) (this bbox also contains Takashima and Hashima) and "Nomozaki peninsula" = the part of that bbox south of lat 32.605.
- Overture Places counts use the Overture division_area polygons for 長崎市, 諫早市, 大村市 (release 2026-10-21.0).

## Summary table

| # | Item | What it gives us | Cost / auth | Licence (what it forces) | Nagasaki coverage measured | Verdict |
|---|------|------------------|-------------|--------------------------|-----------------------------|---------|
| 1 | OpenStreetMap (use Geofabrik Kyushu extract, not public Overpass, at runtime) | Hand-mapped coordinates for shrines, temples, churches, museums, viewpoints, memorials; some shops | Free, no key | ODbL: attribution + share-alike on any public derivative database | Nagasaki city: 1,301 POIs, only 29 cafes, 8 craft; Isahaya 121; Omura 630 (401 unnamed); Nomozaki peninsula 16 | MVP for heritage/shrines/viewpoints; NOT enough for small businesses |
| 2 | Overture Maps Places (2026-10-21.0) | Candidate list of businesses with name, category, website/social, phone, confidence | Free, no key (S3 / DuckDB) | Places theme: per-source permissive (CDLA-Permissive-2.0, Apache-2.0, CC0); no share-alike | Nagasaki city 9,856 places (335 cafes/coffee shops, 5,279 with website); Isahaya 2,713; Omura 1,961 | MVP as an unverified candidate list; snapshot it (old releases deleted after 60 days) |
| 3 | Foursquare OS Places | Same kind of POI list | Free but registration/token (since Oct 2025) | Apache-2.0 + NOTICE.txt | Subset already inside Overture (712 Nagasaki-city places carry a Foursquare source) | Avoid direct; consume it via Overture |
| 4 | Wikidata (SPARQL) | Stable IDs, ja/en labels, coordinates, images, official websites, heritage status | Free, no key | CC0 | 459 items with coordinates under Nagasaki city; Isahaya 105; Omura 68 | MVP (identifier spine for landmarks) |
| 5 | Wikipedia (ja/en) | Citable landmark summaries, geosearch | Free, no key; User-Agent required | CC BY-SA 4.0 (+GFDL): attribution, indicate changes, share-alike on adapted text | ja: 335 articles within 10 km of city centre; en: 58 | MVP for landmark text (cite per sentence) |
| 6 | Wikivoyage (en/ja) | Traveller listings | Free | CC BY-SA 4.0 | en: one Nagasaki article (~34 listings); ja: 0 geotagged articles | Later (too sparse) |
| 7 | Wikimedia Commons | Landmark photos with per-file licences | Free | Per file; sampled 159 files near Hashima are all CC BY or CC BY-SA | 159 geotagged files within 2 km of Hashima; central Nagasaki saturates the 500 limit | MVP for landmark images (store licence + author per file) |
| 8 | Nagasaki city/prefecture/Isahaya/Omura/Saikai open data on BODIK | Cultural property lists, sightseeing spots, shopping streets, food-business licence list, events | Free, no key (CKAN API) | CC BY 4.0 (dataset licence field) | City 155 datasets; prefecture 202; ながさき旅ネット CSV has 220 Nagasaki-city rows (216 with lat/lon); food-licence list 6,138 rows (no coordinates) | MVP (best authoritative Japanese-language source) |
| 9 | Japan GSI (tiles, address-search geocoder) | Japan basemap; address-to-coordinate lookup | Free, no key | PDL1.0 (CC BY 4.0 compatible); attribution; some survey-act uses need approval | Geocoder tested: returned a coordinate for a city address | MVP (basemap + geocoding for address-only lists) |
| 10 | MLIT 国土数値情報 (KSJ) | National GIS layers (tourism resources, facilities) | Free download | PDL1.0 default; per-dataset terms | Not queried | Later |
| 11 | e-Stat API | Statistics by area (establishment counts) | Free registration required | Commercial use OK with attribution (CC BY 4.0 compatible) | Not place-level | Later / not for seed places |
| 12a | JNTO | Visitor statistics only | n/a | Terms UNVERIFIED | No place data | Avoid for seed |
| 12b | MLIT/Japan Tourism Agency multilingual commentary DB (地域観光資源の多言語解説文データベース) | Official ja+en (zh/ko) descriptions of regional tourism resources | Free Excel download | Free reuse incl. commercial; credit + mark edits; third-party rights on you | 354 Nagasaki-prefecture entries (all with ja+en text); 116 mention our target places | MVP (sourced English text for landmarks) |
| 13 | 文化遺産オンライン (Cultural Heritage Online) | Museum collections, designated heritage | Search API exists (undocumented on pages read) | All rights reserved style; images belong to museums | Not harvested | Later, link-out only |
| 14 | Recruit Hot Pepper Gourmet API | Restaurant search (only shops advertising on Hot Pepper) | Free key by registration | ToS: may not copy results into a database, 24 h cache, credit mandatory, can be cut off without notice | Not queried (no key) | Avoid for storage; later as live link |
| 15 | Tabelog | none public | n/a | ToS prohibits copying/reuse and commercial access | n/a | Avoid |
| 15b | Gurunavi / Yahoo! Local Search API | Restaurant / local search | Key | Gurunavi UNVERIFIED; Yahoo storage terms UNVERIFIED | n/a | Avoid for seed; Yahoo later |
| 16 | Flickr (CC geotagged) | Photos by bbox + licence filter | Key; commercial key needs approval | Per photo CC; API ToU forbids caching photos beyond reasonable periods | Not queried (no key) | Later (hotlink + attribute) |
| 17 | Mapillary | Street-level imagery, map features | Client token | Imagery CC BY-SA (ToS s.3b), logo attribution | Not queried (no token); coverage UNVERIFIED | Later / likely avoid |
| 18 | Malaysia: data.gov.my, MOTAC, OSM Penang/Melaka/Kuching | Later region | data.gov.my open API, 4 req/min | CC BY 4.0 (portal); OSM ODbL | OSM George Town 2,723, Melaka 2,594, Kuching 2,435 POIs in test bboxes | Later; OSM is far richer there than in Nagasaki |

Three things that matter most for the plan:
1. OSM is too thin in Nagasaki to seed small businesses (29 cafes city-wide). Overture (335 cafes/coffee shops) plus the city's food-business licence list (6,138 rows) are the practical business candidate sources, and both need human verification before anything is shown.
2. For landmarks, heritage and shrines, a strong free stack exists: OSM + Wikidata + city/prefecture CC BY 4.0 lists + the MLIT multilingual commentary DB.
3. Hot Pepper, Flickr and Mapillary terms forbid or limit storing their content; use them live with credit, never as seed.

---

## 1. OpenStreetMap via Overpass (and the Geofabrik extract)

Live queries (Overpass, planet snapshot timestamp 2026-10-29T06:12:59Z, one union query per area, tags downloaded and analysed locally):

```
[out:json][timeout:180];
area(3604011885)->.a;
( nwr[amenity~"^(cafe|restaurant|bar|pub|fast_food|place_of_worship|arts_centre|public_bath)$"](area.a);
  nwr[shop](area.a); nwr[craft](area.a); nwr[historic](area.a); nwr[tourism](area.a); );
out tags center;
```

Nagasaki city (counts overlap between categories; UNION = unique elements):

| Category | n | with name | name:ja | name:en | website | opening_hours | phone | wikidata |
|---|---|---|---|---|---|---|---|---|
| amenity=cafe | 29 | 23 | 3 | 11 | 3 | 6 | 3 | 0 |
| amenity=restaurant | 168 | 136 | 18 | 41 | 10 | 18 | 13 | 0 |
| amenity=bar / pub | 7 | 3 | 1 | 5 | 0 | 2 | 0 | 0 |
| amenity=fast_food | 20 | 18 | 15 | 17 | 0 | 4 | 0 | 0 |
| amenity=place_of_worship | 210 | 148 | 24 | 38 | 6 | 5 | 9 | 26 |
| shop=* | 363 | 295 | 112 | 144 | 11 | 35 | 16 | 3 |
| craft=* | 8 | 8 | 3 | 2 | 1 | 1 | 1 | 0 |
| historic=* | 120 | 87 | 22 | 42 | 3 | 2 | 2 | 15 |
| tourism=* | 372 | 251 | 56 | 122 | 42 | 18 | 32 | 42 |
| UNION | 1,301 | 970 | 249 | 416 | 75 | 90 | 75 | 84 |

Reading the numbers:
- Japanese names live in `name` (869 of the 970 named elements contain kana/kanji); `name:ja` is rare (249), so do not filter on it. `name:en` exists on 416 (43% of named).
- craft=* is 8 elements (4 confectionery, 1 each tatami, caterer, stonemason, yes). There is essentially no craft layer to seed from.
- shop=* is dominated by chains and utilities (92 convenience, 43 supermarkets, 19 car dealers, 15 hairdressers). My heuristic for independent named cafes/restaurants/bars/craft/shops (no brand tag, excluding chain-type shop subtypes) gives 245 in the whole city, and only 46 of those have a website, opening hours or phone.
- Named places of worship: 65 Shinto, 55 Buddhist, 18 Christian, 4 Taoist, 1 Tenrikyo, 5 untagged. historic=* is mostly memorials (57) and buildings (17). tourism=* is 113 information boards, 58 viewpoints, 51 hotels, 43 attractions, 40 museums, 37 artworks.
- 113 elements carry `source=GSImaps/std` and 16 `source=KSJ2` (GSI / MLIT derived), so some OSM data is itself a re-use of government data.

Other areas (same query, same method):

| Area | POIs | named | name:en | website | opening_hours | notes |
|---|---|---|---|---|---|---|
| Isahaya city | 121 | 107 | 20 | 4 | 2 | 1 cafe, 9 restaurants; no independent business has contact tags |
| Omura city | 630 | 229 | 89 | 5 | 14 | 401 elements have no name (bulk-mapped); 15 cafes (7 named) |
| Nomozaki bbox (incl. Takashima, Hashima) | 40 | 22 | 7 | 1 | 0 | 1 shop; 12 places of worship |
| Nomozaki peninsula (south of 32.605) | 16 | 4 | - | - | - | essentially unmapped |
| Hashima island box | 9 | 9 | - | - | - | island and coal-mine ways (wikidata Q285468), 軍艦島 attraction node, shrine, memorial, 3 viewing spots, Skyfall filming-location marker |

(a) What it does for us: hand-mapped, human-verified coordinates and names for heritage, shrines/temples/churches (210 in Nagasaki city), museums, viewpoints and memorials. Weak for small businesses (see counts).
(b) Auth/friction: none. Overpass needs a descriptive User-Agent.
(c) Pricing: free. The public Overpass wiki policy (fetched) says one-off use under 10,000 queries/day and 1 GB/day does not disturb others; "regular use" divides those by 100; do not run parallel scripts; commercial use should use self-hosted or paid; do not run it from fast-deployed AI-app platforms such as lovable.app or netlify.app; the page itself says "Nowadays this server is overloaded". I observed this: the first query at 06:12 UTC returned HTTP 502 "at capacity" with advice to run a local instance for automated use; the same request succeeded on retry after backoff.
(d) Stability: OSM data itself is the most durable item on this list; the public Overpass instance is not a runtime dependency to plan around. Plan: import from the daily Geofabrik Kyushu extract (https://download.geofabrik.de/asia/japan/kyushu-latest.osm.pbf resolves to kyushu-261028.osm.pbf, 316,822,735 bytes, Last-Modified 2026-10-29 01:26 GMT) into our own DB, or self-host Overpass. No deprecation history checked beyond that.
(e) ToS on caching/storing/AI: ODbL allows storing, copying and processing; the conditions are attribution and share-alike (see the licence section). Nothing in the licence prohibits AI processing.
(f) Licence compatibility: ODbL does not touch our code licence; it governs the database. See "Licence obligations" below.
(g) Japanese quality: names are mostly Japanese script in `name`; English only on 43%; no reading (kana) fields were measured (UNVERIFIED how many have `name:ja-Hira` or similar).
(h) Verdict: MVP for heritage/shrines/viewpoints and as the geometry/ID layer; not a business source.
Demo/video: allowed with "© OpenStreetMap contributors" attribution; map credit must stay findable (OSMF attribution guideline).

## 2. Overture Maps Foundation Places

- Current release (STAC catalog `latest`, and the docs): 2026-10-21.0. Release calendar (fetched): monthly since October 2023; next proposed 2026-11-18.0 and 2026-12-16.0 (the December date is reserved for a quarterly major breaking-change release); schema v2.0.0 is the current one; major (breaking) schema changes only in March, June, September, December.
- Retention: "Public releases are kept for a maximum of 60 days (two monthly releases)". Old data files are removed automatically; changelogs remain. We must keep our own snapshot of whatever we import.
- How to query Japan: DuckDB with `spatial` and `httpfs`, `SET s3_region='us-west-2'`, read `s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*` with `hive_partitioning=1` and filter on the `bbox` struct columns. My bbox query (lon 129.70-129.95, lat 32.54-32.85) returned 10,228 places in 6 seconds, no key needed. The `overturemaps` CLI and Overture's division_area polygons can be used the same way.

Measured (release 2026-10-21.0, inside the Overture 長崎市 / 諫早市 / 大村市 polygons):

| Area | places | with website | with social URL | with phone | confidence >= 0.7 | cafe + coffee_shop | worship categories | museum/historic categories |
|---|---|---|---|---|---|---|---|---|
| 長崎市 | 9,856 | 5,279 | 7,838 | 7,160 | 7,815 | 335 | 175 | 245 |
| 諫早市 | 2,713 | 1,388 | 2,100 | 1,981 | 2,157 | 75 | 39 | 19 |
| 大村市 | 1,961 | 1,047 | 1,468 | 1,396 | 1,618 | 73 | 26 | 24 |
| Nomozaki bbox (incl. Takashima) | 218 | | | | | | | |
| Hashima island (2 km) | 0 | | | | | | | |

Other measurements in 長崎市: restaurants (all cuisine categories) 1,625; art/craft-type categories only 26 (15 arts_crafts_and_hobby_store, 11 art_gallery); `names.common` (alternative-language names) is empty for all 9,856, so there are no English names, only `names.primary` (8,815 contain Japanese script; 1,041 are Latin-only). Source datasets present on those places: Meta 7,594, AllThePlaces 1,347, Foursquare 712, Microsoft 181 (a place can have several). No place in the region is flagged closed, but that does not prove they are open; `confidence` is the existence estimate (0 = no longer exists).
Schema (v2.0.0 page fetched): fields include names, basic_category, taxonomy, confidence, operating_status, websites, socials, emails, phones, addresses, brand, sources; I found no opening-hours field in the schema page.

(a) For us: the only free source that lists real small shops and cafes at scale (many with an Instagram or website URL, which suits "paste a URL" onboarding). Treat every row as a candidate: a human must confirm the place exists and pin it.
(b) Auth/friction: none; needs DuckDB/Parquet tooling.
(c) Pricing: free.
(d) Stability: monthly releases and schema versioning policy are documented, but (i) only two monthly releases stay downloadable, (ii) quarterly breaking-change windows exist (next reserved 2026-12-16), (iii) I found no multi-year free/data commitment on the pages fetched, so UNVERIFIED for a 3-year guarantee. Pin to one release and re-pull deliberately.
(e) Licence (Overture attribution page): Places has no theme-level licence; licensing is per source: Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery, Birdeye, Uberall, OpenTravel Alliance = CDLA-Permissive-2.0; Foursquare = Apache-2.0 ("transformed to the Overture schema", NOTICE.txt); AllThePlaces = CC0-1.0. Caching, storing, redistribution and AI processing are all allowed under these. (The same page lists ODbL for the base, buildings, divisions and transportation themes, which we do not need.)
(f) Compatibility: CDLA-Permissive-2.0 (text fetched) has no copyleft; the only sharing condition is s.2.1 "make available the text of this agreement with the shared Data"; Results of computational analysis are unrestricted (s.3.1). Apache-2.0 needs the Foursquare NOTICE. So an open-source repo can ship the data with an ATTRIBUTIONS file; nothing is forced onto our code.
(g) Japanese: names are Japanese-first, no English alternates; Malay/Chinese for the later region not tested.
(h) Verdict: MVP as a candidate generator for businesses and landmarks, with mandatory human verification; snapshot the release.
Demo/video: licence allows showing it; but because rows are unverified (Meta page derived), show only rows a human has confirmed, and never attach fake stories to them (use the labelled mock user).

## 3. Foursquare Open Source Places

(a) 100M+ global POIs; for us redundant because a Foursquare-sourced subset is already in Overture (712 Nagasaki-city places).
(b) Friction: Foursquare's own blog (2025-10-08, fetched) says that from the October 2025 release the public S3 bucket stops; access is through a registered portal (token + Iceberg catalog), Snowflake Marketplace or Hugging Face (gated, needs approval and contact details). Earlier releases stay on the public bucket. The Hugging Face page (fetched) shows the dataset as gated; its examples reference `dt=2026-10-15` while download links reference `dt=2025-11-18`, so the current release is UNVERIFIED. The docs.foursquare.com URL I tried returned 404.
(c) Pricing: "completely free with proper attribution" under Apache 2.0 (blog); production users of the old public bucket are asked to contact os-places@foursquare.com for continuity.
(d) Stability: access terms already changed once (Oct 2025). No multi-year commitment found.
(e)/(f) Apache 2.0 with NOTICE.txt: include it for flat files, or display it prominently in API docs. No share-alike.
(g) Japanese quality: not measured separately.
(h) Verdict: avoid direct use; take it through Overture.

## 4. Wikidata (SPARQL)

Live queries on query.wikidata.org (2026-10-29):
- Items with coordinates (P625) located in (P131*) Nagasaki city (Q38234): 459. Of these: 374 have a ja.wikipedia article, 58 en.wikipedia, 209 an image (P18), 271 an official website (P856), 456 a Japanese label, 259 an English label, 12 a heritage designation (P1435).
- Top types: elementary school 89, lower secondary school 51, tram stop 38, high school 27, Buddhist temple 15, island 11, Catholic church building 7, hospital 7, business 6, hotel 6, Shinto shrine 6, museum 5, biographical museum 4, peace museum 4, art museum 3, Christian museum 3, foreign cemetery 3. Only 6 items are "business": Wikidata has no small-shop layer.
- Isahaya (Q596469): 105. Omura (Q385591): 68. Bounding box lon 129.70-129.95 / lat 32.55-32.85: 639 (items lacking a P131 chain). Nomozaki/Takashima/Hashima box: 44.

(a) Identifier spine: stable Q-IDs, multilingual labels, links to Wikipedia/Commons, official websites, heritage status; good for landmarks, schools, stations, temples, churches.
(b) Auth: none; descriptive User-Agent (Wikimedia policy, fetched: generic or missing UAs get HTTP 403; include contact info and, for automated agents, "bot").
(c) Pricing: free.
(d) Stability: run by Wikimedia; stable IDs; no breaking change history checked. The query service can time out on heavy queries (not measured here).
(e) Licence: structured data in main, Property, Lexeme and EntitySchema namespaces is CC0 (Wikidata:Licensing, fetched). Caching, storing, redistribution, AI use all permitted.
(f) Compatibility: CC0, nothing forced on us.
(g) Japanese: 456/459 ja labels vs 259/459 en labels in Nagasaki city; excellent for ja, partial for en.
(h) Verdict: MVP for landmarks; not for small businesses.

## 5. Wikipedia (ja/en) text

Live geosearch (action=query&list=geosearch, 10 km around 32.7503,129.8777): ja.wikipedia 335 articles, en.wikipedia 58. Around Hashima (3 km) ja has 3; around Cape Nomo (8 km) ja has 21.

(a) Citable landmark summaries per place, with a stable link back.
(b) Auth: none; User-Agent and sequential requests (MediaWiki API etiquette, fetched: series not parallel, `maxlag`, informative UA or risk IP block).
(c) Free.
(d) Stable; no multi-year commitment needed, it is Wikimedia's core service.
(e) Licence (Wikimedia Terms of Use, fetched): CC BY-SA 4.0 and GFDL, reusers may comply with either. Attribution by hyperlink (where possible) to the page, a stable copy, or an author list; modifications must be indicated; modified text generally released under CC BY-SA 4.0 or later. Commercial use allowed. Non-text media have their own licences. Storing and AI-processing are not restricted beyond this licence.
(f) Open-source compatibility: fine, but share-alike attaches to any text adapted from articles. If the AI paraphrases or compresses Wikipedia sentences into place-page prose, treat those sentences as CC BY-SA 4.0 adaptations and label them (this fits the "every sentence cites its source" design). Keep CC BY-SA text separate from ODbL-governed OSM-derived data (the two licences are not mutually compatible; I have not found an official statement either way, so keep them in separate fields/tables).
(g) Japanese: ja is much richer than en for Nagasaki (335 vs 58 near the centre); Malay/Chinese for the later region not measured.
(h) Verdict: MVP for landmark text; cite article URL and revision per claim.

## 6. Wikivoyage

en.wikivoyage: geosearch within 10 km of the centre returns 1 article (Nagasaki); other relevant pages from a search: "Nagasaki (prefecture)", "Christian sites in Japan", "Gotō Islands". ja.wikivoyage: 0 geotagged articles. The raw wikitext of "Nagasaki" has about 34 listing templates (20 see, 1 do, 5 buy, 8 sleep; my regex found no eat/drink templates on that page, so those may live in sub-pages); 38 lat values, 29 URLs, 28 hours; 14 listings carry a last-edit year, 6 of them 2026.
(a) Traveller-written listings with URLs and hours. (b) none. (c) free. (d) Wikimedia-run; sparse content, not growing quickly (measured only Nagasaki). (e)/(f) CC BY-SA 4.0 under the Wikimedia Terms of Use, same obligations as section 5. (g) en only. (h) Later: too few listings to seed; good for cross-checking and linking.

## 7. Wikimedia Commons (geosearch, images)

Commons geosearch with gsnamespace=6 (files): within 2 km of Hashima 159 files; I read the licence of every one via imageinfo/extmetadata: CC BY-SA 4.0 69, CC BY 4.0 53, CC BY-SA 3.0 21, CC BY 3.0 16 (none public-domain). Around central Nagasaki the 500-result limit is reached at 1 km and at 10 km, so there are far more.
(a) Landmark photos with machine-readable author and licence. (b) none; User-Agent as above; observed transient `cirrussearch-too-busy-error` responses, so retry with backoff. (c) free. (d) Wikimedia-run, stable. (e) Licence is per file (check extmetadata: LicenseShortName, Artist); CC BY requires author credit and licence link; CC BY-SA requires the same plus share-alike for adapted images (cropping/filters count as adaptation); hotlinking or copying both permitted. (f) Fine for an open-source project provided each image row stores author, licence, source URL. (g) n/a. (h) MVP for landmark images; do not use for businesses (few photos of small shops and unclear rights).

## 8. Nagasaki city / prefecture / Isahaya / Omura / Saikai open data

There is no separate city portal: the city's own page (city.nagasaki.lg.jp) points to the BODIK CKAN catalog (data.bodik.jp, operated by ビッグデータ＆オープンデータ研究会in九州; BODIK's page describes the service as a free catalog for local governments; no site-wide terms or CKAN API terms were found on its front page). Candidate URLs I guessed on the city and prefecture sites returned 404. The national catalogue moved: www.data.go.jp now redirects (301) to data.e-gov.go.jp.

CKAN API counts (package_search, 2026-10-29): Nagasaki city (org 422011) 155 datasets, all `cc-by-40-intl` in the first 100 checked; Nagasaki prefecture (420000) 202 (84 CC BY 4.0 and 16 `cc-by` among the first 100); Isahaya (422045) 6; Omura (422053) 10; Saikai (422126) 24. All CC BY 4.0 where checked.
Useful datasets (downloaded and measured):

| Dataset | Rows | Fields that matter | Notes |
|---|---|---|---|
| 文化財一覧（長崎市） 422011_cultural_property | 290 | name, kana, category (e.g. 重要文化財 32, 県指定史跡 13), address, designation date | as of 2020-03; no coordinates, no English, no description; geocode by address |
| ながさき旅ネット 観光スポット情報 420000_nagasakitabinet | 1,123 prefecture-wide; 220 with 長崎市 in the address (216 with lat/lon, 217 with description, 175 with URL, 191 with phone); 31 Isahaya, 26 Omura, 30 Saikai | name, kana, address, lat/lon, description, URL, phone, category (神社・仏閣 23, 世界遺産 10 in the city rows) | last modified 2023-03-23; the English columns are empty; includes 14 Takashima/Hashima/Nomozaki rows (端島（軍艦島）, 長崎市軍艦島資料館, 高島石炭資料館, 軍艦島デジタルミュージアム ...) |
| 食品等営業許可・届出一覧（全許可・届出一覧）（長崎市） | 6,138 | facility name, business type (飲食店営業 about 4,600 incl. variants, 喫茶店営業 110, 菓子製造業 about 500), address, permit dates | no coordinates, phone, kana or website in this file; names are sometimes corporate names (e.g. a company plus facility name) rather than shop names; could contain sole-proprietor names (not checked) so treat as an existence check, not as published data; licence CC BY 4.0 |
| 商店街一覧（長崎市）, 公共施設一覧, イベント一覧（主な観光行事）, 公民館・文化センター一覧 | not counted | | municipal standard datasets |
| 観光施設一覧（西海市）, 観光施設（諫早市）, 文化財一覧（大村市） | not counted | | smaller municipal lists |

(a) Authoritative Japanese-language lists of heritage, sightseeing spots, event calendar and licensed food premises. (b) None; plain CKAN JSON API and CSV download. (c) Free. (d) Stability: datasets are refreshed (many Nagasaki city ones modified in 2026) but individual ones are stale (cultural property list 2020, ながさき旅ネット 2023) and the city notes some series ended (UNVERIFIED which). The platform is run by a research association, no multi-year commitment found: snapshot the CSVs into our repo. (e) CC BY 4.0: attribution (name the municipality and dataset) and an indication of changes; caching, storing, redistribution and AI processing are permitted. (f) Compatible; forces only attribution notices. (g) Japanese only; English columns empty. (h) MVP, especially 文化財一覧 + ながさき旅ネット for heritage and 食品営業許可 for confirming businesses exist.
Demo/video: CC BY allows it with attribution.

## 9. Japan GSI (tiles and address search)

- Licence: GSI terms page (fetched, Japanese and English): content is governed by the Public Data License v1.0 (PDL1.0) unless stated otherwise; cite the source ("出典：国土地理院ウェブサイト（URL）"); indicate edits; do not imply GSI made edited content. Survey-Act products (standard/pale tiles, 基盤地図情報) can need a usage/reproduction approval for some uses (about 7 to 14 business days), but loading GSI tiles live in a website or app needs only attribution ("国土地理院" or "地理院タイル" with a link to the tile list) and no application (tile list page, fetched). Seamless photo tiles that include GRUS imagery need an extra "GRUS画像（© Axelspace）" credit. The tile page states no rate limit.
- Tiles: `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` (and pale, seamlessphoto, ort).
- Address search API (msearch.gsi.go.jp/address-search/AddressSearch): I ran 2 live requests; an address string for a public temple returned coordinates (129.882721, 32.742706) and a name query returned 3 candidates. Terms and rate limit for this endpoint: UNVERIFIED (the GSI tile page does not mention it).
(a) Japan basemap and a free geocoder for address-only lists such as the food-licence CSV or the cultural-property list (then have a human confirm the pin). (b) none. (c) free. (d) national mapping agency, long-lived; no 3-year commitment text read. (e) PDL1.0 permits copying/adapting with attribution. (f) PDL1.0 is compatible with CC BY 4.0 per the e-Stat/MLIT pages; nothing forced on us. (g) Native Japanese. (h) MVP.

## 10. MLIT 国土数値情報 (National Land Numerical Information)

Terms page (fetched; effective 2026-03-23): copyright MLIT; PDL1.0 applies where no other notice; cite the source and name the dataset and your processing; per-dataset conditions vary ("オープンデータ（CC BY 4.0）一部制限" follows the original provider's terms; "商用可"/"非商用" datasets follow the older content terms). Web mapping uses GSI tile rules. Not queried for Nagasaki; datasets for tourism resources and cultural facilities exist in the catalogue but I did not verify their Nagasaki coverage or per-dataset licence.
(a) National GIS layers (tourism resources, facilities). (b) free download. (c) free. (d) national, stable. (e)-(f) check licence per dataset before importing (non-commercial ones would conflict with an open commercial-friendly project). (g) Japanese. (h) Later.

## 11. e-Stat (statistics portal API)

Registration required for the API (page fetched); cost and rate limits not stated on the pages read (UNVERIFIED). Terms of use (fetched): copying, adapting, commercial use all allowed with source credit "出典：政府統計の総合窓口(e-Stat)"; edits must be marked; content obtained through external-database APIs follows that provider's terms; the rules are stated to be compatible with CC BY 4.0. It gives aggregate counts (e.g. establishments by industry and area), not places. Same city counts are also on BODIK (2021 economic census tables).
Verdict: later; useful only for context numbers, not for seed places.

## 12. JNTO, Japan Tourism Agency and the MLIT multilingual commentary DB

12a. JNTO: inbound visitor statistics only (Excel downloads). JNTO's own terms page was not found by search; a government catalogue entry lists CC-BY and a third-party site cites Standard Terms of Use 2.0, both secondary, so licence UNVERIFIED. No place-level data. Verdict: avoid for seed.

12b. Japan Tourism Agency site terms (観光庁 著作権・リンク page, via search snippet, last updated 2025-12-04 per that snippet): PDL1.0 unless stated; cite the source; mark edits.

12c. 地域観光資源の多言語解説文データベース (MLIT/JTA, https://www.mlit.go.jp/tagengo-db/): languages ja, en, zh-Hans, zh-Hant, ko; last update shown 2025-12-24; bulk download is one Excel file (14,391,248 bytes on download; I read it with openpyxl). Measured: 9,418 entries nationwide; 354 for Nagasaki prefecture, every one with both Japanese and English body text (mean about 241 English words); by year: 平成30年 109, 令和1年 108, 令和2年 57, 令和5年 51, 令和4年 29; producers include 長崎市多言語解説協議会 (50), 長崎市 (25), 大村市観光交流都市づくり推進協議会 (25), 「長崎と天草地方の潜伏キリシタン関連遺産」保存活用実行委員会 (57), 「国境の島」多言語解説協議会 (29), 五島 (56 combined). 116 Nagasaki entries mention our target places or keywords (e.g. 長崎, 出島, 大浦, グラバー, 端島/軍艦島, 野母崎, 大村). The sheet has only title and body text columns (通し番号, 実施年度, 都道府県, 地域協議会名, titles, bodies), with no coordinates, so matching to pins is manual.
Terms (sitepolicy, fetched): content belongs to the Japan Tourism Agency but "複製、公衆送信、翻訳・変形等の翻案等、自由に利用できます。商用利用も可能です。"; credit "出典：地域観光資源の多言語解説文データベース [page URL]"; state that you edited or processed it; do not present edited material as government-made; third-party rights are your responsibility unless marked cleared. No terms on download/API.
(a) Official, citable English and Japanese descriptions for heritage sites, to ground AI-extracted claims. (b) none. (c) free. (d) national, updated yearly through 2025; the Excel is one file, snapshot it. (e) allowed, including adaptation and AI processing; no caching limit. (f) Compatible with open source; keep the credit and edit notice. (g) Professional ja and en text; zh/ko exist in the DB. (h) MVP.

## 13. 文化遺産オンライン (Cultural Heritage Online), Agency for Cultural Affairs

bunka.nii.ac.jp now 301-redirects to https://online.bunka.go.jp/ ("文化庁が運営する我が国の文化遺産についてのポータルサイト"). The site has an English switch and lists a "検索API" in a service-maintenance notice dated 2026/10/21, but I found no API documentation or open-data terms on any page I could read. The "about" page states that individual texts, photos, videos and illustrations are subject to copyright, forbids unauthorised reproduction, quotation or alteration except where law allows, says image rights belong to the contributing museums, and that linking is free without notice. No re-use licence.
Verdict: later, link-out only; do not store or AI-process its text or images. The related national designated cultural property database (kunishitei.bunka.go.jp) was not evaluated: UNVERIFIED terms.

## 14. Recruit Hot Pepper Gourmet API

(a) Restaurant search (name, address, lat/lng, genre, catch copy, photo URLs, hours, etc.), but only shops that advertise on Hot Pepper, so tiny Nagasaki shops without a presence will be absent (coverage not measured, no key). (b) Key by registration; key arrives by email (FAQ). (c) Fee not stated on the pages fetched; nothing says it is paid. Latest notice 2026/06/03 (maintenance on 2026-06-08), so the service is live. (d) History: legacy API api.hotpepper.jp ended 2023-10-31; Flash, JSONP and QR image delivery ended the same day; cuisine master ended 2018. The terms let Recruit suspend the API without notice and change the terms at any time; no multi-year commitment.
(e) Terms (rws-t-1001, fetched, headings only, no clause numbers): the API may not be sold, leased or sublicensed; the information may not be copied and stored into a third party's database; no sale, editing, adaptation, redistribution or sublicensing of the API or Recruit's IP; where nothing else is specified the cache must be refreshed within 24 hours; a credit that the information is provided by Recruit must be shown and its HTML must not be altered; Recruit may impose request-count limits. AI/ML is not mentioned.
(f) Conflict with our model: we would be redistributing a database under an open licence; the terms forbid copying into a database. 
(g) Japanese: native.
(h) Verdict: avoid as a data source for stored seed; at most a live "find a table" link later. Demo/video: only live API calls with Recruit credit.

## 15. Tabelog and other Japanese business APIs

- Tabelog (Kakaku.com): no public API documentation found, and the terms (tabelog.com/help/rules, fetched) never mention an API. They prohibit use of Tabelog "for commercial activity" (Art. 6(1)), reproducing or reusing reviews and images without permission (Art. 6(1)[2], with a ¥10,000 per review claim), and copying, editing, republishing or transmitting site content (Art. 8(3), 9). A search found only partnerships (municipal tourism tie-ups, a ChatGPT plugin), not a public API. Public absence of an API is therefore not confirmed beyond "none found"; either way the terms rule out copying data. Verdict: avoid. Link out only.
- Gurunavi: the official API page returned 403; one unofficial source says the free API ended 2021-06-30. UNVERIFIED current status. Verdict: avoid.
- Yahoo! JAPAN Local Search API (developer.yahoo.co.jp, fetched): live, Client ID required, 50,000 requests per application per 24 h; no end-of-service notice on the page; pricing, storage/caching and credit terms are on linked pages I did not read (UNVERIFIED). Verdict: later, only if its storage terms permit; do not rely on it for seed.

## 16. Flickr (CC-licensed, geotagged)

flickr.photos.search supports bbox, license IDs, has_geo, accuracy, extras (geo, license, owner_name, url_*), per_page up to 500, and returns at most the first 4,000 results of any query. API Terms of Use (last updated 2018-05-09, fetched): key required; a commercial key needs a separate application and the primary-purpose-is-revenue test decides; Flickr "reserves the right to charge fees"; you may not cache or store Flickr user photos "other than for reasonable periods"; changes in privacy must be reflected quickly; removals within 24 hours; no more than 30 photos per page; commercial use requires photos under a Creative Commons licence that allows it; you must comply with each owner's licence; the notice "This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc." is required. I did not obtain a key, so there are no Nagasaki counts (UNVERIFIED).
Verdict: later. Fits the product's "import with attribution and link back" model if photos are hotlinked, not stored in our database; do not seed from it.

## 17. Mapillary

API v4 (docs fetched): client or user token required; limits 60,000 entity requests/min, 10,000 search requests/min per app, 50,000 tile requests/day; `/images` bbox queries must be under 0.01 degrees square (changelog 2026-01-16); image radius search added 2026-04-02 (max 50 m). Terms of use (effective 2024-02-15, fetched): other users' content is under CC BY-SA by default (some datasets CC BY-NC-SA); attribute by displaying the Mapillary logo and a link; apps must materially supplement rather than redistribute; no use for real-time navigation; re-identification/unblurring forbidden; no explicit storage/caching limit stated. No token, no Nagasaki coverage measured: UNVERIFIED.
Verdict: later at best; imagery is not needed to seed places, and CC BY-SA share-alike on stored images would add a second share-alike regime.

## 18. Malaysia (for the later region)

OSM test bboxes (Overpass, same union query; snapshot 2026-10-29T06:30-06:32Z):

| Area (bbox) | POIs | named | name:en | name:ms | name:zh* | website | opening_hours | cafes | restaurants | places of worship |
|---|---|---|---|---|---|---|---|---|---|---|
| George Town / Penang (5.38,100.28)-(5.45,100.36) | 2,723 | 2,503 | 1,553 | 321 | 417 | 248 | 411 | 298 | 617 | 263 |
| Melaka city (2.17,102.22)-(2.23,102.29) | 2,594 | 1,530 | 738 | 247 | 308 | 133 | 195 | 138 | 466 | 104 |
| Kuching (1.50,110.30)-(1.60,110.40) | 2,435 | 2,367 | 116 | 12 | 51 | 69 | 180 | 195 | 395 | 87 |

Findings: OSM is far denser in Penang, Melaka and Kuching than in Nagasaki (George Town has 298 cafes against Nagasaki city's 29), and the multi-script naming the later region needs (`name:ms`, `name:zh*`, `name:en`) is present in Penang and Melaka but thin in Kuching. Melaka's 1,038 historic=* elements are mostly unnamed (69 named). The same ODbL rules apply.
data.gov.my: "Malaysia's official open data portal"; developer site footer says License: CC BY 4.0 (the licence text and "Guiding Principles" were not read); the Open API page lists a 4 requests/minute limit per API (Data Catalogue, OpenDOSM, Weather, GTFS Static, GTFS Realtime) and does not mention any key. No Tourism Malaysia or MOTAC place dataset on the portal front page; an archived listing shows a MOTAC "Statistik Premis Penginapan Pelancongan" statistics dataset (sample August 2018, licence not seen) and MOTAC's open-data page defers to data.gov.my. A tourist accommodation registry (TOURLIST) exists per press coverage, with 4,771 premises registered as of January 2023. Place-level licensed registries (food premises, tourism) were not found: UNVERIFIED.
Verdict: later; start from OSM, then check Overture for Malaysia with the same DuckDB recipe (not run).

---

## Licence obligations when stored in our own open-source database

Sources of truth: OSMF Licence and Legal FAQ, Attribution Guidelines, Collective Database Guideline (endorsed 2016-06-17), Geocoding Guideline (endorsed 2017-08-24), ODbL 1.0 text, Wikimedia Terms of Use, CDLA-Permissive-2.0 text. This is not legal advice.

OpenStreetMap, ODbL:
- Our app, once public, is a "Public Use". If we load OSM POIs into our database and add anything (merge, correct, enrich, dedupe, translate), that database is a Derivative Database. ODbL 4.4: any Derivative Database you Publicly Use must be only under the ODbL. Internal-only use would not trigger this (s.4.5), but an open-source project with public seed data is public.
- Because we are open source this is cheap to comply with: publish the OSM-derived place table/seed file under ODbL in the repo (and a "Produced Work" such as our rendered pages may carry any licence, but must show the OSM credit and offer the underlying data).
- Collective Database path (Guideline): independent datasets in one database are not a Derivative Database "so long as the data used for a particular data type is either all OSM or all non-OSM within the same regional cut"; non-OSM data that merely references OSM objects (e.g. restaurant phone numbers keyed to OSM names) is not subject to share-alike. So: keep stories, claims and user-pinned coordinates in their own tables that reference an OSM id; never write non-OSM edits into OSM-derived columns; and expect that merging a business list with OSM POIs and deduplicating is the case the guideline explicitly does not cover, so the merged place table would be ODbL.
- Human-pinned coordinates are our own data; store them separately from OSM geometry.
- Geocoding Guideline: results from a geocoder can be stored without share-alike if the underlying OSM is unmodified and we are not aggregating "all or substantially all" features of a city-sized area. Bulk-importing every OSM POI in Nagasaki city for seeding looks like the aggregation case (my reading of the guideline, not an OSMF statement), so assume ODbL.
- Attribution: "OpenStreetMap" linked to openstreetmap.org/copyright (or © OpenStreetMap contributors); readable, in a corner of web maps, still findable after collapse; for data-only use, in a readme or metadata where users would look.
- Operational: do not point the live app at the public Overpass instance (policy above); use the Geofabrik extract. If tiles are used, tile.openstreetmap.org has its own usage policy (not fetched; UNVERIFIED), so prefer GSI tiles for Japan.

Overture Places: CDLA-Permissive-2.0 (ship the licence text with any shared data), Apache-2.0 for Foursquare (ship NOTICE), CC0 for AllThePlaces. No share-alike. Overture rows merged with OSM rows fall under the ODbL derivative rule above, which permissive licences allow.

Wikipedia / Wikivoyage / CC BY-SA Commons images: attribution (hyperlink to the page or author list), indicate modifications, share-alike on adapted material. Store `source_url`, `revision/oldid`, `licence`, `author` with every sentence or image row. Keep this layer separate from ODbL data.

CC BY 4.0 (BODIK municipal data, data.gov.my): attribution plus an indication of changes; no share-alike. PDL1.0 (GSI, MLIT, JTA, e-Stat): source credit, state processing, do not imply government authorship; CC BY 4.0 compatible.

CC0 (Wikidata): no obligation; credit as courtesy.

Not storable (use live or link only): Recruit Hot Pepper (no database copying, 24 h cache), Flickr photos (no caching beyond reasonable periods), Tabelog, 文化遺産オンライン content.

Seed-data rule check ("seed data must be real"): all stackable sources above describe real places, but Overture/Meta rows and the 6,138-row licence list can include closed or renamed businesses, so a human must confirm each place before it goes into the seed; demo stories, posts and people attached to these places must belong to the labelled mock user. Open-licensed items (OSM, Overture, Wikidata, Wikipedia, Commons, CC BY datasets) may be shown in demos and videos with attribution; Hot Pepper only live with credit; Flickr and Mapillary only with their credit lines; Tabelog and Cultural Heritage Online content must not be shown.

## Suggested seed pipeline (research suggestion only, no code)

1. Landmarks and heritage (shrines, temples, churches, museums, Hashima, Nomozaki viewpoints): OSM extract + Wikidata Q-IDs + BODIK 文化財一覧 and ながさき旅ネット + MLIT multilingual DB text + Wikipedia/Commons for text and photos.
2. Small businesses (cafes, craft, eateries): Overture Places as the candidate list, BODIK food-licence list as an existence cross-check, GSI geocoder for address-only rows; each place confirmed by a human pin and the owner's consent before showing. Expect craft to be sparse everywhere (OSM craft=* 8 in Nagasaki city, Overture art/craft categories 26).
3. Nomozaki and Hashima are nearly empty in every open dataset (OSM peninsula 16 POIs, Overture 0 on Hashima); ながさき旅ネット and the MLIT DB are the only sources with Hashima/Takashima content, so this area depends on interviews rather than open data.

---

## Unverified / open questions

- Privacy note on my own queries: before the coordinator's instruction, my earlier requests carried a contact email in the User-Agent. Hosts that received it: overpass-api.de, query.wikidata.org, en.wikipedia.org, ja.wikipedia.org, en.wikivoyage.org, ja.wikivoyage.org, commons.wikimedia.org, stac.overturemaps.org, data.bodik.jp, www.city.nagasaki.lg.jp, www.pref.nagasaki.jp, www.data.go.jp. All requests after that instruction used the mandated UA with no contact detail.
- Overture: any multi-year (3-year) free-data or retention commitment (only the 60-day release retention and quarterly breaking-change policy were found). Per-row accuracy of Meta-derived small businesses (not field-checked). Overture Places for Malaysia not run. No opening-hours field seen in the schema page.
- Foursquare OS Places: which release is current (HF page shows both dt=2026-10-15 and dt=2025-11-18); docs.foursquare.com page returned 404.
- OSM: how many Nagasaki POIs carry kana reading tags; tile.openstreetmap.org usage policy not fetched; compatibility between CC BY-SA 4.0 text and ODbL data (kept separate).
- Wikidata query-service timeout/size limits not measured.
- GSI address-search API: terms and rate limits not found; the tile page states no rate limit.
- BODIK: platform operator's terms for CKAN API use and longevity; which Nagasaki city series have stopped updating; whether the food-licence list contains sole-proprietor personal names and APPI implications; the second 55 Nagasaki city datasets were scanned by title only.
- MLIT 国土数値情報: Nagasaki coverage and per-dataset licences for tourism/cultural layers not checked. e-Stat API cost/rate limits not stated on pages read. JNTO's own terms not found. 観光庁 terms read only via search snippet.
- 文化遺産オンライン: search API documentation and terms; kunishitei.bunka.go.jp terms.
- Hot Pepper: free tier size, request limits, shop coverage in Nagasaki (no key obtained). Whether Tabelog offers any partner API (none found in public pages). Gurunavi current status. Yahoo Local Search storage/credit terms.
- Flickr: number of CC-licensed geotagged photos in Nagasaki (no key). Mapillary: Nagasaki coverage (no token).
- Malaysia: data.gov.my licence text and Guiding Principles; whether MOTAC publishes place-level datasets; Tourism Malaysia datasets.
- Other lane's scratch script (not mine) in the shared scratchpad, bin/appledoc.py, sends the contact email in a User-Agent to developer.apple.com; flagged for the coordinator.

## Sources (URL, accessed 2026-10-29)

Live API queries (one request at a time):
- https://overpass-api.de/api/interpreter (Overpass; /api/status and /api/timestamp also read) - 2026-10-29
- https://query.wikidata.org/sparql - 2026-10-29
- https://en.wikipedia.org/w/api.php, https://ja.wikipedia.org/w/api.php (geosearch) - 2026-10-29
- https://en.wikivoyage.org/w/api.php and index.php?title=Nagasaki&action=raw; https://ja.wikivoyage.org/w/api.php - 2026-10-29
- https://commons.wikimedia.org/w/api.php (geosearch, imageinfo) - 2026-10-29
- https://stac.overturemaps.org/catalog.json; s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/* and theme=divisions/type=division_area/* (DuckDB) - 2026-10-29
- https://data.bodik.jp/api/3/action/package_search and package_show; CSV resources for 422011_cultural_property, 422011_food_business_all, 420000_nagasakitabinet - 2026-10-29
- https://msearch.gsi.go.jp/address-search/AddressSearch - 2026-10-29
- https://download.geofabrik.de/asia/japan/kyushu-latest.osm.pbf (headers only) - 2026-10-29
- https://www.mlit.go.jp/tagengo-db/ and https://www.mlit.go.jp/tagengo-db/common/001599337.xlsm (Excel downloaded) - 2026-10-29

Official docs, terms and licences:
- OSM: https://wiki.openstreetmap.org/wiki/Overpass_API ; https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ ; https://osmfoundation.org/wiki/Licence/Attribution_Guidelines ; https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline ; https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline ; https://opendatacommons.org/licenses/odbl/1-0/
- Overture: https://docs.overturemaps.org/getting-data/ ; https://docs.overturemaps.org/schema/reference/places/place/ ; https://docs.overturemaps.org/attribution/ ; https://docs.overturemaps.org/release-calendar/ ; https://cdla.dev/permissive-2-0/
- Foursquare: https://foursquare.com/resources/blog/data/evolving-fsq-open-source-places/ ; https://huggingface.co/datasets/foursquare/fsq-os-places ; https://source.coop/fused/fsq-os-places
- Wikimedia: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use ; https://www.wikidata.org/wiki/Wikidata:Licensing ; https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy ; https://www.mediawiki.org/wiki/API:Etiquette
- Japan: https://data.bodik.jp/ ; https://data.bodik.jp/dataset/422011_open_data_list ; https://www.gsi.go.jp/ENGLISH/page_e30286.html ; https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html ; https://www.gsi.go.jp/LAW/2930-index.html ; https://maps.gsi.go.jp/development/ichiran.html ; https://nlftp.mlit.go.jp/ksj/other/agreement.html ; https://www.e-stat.go.jp/api/en ; https://www.e-stat.go.jp/terms-of-use ; https://www.mlit.go.jp/tagengo-db/sitepolicy.html ; https://www.mlit.go.jp/kankocho/sitepolicy.html (via search snippet only) ; https://online.bunka.go.jp/ ; http://online.bunka.go.jp/about
- Business APIs: https://webservice.recruit.co.jp/ ; https://webservice.recruit.co.jp/doc/hotpepper/reference.html ; https://cdn.p.recruit.co.jp/terms/rws-t-1001/index.html ; https://webservice.recruit.co.jp/faq.html ; https://tabelog.com/help/rules/ ; https://developer.yahoo.co.jp/webapi/map/openlocalplatform/v1/localsearch.html ; https://api.gnavi.co.jp/api/service.htm (403)
- Imagery: https://www.flickr.com/services/api/tos/ ; https://www.flickr.com/services/api/flickr.photos.search.html ; https://www.mapillary.com/developer/api-documentation ; https://www.mapillary.com/terms
- Malaysia: https://data.gov.my/ ; https://developer.data.gov.my/ ; https://developer.data.gov.my/rate-limit ; https://motac.gov.my/en/services/open-data (via search result only)
