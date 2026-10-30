# 03. Social and blog URL embed / import

Lane: given a public URL a user pastes, what can we legitimately render, and what can we store, per platform.
Access date for every fact below: **2026-10-29** unless a line says otherwise. Anything I could not confirm on a primary page is marked **UNVERIFIED**.
No Instagram, Google, TikTok or X content pages were fetched. For those platforms I read only developer docs, terms, and (for Instagram) the public `robots.txt` policy file.

## Summary table

| # | Item | Renders from URL alone (no auth)? | Registered app / review? | Cost today | Store metadata / thumbnail? | Feed to AI claims? | Verdict |
|---|------|----|----|----|----|----|----|
| 1 | Instagram oEmbed + embed.js | Yes, tokenless since 2026-05-15 | No | Free, 1,000 req/h | No (persisting prohibited) | No | **MVP** (render-only) |
| 2 | Instagram Graph API (hashtag search) / Basic Display | No | Yes (App Review + professional account) | Free, 30 hashtags / 7 days | No | No | **Avoid** (Basic Display is dead, hashtag search is tiny) |
| 3 | Facebook oEmbed (post, video, page) | Yes, tokenless since 2026-06-15 | No | Free, 1,000 req/h per endpoint | No | No | **MVP** (same adapter as Instagram) |
| 4 | Threads oEmbed | Yes, tokenless since 2026-03-03 | No | Free, 1,000 req/h | No | No | **Later** (free with the Meta adapter, but no JP usage data) |
| 5 | Threads API keyword search | No | Yes (`threads_keyword_search`) | Free, 2,200 queries / 24 h | Not stated | Not stated | **Avoid** (no location search, review needed) |
| 6 | TikTok Embed Player / oEmbed | Yes (iframe from video ID) | No | Free | Do not | No | **MVP-stretch** (oEmbed "deprecated soon", use Embed Player) |
| 7 | TikTok Display API / Research API | No | Yes | Free | Restricted | No | **Avoid** (own videos only / non-profit academics only) |
| 8 | X oEmbed + widgets.js | Yes | No | Free | Only IDs safely | No | **MVP** |
| 9 | X API v2 | No | Yes | Pay per use, $0.005 per post read | Must stay in sync, 24 h deletes | Forbidden for model training | **Avoid** |
| 10 | YouTube iframe embed + oEmbed | Yes | No (no key) | Free | Video ID only; 30-day refresh if API data | No | **MVP** |
| 11 | YouTube Data API v3 | Needs API key | Key only (audit for more quota) | Free quota: 10,000 units/day + 100 `search.list`/day | 30-day rule | Not stated, derived data barred | **Later** (location search for discovery) |
| 12 | Bluesky (oEmbed + public AppView) | Yes | No | Free | Open protocol, but author owns content | Not restricted by ToS | **MVP-stretch** |
| 13 | Mastodon | Yes (per instance) | No | Free | Per-instance rules | Per-instance | **Later** |
| 14 | Reddit | oEmbed endpoint exists, auth UNVERIFIED | API approval needed (secondary report) | Free non-commercial; commercial = agreement | Delete on removal | Forbidden without rightsholder permission | **Avoid** |
| 15 | Pinterest | Widgets yes; oEmbed undocumented | No for widgets | Free | No (storage prohibited) | Forbidden | **Later / avoid** |
| 16 | Flickr (API + oEmbed) | API key needed | Key (commercial needs approval) | Free | Only "reasonable periods", 24 h removals | Not stated | **Later** (CC photos by geo) |
| 17 | Google Maps review URL; `place_id` + link-out | No (no public review endpoint) | Key for Places API | Maps URLs: no key. Places: out of lane | `place_id` yes; reviews no | Forbidden | **MVP** as a link-out, not as review rendering |
| 18 | Generic blog (OGP, oEmbed discovery, RSS/Atom, robots.txt) | Yes | No | Free | Short snippet + hotlinked image, our policy | Only owner-contributed text | **MVP** |
| 19 | note.com | OGP + RSS yes; no public oEmbed | No | Free | Link card only | No | **MVP** via Generic adapter |
| 20 | Ameba Blog | RSS yes; embed UNVERIFIED | No | Free | Link card only | No | **MVP** via Generic adapter |
| 21 | Hatena Blog | Yes, documented oEmbed | No | Free | Terms bar third-party disclosure | No | **MVP-stretch** |
| 22 | LINE VOOM | No | n/a | n/a | n/a | n/a | **Avoid**: scheduled to end 2026-09-30 |
| 23 | Link-unfurl libraries | n/a | n/a | n/a | n/a | n/a | **MVP**: use `metascraper` or `open-graph-scraper` plus a small oEmbed client |

Verdicts, one line each:
1. Instagram: biggest visual source in JP (54.8%), free and tokenless now, but display-only.
2. Instagram Graph: Basic Display API was shut down 2024-12-04; hashtag search is capped and review-gated.
3. Facebook: shares the Meta adapter, 27.0% JP use (38.9% among 40s).
4. Threads: free with the Meta adapter, add last.
5. Threads search: needs App Review, no way to find posts by place.
6. TikTok embed: 36.7% JP use; build on the Embed Player iframe because TikTok says oEmbed will be deprecated.
7. TikTok APIs: Display is creator-authorised only; Research excludes commercial users.
8. X oEmbed: 44.7% JP use, no auth, no stated rate limit.
9. X API: pay-per-use plus a Developer Agreement that bans foundation-model training.
10. YouTube embed: 81.5% JP use, no key, the most stable embed.
11. YouTube Data API: only `search.list` with `location` helps us, and it has its own 100-call/day bucket.
12. Bluesky: open and free, but small JP audience (UNVERIFIED) and the public search host returns 403.
13. Mastodon: free and open, but each instance is its own SSRF and ToS surface.
14. Reddit: restrictive terms, approval-gated, thin Japan relevance.
15. Pinterest: bans storage and AI use, oEmbed not documented.
16. Flickr: the only source with machine-readable CC licences and a geo search.
17. Google Maps: a review cannot be rendered from its URL without breaking Google terms. Store `place_id`, link out.
18. Generic: covers the long tail of blogs, needs SSRF and robots care.
19. note: OGP and RSS only, `robots.txt` forbids its internal API.
20. Ameba: RSS exists, terms UNVERIFIED.
21. Hatena: only JP blog platform with a documented oEmbed.
22. LINE VOOM: gone; its LY Corp replacement has no public post URL or embed that I could find.
23. Libraries: permissive licences, MIT mostly.

## Findings that contradict or sharpen the plan

1. **Embeds are display-only evidence. They cannot feed the AI claims pipeline.** Meta says using oEmbed content or metadata "for any purpose other than providing a front-end view ... is strictly prohibited", including "consuming, manipulating, extracting, or persisting". X's Developer Agreement bars using X content to "fine-tune or train a foundation or frontier model" and the policy requires deletions within 24 h. Reddit and Pinterest bar AI training. Google Maps terms bar using Maps content to "train, test, validate or fine-tune" models and bar copying "user reviews". The plan says "paste URLs and the app imports/renders them". Rendering is fine. Importing text into claim extraction is not. Claims must come from owner-contributed transcripts or text the contributor typed.
2. **The open-source data export must contain URLs and IDs, not platform content.** X allows distributing only Post/User IDs (max 1,500,000 Post IDs per 30 days), Meta bars "selling, licensing" Platform Data, TikTok bars redistribution, Pinterest bars storage. Publishing a database dump with captions, thumbnails or author names breaks these terms.
3. **Meta removed the app-review barrier in 2026.** Threads oEmbed became tokenless on 2026-03-03, Instagram oEmbed on 2026-05-15, all Meta oEmbed APIs on 2026-06-15 (Meta changelogs and reference pages). An open-source project can therefore ship Instagram, Facebook and Threads rendering with no credentials. That removes the "every self-hoster needs their own approved Meta app" problem. It does not apply to X API, Reddit, TikTok Research, YouTube Data API, which all need per-deployer credentials (Reddit Developer Terms 1.4 forbids sharing Access Info).
4. **Meta oEmbed no longer returns thumbnail or author fields** (removed 2025-11-03: `author_name`, `author_url`, `thumbnail_url`, `thumbnail_width`, `thumbnail_height`). Rendering must use the returned `html`. We cannot build our own preview card from Meta data.
5. **LINE VOOM was scheduled to end on 2026-09-30** (LY Corp notice dated 2026-07-15). Today is 2026-10-29, so it should be gone, though I could not independently confirm the shutdown. Its replacement, the LINE Official Account "投稿" feature, was opened to all accounts on 2026-10-28 and no public URL or embed was documented. LINE is the most-used app among Japanese people (92.9%), yet nothing LINE-side is importable. Tiny businesses that live on LINE can only enter via interview transcripts. The plan already has that path.
6. **The oEmbed provider registry is stale.** `oembed.com/providers.json` still lists `place.line.me/oembed` (LINE PLACE closed 2024-06-03) and Meta endpoints under Graph `v16.0`. It lists no Threads, Mastodon or note. Do not drive adapter selection from the registry.
7. **TikTok oEmbed is on borrowed time.** TikTok's own page says "Embed Videos will be deprecated soon... We recommend using Embed Player for new integrations." No date is given.
8. **X API is pay-per-use** ($0.005 per post read on the pricing page), no subscription tiers on the page. X oEmbed remains free and unauthenticated.
9. **Bluesky's public AppView host is inconsistent for search**: `public.api.bsky.app` returned HTTP 403 for `searchPosts` while `api.bsky.app` returned 200 without auth (live probe 2026-10-29). The lexicon itself says search "may require authentication ... for some service providers".

## Cross-cutting: Japanese usage (locals and visitors)

**Locals.** MIC (総務省) 令和7年度 survey, fieldwork 2025-12-01 to 2025-12-07, n=1,800, ages 13 to 79, published 2026-06-26. Table: share who say they use the service (利用率).

| Service | All | 40s | 50s | 60s | 70s |
|---|---|---|---|---|---|
| LINE | 92.9% | 96.6% | 95.6% | 92.0% | 77.8% |
| YouTube | 81.5% | 91.6% | 84.9% | 72.6% | 48.5% |
| Instagram | 54.8% | 67.1% | 54.4% | 36.1% | 15.8% |
| X (formerly Twitter) | 44.7% | 57.0% | 40.2% | 24.8% | 10.8% |
| TikTok | 36.7% | not extracted | not extracted | not extracted | not extracted |
| Facebook | 27.0% | 38.9% | 33.1% | 22.6% | 12.5% |

The survey does not list note, Ameba, Hatena, Threads, Bluesky, Pinterest or Reddit. Their JP usage is **UNVERIFIED** from a primary source. The survey samples the general public, not business owners, so "owners of tiny Nagasaki shops" usage is also UNVERIFIED.

**Visitors.** Japan Tourism Agency, インバウンド消費動向調査 2025 年次報告書, figure 5-1, "出発前に役に立った旅行情報源" (all nationalities, multiple answers): SNS 43.3%, 動画サイト 39.6%, 個人のブログ 23.9%, 自国の親族・知人 19.9%, 日本政府観光局HP 12.2%, 口コミサイト 11.0%. Figure 5-2, information useful during the stay: 交通手段 65.9%, 飲食店 56.0%, 観光施設 39.1%. The report does not name platforms inside "SNS". Per-platform usage by visitors is **UNVERIFIED**, and by visitor country (English-speaking travelers specifically) is **UNVERIFIED**.

Reading: for locals the order is LINE, YouTube, Instagram, X, TikTok, Facebook. For visitors, SNS and video sites dominate, personal blogs are a real third. That supports the MVP order in the last section.

## Cross-cutting: how a deleted original reaches us

Embeds degrade by themselves (the platform stops rendering). What we must handle is **our stored record** and **claims that cite it**.

| Platform | How we learn it is gone | Obligation / observed behaviour |
|---|---|---|
| Meta (IG, FB, Threads) | Re-call oEmbed; error response. Exact error for a deleted post is UNVERIFIED. | Platform Terms (updated 2026-02-03) 3.d.i.1: "Update or delete Platform Data promptly after receiving a request from us or the User". Needs a removal-request path. |
| X | Re-call oEmbed; response for deleted posts is undocumented on the oEmbed page | Policy: delete or modify "as soon as reasonably possible, or within 24 hours after receiving a request". Stored content must be kept up to date. |
| YouTube | Re-verify at least every 30 days | Developer Policies III.E.4.b: "verify, every 30 days, that the video has not been deleted". |
| Bluesky | Observed: `getPosts` returns `200 {"posts":[]}`; `embed.bsky.app/oembed` returns `404 post not found` | No ToS duty found; delete anyway. |
| Mastodon | `/api/oembed` returns 404 `{"error":"Record not found"}` (observed on a non-existent ID) | ActivityPub 7.4: receiving servers "should remove its copy"; deleted objects return 410 or 404 (W3C Rec, 2018-01-23). |
| Reddit | Re-check | Developer Terms 3.3: delete or modify "as soon as possible" if content is deleted, protected or removed. |
| Flickr | Re-check | API ToU: removal within 24 hours of owner request; reflect privacy changes "as soon as reasonably possible". |
| Hatena Blog | oEmbed 404 (article not found) or 401 (blog not public) | Documented error codes. |
| Generic web | 404/410, `noindex`, or robots.txt change | Honour robots.txt re-check (RFC 9309 says cache at most 24 h). |

Recommended rule set: store one `SourceLink` row per URL (platform, canonical URL, external ID, status, `last_checked_at`, `next_check_at`, our own annotation). Re-check cadence: 24 h for X and Flickr, 30 days or less for YouTube, weekly default. On `gone`: stop rendering, delete any cached preview text, mark every claim whose only citation is that link as "source unavailable" (the Wikipedia-style "citation needed" state), keep the link row as a tombstone with the date. Provide a public takedown endpoint with a 24 h target.

## Cross-cutting: demos and videos

HARD RULE: seed data real, demo content under an explicitly labelled mock user. None of the embed terms I read says whether a screen recording of an embedded third-party post is allowed. Meta, X, YouTube and Reddit grant display "in websites and apps". A published video is re-publication, so the permission is **UNVERIFIED**. Safe path: the mock user imports only (a) posts on accounts the team controls, (b) posts whose owner gave written permission, or (c) openly licensed items (Flickr CC filter, YouTube videos the owner labelled CC-BY). A real stranger's post must not appear in a published demo even though the embed terms allow display in the app. Google Maps imagery in videos has its own permission guidelines, not fetched here (UNVERIFIED).

---

## 1. Instagram: oEmbed and plain embed

- **(a) What it does for us.** `GET https://graph.facebook.com/instagram_oembed?url=<post URL>` returns embed HTML (a `blockquote.instagram-media` plus `embed.js`) for public posts, reels and profiles. A user can also copy the same HTML from a post's `...` menu, then Embed, with an "Include caption" toggle (Meta embed-button doc).
- **(b) Auth / friction.** Tokenless. Changelog 2026-05-15: "You can now call Instagram oEmbed API without an access token." Reference page for all Meta oEmbed APIs: "On June 15, 2026, we lifted the access token requirement from all Meta oEmbed APIs... App Review will no longer be required to embed public Meta content." The older `features-reference/oembed-read` page still says App Review and business verification are required. The dated changelog and newer reference win, but the contradiction exists and I did not test a live call (no Instagram fetching).
- **(c) Cost.** Free. "Up to 1,000 requests every hour" tokenless (per endpoint). Apps that already hold Meta oEmbed Read can use a token for up to 5 million requests per endpoint per day.
- **(d) Longevity.** Volatile but trending open. 2025-04-08: Meta oEmbed Read replaces the old feature (old one deprecated 2025-11-03). 2025-11-03: author and thumbnail fields removed. 2026: tokens dropped. Basic Display API deprecated 2024-12-04. Expect more changes. No multi-year free commitment found.
- **(e) ToS: caching, storing, redistributing, AI.** Instagram oEmbed page: endpoint is "only meant to be used for embedding Instagram content in websites and apps"; any other use of metadata or content "(or their derivations)" is "strictly prohibited", including "consuming, manipulating, extracting, or persisting". Not supported: private, inactive, age-restricted accounts; accounts with Embeds disabled; Stories. Meta Platform Terms (2026-02-03): no "Selling, licensing, or purchasing Platform Data" (3.a.iv); delete on user or Meta request (3.d). Meta Automated Data Collection Terms (effective 2024-10-07): automated collection prohibited without express written permission. `instagram.com/robots.txt` says `User-agent: * Disallow: /` plus a notice that automated collection is prohibited without written permission. **Store:** URL, shortcode, status, our own notes. **Do not store:** returned `html`, captions, author names. A short-lived render cache of the HTML is a grey area, **UNVERIFIED**; avoid it, or render client-side so the browser talks to Meta.
- **Attribution.** The embed shows the owner's username linking to the profile. Do not strip it.
- **(f) OSS licence.** Nothing forced on our code or data. `embed.js` is Meta's script, loaded at runtime from Meta; do not vendor it (redistribution terms UNVERIFIED).
- **(g) Japanese quality.** The embed renders whatever the poster wrote; our own UI strings are ours.
- **Breaks it.** Private or age-restricted accounts, Embeds disabled by the owner, Stories, deletion. Shadow DOM is unsupported. 1,000 req/h per endpoint means client-side rendering or an HTTP cache for repeated views. Meta third-party scripts set cookies, so use a click-to-load facade for visitors.
- **Demo rule.** No explicit rule found. Use accounts we control.
- **(h) Verdict: MVP, render-only.** Highest JP visual reach, free, no keys.

## 2. Instagram Graph API: hashtag search, Basic Display

- **(a)** Discovery by hashtag (e.g. `#長崎`) for an Instagram professional account.
- **(b)** Needs a professional-account token and App Review for "Instagram Public Content Access" and `instagram_basic`.
- **(c)** Free. Limit: "a maximum of 30 unique hashtags" per rolling 7 days per account; fetching media counts as a query.
- **Location search.** No location search endpoint appears in Meta's Instagram Platform documentation index (`llms.txt`, checked 2026-10-29); the index lists hashtag search only. Legacy location endpoints: **UNVERIFIED**, treat as unavailable.
- **Basic Display API.** Changelog 2024-12-04: "has been deprecated... All requests... will return an error message."
- **(d)** Basic Display shows the platform's churn.
- **(e)** Same Meta Platform Terms as above. Cannot comment on hashtag-discovered media; `media_url` is omitted for some videos with licensed audio; emojis and Stories hashtags unsupported; "sensitive" hashtags return a generic error.
- **(f)/(g)** Hashtag text in Japanese is fine; emoji queries are not.
- **Demo rule.** Same as 1.
- **(h) Verdict: avoid.** App Review, 30-hashtag cap, no place filter, data cannot be persisted anyway. Creator-connect flows (a creator authorises their own account) are a "later" idea.

## 3. Facebook oEmbed (posts, videos, pages)

- **(a)** `/oembed_post`, `/oembed_video`, `/oembed_page` on `graph.facebook.com` (Graph v26.0 pages show the Reading operation and no deprecation notice).
- **(b)** Tokenless since 2026-06-15 (same reference page as above). Parameters: `url` (required), `maxwidth`, `omitscript`, `sdklocale`, `useiframe`.
- **(c)** Free, 1,000 req/h per endpoint tokenless.
- **(d)** Same churn as Instagram. Fields returned now: `height`, `html`, `provider_name`, `provider_url`, `type`, `version`, `width`. Thumbnail and author fields gone since 2025-11-03.
- **(e)** Meta oEmbed Read (when used) allows "front-end views" and aggregated, de-identified analytics only. Platform Terms apply.
- **(f)** Nothing forced on us.
- **(g)** n/a.
- **Breaks it.** Non-public posts; Page content restricted by country or age gate (precise behaviour UNVERIFIED).
- **Demo rule.** Own pages only.
- **(h) Verdict: MVP.** One adapter with Instagram. 27.0% JP overall, 38.9% in the 40s, which includes many small-business owners.

## 4. Threads oEmbed

- **(a)** `GET https://graph.threads.com/v1.0/oembed?url=<post URL>`. Accepted formats `threads.com/@{user}/post/{shortcode}` and `threads.com/t/{shortcode}`.
- **(b)** Changelog 2026-03-03: "You can now call Threads oEmbed API without an access token." The page "App Access Tokens" still says oEmbed "require[s]" tokens. Docs contradict, the changelog is dated and newer.
- **(c)** Free, 1,000 requests per hour.
- **(d)** New (2024 API launch, 2026 tokenless).
- **(e)** "only intended to be used for embedding Threads content in websites and apps"; other use "including analytics" prohibited. Not supported: private, inactive, age-restricted accounts and geo-gated posts.
- **(f)/(g)** Same as Meta family.
- **(h) Verdict: later.** Free once the Meta adapter exists, but no JP usage figure found (UNVERIFIED).

## 5. Threads API keyword search

- **(a)** `GET /keyword_search` with `q`, `search_type` (TOP or RECENT), `search_mode` (KEYWORD or TAG), `media_type`, `since`, `until`, `author_username`.
- **(b)** Needs `threads_basic` plus `threads_keyword_search`. Without approval the search covers only the authenticated user's own posts. Public search follows approval.
- **(c)** Free. "A user can send a maximum of 2,200 queries within a rolling 24-hour period" across apps; no-result queries do not count. Page size 25 default, 100 max.
- **Location.** None for finding posts. "Location Search" lets you search places to tag when creating posts (needs a Threads user token), not to find posts by place.
- **(d)** Query limit was changed on 2025-06-25; author filter added 2026-01-20.
- **(h) Verdict: avoid.** Review needed, no geography, results persist under Meta terms we cannot meet.

## 6. TikTok: Embed Player and oEmbed

- **(a)** Render a video from a TikTok URL. The Embed Player is an iframe `www.tiktok.com/player/v1/{video_id}` with query parameters (controls, autoplay, description, etc.). `postMessage` controls playback. The oEmbed endpoint `https://www.tiktok.com/oembed?url=` returns an `html` iframe pointing at the same player.
- **(b)** The doc does not mention auth for either. Do not call TikTok to test (project rule).
- **(c)** Free. "TikTok may apply usage limits to embedded players on a per-domain basis."
- **(d)** Embed Videos page: "Embed Videos will be deprecated soon. Existing integrations will migrate automatically. We recommend using Embed Player for new integrations." No date.
- **(e)** TikTok Developer ToS (modified 2025-12-26): use of TikTok Information limited to "developing, maintaining, and supporting your Applications"; no distributing or selling; no removing attribution. Deletion on termination (VI). No AI-training clause on the page, but III.3(h) bars building "profiles, databases, or similar records" about individuals. Removed videos stop playing ("will no longer be accessible").
- **Fields.** The documented oEmbed sample lists `version, type, width, height, html, provider_url, provider_name, embed_product_id, embed_type`. No thumbnail, title or author in the documented sample. Whether the live endpoint adds them is UNVERIFIED.
- **(f)/(g)** Nothing forced. Japanese captions render natively.
- **Breaks it.** Short links (`vm.tiktok.com`) need a redirect hop to get the ID. Ask the user for the full URL rather than calling TikTok. Manual embed code needs a non-mobile surface.
- **(h) Verdict: MVP-stretch.** 36.7% JP use and visitors rate video highly. Parse the ID from the URL and build the iframe ourselves.

## 7. TikTok Display API and Research API

- **Display API.** Endpoints `/v2/user/info/`, `/v2/video/list/`, `/v2/video/query/`; scope `video.list` "Read a user's public videos on TikTok". Lookup is by video ID within an authorised user's videos. No documented lookup of arbitrary public videos by URL.
- **Research API.** Page: "independent and academic researchers who conduct research on a non-for-profit basis"; application and approval required. FAQ on commercial users: "No." Limits: 1,000 requests/day, 100,000 records/day, tokens expire every 2 hours; max 100 results per request; `end_date` within 30 days of `start_date`.
- **(h) Verdict: avoid.** Our project is not eligible for Research. Display could serve a creator-connect flow later, but it needs app review (page does not say) and returns the creator's own content.

## 8. X: oEmbed and widgets

- **(a)** `https://publish.x.com/oembed?url=<post URL>` returns embed HTML (`blockquote.twitter-tweet` + `widgets.js`). Parameters: `maxwidth` 220 to 550, `hide_media`, `hide_thread`, `omit_script`, `align`, `lang`, `theme`, `dnt`. Response includes `author_name`, `author_url`, `cache_age`, `html`, no `height`.
- **(b)** The docs table says "Requires authentication: No; Rate limited: No". The embed page does not mention keys.
- **(c)** Free.
- **(d)** Endpoint moved from `publish.twitter.com` to `publish.x.com`; both are in the oEmbed registry. Stable for years. Pricing changed (section 9).
- **(e)** Developer Agreement (last updated 2026-04-27): II(B) X may "access, index, and cache" pages where you embed posts; III(A)(k) no use of "the X API or X Content to fine-tune or train a foundation or frontier model"; III(E) no aggregating, caching or storing location data. Developer Policy: "If you store X Content offline, you must keep it up to date"; delete or modify within 24 h on request; respect protected status; distribute only Post IDs (up to 1,500,000 per 30 days). The oEmbed page says markup "is meant to be cached... up to the suggested cache lifetime" (`cache_age`). **Store:** URL and ID only.
- **Attribution.** "All aspects of X's display requirements are handled for you by using our tools." Do not edit the embed.
- **(f)** Nothing forced on code. Data export must be IDs only.
- **(g)** Japanese posts render natively. 44.7% of JP respondents use X (57.0% in the 40s).
- **Breaks it.** Deleted, protected or suspended posts; the oEmbed page does not describe behaviour for deleted posts.
- **Demo rule.** Own account or written permission.
- **(h) Verdict: MVP.**

## 9. X API v2

- **Pricing page (docs.x.com, no date shown):** "The X API uses pay-per-usage pricing with no subscriptions." Post reads $0.005 each, user reads $0.010, owned reads $0.001, post creation $0.015 ($0.200 with a URL). Cap 3 million post reads per monthly cycle on pay-per-use. New-user incentive: $20 in credits after a first payment. Free tier retired and legacy Basic/Pro wind-down dates come from **secondary reports only (UNVERIFIED)**.
- **(e)** As in section 8, plus Commercial Use clauses (III(B)) for non-profit exemptions.
- **(h) Verdict: avoid.** We do not need X search; oEmbed is free.

## 10. YouTube: embed and oEmbed

- **(a)** Render any public video from `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`. The registry lists oEmbed at `https://www.youtube.com/oembed`. Fields (title, author_name, author_url, thumbnail_url on `i.ytimg.com`) are from third-party examples only. Google's docs I fetched do not specify the oEmbed endpoint, so its terms and field list are **UNVERIFIED**. The IFrame embed needs only the video ID.
- **(b)** No key for iframe embed.
- **(c)** Free.
- **(d)** Most stable embed. API policies updated 2026-09-14 (ToS) and 2026-10-15 (Developer Policies).
- **(e)** YouTube Developer Policies and Required Minimum Functionality (both "Last updated 2026-10-15"): embedded players must identify themselves via the HTTP Referer header; player at least 200 by 200 px (recommended 480 by 270 for 16:9); do not "modify, build upon, or block any portion or functionality of a YouTube player"; do not "download, import, backup, cache, or store copies of YouTube audiovisual content" without written approval (III.E.1.a); background playback not allowed; clients must make clear YouTube is the source (III.F.2). Embedded player shares basic data with YouTube; disable autoplay to limit it before interaction. For API data, 30-day delete-or-refresh rule (III.E.4.c) and every-30-days deleted-video check (III.E.4.b).
- **Store.** Video ID. Hotlink the thumbnail from `i.ytimg.com`; do not copy it. Title and channel: refresh every 30 days or less if treated as API data.
- **(f)/(g)** Nothing forced. Japanese titles render fine. 81.5% JP use.
- **Breaks it.** Embedding disabled by owner, age restriction, region blocks, deletion.
- **Demo rule.** Use our own channel or CC-labelled videos.
- **(h) Verdict: MVP.**

## 11. YouTube Data API v3

- **(a)** Discovery: `search.list` with `location=lat,lng` + `locationRadius` (max 1000 km), only with `type=video`. A request with `location` but no `locationRadius` errors.
- **(b)** Needs a Google Cloud project and API key. Quota audit for more.
- **(c)** Default allocation per quota page: 10,000 units per day shared across most endpoints (`videos.list`, `channels.list` etc. cost 1), plus separate buckets: 100 `search.list` calls/day and 100 `videos.insert` calls/day. Every request costs at least 1; pagination costs per page. Reset at midnight Pacific. The page ("Last updated 2026-10-15") describes `search.list` as its own bucket rather than a unit cost against the 10,000.
- **(d)** Quota model rewritten; ToS updated 2026-09-14.
- **(e)** As in section 10. No AI clause on the pages I read; III.E.4.h bars creating "new or derived data or metrics".
- **(h) Verdict: later.** Useful only as a human-assisted "find videos near this pin" helper, within 100 searches a day.

## 12. Bluesky: AT Protocol public endpoints, searchPosts, embeds

- **(a)** Pull a post by URL: parse `bsky.app/profile/{handle}/post/{rkey}`; `app.bsky.feed.getPosts` (public AppView) and `https://embed.bsky.app/oembed?url=` (registry lists it).
- **(b)** No auth for these reads. Live probe 2026-10-29: `getProfile` on `public.api.bsky.app` returned 200 with `access-control-allow-origin: *` and `cache-control: public, max-age=30`; `getPosts` for a non-existent record returned `200 {"posts":[]}`; oEmbed for a real post returned `type: rich`, `author_name`, `author_url`, `cache_age: 86400`, `width: 600`, `height: null`, and an `html` blockquote `class="bluesky-embed"` with `data-bluesky-uri` and `data-bluesky-cid`. No thumbnail field. oEmbed for a non-existent post: `404 post not found`.
- **searchPosts.** Lexicon (atproto repo, `packages/api/lexicons/app/bsky/feed/searchPosts.json`): "this API endpoint may require authentication (eg, not public) for some service providers". Parameters: `q`, `sort`, `since`, `until`, `mentions`, `author`, `lang`, `domain`, `url`, `tag`, `limit`, `cursor`. No location parameter. Live probe: `public.api.bsky.app` returned 403 (CDN HTML page), `api.bsky.app` returned 200 unauthenticated. Third-party reports say behaviour varies and cursor paging may be rejected unauthenticated; not primary. Language filtering with `lang=ja` is available.
- **(c)** Free.
- **(d)** Open protocol; atproto code is dual MIT/Apache-2.0 (`LICENSE-MIT.txt`, `LICENSE-APACHE.txt`). Docs moved: `docs.bsky.app` redirects to `bsky.network` and `endpoints.bsky.app`; the `bsky-docs` repo is deprecated and archived (notice dated 2026-08-18).
- **(e)** Bluesky ToS (updated 2025-08-14): users "retain ownership of your Content"; Bluesky claims only a licence to run its service; "Bluesky does not control how others may use your Content"; no scraping or AI clause in the text I read. Copyright of the poster still applies to us.
- **(f)/(g)** Nothing forced. Japanese works; JP audience size UNVERIFIED.
- **Breaks it.** Deleted records (empty `getPosts`, oEmbed 404). Posts hidden by labels or author settings (behaviour UNVERIFIED).
- **Demo rule.** Own account, or the platform's official account with permission.
- **(h) Verdict: MVP-stretch.** Free, open, easy to test, small audience.

## 13. Mastodon

- **(a)** `GET https://{instance}/api/oembed?url=<status URL>` returns a `rich` response: `title`, `author_name`, `author_url`, `provider_name`, `cache_age`, `html` (iframe plus script), `width`, `height`. Public. Missing status: 404 `{"error":"Record not found"}` (observed on `mastodon.social` with a non-existent ID).
- **(b)** No auth, no registered app.
- **Search.** `GET /api/v2/search`: no user token needed since 4.0.0 for basic search, but "full text search is not available to unauthenticated users" for statuses and depends on the instance's Elasticsearch.
- **(e)** Each instance has its own ToS; no central licence. Deletes propagate by ActivityPub `Delete` (W3C Rec 2018-01-23, 7.4).
- **(f)** Mastodon server code is AGPL-3.0. We only call an HTTP API, so nothing is forced on us. Do not copy Mastodon code into a permissive project.
- **Breaks it.** Instance offline, instance allow-listing, user has "limited" privacy. Arbitrary hostnames mean SSRF risk (see OWASP controls under Generic).
- **(h) Verdict: later.**

## 14. Reddit

- **Terms (primary, fetched 2026-10-29).** Data API Terms, effective 2023-06-19, last revised 2026-07-20: licence to "copy and display the User Content using the Data API solely as necessary to develop, deploy, distribute, and run your App"; "You may not modify the User Content except to format it for such display"; no use "for training a machine learning or AI model, without the express permission of rightsholders"; "If you are interested in using the Data APIs for commercial purposes... you will need to enter into a separate agreement"; no "derive revenues from the use or provision of the Data APIs" without written approval; delete data not needed for the approved use; on termination delete cached or stored User Content and "any data or models that were derived". Developer Terms (last revised 2026-03-24) 1.4: do not share Access Info; 3.1: Reddit may require App Review; 3.3: delete on removal. Embeds Terms of Use (last revised 2023-04-18): use only "for making User Content visible on your App"; do not "modify, alter, obscure, or disable" elements; do not imply endorsement.
- **API access.** Reports that self-service token creation ended in November 2025 and approval is now required come from a mirrored r/redditdev thread and Reddit's help article that returned HTTP 403 to me. **UNVERIFIED** against a primary page.
- **oEmbed.** `https://www.reddit.com/oembed` is in the registry. Whether it needs auth is **UNVERIFIED**.
- **(f)** An open-source app needs each deployer's own credentials.
- **(h) Verdict: avoid.** Minimal Japanese local relevance, restrictive, approval-gated.

## 15. Pinterest

- **Widgets.** Pinterest's `developers.pinterest.com/docs/widgets/getting-started/` says to add their JavaScript once per page near the end of `body`. The Pin/Board/Profile markup pages were not fetched.
- **oEmbed.** `https://www.pinterest.com/oembed.json` is in the oEmbed registry; no Pinterest-authored documentation was found. **UNVERIFIED.**
- **Terms.** Developer Guidelines (no date on page): "you may not store any information accessed through any Pinterest Materials including the API"; "Link Pins back to their source on Pinterest"; no use of Pinterest Materials "to train, fine-tune, or otherwise improve or develop any artificial intelligence".
- **(h) Verdict: later / avoid.** No storage, no AI, low JP relevance data.

## 16. Flickr

- **(a)** Find CC-licensed photos by location. `flickr.photos.search` with `lat`, `lon`, `radius` (more than 0, less than 20 miles or 32 km), `bbox`, `has_geo`, `license`. Geo queries need a limiter (tags or a date filter) or only the last 12 hours are returned. Unauthenticated calls return public photos only.
- **(b)** `api_key` required. API ToU (last updated 2018-05-09): "If the primary purpose of your application is to derive revenue, it is considered a commercial application"; commercial keys need a separate application and may carry fees.
- **(c)** Free for non-commercial; commercial subject to approval.
- **(e)** Must place "This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc." prominently; no Flickr logo without permission; do not "Cache or store any Flickr user photos other than for reasonable periods"; remove within 24 hours of an owner's request; reflect privacy changes promptly; show 30 or fewer photos per page; commercial use needs a CC licence that allows it and its conditions must be followed. No AI clause on the page.
- **URLs.** Static images `https://live.staticflickr.com/{server-id}/{id}_{secret}_{size}.jpg`; the doc has no hotlinking policy.
- **oEmbed.** Registry lists `https://www.flickr.com/services/oembed/`; the doc page I tried returned HTTP 400 and `misc.oembed.html` returned 404. **UNVERIFIED.**
- **(h) Verdict: later.** Best source of legally reusable, geotagged photos. Needs a licence-aware UI and attribution.

## 17. Google Maps review URLs; `place_id` and link-out

- **What a review URL gives us.** There is no public oEmbed or review-by-URL endpoint in the docs I read. The documented ways to show reviews are Places API (New) Place Details (the `reviews` field triggers the Enterprise + Atmosphere SKU; the page does not state how many reviews come back) or the Places UI Kit. The format of review share links is **UNVERIFIED**; resolving a short link requires a request to Google, so I recommend not doing it.
- **What the terms bar** (Google Maps Platform Terms of Service 3.2.3, version last modified 2026-08-26): "No Scraping ... (i) pre-fetch, index, store, reshare, or rehost Google Maps Content ... (iii) copy and save business names, addresses, or user reviews"; "No Caching ... except as expressly permitted"; "(vii) use Google Maps Content to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune"; "No Use With Non-Google Maps ... display or use Places content on a non-Google Map". Service Specific Terms (last modified 2026-10-28): Google IDs may be cached, "place_id from Places API" (section 3); 14.1 Places API content may be used without a map; 14.2 not with a non-Google map; 14.3 lat/lng cached at most 30 days. Places UI Kit may be used with or without any map, including a non-Google map (15.1) and Google attribution may not be altered (15.4).
- **Places API policies page.** "You can therefore store place ID values indefinitely." "You must always credit the author when displaying photos or reviews." End users must have access to the source review on Google Maps. Results shown without a map need the Google Maps logo. Show how reviews are ordered; "Inform end users of Google's review policy when displaying reviews and average rating" is recommended.
- **Place ID upkeep.** Refresh if older than 12 months (free refresh with an ID-only Place Details request); `NOT_FOUND` means obsolete; store the original request that produced the ID.
- **Legal alternative we can ship.**
  - The user pins the place by hand on our map (our own coordinates, our own data).
  - Optionally we resolve a `place_id` through a licensed Places call, store only the ID.
  - Show "Read reviews on Google Maps" as a link built with Maps URLs: `https://www.google.com/maps/search/?api=1&query=<name>&query_place_id=<id>`. "You don't need a Google API key to use Maps URLs"; 2,048 character limit; works on every platform.
  - Optionally embed the Maps Embed API place card ("no charge with unlimited usage"; example URL uses a key).
  - If a reviewer wants their own review in our app, they type it as their own contribution with an authorship attestation. That is contributor content, not Google Maps Content. Legal review of that route is needed (open question).
- **Stories not scores.** Do not show star ratings from Google. Whether showing review text without its rating is permitted is **UNVERIFIED**.
- **Pricing of Places SKUs** is out of scope for this lane (not fetched).
- **Demo rule.** Google's permission guidelines for Maps content in videos were not fetched (UNVERIFIED). Show only our own map and a link-out button.
- **(h) Verdict: MVP as link-out and `place_id`.** Not as review rendering.

## 18. Generic blogs: OpenGraph, oEmbed discovery, RSS/Atom, robots.txt

- **OpenGraph** (ogp.me; spec under Open Web Foundation Agreement 0.9): required `og:title`, `og:type`, `og:image`, `og:url`; optional `og:description`, `og:locale`, `og:site_name`.
- **oEmbed discovery** (oembed.com section 4): `<link rel="alternate" type="application/json+oembed" href="...">` (or `text/xml+oembed`); response needs `type` and `version` "1.0"; `thumbnail_url` optional; `cache_age` is "the suggested cache lifetime"; consumers choose whether to use it.
- **Feeds.** RSS 2.0.11 (RSS Advisory Board, 2009-03-30; spec under CC BY-SA 1.0). Atom is RFC 4287 (December 2005, Standards Track). Both let us read titles, links, dates and summaries without scraping HTML.
- **robots.txt** (RFC 9309): longest-match rule; 4xx means crawler "MAY access any resources"; 5xx means "MUST assume complete disallow"; cache at most 24 h; and "These rules are not a form of access authorization". Observed on 2026-10-29: `note.com` disallows `/api/*` and `/embed/*` for all agents; `ameblo.jp` disallows `/p/embed/*`, `/s/embed/*`, `/_api/*` (with a few Allow carve-outs) for Googlebot and only tracking-parameter URLs for `*`; `hatena.blog` allows `/*` and disallows `/api/`; `instagram.com` disallows everything.
- **SSRF.** A server that fetches user-supplied URLs is a classic SSRF vector. OWASP controls: allowlist hosts where possible, resolve and validate IPs, pin the connection to the validated IP, disable automatic redirects (or re-validate each hop), block metadata addresses such as 169.254.169.254, restrict egress. The cheat sheet does not cover timeouts and size limits; add them.
- **Store.** A short title, canonical URL, site name, language, and a hotlinked image URL at render time. Copying images into our storage is reproduction. Japan has a narrow exception for search-style services (Copyright Act 47-5), whether our product qualifies is an open legal question.
- **Fetcher identity.** Send a product token and project URL, no personal contact details.
- **(h) Verdict: MVP.** This one adapter covers note, Ameba and long-tail personal and business blogs.

## 19. note.com

- **Observed 2026-10-29** on note's own official account only: article pages carry `og:title`, `og:description`, `og:image`, `og:type`; the account page carries `<link rel="alternate" type="application/rss+xml" href="https://note.com/info/rss">`; no oEmbed discovery tag found; the feed is RSS 2.0 with `atom` and `media` namespaces.
- **Embed.** note's help describes "サイトに貼る" (an iframe snippet from the article menu) and RSS or magazine RSS for displaying notes on your own site (search-result summary of the help article; the help site returned HTTP 403 behind a Cloudflare challenge to me, so I did not retrieve it). A separate note "embed" developer guideline concerns external services embedding into note articles (note as consumer, applications reviewed, oEmbed-based), not third parties embedding note. Same limitation.
- **robots.txt.** `/api/*` and `/embed/*` are disallowed for all agents. Do not use note's unofficial JSON API.
- **Terms.** `note.com/terms` redirects to `terms.help-note.com`, which I could not fetch. Scraping, quoting and embedding clauses are **UNVERIFIED**.
- **(g)** Japanese-first platform; no usage data in the MIC survey.
- **(h) Verdict: MVP via the Generic adapter** (OGP link card plus RSS autodiscovery).

## 20. Ameba Blog (アメブロ)

- **Observed.** Per-blog RSS at `https://rssblog.ameba.jp/{amebaId}/rss20.xml` returned HTTP 200 (RSS 2.0). I fetched the front page and one public entry once to check markup and discarded the content. I did not confirm OGP or an oEmbed tag on entry pages. `robots.txt` as in section 18.
- **Terms.** Not found on a primary page; **UNVERIFIED**. A search for an official Ameba embed or quotation rule found nothing usable.
- **(h) Verdict: MVP via Generic adapter (link card).** Do not scrape entry bodies.

## 21. Hatena Blog (はてなブログ)

- **(a)** Official oEmbed: `https://hatena.blog/oembed?url=<article permalink>&format=json|xml` (domain changed from `hatenablog.com` in March 2024). Fields: `author_name`, `author_url`, `blog_title`, `blog_url`, `categories`, `description`, `height`, `html`, `image_url`, `provider_name`, `provider_url`, `published`, `title`, `type`, `url`, `version`, `width`. Live probe 2026-10-29 on Hatena's own staff blog article returned 200 JSON, `type: rich`, `height: 190`, an iframe to `hatenablog-parts.com`, `Cache-Control: private`.
- **(b)** No auth. Only articles of blogs set to "すべての人に公開". Errors: 404 (not found), 401 (blog not public), 400 (invalid parameter). Discovery via `<link rel="alternate">`.
- **(c)** Free.
- **(d)** Introduced 2014-09 (Hatena Blog developer blog, search-result summary); domain change 2024. Stable.
- **(e)** API terms (revised 2023-05-24): no "宣伝や商用を目的とした内容" unless Hatena permits; information obtained must not be disclosed or provided to third parties; developers must state responsibility for their app and publish contact details; sample code MIT; no stated caching limit. **Risk:** the third-party disclosure clause is broad. Render live in the visitor's page, do not persist.
- **(h) Verdict: MVP-stretch.** The only JP blog platform with a documented oEmbed.

## 22. LINE VOOM and LINE Place

- **LINE VOOM.** LY Corp notice "LINE VOOM 提供終了" (first published 2026-07-15, updated 2026-08-12): "2026年9月30日（水）をもちまして、「LINE VOOM」の提供を終了することとなりました。" Posts viewable in VOOM Studio for a limited period afterwards. Replacement: LINE Official Account "投稿" feature. A later LY notice (published 2026-07-30, updated 2026-10-28) says certified accounts got "投稿" from 2026-09-16 and all accounts from 2026-10-28, and that VOOM history cannot be migrated. The page does not say whether posts have public URLs.
- **Embed or API.** None found for VOOM or for the new feature. **UNVERIFIED** that none exists.
- **LINE Place.** `help2.line.me/LINEPLACE` says it ended on 2024-06-03, merged into Yahoo! Maps; reviews now appear on Yahoo! Maps. The oEmbed registry entry `place.line.me/oembed` is dead.
- **(h) Verdict: avoid.** Nothing to import. Capture LINE-only businesses through interviews.

## 23. Open-source link-unfurl libraries and licences

Licence from package registries (npm, RubyGems) or the GitHub API, 2026-10-29. All permissive licences impose nothing on our code beyond notice retention.

| Library | Language | Licence | Status | Notes |
|---|---|---|---|---|
| `metascraper` | JS | MIT | active (pushed 2026-10-15) | Rule-based plugins; good JP text via per-site rules |
| `open-graph-scraper` | JS | MIT (npm) | v6.12.0 on npm | Simple OGP/Twitter-card parser (repo `jshemas/openGraphScraper`) |
| `@extractus/oembed-extractor`, `oembed-parser` | JS | MIT | active | oEmbed fetch and discovery |
| `iframely` (self-hosted) | JS | MIT (npm) | v2.6.0 | Full embed server; heavy; repo `itteco/iframely` |
| `unfurl.js` | JS | ISC per npm; MIT per GitHub | archived 2024-04 | Avoid for new work |
| `discourse/onebox` (gem `onebox`) | Ruby | MIT | gem 2.2.19, repo last pushed 2024-02 | Per-site "oneboxes" including social |
| `aaronpk/XRay` | PHP | MIT | active (2026-10-02) | Extracts structured data from URLs (microformats, OGP) |
| `extruct` | Python | BSD-3-Clause | active | OGP, microdata, JSON-LD |
| `page-metadata-parser` | JS | MPL-2.0 | archived 2022 | Weak copyleft; skip |
| `react-tweet` | JS | MIT | active | Renders tweets without X's widget, uses unofficial endpoints (UNVERIFIED legal status under the X Developer Agreement); avoid |
| `react-social-media-embed` | JS | MIT | last push 2025-02 | iframe wrappers |
| `link-preview-js` | JS | MIT (npm) | v5.0.1 | Fetch-and-parse helper |
| Mastodon | Ruby | AGPL-3.0 | active | Do not copy code into a non-AGPL project |

None of them is SSRF-safe by default; wrap their fetch in our own guarded fetcher.

## Japanese copyright notes (reading of statute text, not legal advice)

Source: e-Gov 著作権法 (revision in force 2026-06-24).
- **Art. 32 (引用).** A published work may be quoted if the quotation "公正な慣行に合致するもの" and "報道、批評、研究その他の引用の目的上正当な範囲内". Relevant to short quoted excerpts shown with attribution inside a story.
- **Art. 19 (氏名表示権).** The author has the right to display or withhold their name when the work is offered to the public. A Supreme Court judgment of 2020-07-21 is reported to have held that a platform's automatic trimming that removed the author's credit infringed this right (secondary reports; the courts.go.jp PDF I tried returned 404, so the case number and holding are **UNVERIFIED** against the primary). Lesson: never crop away attribution.
- **Art. 30-4.** Allows use not aimed at enjoying the expressed ideas, such as information analysis, with an exception where it "unreasonably prejudices the interests of the copyright holder". My reading: it can cover analysis, but not displaying the extracted sentences to readers. Platform contracts and ToS still bind us either way.
- **Art. 47-5 (軽微利用).** Narrow exception for incidental minor use in search or analysis services. Whether a place-story app qualifies is uncertain.
- Malaysian copyright law was not researched.

## Recommended `SourceAdapter` interface (design sketch, not app code)

```ts
// Region is configuration: each region file lists enabled adapters, language hints,
// and per-adapter overrides. No adapter hard-codes a country.
type Platform = string;                       // "instagram" | "youtube" | "web" | ...
type Status = "live" | "unavailable" | "deleted" | "private" | "blocked" | "unknown";

interface MatchResult {                       // pure function of the URL, no network
  adapterId: string;
  canonicalUrl: string;
  externalId?: string;                        // shortcode, video id, rkey, at-uri
  confidence: "exact" | "heuristic";
}

interface RetentionPolicy {
  persist: "none" | "ids-only" | "metadata-short" | "metadata";
  maxAgeSeconds?: number;                     // e.g. 30 days for YouTube API data
  deleteOnUpstreamRemoval: boolean;
  feedAiPipeline: false;                      // embeds are never AI input
  exportInOpenDataset: "url-only" | "ids-only";
}

interface NormalizedPost {
  platform: Platform;
  canonicalUrl: string;
  externalId?: string;
  kind: "post" | "video" | "photo" | "article" | "profile" | "place-link";
  author?: { name?: string; handle?: string; url?: string };
  publishedAt?: string;                       // ISO 8601
  language?: string;                          // BCP 47, e.g. "ja"
  render:
    | { mode: "embed-html"; html: string; scriptSrc?: string; maxWidth?: number }
    | { mode: "embed-iframe"; src: string; width?: number; height?: number }
    | { mode: "link-card"; title?: string; description?: string; imageUrl?: string; siteName?: string }
    | { mode: "link-only" };
  attribution: { platformName: string; linkBack: string; requiredText?: string };
  license?: { spdx?: string; text?: string; allowsRedistribution: boolean };
  status: Status;
  fetchedAt: string;
  retention: RetentionPolicy;
}

interface SourceAdapter {
  id: string;
  patterns: RegExp[];                         // cheap pre-filter on host and path
  match(url: URL): MatchResult | null;
  hosts: string[];                            // egress allowlist for the SSRF-safe fetcher
  fetch(ref: MatchResult, ctx: FetchContext): Promise<NormalizedPost | FetchFailure>;
  revalidate(ref: MatchResult, ctx: FetchContext): Promise<Status>;
  recheckEverySeconds: number;                // 24h X/Flickr, <=30d YouTube, 7d default
}

interface FetchContext {
  http: GuardedHttp;       // resolves and pins IPs, no redirects without re-validation,
                           // timeouts, size caps, per-host rate limit, robots.txt check
  clock: () => Date;
  userAgent: string;       // product token plus project URL, no personal contact data
}

type FetchFailure = { failure: "not-found" | "private" | "blocked-by-robots" | "rate-limited"
                      | "unsupported" | "network"; retryAfterSeconds?: number };
```

Pipeline rules:
1. `match` runs on every adapter in region order; first `exact` wins; otherwise `GenericWeb`; otherwise `LinkCard`.
2. Store a `SourceLink` row (platform, canonical URL, external ID, status, check times, our annotation), never the returned `html` or captions for restricted platforms.
3. Honour `cache_age` and each platform's recheck cadence (deletion table above).
4. Every rendered item shows platform, author, link back, and retrieval date.
5. Adapters never emit text into the claim-extraction queue. Only a contributor-typed excerpt or consented transcript can.
6. Click-to-load facade for third-party scripts (Meta, X, TikTok) for visitor privacy.

## MVP adapter list, priority order

1. **LinkCard** (fallback, no fetch): user-typed title plus canonical URL. Handles LINE, Google Maps and anything unsupported.
2. **MetaOEmbed** (Instagram, Facebook posts and videos, Threads): tokenless, free, client-side render.
3. **YouTube**: iframe from video ID; no key.
4. **X**: `publish.x.com/oembed` or blockquote plus `widgets.js`.
5. **GoogleMapsPlaceLink**: store `place_id`, emit Maps URLs link-out, optional Maps Embed.
6. **GenericWeb**: OGP, oEmbed discovery, RSS/Atom autodiscovery, robots.txt and SSRF guard (covers note and Ameba).
7. **TikTokEmbedPlayer**: ID parsed from the full URL, iframe only.
8. **HatenaBlog**: oEmbed.
9. **Bluesky**: oEmbed and `getPosts`.

Later: Mastodon, Flickr (CC photos by geo), Pinterest widgets, YouTube Data API for discovery, creator-connect flows (Instagram API with Instagram Login, TikTok Display API).
Avoid: LINE VOOM, Instagram Graph hashtag search, Threads keyword search, X API, TikTok Research, Reddit API.

---

## Unverified / open questions

- **Request-hygiene notice.** Before the coordinator's instruction, my `curl` requests carried a User-Agent containing a contact email address. Hosts that received it: public.api.bsky.app, api.bsky.app, embed.bsky.app, mastodon.social, redditinc.com, www.redditinc.com, support.reddithelp.com, cloud.google.com, note.com, www.help-note.com, ameblo.jp, rssblog.ameba.jp, helps.ameba.jp, agreement.ameba.jp (connection failed, may not have been sent), hatenablog.com (redirected to hatena.blog), hatena.blog, www.instagram.com (robots.txt only), www.soumu.go.jp, www.mlit.go.jp, developers.facebook.com. The address is not written in this file. WebFetch and WebSearch calls, the GitHub, npm, RubyGems and PyPI queries, and `gh` calls did not carry it.
- Whether the old Meta page `features-reference/oembed-read` (App Review plus business verification) or the 2026 changelog entries govern. I did not make a live Meta oEmbed call.
- Exact error shape of Meta and X oEmbed for deleted posts.
- TikTok live oEmbed fields (thumbnail, title, author) and TikTok oEmbed deprecation date.
- YouTube oEmbed: no Google-authored documentation found; field list, rate limits and terms UNVERIFIED.
- X free-tier retirement and legacy Basic/Pro end dates (secondary sources only).
- Reddit: approval requirement and `reddit.com/oembed` auth (primary help page blocked).
- Pinterest oEmbed and Flickr oEmbed official docs.
- note.com Terms of Use (Cloudflare 403) and Ameba Blog terms and embed or OGP support.
- LINE VOOM actual shutdown confirmation after 2026-09-30; any public URL or embed for the new LINE Official Account "投稿" feature; whether LINE Official Account profile pages are linkable.
- Japanese usage of note, Ameba, Hatena, Threads, Bluesky, Mastodon; usage among small-business owners; usage by English-speaking visitors by platform.
- Number of reviews Places API returns and whether review text without ratings may be shown.
- Google Maps review-share URL shapes; Google's permission rules for Maps content in demo videos.
- Whether a user-typed own-review contribution, or our store-and-show of link-card previews, is safe under Japanese law (Art. 32, 47-5) and under Malaysian law (not researched). Needs counsel.
- Malaysian-market platforms (Facebook, TikTok, Xiaohongshu, WhatsApp channels, Malay/Chinese-language blogs) were not researched in this lane.
- Supreme Court 2020-07-21 retweet judgment: primary PDF not retrievable; case details from secondary reports.
- No multi-year free-tier or credit commitment was found for any item. "None exists" is UNVERIFIED.

## Sources

All accessed 2026-10-29. Search-result summaries were used only to locate primary pages.

Meta (Instagram, Facebook, Threads)
- https://developers.facebook.com/docs/instagram-platform/oembed
- https://developers.facebook.com/documentation/instagram-platform/oembed.md
- https://developers.facebook.com/docs/graph-api/reference/instagram-oembed
- https://developers.facebook.com/docs/features-reference/oembed-read
- https://developers.facebook.com/docs/graph-api/reference/oembedvideo/
- https://developers.facebook.com/docs/graph-api/reference/oembedpost/
- https://developers.facebook.com/docs/graph-api/reference/oembedpage/
- https://developers.facebook.com/documentation/instagram-platform/embed-button.md
- https://developers.facebook.com/documentation/instagram-platform/changelog.md
- https://developers.facebook.com/documentation/instagram-platform/llms.txt
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search
- https://developers.facebook.com/docs/instagram-platform/overview
- https://developers.facebook.com/docs/threads/tools-and-resources/embed-a-threads-post
- https://developers.facebook.com/documentation/threads/reference/oembed.md
- https://developers.facebook.com/documentation/threads/get-started/app-access-tokens.md
- https://developers.facebook.com/documentation/threads/reference/location-search.md
- https://developers.facebook.com/documentation/threads/llms.txt
- https://developers.facebook.com/docs/threads/keyword-search
- https://developers.facebook.com/docs/threads/changelog
- https://developers.facebook.com/terms/ (Meta Platform Terms, updated 2026-02-03)
- https://www.facebook.com/legal/automated_data_collection_terms (effective 2024-10-07)
- https://www.instagram.com/robots.txt (policy file only)

TikTok
- https://developers.tiktok.com/doc/embed-videos
- https://developers.tiktok.com/doc/embed-player
- https://developers.tiktok.com/doc/display-api-overview
- https://developers.tiktok.com/doc/about-research-api
- https://developers.tiktok.com/doc/research-api-faq
- https://developers.tiktok.com/doc/research-api-specs-query-videos
- https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en (modified 2025-12-26)

X
- https://docs.x.com/x-api/getting-started/pricing
- https://docs.x.com/x-api/getting-started/about-x-api
- https://docs.x.com/x-for-websites/oembed-api
- https://docs.x.com/x-for-websites/embedded-posts/overview
- https://docs.x.com/developer-terms/policy
- https://docs.x.com/developer-terms/agreement (last updated 2026-04-27)

YouTube / Google
- https://developers.google.com/youtube/v3/determine_quota_cost
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/api-services-terms-of-service
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://developers.google.com/youtube/player_parameters
- https://cloud.google.com/maps-platform/terms
- https://cloud.google.com/maps-platform/terms/maps-service-terms
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/maps/documentation/embed/get-started
- https://developers.google.com/maps/documentation/places/web-service/place-id
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/policies

Bluesky, Mastodon, W3C
- https://github.com/bluesky-social/atproto (lexicon `packages/api/lexicons/app/bsky/feed/searchPosts.json`, licence files)
- https://github.com/bluesky-social/bsky-docs and https://github.com/bluesky-social/bps-website
- https://endpoints.bsky.app/ and https://atproto.com/specs/xrpc
- https://bsky.social/about/support/tos (updated 2025-08-14)
- Live probes of public.api.bsky.app, api.bsky.app, embed.bsky.app (2026-10-29)
- https://docs.joinmastodon.org/methods/oembed/ and https://docs.joinmastodon.org/methods/search/
- https://www.w3.org/TR/activitypub/

Reddit, Pinterest, Flickr
- https://redditinc.com/policies/data-api-terms (last revised 2026-07-20)
- https://www.redditinc.com/policies/developer-terms (last revised 2026-03-24)
- https://redditinc.com/policies/embeds-terms (last revised 2023-04-18)
- https://developers.pinterest.com/docs/widgets/getting-started/
- https://policy.pinterest.com/en/developer-guidelines
- https://www.flickr.com/services/api/tos/ (last updated 2018-05-09)
- https://www.flickr.com/services/api/flickr.photos.search.html
- https://www.flickr.com/services/api/misc.urls.html

Generic web standards and tooling
- https://oembed.com/ and https://oembed.com/providers.json
- https://ogp.me/
- https://www.rfc-editor.org/rfc/rfc9309.html
- https://www.rfc-editor.org/rfc/rfc4287.html
- https://www.rssboard.org/rss-specification
- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- npm registry, RubyGems, PyPI and GitHub API licence fields (2026-10-29)

Japan
- https://www.soumu.go.jp/menu_news/s-news/01iicp01_02000130.html and https://www.soumu.go.jp/main_content/001079136.pdf (MIC 令和7年度 survey summary; full report https://www.soumu.go.jp/main_content/001079141.pdf)
- https://www.mlit.go.jp/kankocho/tokei_hakusyo/gaikokujinshohidoko.html and https://www.mlit.go.jp/kankocho/content/002020010.pdf (JTA 2025 annual report, figures 5-1 and 5-2)
- https://developer.hatena.ne.jp/ja/documents/blog/apis/oembed/ and https://developer.hatena.ne.jp/license (revised 2023-05-24); live probe of https://hatena.blog/oembed
- https://note.com/robots.txt, https://note.com/info and one note official article (OGP, RSS), https://www.help-note.com/hc/ja/articles/900001827326 and .../4402395202841 (located via search; not fetched, Cloudflare 403)
- https://ameblo.jp/robots.txt and https://rssblog.ameba.jp/{id}/rss20.xml (HTTP status only)
- https://www.lycbiz.com/jp/news/line-official-account/20260715 and https://www.lycbiz.com/jp/news/line-official-account/20260730/
- https://help2.line.me/LINEPLACE/android?lang=ja
- https://laws.e-gov.go.jp/api/2/law_data/345AC0000000048 (著作権法, Art. 19, 30-4, 32, 47-5)
