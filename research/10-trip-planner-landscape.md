# 10. AI trip planners and travel agents: what they do and where they fall short

Lane: existing AI trip planners and travel agents. How they learn about the traveller, how deep personalisation goes, group and road-trip support, where place knowledge comes from, money, in-trip behaviour, price, user-voiced failures, and market facts. Not covered here: how to build such an agent, and Malaysian data and routing.
Access date for every fact below: **2026-11-23** (today). Products in this field change quarterly. Re-check before relying on any row.

Method and caveats:
- The author is an AI model (Claude). It read pages through a summarising fetch tool and a US-only search tool. Search was used to locate pages. Facts that drive a decision cite the page that was actually opened.
- Many primary pages could not be opened this session: Mindtrip site (HTTP 403), Tripadvisor AI assistant page (403), Expedia Romie page (429), Layla pricing (429), Wanderlog pricing (404) and help centre (403), Booking.com AI page (empty), TripIt pricing (404), the Afar "common mistakes" article (empty), Fast Company (403), PhocusWire (403). Reddit is blocked to both tools, so **no Reddit threads were read**. The brief asked for Reddit voices. Evidence below comes instead from Trustpilot, App Store listings, journalist tests and commissioned surveys. Treat "user voice" claims accordingly.
- Where a fact is marked UNVERIFIED, I saw it only in a search snippet or a third-party page, or could not see it at all. Not filled from memory.
- Several fetched pages are vendor marketing. Those are labelled "vendor claim".
- Not covered because nothing usable was found or opened: TripIt, Tripnotes (only its shutdown), GuideGeek (primary), iPlan.ai, Curiosio, Wonderplan, Trip Planner AI, Vacay (primary), Traveloka AI planner, Grab travel, Tourism Malaysia's own planner apps. See the unverified list at the end.
- No sign-up, no paid API, no scraping behind logins.

---

## Summary table

Cell values are short. "unv." means unverified (no primary page opened). "n/s" means the page I read does not say.

| Product | 1. Learns about traveller | 2. Depth | 3. Group | 4. Road trip | 5. Place data | 6. Money | 7. In-trip | 8. Price / limits |
|---|---|---|---|---|---|---|---|---|
| Wanderlog | n/s from listing; AI assistant (unv. detail) | per trip; no per-member profiles seen | Yes: invite by link, edit or view permissions, real-time edit, expense split | Yes: unlimited stops, route optimisation, times and distances | Google-style map data (unv.); user guides and lists | Subscription (Pro); flight/hotel deals (unv.) | Offline (listing says plans stored offline; Pro detail unv.); export to Google Maps (Pro) | Free app; Pro RM129.90 to RM399.90 a year in MY store; free AI capped (about 5 messages, unv.) |
| Mindtrip | Chat; app says it "learns your travel preferences over time" | per user account; trip plan merges members' preferences (press claim) | Yes: group chat, shared edit, "@Mindtrip" in chat | n/s (app reviewer: one destination per trip) | 11M+ places plus 40,000 local guides (company claim, via search) | Booking commissions and partner bookings (inferred; unv.); investors include airline and card firms | Price tracking, alerts, agents | Free in store listing; funded $22.5M total (company) |
| Layla | n/s on page; chat | per trip; "learns" claim from G2 (unv.) | n/s | n/s | partner inventory; human advisor books | Booking margin, "no fees" to user (vendor claim) | Human advisor on WhatsApp | Priced per trip package; app pricing UNVERIFIED |
| Roadtrippers Autopilot | Few questions: vehicle, budget, dates, who is travelling, dining and lodging | per trip; "who is traveling" asked, depth n/s | Share and edit with companions | Yes, core product. Detour or drive-time limits not described | 38M+ user trips (vendor), camping data | Subscription | Navigation in app, weak per user reviews | $35.99, $49.99, $59.99 a year; Autopilot is Premium; 3, 5 or unlimited trips; 20, 50 or 150 stops (Premium sign-up page) |
| Google Maps Ask Maps | Chat; uses your searches and saved places | per user, from history ("knows you like vegan") | Share the itinerary only (Android Central) | Yes: multi-day road trip example, add stops, traffic, open hours | 300M places, 500M contributors | Ads and booking referral (inferred; not stated on pages read) | Live traffic, hours, add stops | Free; rolled out March 2026 US and India, wider by Nov 2026 |
| Google AI Mode / Canvas | Describe trip in chat | per user | n/s | n/s | Maps, flights, hotel feeds, web | Booking partners (Booking.com, Expedia, Marriott and others) | Price tracking | US, Labs opt-in for Canvas (Nov 2025 post) |
| Tripadvisor AI | Destination, dates, who travelling, interests | tag-level "who" | Share and edit the trip | n/s | 1B+ reviews, 8M businesses | Viator, TheFork booking links (search result; page itself names none) | n/s | Free; beta US (2023 release). Current state UNVERIFIED |
| Expedia Romie | Chat; group text | per chat, per message | Yes: Romie joins a group text and listens | n/s | Expedia inventory | Booking commission | Updates itinerary as plans change (2024 claim) | 2024 alpha; 2026 status UNVERIFIED |
| Booking.com AI Trip Planner | Natural-language filters | per request | None described | n/s | Own listings, reviews, photos | Booking commission | n/s | Free; app only, a few markets (Oct 2024 release) |
| Agoda AI Assistant | Chat, retains preferences | per user | None described | n/s | Agoda inventory, Gemini with Maps for restaurants and places | Booking commission | n/s | Free; 21 markets incl. Malaysia (30 Oct 2026) |
| Trip.com TripGenie / Trip.Planner | 3 questions: place, days, style (family is one style) | style tag | None described | n/s | 20M+ geo-tagged POIs | Booking commission | Real-time suggestions | Free; Malaysia included (Sep 2025) |
| Klook | Beta agent | n/s | n/s | n/s | Klook inventory | Booking commission | n/s | Beta, not general (Jun 2026) |
| Airbnb | AI search by words; "baby" keyword shows crib filters | per search | Travel Map of friends' stays (no group planning) | n/s | Own listings | Booking fee | n/s | US first; full AI agent planned first half 2027 |
| Polarsteps | Personalised tips (page vague) | n/s | Followers, not co-editing | Route tracking | User trips | Photo books, Plus subscription, ad-free | Works offline | 23M travellers (vendor) |
| Furkot | Daily drive limits and preferences | per trip | n/s | Yes: daily travel-time limit, overnight stops, meals | Lodging and POI feeds | n/s | n/s | n/s |
| ChatGPT / Gemini / Claude | Whatever you type; may not ask | per conversation | None native | Text only | Web, model memory | Subscription | None | ChatGPT agent mode paid tiers |

---

## Per-product detail

### Wanderlog
- Product page (via a review-style summary of wanderlog.com, read 2026-11-23): claims over 1 million users, 8M+ trips, 4.9 on App Store, 4.7 on Google Play. Vendor claim. The text I read looked like third-party reviewers quoted on the page, so some descriptions of features come from reviewers, not Wanderlog.
- App Store listing, Malaysia storefront (https://apps.apple.com/my/app/id1476732439): road trip tools with unlimited stops, route optimisation, travel times and distances. Invite tripmates by email or link, with edit or view permission, real-time edits. Plans stored offline automatically. Forward booking emails or connect Gmail. "Import from anywhere" builds an itinerary from a link or reel. The listing does not mention AI. Pro prices listed in ringgit: monthly RM62.90, annual RM129.90 to RM399.90, a discount tier RM189.90.
- AI features and caps: only third-party pages (search result, Pilot and Stippl blog posts, both competitors). They say Pro is about $39.99 a year and the free tier has a handful of AI messages. UNVERIFIED against Wanderlog's own pricing page (404).
- Personalisation: no onboarding quiz found. It is a map-first organiser. People collect places; the AI helps fill empty days.
- Money: subscription. Whether flight and hotel links earn affiliate fees is UNVERIFIED.
- Failures: Trustpilot page (https://www.trustpilot.com/review/wanderlog.com): 2.0 of 5 from 53 reviews, 67% one-star. The profile is unclaimed and the company has not invited reviews, so it is not representative. Themes: misleading "free", forced trial and charges, wrong info. Examples: "Most museums listed as Free entry are not." (Paul Wadlan, 9 Aug 2026); wrong wedding venue location (Maria Zinsser, 2 Jan 2026). The App Store listing rating is 4.9 from about 1.3k ratings in the Malaysian store. The two sources point opposite ways. Anecdote level.

### Mindtrip
- App Store listing (https://apps.apple.com/app/id6503107567): text or voice assistant that "learns your travel preferences over time". Save videos, articles, photos or Google Maps pins into collections. Invite friends or family to plan. Price tracking. Book in app. 4.7 from 883 ratings. One reviewer (27 March): only one destination per trip, chat sometimes fails, itinerary items show little detail.
- Group chat launched September 2024. Trade press (PhocusWire, via search snippet) says it merges each traveller's preferences into one itinerary. How conflicts are resolved: not found. UNVERIFIED beyond the press line.
- Funding (search result, company's own number): total $22.5M after Amex Ventures, Capital One Ventures and United Airlines Ventures investments announced Dec 2025. CB Insights lists $19M. Mindtrip Stays launched 15 July 2026 (search result).
- Follow-up check by the reviewer, 2026-11-23 (search summaries of the Globetrender and PhocusWire launch pieces and of a PhocusWire group-travel article; the pages themselves were not opened, so treat as UNVERIFIED on the primary): each person's preferences come from their own account, through a profile they can edit and a quiz that builds a "travel persona". The group chat then merges the personas of the account holders in it, and anyone can tag @Mindtrip for a suggestion "that balances everyone's vibes". So Mindtrip is the nearest thing to per-member personalisation, and the thesis should be stated narrowly. What no source shows: a profile for a traveller who has no account (a child, a grandparent the organiser describes), a line between hard rules and tastes, how a clash is settled, whose wish a given stop serves, or any question about the trip's purpose. One parent's account (theeverymom.com, via search summary) says Mindtrip suggested an outdoor food tour that did not work in summer heat with children, and some restaurants were shut.
- Independent test: Afar, Craig Stoltz, "I Tried 4 AI Travel Planning Apps", updated 2 May 2025 (fetched through the Afar URL listed in sources). Stoltz called Mindtrip "the most sophisticated tool". It wrongly said the trip dates were in the past and could not find a hotel both downtown and under $300: "Even after several stern talking-tos, it never got it right."

### Layla
- Site (https://layla.ai, read 2026-11-23): chat plans a trip, then "a travel advisor checks every detail, books it and stays with you on WhatsApp". Per-person package prices in euros, "no fees". The page does not say how it learns preferences, names no booking partners and shows no group features.
- Trustpilot (https://www.trustpilot.com/review/layla.ai): 4.3 from 98 reviews. One review (Raj Patel, 11 Sep 2026, 2 stars): "The AI frequently forgets earlier instructions and misses some key information at times." Anecdote. Another notes a wait of a couple of weeks for tickets and vouchers after paying.
- App pricing ($49 a year claim) comes only from vendor-linked blogs. UNVERIFIED. Note: a search source warns of a second, unrelated product called Layla.

### Roadtrippers and Autopilot
- Autopilot page (https://www.roadtrippers.com/autopilot): needs start and destination; optional vehicle type, fuel type, MPG, home address; "Plan with autopilot" or "on your own". Claims patterns from "over 42 million trips" (the magazine post says 38 million). Premium feature. Saved trips: 3, 5, unlimited. Stops per trip: 20, 50, 150. Page does not describe detour or drive-time limits.
- Magazine post (https://roadtrippers.com/magazine/whats-the-best-ai-trip-planner/, vendor claim): Autopilot asks "vehicle, budget, travel dates, who is traveling, and where you want to eat and stay". Itinerary in under two minutes. It claims other AI planners "often rely on generic internet searches".
- App Store (https://apps.apple.com/us/app/-/id944060491): "USA and Canada" only. 4.6 from about 62K ratings. Navigation complaints (Nov 2025): "trip plans were discarded once navigation started", missed a freeway closure. Free tier cut to three stops. Version 5.29 reworked Autopilot to find stops along the route.
- Product Hunt reviewer (via search snippet, UNVERIFIED): after upgrade, "The places suggested do not correspond to my interests."
- Why it matters here: Roadtrippers is the nearest product to this trip type, and it does not cover Malaysia.

### Google: Maps (Ask Maps), AI Mode, Gemini
- Google blog, 12 March 2026 (https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/): Ask Maps answers questions with a custom map, builds itineraries from 300M places, uses "reviews from a community of over 500 million contributors". Uses your saved and searched places: it "already knows you like vegan restaurants". Launched in the US and India.
- Android Central, 16 Nov 2026 (https://www.androidcentral.com/apps-software/google-maps/google-maps-wants-to-be-your-one-and-only-trip-planner-this-holiday-season): day-by-day itineraries with directions, traffic, opening times. Edit, remove stops, ask for "a scenic stop". Only collaboration: share the itinerary after setting it. Expanding to 30 more European countries. Whether Malaysia is covered: UNVERIFIED. A search snippet claims Ask Maps trip planning reaches 200+ countries, from a secondary source.
- Google blog, Nov 2025 (https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/): Canvas in AI Mode, desktop, US, Labs opt-in. You describe the trip type. No profile fields for ages or needs. TechCrunch 27 Aug 2026: AI Mode hotel booking, flight price tracking in 180+ countries, no group features mentioned.
- Meaning: Google already has maps, hours, traffic and a personal history. It is the strongest generalist. Its personalisation is built from the account's history, not from who is in the car today.

### Tripadvisor
- Release dated 19 July 2023 (https://tripadvisor.mediaroom.com/Tripadvisor-launches-AI-powered-travel-planning-product): inputs destination, dates, who you are travelling with, activity types. OpenAI model plus reviews ("over a billion"). Beta, US only then. Current AI assistant page not readable (403). Booking links to Viator and TheFork come from a secondary summary (UNVERIFIED on the primary page).
- Money: the same company sells the tours (Viator) that the planner links to. So tours it can book are more likely to appear. This is an inference from the business structure, not a documented bias.

### Expedia (Romie), Booking.com, Agoda, Trip.com, Klook, Airbnb
- Expedia: Romie announced May 2024 as an alpha. Group-text feature: add Romie to an SMS chat, it listens and suggests. Skift's example: a child who likes dinosaurs gets a museum suggestion. I could not open Expedia's page (429). 2026 status UNVERIFIED.
- Booking.com (Booking Holdings release, 30 Oct 2024, https://www.bookingholdings.com/press-releases/booking-com-enhances-travel-planning-with-new-ai-powered-features-for-easier-smarter-decisions/): Smart Filter from natural language, Property Q&A, planned review summaries tailored to what matters to each traveller (e.g. wheelchair access, parking; not yet live then). AI Trip Planner in US, UK, Australia, NZ, Singapore via app. No group features.
- Agoda press release, 30 Oct 2026 (https://www.agoda.com/press/1509063/): AI Assistant in 21 markets incl. Malaysia, 6M+ accommodations, Gemini with Google Maps grounding for restaurants and places, OpenAI models, retains preferences and trip context, trip planner canvas. No group tools.
- Trip.com Trip.Planner, 1 Sep 2025 (https://www.ttgasia.com/?p=111387): starts with three questions (destination, duration, travel style). Styles include families, cultural explorers, nature, history, budget. 20M+ geo-tagged POIs, verified hours and visit durations. English-language sites incl. Malaysia. This is the only product read where "family" is an explicit input, and it is one tag among styles.
- Klook (Skift, 9 Jun 2026, paywalled excerpt): AI shopping agent in beta with select users.
- Airbnb (Analytics Insight): AI search, filters ("baby" shows cribs), Travel Map of friends' stays. Full AI travel agent planned for first half of 2027 (search snippet from Q3 2026 shareholder letter, UNVERIFIED on primary).

### Roadtripping and minor planners
- Furkot (https://trips.furkot.com/, read): set daily limits on travel time; suggests overnight stops; add meal and fuel stops; reverse or reorder. No detour feature described. This is the closest read of "pacing a multi-day drive".
- Polarsteps (https://www.polarsteps.com/): tracks route, trip reels and books, 23M travellers (vendor), ad-free, paid Plus. AI Trip Planner link exists, no detail.
- Stippl: vendor blog only. Full AI itineraries paid (€24.99 a year per vendor), unlimited collaborators claim is for Wanderlog. Wonderplan, Vacay, GuideGeek, iPlan.ai, Curiosio, Trip Planner AI, TripIt, Tripnotes: only roundup pages or search snippets. Afar's tester (via search snippet) found GuideGeek "invented" connections and Vacay plans lack maps. UNVERIFIED primary.

### General assistants
- ChatGPT agent mode (NN/G, 8 Aug 2025, https://www.nngroup.com/articles/impressions-chatgpt-agent/): on a restaurant task the agent "jumped immediately into the task with limited context" and asked no questions about budget or attendees. It did apply a shellfish allergy. Booking took about 11 minutes against about 2 by hand. One task, one tester.
- Afar test (2 May 2025): Gemini produced text itineraries and "was the most consistently accurate on facts and links" but did not give booking links unless asked. Kayak inside ChatGPT cut off after about 20 exchanges on the free tier.
- Search snippet: OpenAI bought Odessia in Nov 2026 (see market facts). Claude was not covered by any source read.

### Southeast Asia and Malaysia
- Agoda 2026 Travel Outlook (sponsor: Agoda, 3,353 respondents across nine markets, surveyed October, via The Star, 3 Dec 2025, https://www.thestar.com.my/lifestyle/travel/2025/12/03/malaysia-leads-in-ai-adoption-for-travel-planning): 40% of Malaysians actively use AI to plan trips, 59% plan to, 36% trust AI travel information. A seller of bookings ran this survey.
- Tourism Malaysia and Alipay+ MoU (Bernama, 14 Oct 2026, https://www.bernama.com/en/news.php?id=2620012): Alipay+ Voyager, an AI agent in wallets, to surface Tourism Malaysia-verified offerings. Aimed at international visitors. No launch date. This is a state-backed channel that steers visitors to verified, sponsored-by-agreement operators. Not a planner for locals.
- Agoda, Trip.com, Booking.com (Singapore) all cover Malaysia with booking-first assistants.
- Tourism Malaysia's own planner apps, Traveloka's AI planner, Grab: nothing found. UNVERIFIED either way.

---

## What everyone already does (table stakes)

- Describe a trip in chat and get a day-by-day plan with a map. Seen at Mindtrip, Layla, Trip.com, Agoda, Google Maps, Wanderlog (Import) and most minor tools.
- Import from links, reels or screenshots (Mindtrip, Wanderlog, Google saved lists).
- Share a plan with others. Real-time shared edit at Wanderlog and Mindtrip.
- Show opening hours and travel times between stops (Trip.com, Google Maps).
- Offer booking or price links (every OTA, Mindtrip, Layla, Google).
- Free tier with a cap, paid tier near $35 to $50 a year.

## What nobody does well (gaps)

1. **Per-member needs in one party.** No product read shows a profile per traveller (age, mobility, diet, nap, boredom). The inputs seen are one tag ("families"), a companion field, or merged preferences with unexplained conflict handling. Evidence: Trip.com, Tripadvisor, Roadtrippers, Google pages (primary). Confidence: medium-high that it is absent from the public pages read. Low on what happens inside the products, which I could not use.
2. **Sourced, checkable claims.** Chat answers come with maps and ratings, not with a quoted sentence tied to its source. Google and Agoda cite Maps data; none quotes the story of a place. Confidence: medium (I read pages, not outputs).
3. **Invented or closed places.** Wrong or missing places are the most repeated complaint. Evidence: Greetwell survey (Aug 2026, commissioned by a travel concierge company, 1,000 US leisure travellers, 485 AI users; 16% were sent a place that did not exist, 55% got at least one bad suggestion; read via a news syndication, not the primary). The Star, 28 Sep 2026: an elderly couple travelled from Kuala Lumpur to Kuak Hulu, Perak, to see a cable car that did not exist, after an AI-generated video (https://www.thestar.com.my/lifestyle/travel/2026/09/28/navigating-the-good-and-the-bad-of-ai-in-tourism). That case involved a video, not a planner. "90% of itineraries inaccurate" (search result of a single test, method not seen): treat as low confidence.
4. **Same famous list for everyone.** In The Star article a 28-year-old traveller says AI suggestions "often reflect popular choices, which may not suit everyone". One interviewee, anecdote. Alipay+ and Tourism Malaysia say they want to spread visitors beyond hubs, which is a stated gap, not proof.
5. **Forgetting what you said.** Layla review: the AI "frequently forgets earlier instructions" (one Trustpilot reviewer). Mindtrip failed a stated price-and-place filter (Afar, one journalist, 2025). Confidence: low to medium.
6. **Pushy subscription and "free" claims.** Wanderlog and Roadtrippers reviews on Trustpilot and the App Store repeat auto-renewal and forced-trial complaints. Many reviews, but unclaimed profiles and self-selected. Confidence: medium that it is a pattern, low on size.
7. **Road trip detail outside North America.** Roadtrippers is USA and Canada only (App Store). Furkot has daily drive limits but no sign of AI. Confidence: medium.
8. **Accessibility accuracy.** An accessible-travel writer found ChatGPT claimed wheelchair taxis existed in St. Louis based on outdated data (wheelchairtravel.org, via search snippet, one anecdote). Wheel the World with Experience Grand Rapids has a specific AI accessibility planner (search snippet). Primary pages not opened.
9. **Money shapes the answer.** Booking-led products (Agoda, Trip.com, Booking.com, Expedia, Klook) earn when you book, so inventory they sell comes first. Tripadvisor owns Viator. Wanderlog and Roadtrippers sell subscriptions. Layla sells packages. Google's AI Mode names booking partners. None of the pages read states a ranking rule. This is inference from business structure.

## How family and group trips are handled today

Honest reading: no product opened in this session personalises by member. Some come close on parts.

| Need | Closest thing found | Evidence | Gap |
|---|---|---|---|
| "Family" as a label | Trip.com style "families"; Tripadvisor "who is travelling"; Roadtrippers "who is traveling" | Primary pages | A tag. Ages, nap, stairs are not asked |
| Merged preferences from several people | Mindtrip group chat "merges each traveller's preferences" | PhocusWire via search snippet (primary not opened) | How conflicts resolve is unknown. The best candidate against the thesis, but unverified |
| Group chat with an AI in it | Expedia Romie in a group text | Expedia release 2024 via search; Skift example (child likes dinosaurs) | Alpha in 2024; 2026 status unknown |
| Shared editing | Wanderlog, Mindtrip | App Store listings | Edits only. No voting or split-day logic seen |
| One member's diet or allergy | ChatGPT agent applied a shellfish allergy | NN/G test | It defaulted to the user, since the allergy holder was never specified. One task |
| Accessibility | Booking.com planned per-traveller review summaries (wheelchair, parking); Wheel the World | Booking release 2024; search snippet | Not a trip planner for mixed groups |
| Memory from your history | Google Maps (saved and searched places), Agoda, Mindtrip | Google blog; Agoda release; App Store | Personal history, not today's party |
| Trip purpose (a reunion, an anniversary, a pilgrimage) | Not found on any page read | n/a | Nobody visibly asks |

The thesis stands on what could be read, in a narrower form than "nobody personalises by member". Mindtrip does hold a persona per account holder and merges the personas in a group chat (see the reviewer's follow-up under Mindtrip). The gap that remains on the evidence: travellers without an account, hard rules kept apart from tastes, a visible answer to "whose stop is this", an honest "could not check", and the trip's purpose. Still the first thing to test by hand, with a free account and a made-up mixed party, before building. It was not done here because of the no-sign-up rule.

Also note: "family-friendly" is not wrong everywhere. Booking.com's own example of review summaries tailored to wheelchair access shows the biggest platforms plan to handle needs through review summaries, not through a traveller profile.

## Market facts for a small entrant

- Survey data on AI use in planning. Numbers differ because the samples differ:
  - Allianz Partners Global Travel Confidence Index, polled by Ipsos, 2,001 US adults, 20 Mar to 14 Apr 2026: 37% of Americans planning to travel this summer use or plan to use AI to plan (via Hotel Dive, 23 Jul 2026).
  - Agoda 2026 Travel Outlook (sponsor Agoda), Malaysia: 40% actively use AI to plan; 59% plan to.
  - Greetwell (sponsor: a travel concierge firm): 485 of 1,000 US leisure travellers had tried AI for travel.
  - Search-result numbers, not opened: Phocuswright "more than half" of US leisure travellers; IATA 49%; eMarketer 28.7%; Booking.com 69% of Gen Z (Booking.com is a seller). UNVERIFIED primaries.
- Shutdowns and deals:
  - Tripnotes shut mid-December 2023 after being sold; the founders said funding "froze" (Skift, 2 Jan 2024, https://skift.com/?p=650997).
  - Odessia, an AI travel agent by a Sonder co-founder, launched 14 Oct 2025, about $6M seed led by Sequoia. OpenAI's acquisition announced 10 Nov 2026 (Skift, https://skift.com/2026/11/10/a-year-after-sonders-collapse-francis-davidson-sells-his-ai-travel-startup-to-openai/). The Skift text did not say the service was shut down; other search results say it was. UNVERIFIED.
  - Layla bought Roam Around in Feb 2024 (TechCrunch headline via search).
- Usage numbers published by the vendors: Wanderlog over 1M users (vendor); Polarsteps 23M travellers (vendor); Roadtrippers about 62K App Store ratings; Mindtrip 883 App Store ratings, no user count found.
- Pattern: independent startups are small or get absorbed; the big sellers add assistants to booking flows (Google, Agoda, Trip.com, Booking, Airbnb planned for 2027).

---

## Not verified this session

- Reddit threads (blocked). App Store reviews for Layla, Mindtrip beyond the listing page.
- Mindtrip primary pages and how its group preference merge works.
- Wanderlog Pro page, AI caps, affiliate revenue; Layla app pricing; Expedia Romie 2026 status; Tripadvisor current AI page and any group feature.
- Whether Ask Maps itineraries are available in Malaysia.
- TripIt, GuideGeek, iPlan.ai, Curiosio, Wonderplan, Trip Planner AI, Vacay primary pages. Klook beyond a paywalled snippet.
- Traveloka, Grab, Tourism Malaysia's own planner apps.
- Phocuswright, IATA, eMarketer survey primaries; the "90% of ChatGPT itineraries wrong" test method.
- Whether Odessia was shut down.
- How any product actually behaves with a mixed-needs party (no product was used).

## Sources (read 2026-11-23 unless marked as search result only)

Opened:
- https://www.roadtrippers.com/autopilot
- https://roadtrippers.com/magazine/whats-the-best-ai-trip-planner/
- https://apps.apple.com/us/app/-/id944060491 (Roadtrippers)
- https://apps.apple.com/my/app/id1476732439 (Wanderlog, Malaysia store)
- https://apps.apple.com/app/id6503107567 (Mindtrip)
- https://wanderlog.com/ (review-style content)
- https://www.trustpilot.com/review/wanderlog.com ; https://www.trustpilot.com/review/layla.ai
- https://layla.ai
- https://blog.google/products-and-platforms/products/maps/ask-maps-immersive-navigation/
- https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/
- https://techcrunch.com/2026/08/27/googles-ai-mode-can-now-track-flight-prices-help-book-hotels-and-more/
- https://www.androidcentral.com/apps-software/google-maps/google-maps-wants-to-be-your-one-and-only-trip-planner-this-holiday-season
- https://tripadvisor.mediaroom.com/Tripadvisor-launches-AI-powered-travel-planning-product
- https://www.bookingholdings.com/press-releases/booking-com-enhances-travel-planning-with-new-ai-powered-features-for-easier-smarter-decisions/
- https://www.agoda.com/press/1509063/
- https://www.ttgasia.com/?p=111387 (Trip.com Trip.Planner) ; https://www.trip.com/tripgenie/
- https://www.polarsteps.com/ ; https://trips.furkot.com/
- https://www.analyticsinsight.net/news/airbnb-adds-ai-search-travel-sharing-features-for-easier-planning
- https://skift.com/2026/06/09/klook-co-founder-bets-ai-can-finally-fix-travel-experiences-discovery/
- https://skift.com/2026/11/10/a-year-after-sonders-collapse-francis-davidson-sells-his-ai-travel-startup-to-openai/
- https://skift.com/?p=650997 (Tripnotes)
- https://www.afar.com/magazine/we-tested-ai-travel-planning-apps-here-are-the-3-that-actually-worked (page read was the Afar Stoltz piece, 2 May 2025)
- https://www.nngroup.com/articles/impressions-chatgpt-agent/
- https://www.hoteldive.com/news/ai-travel-planning-tool/826002/
- https://www.thestar.com.my/lifestyle/travel/2025/12/03/malaysia-leads-in-ai-adoption-for-travel-planning
- https://www.thestar.com.my/lifestyle/travel/2026/09/28/navigating-the-good-and-the-bad-of-ai-in-tourism
- https://www.bernama.com/en/news.php?id=2620012 ; https://www.alipayplus.com/voyager/
- https://www.stippl.io/blog/stippl-vs-wanderlog (vendor)
- https://www.techradar.com/computing/artificial-intelligence/can-an-ai-travel-agent-remove-the-stress-of-vacation-booking-i-tried-three-to-find-out (opened, body truncated; used only for title and date)

Search result only (not opened or not readable):
- Expedia Romie: https://www.expedia.com/newsroom/spring-product-release-2024 ; https://skift.com/2024/06/04/what-it-means-to-add-expedias-travel-assistant-romie-to-your-group-chat
- Mindtrip funding and group chat: https://www.phocuswire.com/mindtrip-secures-12m-funding-launches-group-chat ; https://globetrender.com/2024/09/24/mindtrip-launches-group-chat-feature/
- Greetwell survey: https://www.greetwell.com/us/guides/ai-travel-survey-2026 ; https://stacker.com/stories/travel/survey-ai-hallucinated-travel-destinations-1-6-users
- 90% itinerary claim: https://www.rustourismnews.com/90-of-ai-travel-itineraries-are-inaccurate/
- Accessible travel and ChatGPT: https://wheelchairtravel.org/artificial-intelligence-impact-accessible-travel-will-be-negative-before-positive/
- Phocuswright, IATA, eMarketer survey pages (listed in a search result; not read).
