# 04 - Scraping / Apify bootstrap and official alternatives

Lane: bootstrap pull of public posts and blogs about specific places (Nagasaki first; Malaysia later), plus official routes that avoid scraping.
Access date for every source in this file: **2026-10-29** (today). Prices and terms change often; re-check before spending money.
Convention: **UNVERIFIED** = I could not confirm the fact from a primary source in this session. Figures marked "estimate" are my own arithmetic or assumptions, not measurements.

Method notes (what this lane did and did not do):
- No Apify actor was run. Nothing was collected from Instagram, Google (Search/Maps UI), TikTok, X or Threads. Only their legal-terms and developer-documentation pages were read.
- Some pages were fetched with curl because the reading tool could not render them. Incidental one-off requests: a single trivial `searchPosts` call to `public.api.bsky.app` (returned HTTP 403), and a single GET of a note.com hashtag RSS URL (response deleted unread). No request carried an email address or personal contact detail.
- Court documents were read from the court's own filing (RECAP/CourtListener copies of PACER filings, the Ninth Circuit site, the Supreme Court site) where possible. Law-firm blogs and news were used only to locate filings and are labelled "secondary" where they carry a fact I could not confirm in a filing.
- Not legal advice. Items touching Japanese and Malaysian law need local counsel.

---

## 0. Bottom line

1. **A scraping lane is not needed for the MVP.** The primary flow (human pin plus pasted URL) is the right bootstrap too: the team itself pastes about 300 real URLs (estimate: about 7.5 person-hours) with official-API discovery helpers (YouTube, Wikimedia Commons, Flickr, Bluesky/Mastodon, human-run web search). Cost is about 0 USD. Legal exposure is low.
2. **Instagram and Threads are the highest-risk targets and the least useful.** Meta's terms prohibit automated collection "regardless of whether" logged in; Meta's separate Automated Data Collection Terms demand express written permission. The 2024 Meta v. Bright Data ruling helped logged-out scrapers on the *old* terms only, and Meta rewrote its terms afterwards. Apify's own terms push all legality risk onto the customer.
3. **Several "import and render" assumptions in the plan collide with platform terms** (storage, caching, AI-processing, non-Google maps). See section 8.4. The fix is the same as the pipeline: store URL plus human-entered fields, render live through the platform's own embed, run AI claim extraction only on consented transcripts.

---

## 1. Summary table

Verdict key: MVP = use in the first release; later = after MVP or when a named condition is met; avoid = do not use (or only as a one-off outside the product).
Cost column = estimated cash cost to seed about 15 places x about 20 posts (about 300 accepted posts), see section 7 for assumptions.

| # | Item | Route | Est. cost (15 x 20) | Verdict | One-line why |
|---|---|---|---|---|---|
| A1 | Apify platform | scraping host | 0 to 19 USD | avoid (MVP) | Terms make the customer solely liable for legality; actors can be removed without notice |
| A2 | apify/instagram-scraper, hashtag-scraper, api-scraper | scraping | about 4 to 8 USD raw pull | avoid (MVP); later only as one-off with counsel sign-off | Meta terms forbid automated collection; hashtag actor has no location input |
| A3 | compass/crawler-google-places | scraping | under 1 USD | avoid | Google Maps ToS "No Scraping" and no-caching clauses; reviews are score-adjacent content |
| A4 | clockworks/tiktok-scraper | scraping | about 3 to 9 USD (estimate) | avoid | TikTok ToS forbids automated scripts; no location input |
| A5 | Community Threads actors | scraping | about 1 to 39 USD | avoid | Small user bases (50 to 281 users); one needs a logged-in session cookie |
| C1 | YouTube Data API v3 | official API | 0 | MVP | Location-radius video search, 100 searches/day free, Japanese relevance filter |
| C2 | Flickr API | official API | 0 | later | Photos not posts; licence-aware, but ToU dated 2018 and key rules partly UNVERIFIED |
| C3 | Wikimedia Commons / Wikipedia (geosearch) | official API / open licence | 0 | MVP | Only source in this list with clearly reusable licences; good for photos and background |
| C4 | Bluesky search | official API | 0 | later | Unauthenticated search returns 403 today; needs an account; Nagasaki yield UNVERIFIED |
| C5 | Mastodon hashtag timelines | official API | 0 | later | Public and simple, but per-instance rules and thin Nagasaki yield |
| C6 | Reddit Data API | official API | 0 nominal | avoid | Commercial use needs a separate agreement; AI-training ban; deletion duties |
| C7 | Threads keyword search API | official API | 0 | later | Needs App Review for `threads_keyword_search`; 2,200 queries per rolling 24 h; storage rights UNVERIFIED |
| C8 | Instagram Graph hashtag search | official API | 0 | avoid | Hashtag only, no location, App Review, 30 hashtags per 7 days |
| C9 | Official embeds: YouTube iframe, Instagram oEmbed, TikTok oEmbed, X oEmbed | render-only | 0 | MVP | "Link out via embed" is the only render path every platform explicitly supports |
| C10 | TikTok Research API; X API reads | official API | X: about 7 to 15 USD | avoid | Research API is academic/non-profit in US/EEA/UK/CA/CH; X API is pay-per-read |
| C11 | Google Places API (New) | official API | 0 within free caps | later (place-ID resolver only) | IDs-only text search is free and place_id is storable; content cannot be cached or shown on a non-Google map |
| C12 | Web search APIs (Brave; Google CSE; Bing) | official API | about 0 | later (Brave, discovery only) | Google CSE closed to new customers; Bing retired; Brave forbids storing results and AI use |
| C13 | Blog RSS / sitemap / WordPress REST (owner-supplied sites) | open protocols | 0 | MVP | Best fit for tiny Japanese businesses that do have a blog; no platform terms |
| C14 | Japanese blog platform APIs (Hatena, Ameba, note) | official/none | n/a | avoid | No public cross-blog keyword search found; terms partly UNVERIFIED |
| C15 | Human-confirmed manual curation (pipeline baseline) | manual | 0 (about 7.5 h) | MVP | Highest accuracy, zero platform-terms risk |

---

## 2. Apify

### 2.1 Platform (A1)

(a) What it does for us: hosted runner and marketplace for scrapers ("Actors"). Would run Instagram, Google Maps, TikTok and Threads collectors without us operating proxies.

(b) Onboarding friction: account plus API token. Whether a payment card is needed for the Free plan: UNVERIFIED (not stated in the fetched pricing text).

(c) Free tier and pricing (https://apify.com/pricing, accessed 2026-10-29):

| Plan | Price/month | Included prepaid usage | Compute unit | Residential proxy |
|---|---|---|---|---|
| Free | 0 | 5 USD | 0.20 USD/CU | 8 USD/GB |
| Starter | 19 USD | 19 USD | 0.20 USD/CU | 8 USD/GB |
| Scale | 199 USD | 199 USD | 0.16 USD/CU | 7.5 USD/GB |
| Business | 999 USD | 999 USD | 0.13 USD/CU | 7 USD/GB |

Annual billing 10% cheaper. Unused prepaid usage "expires at the end of the billing cycle and does not roll over". Most Store Actors are pay-per-event (price shown on each Actor page, per-plan tiers). A "Creator" plan is 1 USD/month with a one-time 500 USD of platform usage for 6 months, but "limits Apify Store to universal Actors", so it does not cover the Instagram/TikTok/Threads actors below.

(d) Stability/longevity: no multi-year free or credit commitment found; the Free credit is monthly and renews. Actor risk: Store Publishing Terms (last updated 2026-09-15) s.2.2.4.3 lets Apify "unpublish, delete, restrict, or modify that Actor or content without prior notice"; s.7.1 lets Apify mark a faulty Actor "under maintenance" and after 30 days or more "deprecated" or remove it. Community Actors depend on small maintainers fighting anti-bot changes. Do not plan on any single actor for 3 years.

(e) ToS limits and Apify's stated position on legality:
- Apify blog (https://blog.apify.com/is-web-scraping-legal/): "Web scraping is generally legal if you scrape data that is publicly available on the internet." and "take great care when scraping data behind a login, personal data, intellectual property, or confidential data." On ToS: "nothing currently prevents the website owner from adding provisions that ban scraping or automated access". Disclaimer: "We are lawyers, but we are not your lawyers."
- The help-centre page named "web scraping legality" (help.apify.com/en/articles/3024655) states no position (content was only a tool overview when fetched).
- General Terms (effective 2026-07-09) s.5.8: "You are solely responsible for the legality, accuracy, quality, appropriateness, and use of all Customer Data." s.6.2 limits processing to data "you are authorized to access". s.11.1 indemnity: "Should you use the Services or Actors to extract Customer Data from unauthorized sources, you shall be responsible for compensating any damages incurred by and/or any claims of the affected third parties." The terms contain no clause telling you to honour target-site terms.
- Actor Terms (effective 2026-07-09): s.5.1 Actors are "AS IS"; s.9.1 "we do not review, vet, endorse, or monitor the Community Actors and do not guarantee quality, security, accuracy, or legal compliance"; s.9.2 "Creators are solely responsible for their Community Actors"; s.2.2 use "solely for legitimate purposes" and in line with applicable law. s.3.2 you keep IP rights in Actor Input and Output (this does not give you rights in the third-party content inside it).
- Acceptable Use Policy (last updated 2026-02-20) Art. 2.1(10) bans "activities that contravene applicable laws, regulations, or the rights of any third party".
- Actor pages repeat a boilerplate: public data only, but "some public data may be considered personal data under regulations like the GDPR" and "Only scrape data if you have a legitimate reason".

(f) Licence compatibility: we would only call Apify's API; no code-licence interaction with an open-source repo. Source licence of individual Actors: UNVERIFIED. An Apify token must never be committed to the public repo.

(g) Japanese quality: not applicable; Actors pass through whatever text the source holds.

(h) Verdict: **avoid for MVP.** Terms shift every legal and third-party risk to us.

Demo/video: Apify output is third-party content copied against the source platform's terms; do not use it in demos.

### 2.2 Actors

Prices are the "from" or per-plan figures on each Actor page (pay-per-event), accessed 2026-10-29. User counts are as displayed.

**A2a. apify/instagram-scraper** (Apify-maintained; https://apify.com/apify/instagram-scraper)
(a) Posts, reels, comments, profiles, hashtags and places from profile, post, hashtag and *location/place URLs*, or by keyword search (hashtag, place, user). Search and URLs cannot be combined in one run.
(b) Apify account only; "no Business or Creator account, no OAuth"; scrapes "as it appears to logged-out visitors".
(c) "from 1.50 USD / 1,000 results"; Free plan 2.70 USD, Starter 2.30, Scale 1.90, Business 1.50 per 1,000. One result = one post, reel, comment, profile, hashtag or place. 454,618 total users, 60,332 monthly.
(d) Largest user base of any Instagram actor, but no changelog date shown; Meta can change anti-bot at will. No multi-year commitment.
(e) Governed by Instagram terms (section 3 below), not by Apify's. Page FAQ: only public data, "does not access private content".
(f) n/a. (g) Japanese captions come through as raw text; no language filter on search.
(h) **avoid for MVP.** Meta's Automated Data Collection Terms apply; see section 3.

**A2b. apify/instagram-hashtag-scraper** (https://apify.com/apify/instagram-hashtag-scraper): from 1.90 USD / 1,000; Free 2.60, Starter 2.30. Inputs are hashtags/keywords; **no location input** (location only appears in output fields `locationName`, `locationId`). Free plan "covers just the first page of results". Same verdict: avoid.

**A2c. apify/instagram-api-scraper** (https://apify.com/apify/instagram-api-scraper): from 1.40 USD / 1,000. Supports location *lists* and exact location URLs (page example uses Prague URLs) and place search via `searchType`. Max 50 comments per post. Same verdict: avoid.

**A3. compass/crawler-google-places** (https://apify.com/compass/crawler-google-places)
(a) Google Maps place records and (optional) reviews, contacts, social profiles.
(c) "from 1.50 USD / 1,000 scraped places". The page's own example table implies (my arithmetic) about 0.002 USD per place-details add-on and about 0.0005 USD per review on the Free plan. Social-profile enrichment is far dearer (10.00 USD per 100 profiles on Free).
(e) Page says to "factor in Google's Terms of Use" and warns reviewer data is personal data. Google Maps Platform ToS s.3.2.3(a) (quoted in section 3) bars "copy and save business names, addresses, or user reviews" for Maps Platform customers; Google's general ToS (effective 2026-07-30) bars automated access "in violation of the machine-readable instructions" such as robots.txt. I did not check Google's robots.txt for Maps paths (UNVERIFIED).
(h) **avoid.** Reviews also drag the product toward scores, against the "stories, not scores" policy.

**A4. clockworks/tiktok-scraper** (https://apify.com/clockworks/tiktok-scraper)
(a) Videos by hashtag, keyword (`searchQueries`), profile or URL. **No location input**; location of creation appears only as an output field. Transcripts and AI summaries are charged add-ons.
(c) "from 1.70 USD / 1,000 results"; Free-plan rate not retrieved. 367,565 total users, 32,946 monthly, 99.0% run success, 4.74 stars.
(e) TikTok ToS (last updated 2025-12-01), section 5: you may not "use automated scripts to collect information from or otherwise interact with the Services".
(h) **avoid.**

**A5. Threads actors (community, not Apify-maintained)**
- futurizerush/threads-search-scraper-api: "from 4.00 USD / 1,000 results"; keyword search up to 20 terms; 50 total users and 6 monthly. In practice needs a Threads `sessionid` cookie from a logged-in browser ("signed-out searching is possible but returns a shallower set of results"). Logged-in automated access is exactly what Meta v. Bright Data (section 4) distinguishes as bound by the terms. Do not use.
- magicfingers/threads-scraper: README says 0.60 USD / 1,000 results (page also says "Pay per usage", so the price model is inconsistent); 281 total users; no login claimed; needs residential proxies because "Threads blocks datacenter IPs".
- Other Threads search actors listed in Apify search (self-reported, not opened by me): about 1.56 to 5.00 USD / 1,000, one at 13 USD / 1,000 on the Free plan.
(e) Meta terms (section 3). (h) **avoid.**

---

## 3. What the platforms' terms say about automated collection

Quotes are verbatim from the fetched text. Dates are the version dates shown on the page.

| Platform | Clause (verbatim) | Version / date | Notes |
|---|---|---|---|
| Meta (Facebook, and Meta "Products") | s.3.2.3: "You may not access or collect data from our Products using automated means (without our prior permission)"; also applies "regardless of whether such automated access or collection is undertaken while logged in to a Facebook account." | Effective 2025-01-01; page also says "We're updating our Terms of Service on 20 January 2027" | https://www.facebook.com/legal/terms/update. Re-check after 2027-01-20. |
| Meta Automated Data Collection Terms | s.2: you "will not engage in Automated Data Collection without first obtaining Meta's express written permission". Accepting the terms is not that permission. s.4 bars transferring, selling or licensing Collected Data, including "licensing of search indices and caches" | Effective 2024-10-07 | https://www.facebook.com/apps/site_scraping_tos_terms.php |
| Instagram Terms of Use | s.4.2: "You can't attempt to create accounts or access or collect information in unauthorized ways. This includes creating accounts or accessing or collecting information in an automated way without our express permission" ... "regardless of whether such automated access or collection is undertaken while logged-in to an Instagram account." | Effective 2025-01-01 | help.instagram.com renders by JavaScript and could not be fetched; text read from the Open Terms Archive snapshot (https://github.com/OpenTermsArchive/pga-versions). Treat as UNVERIFIED against the live page. |
| Meta Platform Terms (developers) | No explicit scraping clause in the text fetched. s.3.d.i.2 requires deleting Platform Data "as soon as reasonably possible" when retention is no longer necessary for a legitimate business purpose, and other cases; s.3.a.viii limits processing to purposes "set forth in Meta's Developer Docs" | Last updated 2026-02-03 | https://developers.facebook.com/terms/ |
| Threads | No Threads-specific terms retrieved. Whether Meta ToS s.3.2.3 covers Threads: UNVERIFIED | n/a | Official Threads API keyword search exists (section 6.7) |
| TikTok Terms of Service | s.5: you may not "use automated scripts to collect information from or otherwise interact with the Services;" | Last updated 2025-12-01 | https://www.tiktok.com/legal/page/row/terms-of-service/en |
| Google Maps Platform ToS | s.3.2.3(a) No Scraping: "Customer will not export, extract, or otherwise scrape Google Maps Content for use outside the Services. For example, Customer will not: (i) pre-fetch, index, store, reshare, or rehost Google Maps Content outside the services; (ii) bulk download ... places information ...; (iii) copy and save business names, addresses, or user reviews". (b) "No Caching". (c)(vii) no "use Google Maps Content to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune the models." | Last modified 2026-08-26 | https://cloud.google.com/maps-platform/terms |
| Google Terms of Service (Search etc.) | Prohibits "using automated means to access content from any of our services in violation of the machine-readable instructions" on its web pages (robots.txt given as the example) | Effective 2026-07-30 | https://policies.google.com/terms. Robots.txt itself says "These rules are not a form of access authorization" (RFC 9309 s.1), so it is a signal, not a permission system. |
| X Terms of Service | "crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited" ("Misuse of the Services" section, item (iii); access is limited to "currently available, published interfaces"). Liquidated damages: "15,000 USD per 1,000,000 posts" requested, viewed or accessed in any 24-hour period (EUR 15,000 for the EU/EFTA/UK version) | Effective 2026-10-09 | https://x.com/en/tos |
| X Developer Agreement and Policy | "If you store X Content offline, you must keep it up to date" and delete deleted/modified content "as soon as reasonably possible, or within 24 hours" of a request. Location data in X Content may not be stored or aggregated except as part of a Post. No AI/ML-training clause found in the fetched text (UNVERIFIED for the live policy). | no date on page | https://docs.x.com/developer-terms/agreement-and-policy |

Take-away: every one of the five operators forbids automated collection of its public pages in contract. The legal question is enforcement, not whether the clause exists (section 4).

---

## 4. Litigation (primary sources)

| Case | Court, date | What was held (from the filing) | Source |
|---|---|---|---|
| Van Buren v. United States, No. 19-783 | U.S. Supreme Court, 2021-06-03 | CFAA "exceeds authorized access" and "without authorization" clauses "stems from a gates-up-or-down inquiry" (one either can or cannot access a system or areas within it). Not about scraping directly. | https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf |
| hiQ Labs v. LinkedIn, No. 17-16783 (on remand) | 9th Cir., 2022-04-18 | Preliminary injunction affirmed. "Public LinkedIn profiles, available to anyone with an Internet connection, fall into the first category [computers for which no authorization is required] ... the concept of 'without authorization' is inapt." CFAA only; contract claims left open. | https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf |
| hiQ v. LinkedIn, 3:17-cv-03301-EMC, Dkt. 405 | N.D. Cal., stipulation filed 2022-12-06 | On remand hiQ lost on contract: recital says the court held LinkedIn's User Agreement "unambiguously and enforceably prohibits unauthorized scraping and creation of fake accounts" (order of 2022-10-27, not read directly). Consent judgment of 500,000 USD plus permanent injunction. | https://s3.documentcloud.org/documents/23429042/hiq-stip.pdf |
| Meta Platforms v. Bright Data, 3:23-cv-00077-EMC, Dkt. 181 | N.D. Cal. (Judge Chen), 2024-01-23 | Meta's cross-motion denied, Bright Data's summary judgment granted on contract claims: "the Terms do not apply to Bright Data's logged-off scraping of publicly viewable data." Bound while it held accounts, but only logged-in scraping would breach; no evidence of that. Order construed the *then-current* Facebook and Instagram Terms. Meta later moved to drop the remaining claim without prejudice and waived appeal (TechCrunch, 2024-02-26: secondary, docket not retrieved). | https://storage.courtlistener.com/recap/gov.uscourts.cand.406956/gov.uscourts.cand.406956.181.0.pdf |
| X Corp. v. Bright Data, C 23-03698 WHA, Dkt. 83 | N.D. Cal. (Judge Alsup), 2024-05-09 | Complaint dismissed. "To the extent X Corp.'s state-law claims are based on scraping and selling of data, they are preempted" by the Copyright Act (conflict preemption). X Corp. is a non-exclusive licensee of user content and cannot use contract to control public data. | https://storage.courtlistener.com/recap/gov.uscourts.cand.415869/gov.uscourts.cand.415869.83.0.pdf |
| X Corp. v. Bright Data, Dkt. 156 | N.D. Cal., 2024-11-26 | Leave to amend granted in part, denied in part: access-based contract, trespass to chattels and related claims could proceed; claims based on scraping and copying user data stayed preempted. | https://storage.courtlistener.com/recap/gov.uscourts.cand.415869/gov.uscourts.cand.415869.156.0.pdf |
| X Corp. v. Bright Data, settlement | N.D. Cal., reported 2025-06-23 | Bloomberg Law (secondary) reports a joint stipulation to settle, terms confidential. Docket entry not retrieved. | https://news.bloomberglaw.com/ip-law/musks-x-settles-data-scraping-dispute-against-israeli-data-firm |
| Google LLC v. SerpApi, 4:25-cv-10826-YGR, Dkt. 42 | N.D. Cal. (Chief Judge Gonzalez Rogers), 2026-07-20 | Motion to dismiss granted with leave to amend. DMCA s.1201: "To the extent that Google Search results do not contain any copyrighted content, SearchGuard cannot be said to effectively control access to a work protected under this title." | PDF of the order as posted by the defendant: https://serpapi.com/blog/content/files/2026/07/Order-Granting-Motion-to-Dismiss---Google-v.-SerpApi.pdf (I read the filed copy; docket page not retrieved) |
| Reddit v. SerpApi, Oxylabs, AWMProxy, Perplexity, 25 Civ. 8736 (PAE), Dkt. 104 | S.D.N.Y. (Judge Engelmayer), 2026-07-31 | "predominantly denies the motions to dismiss." Granted only as to the s.1201(b) claim against SerpApi and the unfair-competition and unjust-enrichment claims against both movants. DMCA anti-circumvention claims (s.1201(a)) survive. | https://storage.courtlistener.com/recap/gov.uscourts.nysd.651592/gov.uscourts.nysd.651592.104.0.pdf (scanned PDF; I read the opening pages by OCR) |

Reading (my analysis, not a holding):
- Logged-out scraping of public pages: the best district-court authority (Meta v. Bright Data, X v. Bright Data) went the scraper's way, but both are trial-level, both turned on *the terms then in force* or on Copyright Act preemption, and both settled or ended without appellate review. No court has ruled on whether the *rewritten* Meta terms (effective 2024-10-07 and 2025-01-01, expressly "regardless of whether ... logged in") bind a logged-out visitor. I found no such ruling (UNVERIFIED that none exists).
- Logged-in or fake-account scraping loses (hiQ remand).
- The new front is DMCA s.1201 anti-circumvention against anti-bot measures. The two 2026 district rulings split: Google v. SerpApi (N.D. Cal.) dismissed because search results without copyrighted content are not protected by a "work"; Reddit v. SerpApi (S.D.N.Y.) let the claims go forward. Using proxies or tooling to defeat anti-bot systems is therefore a live risk, separate from contract.
- Platform self-help (bans, blocks, cease-and-desist) needs no court ruling.

---

## 5. Legal position of scraping public data: Japan and Malaysia (short)

**Japan.** Copyright Act Art. 30-4 allows exploitation "in any way and to the extent considered necessary" where "it is not a person's purpose to personally enjoy or cause another person to enjoy the thoughts or sentiments expressed in that work" (listed examples include "data analysis"), unless it "would unreasonably prejudice the interests of the copyright owner" (English translation, Act No. 48 of 1970; the translation page shows "Last Version: Act No. 52 of 2021", so it may lag later amendments). Art. 47-5 lets operators of search or analysis services make *minor* exploitation of publicly available works, but not when they know the source publication is infringing or where it would unreasonably prejudice the owner. Art. 32 allows quotation "consistent with fair practices". The Agency for Cultural Affairs' "General Understanding on AI and Copyright in Japan" (Legal Subcommittee; overview dated May 2024; "not legally binding") says Art. 30-4 does not apply where an "enjoyment" purpose coexists, names RAG that outputs creative expression as outside Art. 30-4 (Art. 47-5 may still apply), and treats reproduction of database-type website data "while avoiding" technical measures such as robots.txt or login as within the Art. 30-4 proviso. Consequence for us: collecting posts to *train or analyse* is relatively permissive in Japan, but *displaying* excerpts (our product) is ordinary reproduction/transmission and needs a licence, Art. 32 quotation, or a link/embed. The Unfair Competition Prevention Act protects "shared data with limited access" (Art. 2(1)(xi)-(xvi), Art. 2(7), translation Act No. 51 of 2023), defined as data provided to specific persons on a regular basis; Art. 19(1)(ix)(b) excludes acquiring data "the same as any information that has been made available to the public without compensation", so public posts are outside it, while Art. 2(1)(xvii)-(xviii) targets devices that circumvent technological restriction measures. Contract (platform terms) and personal-data law (APPI) remain; I did not verify APPI text or METI's limited-data guideline (that PDF returned 403), nor Japanese case law on crawling.

**Malaysia.** The Personal Data Protection Act 2010 (Act 709) applies under s.2(1) to "any personal data in respect of commercial transactions", defined as "any transaction of a commercial nature, whether contractual or not" (2016 reprint, https://lom.agc.gov.my). It was amended by the Personal Data Protection (Amendment) Act 2024 (Act A1727), phased in during 2025 (dates from secondary sources; amendment text not retrieved). The "made public by the data subject" carve-out in s.40(1)(c) sits inside the *sensitive* personal data section, so it is not a general exemption for public posts. The Computer Crimes Act 1997 (Act 563, reprint to 2006-01-01), s.3, makes it an offence to cause a computer to perform a function with intent to secure access that is "unauthorized" and known to be so; s.2(5) defines unauthorized access as access by someone who is not entitled to control it and lacks, or exceeds, the consent of someone who is; penalty up to 50,000 ringgit or five years. Whether reading a public web page against its terms is "unauthorized" is untested in anything I retrieved (UNVERIFIED). The Copyright Act 1987 (Act 332) is reported by secondary sources to have no text-and-data-mining exception, and MyIPO is reported to have run a 2026 consultation on one; primary text blocked (403), so UNVERIFIED.

---

## 6. Official alternatives (per item)

Each block lists (a) to (h) plus demo/video use.

### 6.1 YouTube Data API v3 (C1)
(a) Find videos near a point (`search.list` with `location`, `locationRadius`, `type=video`) and by Japanese query (`relevanceLanguage=ja`, `regionCode=JP`). Gives video IDs for an official iframe embed.
(b) Google Cloud project plus API key; OAuth not needed for public search.
(c) Free. Default quota: "100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints"; search costs 1 per call in its own bucket; `videos.list` costs 1; `maxResults` up to 50; `locationRadius` max 1,000 km; resets midnight Pacific. ("Quota extension audit" details are on a separate page I did not open.) Pages dated 2026-09-14 and 2026-10-15.
(d) Stable API; quota model has changed shape (search is now its own 100-calls bucket; I recall it previously cost 100 units out of 10,000, same effective capacity: recollection, UNVERIFIED). No multi-year free commitment stated, but there is no charge for the default quota either.
(e) Developer Policies (updated 2026-10-15) III.E.4.c: "After 30 calendar days, the API Client must either delete or refresh the stored data." Non-authorized statistics may not be stored over 30 days. Deletion on user request within 7 days. III.F.2: must show YouTube as the source and display brand features. No AI/ML-training clause found in the Developer Policies or API Services Terms text (searched for "machine learning", "artificial", "generative", "train": zero hits); Google-wide AI rules UNVERIFIED. **Open-source trap:** "you must not share or disclose your API Credentials to any other third party, allow access to or use of your API Credentials by any other third party, or embed your API Credentials in open source projects." Every self-hoster needs their own key.
(f) Compatible if no copies of video content are stored and each deployer brings a key.
(g) Japanese search works through `relevanceLanguage`; actual ranking quality for tiny Nagasaki businesses: UNVERIFIED (not queried).
(h) **MVP.** Only high-volume official route that is location-aware.
Demo/video: embedding real public videos through the YouTube player is the intended use; still show them only as mock-user content or with the owner's consent.

### 6.2 Flickr API (C2)
(a) Geo and tag search for photos (`flickr.photos.search`: `lat`/`lon`/`radius` under 32 km, `bbox`, `has_geo`, `tags`, `text`, `license`, `per_page` up to 500; at most the first 4,000 results; geo queries need another limiting parameter). Photos, not posts.
(b) API key by application; non-commercial default, commercial key by Flickr staff approval. Whether a paid Flickr account is needed for new keys: UNVERIFIED (one commercial blog claims so; not confirmed).
(c) Free for non-commercial; API rate limits not stated on the pages fetched.
(d) ToU "Last updated: May 9, 2018", which says SmugMug may change terms without notice. No 2026 changelog retrieved.
(e) ToU: do not "Cache or store any Flickr user photos other than for reasonable periods"; comply with owners' licence restrictions; remove within 24 h; show the "uses the Flickr API but is not endorsed or certified by SmugMug, Inc." notice; no more than 30 photos per page. AI use not addressed.
(f) Use only photos under licences that permit reuse (filter `license`), hotlink or link out; open-source compatible if attribution is kept.
(g) Japanese tags and text: search works on any text; quality UNVERIFIED.
(h) **later.** Useful for photos of a place; add after MVP.
Demo/video: only CC/PD-licensed photos with attribution.

### 6.3 Wikimedia Commons, Wikipedia (ja/en) geosearch (C3)
(a) `action=query&list=geosearch` (GeoData extension, installed on Commons and all Wikipedias) returns nearby pages and files; Commons files carry per-file licences. Gives reusable place photos and neutral background text.
(b) None; descriptive User-Agent required ("API requests to Wikimedia wikis must include a meaningful User-Agent header").
(c) Free. Serial requests recommended; extra Wikimedia rate limits exist (details on a separate page).
(d) Very stable; Etiquette page last edited 2026-05-13; Terms of Use effective 2023-06-07.
(e) Terms of Use s.7: text under CC BY-SA 4.0 and GFDL, non-text media under various licences "that allow unrestricted reuse"; reusers must attribute authors (link to page, or list authors) and share-alike modified text. s.4 bans abusive or disruptive automated use. Nothing on AI processing in the text fetched.
(f) CC BY-SA 4.0 is share-alike for text: keep Wikipedia-derived text separate from code licence, with attribution.
(g) ja.wikipedia.org and Commons Japanese categories: best Japanese-language quality of any item here (editorial community), though small businesses are rarely covered (UNVERIFIED, not sampled).
(h) **MVP** for place background and photos; not a source of personal "stories".
Demo/video: allowed with per-file licence and attribution.

### 6.4 Bluesky search (C4)
(a) `app.bsky.feed.searchPosts` keyword search of public posts.
(b) Account and app password; unauthenticated calls to the public AppView returned **403** in my one test today and are reported failing in the official docs repo (bluesky-social/bsky-docs issue #332, opened 2025-02-22; a contributor said the 403 is deliberate load reduction; on 2026-08-18 a user reported both `public.api.bsky.app` and `api.bsky.app` returning 403 again; the repo was archived that day). Do not rely on case-sensitivity bypasses.
(c) Free. Rate limits page moved and could not be read: UNVERIFIED.
(d) Search access has been unstable for 20 months; no commitment.
(e) Terms (last updated 2025-08-14): no automated-access or AI clause; licence s.3.5 is a limited licence to Bluesky itself; "Bluesky does not control how others may use your Content."
(f) Protocol is open; content remains the authors'.
(g) Japanese: `lang` filter exists in my recollection (UNVERIFIED, docs not retrievable); Nagasaki yield UNVERIFIED.
(h) **later.**

### 6.5 Mastodon hashtag timelines (C5)
(a) `GET /api/v1/timelines/tag/:hashtag` public posts for a tag (`any[]`, `all[]`, `none[]`, `local`, `only_media`, `limit` max 40).
(b) None unless the instance disables unauthenticated access (setting `timelines_access.hashtag_feeds`, added in 4.5.0; then a 401 and an app token with `read:statuses` are needed).
(c) Free. Default "300 times within 5 minutes" per IP.
(d) Protocol stable; each server can restrict access.
(e) Per-instance ToS (I could not retrieve mastodon.social's; Japanese instances not checked): UNVERIFIED.
(f) Fine; per-post licence is the author's.
(g) Hashtag only (no location, no language parameter documented); Nagasaki yield UNVERIFIED.
(h) **later.**

### 6.6 Reddit Data API (C6)
(a) Subreddit/search access; relevant subreddits for Japan travel exist but Nagasaki businesses are thin (UNVERIFIED).
(b) OAuth app. Current approval rules (Responsible Builder Policy page returned 403): UNVERIFIED.
(c) Terms say fees are reserved; commercial use, or "research in excess of rate limits", needs a separate agreement.
(d) Data API Terms effective 2023-06-19 and last revised 2026-07-20, so the terms are still moving; no multi-year free commitment stated.
(e) Data API Terms: no use of User Content "for training a machine learning or AI model, without the express permission of rightsholders"; "must immediately delete any data not required"; on termination delete cached content "and any data or models that were derived from" it; no deriving revenue "unless there is express written approval".
(f) Incompatible with an AI-claims pipeline and with open redistribution.
(g) Japanese content minimal (UNVERIFIED).
(h) **avoid.**

### 6.7 Threads API keyword search (C7)
(a) Searches public Threads posts by keyword or topic tag (`search_type` TOP/RECENT, `search_mode` KEYWORD/TAG, `media_type`).
(b) Meta developer app, `threads_basic` plus `threads_keyword_search`; "Without approval, search covers only the authenticated user's own posts", so App Review is required to search others. Review duration and criteria: UNVERIFIED.
(c) Free. Limit: 2,200 queries per rolling 24 hours (queries returning no results do not count); "sensitive or offensive" keywords return an empty array.
(d) New API; Meta has kept expanding it, but no multi-year commitment.
(e) The keyword-search page is silent on storage and display. The overview page says published content is shown "solely to the person who created it" for the publishing flows; whether that restricts search results: UNVERIFIED. Meta Platform Terms deletion duties apply (section 3).
(f) n/a.
(g) Japanese keyword behaviour: UNVERIFIED. Location search in the Threads API is for tagging posts (500 location searches per 24 h), not for finding posts by place.
(h) **later**, after the MVP, if App Review is granted.

### 6.8 Instagram Graph API hashtag search (C8)
(a) Look up a hashtag ID and read recent or top media for it.
(b) Business or Creator account, App Review for the Instagram Public Content Access feature and `instagram_basic`.
(c) Free; "30 unique hashtags per Business or Creator Account in a rolling 7-day period"; sensitive hashtags return a generic error.
(e) No location filter; example response returns media IDs only; storage governed by Meta Platform Terms.
(h) **avoid** (hashtag only; not place-aware; review burden).

### 6.9 Official embeds (C9) - the render path
- Instagram oEmbed: `GET graph.facebook.com/instagram_oembed?url=` for posts, reels and profiles; 1,000 requests per hour; "The endpoint is only for embedding Instagram content in websites and apps. Using metadata or content for anything other than a front-end view is prohibited. This includes extracting, manipulating, or persisting the metadata and content, and deriving analytics from it." Caching or storing the response falls under this. Private, age-restricted and embeds-disabled accounts are unsupported. Auth and app-review needs are not stated on that page (UNVERIFIED).
- TikTok oEmbed: `GET https://www.tiktok.com/oembed?url=`; the example shows no credentials; "Embed Videos will be deprecated soon" and the page recommends Embed Player for new integrations.
- X oEmbed: `https://publish.x.com/oembed`, "requires no authentication", not rate limited, markup may be cached up to the returned `cache_age`.
- YouTube iframe player (section 6.1).
- Threads embed documentation: URL I tried returned 404, UNVERIFIED. Bluesky and Mastodon embeds: not checked.
(h) **MVP.** These are the only routes where a platform itself says "show this content on your site". Store only the URL plus our own human-entered fields; re-check availability on a schedule.
Demo/video: embeds of real public posts are the intended use, but a recorded video freezes third-party content that the author may later delete (X requires deletion sync within 24 h; YouTube 30-day refresh). Use mock-user content or owner-consented posts in demos.

### 6.10 TikTok Research API; X API reads (C10)
- TikTok Research API: eligibility is academic institutions in the US, EEA, UK, Canada or Switzerland, plus some non-profit/independent research bodies; applicants must be "independent of commercial interests". Not available to this project. **avoid.**
- X API: pay-per-use, "0.005 USD" per post read, "No contracts, subscriptions, or minimum spend", promotional credits of 20 USD after first purchase (page undated). Recent-search availability not confirmed on that page. About 7 to 15 USD to read 1,500 to 3,000 posts (my arithmetic). Developer terms: delete within 24 h on X's request; no standalone location storage. **avoid** (low Japanese-place yield per cost, deletion-sync burden).

### 6.11 Google Places API (New) (C11)
(a) Resolve a place to a stable `place_id`, and fetch details for link-out.
(b) Google Cloud project, billing account.
(c) Free caps per month (pricing page dated 2026-10-28): Place Details Essentials 10,000; Pro 5,000 (17 USD per 1,000 beyond); Enterprise 1,000 (20 USD per 1,000 beyond); Enterprise + Atmosphere 1,000 (25 USD per 1,000 beyond; this SKU holds `reviews`, `editorialSummary`, `generativeSummary`). **Text Search Essentials (IDs Only) and Place Details Essentials (IDs Only): unlimited, no charge.** The page no longer mentions a 200 USD monthly credit (earlier existence of that credit: my recollection, UNVERIFIED).
(d) Pricing model has been restructured repeatedly; Service Specific Terms last modified 2026-10-28 and Maps ToS 2026-08-26. No multi-year credit commitment.
(e) Places policy: "You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions"; "You can therefore store place ID values indefinitely." Service Specific Terms s.14.2: "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google map." s.14.3: latitude/longitude may be cached up to 30 consecutive calendar days. Maps ToS s.3.2.3(c)(vii): no using Maps content to "train, test, validate or fine-tune" ML/AI models.
(f) The 14.2 clause is incompatible with showing Places content on our own (non-Google) pin map. Our map provider is unknown to me: UNVERIFIED.
(g) `languageCode=ja` supported (default "en"); `regionCode` optional.
(h) **later**, and only as a free IDs-only resolver for `place_id` plus a "view on Google Maps" link. Do not store or display other Places content.
Demo/video: show no Places content except a Google-attributed live widget.

### 6.12 Web search APIs (C12)
- Google Custom Search JSON API: "closed to new customers"; existing customers until **2027-01-01** to move; free 100 queries per day, 5 USD per 1,000, cap 10,000 per day. Not an option (page dated 2026-02-18).
- Bing Search APIs: retirement announced for 2025-08-11; replaced by "Grounding with Bing Search" in Azure AI Agents (a Microsoft Lifecycle announcement page; read via search result). Not an option.
- Brave Search API: Search plan 5 USD per 1,000 requests with 5 USD free credit monthly (about 1,000 free queries); Answers plan 4 USD per 1,000 plus tokens. API ToS (last updated 2026-09-01): s.3(b)(i) forbids "store, cache, or create a database of Search Results, in whole or in part"; s.3(b)(xiii) forbids using results to "create, evaluate, train, re-train, fine-tune, benchmark or otherwise improve artificial intelligence models"; s.4(d) requires "POWERED BY BRAVE" attribution. Storage needs "a plan that includes storage rights" (which plan: UNVERIFIED). Japanese support: UNVERIFIED.
(h) Brave: **later**, human-in-the-loop discovery only (the person sees results, pastes the chosen URL; nothing stored from the API response beyond what the human pastes). Even that is a grey area under s.3(b)(i): confirm with Brave.

### 6.13 Blog RSS, sitemaps, WordPress REST (C13)
(a) Many small businesses run WordPress or a blog with a feed. RSS/Atom feeds and `sitemap.xml` list posts; WordPress sites expose `GET /wp-json/wp/v2/posts?search=` ("Limit results to those matching a string"; default 10 per page) where enabled.
(b) None; discovery of which businesses have blogs is manual (owner interview or the business's own link).
(c) Free.
(d) Open standards. RFC 9309 (Robots Exclusion Protocol, Standards Track, September 2022) is the only machine-readable consent signal, and it states "These rules are not a form of access authorization."
(e) Per-site copyright and terms. Respect robots.txt, rate-limit, and prefer owner permission; fetching a feed of a site whose owner is already your interview contributor is the lowest-risk case.
(f) Quote under Japan Art. 32 or link; do not copy full articles.
(g) Japanese content is native; quality is the owner's.
(h) **MVP** for owner-consented blogs.
Demo/video: use only blogs whose owner consented.

### 6.14 Japanese blog platforms' public APIs (C14)
- Hatena Blog AtomPub API: operates on a blog you own or are a member of; "no search of other people's blogs is described"; requires OAuth `read_private` and `write_private` for all operations, or WSSE/Basic with the blog's API key. Useful only for blogs whose owners connect their own account.
- Ameba: Terms of Use (updated 2025-11-10) Art. 13 contains no clause on automated collection or scraping in the text fetched; Ameba Help (updated 2022-03-17) says "Amebaは自動化ツール等を利用したサービスの利用を認めていません。" (Ameba does not permit use of the service via automation tools.) No public API or RSS terms found.
- note.com: terms page returned 403; Hatena general terms 404 at the URL tried; Livedoor, Seesaa, FC2, Rakuten not checked. All UNVERIFIED.
(h) **avoid** as a bootstrap source. Where an owner wants their own blog linked, use C13 or paste the URL.

### 6.15 Human-confirmed manual curation (C15)
(a) Team members search the web, Google Maps (as a human), Instagram, blogs, and paste URLs into the product's own flow. (b) None. (c) Free. (d) Independent of any API. (e) Same terms as any human reader; no automated collection. (h) **MVP.** Estimate in section 7.

---

## 7. Cost and effort to seed about 15 places x about 20 posts

Assumptions (all mine): target 300 accepted, real, human-confirmed posts; a human needs about 1 minute to confirm and link one candidate, about 10 seconds to skim a raw candidate; only 1 in 5 to 1 in 10 raw candidates is on-topic for a specific tiny business, so 1,500 to 3,000 raw candidates are pulled where a route returns noise. Dev effort assumes a developer who has not used the route before.

| Route | Raw items | Cash cost | Dev effort | Human review | Legal/terms risk |
|---|---|---|---|---|---|
| Apify Instagram (location URLs plus hashtags) | 1,500 to 3,000 | 4.05 to 8.10 USD at the Free rate of 2.70 USD per 1,000 (the 5 USD free credit covers about 1,850 results); about 19 USD/month if Starter is taken | 1 day plus finding 15 location IDs by hand | about 4 to 8 h skim plus 5 h confirm | High |
| Apify Google Maps (15 places, 300 reviews) | 15 places | about 0.03 + 0.15 = 0.18 USD | 0.25 day | about 1 h | High (Maps ToS); reviews conflict with policy |
| Apify TikTok (hashtags/keywords) | 1,500 to 3,000 | about 3 to 9 USD (estimate; Free-plan rate not retrieved) | 0.5 day | 4 to 8 h skim plus 5 h confirm | High |
| Apify Threads (community actors) | 1,500 to 3,000 | about 1 to 39 USD (0.60 to 13 USD per 1,000) | 0.5 day | same | High; one actor needs a session cookie |
| X API reads | 1,500 to 3,000 | 7.50 to 15 USD | 0.5 day plus credit purchase | same | Medium (official API; deletion sync) |
| YouTube Data API | up to 3,000 (60 searches at 50 results is within 100 calls/day) | 0 | 0.5 to 1 day | 3 to 5 h | Low |
| Wikimedia Commons / Wikipedia | a few hundred | 0 | 0.5 day | about 2 h | Low |
| Flickr geo/tag search | a few hundred | 0 | 0.5 day | about 2 h | Low to medium (licence filter needed) |
| Bluesky / Mastodon | tens to low hundreds (UNVERIFIED) | 0 | 0.25 day each | about 1 h | Low |
| Threads keyword search API | up to 2,200 queries/24 h | 0 | 0.5 day plus App Review wait (UNVERIFIED) | 3 to 5 h | Medium |
| Google Places IDs-only resolver | 15 lookups | 0 | 0.25 day | about 0.5 h | Low if only `place_id` stored |
| Brave Search (human-in-loop discovery) | about 75 to 150 queries | about 0 (5 USD monthly credit = 1,000 queries) | 0.25 day | about 3 h | Medium (no-store clause) |
| Blog RSS/sitemap (owner-consented sites) | 10 to 50 posts per site | 0 | about 1 h per site | about 1 h | Low |
| Manual pasting by the team (baseline) | 300 | 0 | 0 | about 7.5 h (300 x 1.5 min) | None beyond ordinary browsing |

Take-away: scraping saves roughly one person-day of searching and costs at most about 20 USD, in exchange for a clearly higher legal and account-ban risk and content that cannot be shown or stored anyway (section 8.4).

---

## 8. Recommended pipeline, verdict, and where the plan collides with the terms

### 8.1 Pipeline: discover candidates, a human confirms, we link out via embed

1. **Seed places (human).** The owner names the 15 real places and pins them. Optionally resolve each to a Google `place_id` with an IDs-only text search (free; `place_id` may be stored indefinitely). Do not store other Places content.
2. **Discover candidates (read-only, low-rate, official).** YouTube Data API (location radius plus Japanese query plus place name), Wikimedia Commons/Wikipedia geosearch, Flickr geo search with a licence filter, Bluesky and Mastodon tag/keyword search, Threads keyword search once approved, human-run web searches for blogs, and RSS/sitemap/WordPress REST for owner-supplied blogs. Output a candidate list of URL plus minimal metadata, held as short-lived (YouTube refresh rule 30 days; X deletion rule 24 h) and never committed to the repo.
3. **Human confirms.** A reviewer approves each candidate, links it to the pinned place, and adds a short note in our own words. Reject anything personal, off-topic, or posted by someone who has not consented.
4. **Link out via embed.** Store the canonical URL, platform, author handle as a link, post date and the human note. Render with the platform's own embed (YouTube iframe, Instagram oEmbed, TikTok oEmbed/Embed Player, X oEmbed). Always show attribution and a link to the original.
5. **Re-verify on a schedule.** Re-fetch embeds or call the platform API to confirm the post still exists; hide the entry when it does not.
6. **AI claim extraction only on material we are licensed to process:** owner-contributed interview transcripts, and openly licensed text (e.g. Wikipedia under CC BY-SA, kept attributed). Do not run extraction over scraped or embedded third-party social posts.

### 8.2 Is a scraping lane needed for the MVP?

**No.** Official discovery plus human confirmation covers the bootstrap with 0 USD of fees and low legal exposure, and the product's accuracy promise (human pin) is better served by humans confirming each link.

### 8.3 Lowest-risk way if the owner still insists

Only as a one-off preparation task outside the product, never as a feature, and only after Japanese counsel signs off:
1. Public, logged-out pages only. No accounts, no cookies or session IDs (so never the community Threads actor that needs one), no fake accounts, no proxy rotation or other measures meant to defeat anti-bot systems (the s.1201 line of cases, section 4), no rate-limit evasion.
2. Use an Apify-maintained actor (apify/instagram-scraper) with hard caps: 15 location or hashtag URLs, e.g. 100 results each, at most 1,500 results (about 4 USD at the Free rate). One run, one day.
3. Treat the output as a lead list: keep only post URLs, discard captions, images and handles after human triage in the same sitting, and never commit it to the repo or put it in a demo.
4. Do not scrape Google Maps reviews or place data at all.
5. Accept that Meta's Instagram ToS s.4.2 and Automated Data Collection Terms still prohibit it in contract and that Apify's s.11.1 indemnity makes us pay for any resulting claim.

### 8.4 Where the plan collides with platform terms (contradictions to resolve)

- **"Imports and renders" pasted URLs with attribution.** Instagram oEmbed forbids "extracting, manipulating, or persisting the metadata and content". X requires deletion sync within 24 h. YouTube requires refresh or delete after 30 days. Google Places forbids caching beyond IDs. So "import" has to mean store URL plus human fields, render live through the embed.
- **Non-Google map.** Places API content may not be used "in conjunction with a non-Google map" (Service Specific Terms s.14.2). If the pin map is Leaflet/MapLibre/OSM-based, Places content is out apart from `place_id`.
- **AI processing.** Google Maps content cannot be used to train, test, validate or fine-tune models; Reddit and Brave forbid AI use of their data; Instagram oEmbed forbids "deriving analytics"; the Japanese ACA guidance treats RAG-style reuse of creative expression as outside Art. 30-4. Keep AI extraction to consented transcripts and openly licensed text.
- **Open source.** YouTube's policy forbids embedding API credentials in open-source projects; every deployment (including the Malaysia instance) must hold its own keys for YouTube, Brave, X, Meta and Apify.
- **Demo rule.** The hard rule says demo content belongs to a labelled mock user. No source in this lane grants permission to show copies of third-party posts in a recorded demo. Allowed: Commons/CC/PD media with attribution, owner-consented items, and content the team creates under the mock user.

---

## 9. Unverified / open questions

1. Live Instagram Terms text: help.instagram.com is JavaScript-rendered; I read s.4.2 from the Open Terms Archive snapshot dated 2025-01-01. Meta says its ToS will change on 2027-01-20. Re-check both.
2. Whether Meta ToS s.3.2.3 and the Automated Data Collection Terms cover Threads, and whether any court has tested the rewritten Meta terms against a logged-out visitor.
3. X Corp. v. Bright Data: settlement is from Bloomberg Law (secondary); I did not retrieve the stipulation or dismissal. Whether Meta formally dropped its residual claim in Meta v. Bright Data: TechCrunch only.
4. Google v. SerpApi after the 2026-07-20 order (amended complaint, 2026-09-29 hearing reported by a secondary source); Reddit v. SerpApi: I read only the opening pages of the opinion, so scope beyond the summary paragraph (which claims were dismissed) is as stated there.
5. Amazon v. Perplexity (9th Cir., reported 2026-08-04, vacating a CFAA injunction against an AI agent): news reports only, filing not read; relevant only to logged-in agent access.
6. Japan: APPI treatment of personal data in public posts; METI's guideline on "limited provision data" (PDF returned 403); Penal Code and crawl-related prosecutions (the 2010 Okazaki library "Librahack" arrest is known to me only from secondary Japanese sources); full ACA main document (only the overview was read); Japanese statutory text (only English translations read; Copyright Act translation shows "Last Version: Act No. 52 of 2021"); any Japanese court rulings on crawling.
7. Malaysia: PDPA amendment text (Act A1727) and its commencement dates (secondary sources); current consolidated Computer Crimes Act (2006 reprint read); Copyright Act 1987 text-and-data-mining position and the 2026 MyIPO consultation (MyIPO PDF returned 403; reports are from news).
8. Apify: whether a payment card is required for the Free plan; source licences of individual actors; actual Free-plan per-result price for TikTok; whether any actor works reliably today (none was run).
9. Bluesky: official `searchPosts` auth rules and the `lang` parameter (docs moved; lexicon not retrievable); public search is returning 403.
10. Flickr: whether a paid account is needed for new keys; API rate limits.
11. Threads keyword search: App Review duration and criteria; storage and display rights for search results; Japanese keyword behaviour; embed documentation (URL returned 404).
12. Instagram oEmbed: authentication and App Review requirements (not stated on the page fetched).
13. Reddit: current API approval policy (help page 403).
14. Mastodon: ToS of Japanese instances; language filtering on tag timelines.
15. Japanese blog platforms: note.com, Hatena, Livedoor, Seesaa, FC2 terms and any public feeds not verified.
16. YouTube: AI/ML restrictions beyond the Developer Policies text; whether Japanese `relevanceLanguage` ranking surfaces tiny Nagasaki businesses (not queried).
17. Google Places: history of the 200 USD credit and 5-review cap (my recollection, not read); Google robots.txt for Maps paths.
18. Our map provider and licence choice are unknown to me; both change the verdicts for Places content and for CC BY-SA text.
19. Yield figures (how many Nagasaki posts each route returns) are assumptions, not measurements; a read-only pilot through official APIs would replace them.
20. Cost figures are arithmetic from list prices (plan-dependent) and may differ at run time.

---

## 10. Sources

All accessed 2026-10-29. "(S)" marks a secondary source used only to locate a primary one or to report a fact I could not confirm in a filing.

Apify
- https://apify.com/pricing
- https://blog.apify.com/is-web-scraping-legal/
- https://help.apify.com/en/articles/3024655-web-scraping-legality
- https://docs.apify.com/legal
- https://docs.apify.com/legal/general-terms-and-conditions (and .md)
- https://docs.apify.com/legal/actor-terms-and-conditions
- https://docs.apify.com/legal/store-publishing-terms-and-conditions
- https://docs.apify.com/legal/acceptable-use-policy
- https://apify.com/apify/instagram-scraper
- https://apify.com/apify/instagram-hashtag-scraper
- https://apify.com/apify/instagram-api-scraper
- https://apify.com/compass/crawler-google-places
- https://apify.com/clockworks/tiktok-scraper
- https://apify.com/futurizerush/threads-search-scraper-api
- https://apify.com/magicfingers/threads-scraper
- Apify search listings for Threads actors (S, locate only)

Platform terms
- https://www.facebook.com/terms and https://www.facebook.com/legal/terms/update
- https://www.facebook.com/apps/site_scraping_tos_terms.php
- https://github.com/OpenTermsArchive/pga-versions (Instagram Terms of Service snapshot; raw file `Instagram/Terms of Service.md`) (S, mirror of help.instagram.com/581066165581870)
- https://developers.facebook.com/terms/
- https://www.tiktok.com/legal/page/row/terms-of-service/en
- https://cloud.google.com/maps-platform/terms
- https://cloud.google.com/maps-platform/terms/maps-service-terms
- https://policies.google.com/terms
- https://x.com/en/tos
- https://docs.x.com/developer-terms/agreement-and-policy
- https://www.rfc-editor.org/rfc/rfc9309.html

Litigation
- https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf
- https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf
- https://s3.documentcloud.org/documents/23429042/hiq-stip.pdf
- https://storage.courtlistener.com/recap/gov.uscourts.cand.406956/gov.uscourts.cand.406956.181.0.pdf
- https://storage.courtlistener.com/recap/gov.uscourts.cand.415869/gov.uscourts.cand.415869.83.0.pdf
- https://storage.courtlistener.com/recap/gov.uscourts.cand.415869/gov.uscourts.cand.415869.156.0.pdf
- https://serpapi.com/blog/content/files/2026/07/Order-Granting-Motion-to-Dismiss---Google-v.-SerpApi.pdf (filed order, hosted by the defendant)
- https://storage.courtlistener.com/recap/gov.uscourts.nysd.651592/gov.uscourts.nysd.651592.104.0.pdf
- https://news.bloomberglaw.com/ip-law/musks-x-settles-data-scraping-dispute-against-israeli-data-firm (S)
- https://techcrunch.com/2024/02/26/meta-drops-lawsuit-against-web-scraping-firm-bright-data-that-sold-millions-of-instagram-records (S)
- Law-firm and news summaries (Skadden, Proskauer, Foley & Lardner, Law360, MediaPost) (S, locate only)

Japan and Malaysia
- https://www.japaneselawtranslation.go.jp/en/laws/view/4207/en (Copyright Act, Art. 30-4, 32, 47-5)
- https://www.japaneselawtranslation.go.jp/en/laws/view/4709/en (Unfair Competition Prevention Act, Art. 2, 19)
- https://www.bunka.go.jp/english/policy/copyright/pdf/94055801_01.pdf (ACA, "General Understanding on AI and Copyright in Japan", overview, May 2024)
- https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20563.pdf (Computer Crimes Act 1997 reprint)
- https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20709%2014%206%202016.pdf (PDPA 2010, as at 2016-06-15)
- https://www.pdp.gov.my/ppdpv1/en/akta/pdp-act-2010-en/ (PDP Department page, locate only)
- https://www.myipo.gov.my/copyright-act/ (blocked; locate only)
- Bernama / Malay Mail / Business Today reports on MyIPO consultation (S, locate only; Business Today returned 403)

Official alternatives
- https://developers.google.com/youtube/v3/determine_quota_cost
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/api-services-terms-of-service
- https://www.flickr.com/services/api/tos/
- https://www.flickr.com/services/api/flickr.photos.search.html
- https://www.flickr.com/services/api/misc.api_keys.html
- https://bsky.social/about/support/tos
- https://github.com/bluesky-social/bsky-docs/issues/332
- https://docs.joinmastodon.org/methods/timelines/
- https://docs.joinmastodon.org/api/rate-limits/
- https://redditinc.com/policies/data-api-terms
- https://www.mediawiki.org/wiki/API:Geosearch
- https://www.mediawiki.org/wiki/API:Etiquette
- https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- https://developers.facebook.com/docs/threads/keyword-search
- https://developers.facebook.com/docs/threads/overview
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search
- https://developers.facebook.com/docs/instagram-platform/oembed
- https://developers.tiktok.com/doc/embed-videos
- https://developers.tiktok.com/products/research-api/
- https://docs.x.com/x-for-websites/oembed-api
- https://docs.x.com/x-api/getting-started/pricing
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/custom-search/v1/overview
- https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement (via search result; Spanish-locale copy seen)
- https://brave.com/search/api/
- https://api-dashboard.search.brave.com/documentation/resources/terms-of-service
- https://developer.wordpress.org/rest-api/reference/posts/
- https://developer.hatena.ne.jp/ja/documents/blog/apis/atom
- https://helps.ameba.jp/rules/post_104.html
- https://helps.ameba.jp/trouble/post_1495.html
