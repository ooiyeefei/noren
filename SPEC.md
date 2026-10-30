# Noren: MVP spec

Status: DRAFT v0.1, 2026-10-29. Evidence for every external claim below lives in `research/01` to `research/07`; section 14 maps them. Facts the research marked UNVERIFIED stay unverified here.

**This file is now design notes.** Requirements live in `specs/001-noren-mvp/spec.md` (Spec Kit); where they differ, that spec wins. Roles are now user, creator, business owner and steward, with invite-only sign-up in the pilot. For the plan stage: the owner chose Clerk for sign-in with role-based access. Check where it processes account data for the privacy notice.

Locked by the owner (2026-10-29):
1. AI works only on consented transcripts and text people type; platform embeds are display-only.
2. No scraping lane in the MVP.
3. Cautions are a fixed vocabulary, not free text.
4. Invite-only until the legal pack exists.
5. Stories, not scores.

Name: Noren (product). Backlane is the phase 2 AI walking companion; Footnote is the citation under every sentence.

Open: operator of record (who is named legally), domain and trademark check for Noren, live-captions provider bake-off.

## 1. What it is

A web app that works as a story layer over real places. People pin a place by hand, attach public posts as live embeds that link back to the creator, and contribute interviews with owners. Owners speak in their own language; AI transcribes, translates and structures what was said into sourced claims; the owner confirms them; the place page blends confirmed claims and shows embeds beside them as evidence. No ratings, no sentiment. First region is Nagasaki; the second (Malaysia) must be a config change, not a rewrite.

Constraint: the Sea x OpenAI Codex Hackathon (Malaysia, 2026-12-05) requires all building on the day and forbids pre-built code. This codebase must not be carried into it.

## 2. Principles (non-negotiable)

1. **Stories, not scores.** No stars, ratings, sentiment labels or sentiment-based ranking. Cautions are factual and come from the vocabulary in section 7.
2. **Real data only.** Seeds are real places confirmed by a human. Anything made for demos or video belongs to an explicitly labelled mock user (`user.is_mock = true`), shows a visible "Demo" badge, and is excluded from all stats.
3. **The human pin is the truth.** Provider coordinates and names are suggestions with provenance, never authoritative.
4. **Link out, don't copy.** We store URL, platform, author link and a human note. We render live via the platform's own embed with attribution adjacent, and hide the entry when the original disappears.
5. **AI is an editor on consented text only.** Inputs: owner transcripts with a consent record, text a contributor typed, and openly licensed text (e.g. Wikipedia, attributed). Never platform content. Every sentence on a blended page cites claim IDs; a sentence with no claim ID is rejected; failures go to human review.
6. **The original language is canonical.** Japanese stays the source of truth. Translations are labelled "machine translation" until a human confirms them.
7. **Region is configuration.** Languages, map, adapters, legal fields and keys live in the region config.
8. **Open source from day one.** No credentials in the repo; every deployment brings its own keys; data under different licences lives in separate tables.
9. **Invite-only until the legal pack is done** (section 10).

## 3. Roles

| Role | Can do | In MVP |
|---|---|---|
| Visitor | Read published pages | yes |
| Contributor | Pin places, add sources and notes, upload interviews | yes |
| Verified creator | As contributor; name tied to a public profile; can run interviews | yes, invited by a steward |
| Owner | Confirm or edit claims about their place, reply to visitor notes | yes, verified by a steward |
| Steward | Moderate, verify owners and creators for a region | yes (owner of this project, programme team) |
| Admin | Config, roles, takedown | yes |

New accounts cannot add cautions. Negative or cautionary claims need a named author and owner confirmation before they surface.

## 4. Data model (logical)

| Entity | Key fields | Notes |
|---|---|---|
| region | id, bbox, locales, status (draft / invite_only / public), config (jsonb) | See section 9. |
| user | id, display_name, role, profile_url, is_mock | Mock users are flagged everywhere. |
| place | id, region_id, status | Internal UUID. |
| place_name | place_id, lang, script (kanji / kana / romaji / latin), value, confirmed_by | Names in several scripts per place. |
| pin | place_id, lat, lng, placed_by, placed_at | The authoritative location. |
| place_external_ref | place_id, provider (osm / wikidata / google_place_id / overture), ref, licence, retrieved_at | Pointers only; provider data is never truth. |
| source | place_id, url, platform, adapter, author_handle (link only), human_note, status (live / gone / hidden), last_checked_at | No captions, images or metadata stored. |
| interview | place_id, interviewer_id, owner_id, language, recording_ref, status | |
| consent | interview_id, scope (publish, ai_processing, foreign_transfer, voice_retention), text_version, recorded_at, withdrawn_at | Withdrawal cascades. |
| transcript | interview_id, version, lang, segments[{start, end, speaker, text}], origin (machine / human_corrected), model_version | The human-corrected version is the source of truth. |
| claim | place_id, kind (story / caution / fact), text_original, lang, translations{lang: {text, origin}}, caution_type, origin (interview / note / open_text), source_ref (transcript span, note, or open-text revision), author_id, status (proposed / owner_confirmed / published / disputed / hidden), reviewer_id, model_version | Atomic unit. |
| story_page | place_id, version, sentences[{text, lang, claim_ids[]}], generated_by, reviewed_by | Rendering of confirmed claims. |
| outbound_click | source_id, ts, bot_flag | Aggregate-only reporting; no IP stored. |
| takedown_request | target_type, target_id, reason, status, outcome | See flow 5.6. |
| audit_log | actor, action, target, ts, diff | Includes diffs of AI edits. |

Licence separation: OSM-derived rows (ODbL), Wikipedia text (CC BY-SA), municipal open data (CC BY 4.0 / PDL1.0) and our own stories and pins sit in separate tables (research/02).

## 5. Flows

**5.1 Pin a place.** Search on submit (never typeahead) through the server-side Nominatim proxy, or drop a pin by hand. The human places or confirms the pin; names are entered per script; romaji and kana from analysers are flagged unconfirmed.

**5.2 Add a source.** Paste a URL; the matching adapter detects the platform and returns an embed. The contributor adds a note in their own words. We store URL, platform, author handle as a link, post date and the note. Unsupported platforms fall back to a link card (user-typed title plus URL). A liveness check hides the entry when the original is gone.

**5.3 Owner's note (interview).**
1. Interviewer and owner agree; the consent screen (JA/EN, versioned) records scope, including foreign transfer and voice retention. No consent, no upload.
2. Audio is recorded or uploaded; the machine transcript comes back.
3. A person corrects the transcript (original language).
4. AI proposes claims with a quote span each, as structured output.
5. The owner sees the claims in Japanese as confirmation cards (Yes / Edit / Remove) and only confirmed claims move on.
6. Translations are generated from the confirmed text and labelled.

**5.4 Place page.** Composed from published claims. Each sentence carries claim IDs; a deterministic check (IDs exist, quote is a substring of the source span, no ID-less sentence) runs before an LLM entailment check from a different vendor; any failure goes to a steward queue. Embeds sit beside the story, with the author credit adjacent.

**5.5 Outbound click.** Every link to an original goes through a first-party redirect that increments an aggregate counter. Creators and owners see counts only. Mock-user activity is excluded.

**5.6 Takedown and withdrawal.** A public form in JA and EN. Acknowledge, hide immediately for privacy or minors, review, give a reasoned outcome, allow appeal. Withdrawing consent hides the interview's claims, transcript and recording.

## 6. Closing the language barrier

| Feature | What it does | MVP |
|---|---|---|
| Bilingual place page | Japanese original beside an English machine translation, per paragraph toggle | yes |
| Owner confirmation cards | The owner approves AI-extracted claims in Japanese before anything is published; this is both the quality check and the consent step | yes |
| Voice-first owner memo | The owner speaks Japanese instead of typing; transcript, correction, English draft | yes (batch) |
| Two-way notes | A visitor's English note is shown to the owner in Japanese, and the owner's reply goes back in English, both labelled as machine translation | yes, on read |
| Ask-me-about topics | The owner picks topics they love to talk about; a visitor can show the card, bilingual | yes |
| Show-the-shopkeeper cards | A small library of owner-friendly phrase cards (Is there a vegetarian option? May I take a photo?) written from templates and reviewed by a Japanese speaker, not free-form AI | yes, about 10 |
| Place-name helper | Kanji, kana, romaji; pronunciation audio later | text yes, audio later |
| Live bilingual captions in an interview | Two tiers: near-live via chunked upload with browser voice-activity detection (about 3 to 8 s delay, an estimate), or true live via a streaming provider (Soniox is the lead candidate, pending a bake-off on real Nagasaki audio) | stretch; near-live first |
| Translation review | Proper nouns and culturally loaded terms flagged; Japanese speakers can suggest fixes | later |
| More languages | Malay and Chinese via region config | later |

Translation applies to confirmed claims, not free-form text, so a mistranslation affects one owner-approved sentence and can be corrected there.

## 7. Caution vocabulary (starter, owner-approved)

Closed days or irregular hours; cash only; reservation required; English menu or English spoken; small space or limited seats; owner asks for no photography; steps or accessibility; seasonal availability. Anything about quality, safety or conduct is out. A caution needs a named author and owner confirmation. The list is editable per region.

## 8. Seed plan

- **First places:** the businesses from the programme's Contact Directory (AWAKE, Eguchi, Futa / Nomozaki, ReLABELED, Hope / meitei, Wakaran Garage, Nagasaki Origami, Mana, Manopan, Again Hashima, Onoue Hill, Yakuzen wu, Yawara). Each page stays hidden until its owner agrees.
- **Landmark layer:** OSM extract, Wikidata IDs, municipal open data (BODIK), the multilingual tourism database, Wikipedia and Commons for text and photos, each kept in its own licensed table.
- **Small-business candidates:** Overture Places snapshot as a candidate list only (it keeps only its latest two releases, so snapshot it), each confirmed by a human pin and the owner's consent.
- **Hashima and Nomozaki** are almost empty in every open dataset, so they depend on interviews.
- **Demo content:** only under a labelled mock user.

### Demo kit (before any owner has consented)

Owner consent is not needed to show what is possible, because nothing about a real business is published. Four layers, each real or clearly labelled:
1. **Landmark pages:** public sites built only from open-licensed text, open data and the multilingual tourism database, attributed. No consent needed. The final list comes from the seed pull.
2. **Creator pins:** cohort members opt in to attach their own public posts about places. Real people, real posts, withdrawable.
3. **Private draft previews of programme-partner businesses:** public facts only (name, category, address, map pin) plus consenting creators' posts, with no claims, status `draft`, visible to stewards only. A steward shows an owner their own preview in person or on a call as the picture for asking consent. Nothing is published or indexed.
4. **Mock walkthrough:** a clearly labelled fictional "Demo Cafe" owned by "Demo Owner (mock)" runs the whole interview, confirmation-card and bilingual-page flow in Japanese and English. Mock rows carry `is_mock`, show a visible Demo badge and are excluded from stats.

## 9. Architecture

- Next.js (App Router) and TypeScript; Convex for data and server functions (this note once said Postgres; superseded by specs/001-noren-mvp/research.md D19). Hosting chosen at build time.
- Map: MapLibre GL JS (BSD-3) with OpenFreeMap tiles; Japanese labels need glyph handling (research/01). Attribution: OpenStreetMap and OpenFreeMap.
- Search: Nominatim behind a server proxy with cache and our own User-Agent, search on submit only. Self-host a Japan extract before real traffic.
- Region config: id, bbox, locales, name-language fallbacks, map style and search adapters, enabled source adapters, caution vocabulary, consent text version, transfer basis, takedown contact, retention, minimum age, per-deployment keys.
- Ports: `GeoProvider` (MapStyle, Search, Reverse, Policy), `SourceAdapter` (match, render, normalise), `Transcriber`, `Translator`, `ClaimExtractor`, `GroundingChecker`.
- Source adapters, in order: LinkCard, Meta oEmbed (Instagram, Facebook, Threads; tokenless), YouTube iframe, X oEmbed, Google Maps place link (store `place_id`, link out), GenericWeb (OpenGraph, SSRF guard), TikTok Embed Player, Hatena, Bluesky.
- AI: transcription and LLM behind interfaces; the provider is chosen by a bake-off on real consented transcripts. Model retirements (OpenAI TTS 2027-01-06, OpenAI transcription 2027-02-26, Perspective API 2026-12-31) are why they sit behind interfaces. Moderation: flag-and-review.
- Security: audio encrypted at rest, access log, least privilege, retention schedule.

## 10. Launch gating

**Build in now (hard to retrofit):** the claim provenance schema; human pin as truth; one table per licence; region config with legal fields; adapters that store only URL plus human fields; the liveness check; the first-party click redirect; Japanese-canonical text with labelled translations; the mock-user flag excluded from stats; audio retention defaults.

**Before any real person's story is published or any public launch:** operator of record; terms of service and contributor licence; privacy notice in JA and EN (names the foreign transfer); interview consent capture; under-16 rule; takedown workflow; owner verification (control of a listed channel, not ID documents); moderation queue; Telecommunications Business Act notice review; name and trademark check; open-source basics (LICENSE, CONTRIBUTING, Code of Conduct, SECURITY.md). Until these exist the app stays invite-only and unindexed. Not legal advice; take research/06 to a Japanese lawyer.

## 11. MVP scope and milestones

| M | Delivers |
|---|---|
| M0 | Scaffold, region config, map, manual pin, place names |
| M1 | Source adapters, live embeds, notes, click redirect, liveness check |
| M2 | Interview upload, consent record, transcript, correction |
| M3 | Claims, owner confirmation cards, grounding gate, bilingual place page |
| M4 | Language features (cards, topics, two-way notes), mock-user demo mode |
| M5 | Roles, takedown, audit, first consented real seeds |

Demo bar for the programme team: at least three real place pages with owner-confirmed notes, or clearly labelled mock content, plus the bilingual view. Then use the pitch-package skill for the animated promo video; the gaps found while building feed the backlog.

## 12. Not in the MVP

Ratings or scores of any kind; scraping or Apify lanes; capacity controls for owners; native apps; paid plans; public API; federation; chat Q&A over pages; Perspective API; storing any platform content.

## 13. Open items

1. Operator of record (named person or entity). Working assumption for the invite-only pilot: the project owner, to be confirmed.
2. Live-captions provider: bake-off on real Nagasaki audio (Soniox is the lead candidate; Azure Japan East and AWS Tokyo are the other Japan-region options).
3. Domain and trademark check for Noren (J-PlatPat for Japan; only `.guide`, `.wiki` and `.stories` looked free by DNS).
4. Whether any Apify / search-API lead list is wanted as a one-off task outside the product (research/04, section 8.3).
5. Owner consent: not required before the demo; real business pages stay `draft` (steward-only previews) until each owner agrees.

## 14. Research index

01 maps and geocoding; 02 open data for seeds; 03 social embeds; 04 scraping and alternatives; 05 AI layer and entity resolution; 06 legal, policy and spec gaps; 07 live transcription and translation.

## 15. Phase 2 direction: AI walking companion

An AI guide that walks with a visitor through an area and tells them what the people who know it have said. It is built on this app's own corpus of human stories, not on an outside model's recommendations. It is not in the MVP. These constraints keep the MVP schema ready for it:

1. Answers come only from published, owner-confirmed claims and openly licensed text. Every sentence carries a footnote to its claim. With no claim there is no answer, only an invitation to add a story.
2. Embeds can be shown but not summarised, because platform terms bar AI processing of their content (research/03, 04).
3. Nothing is ranked by popularity or sentiment. Suggestions follow the visitor's chosen interests and story density, with the reason shown.
4. Location is used per request, with no trail stored by default.
5. The companion's answers are our own speech, so the grounding gate, an "AI-assisted" label and the takedown path apply (research/06 lists chat Q&A as LATER).
6. Quality depends on the volume of consented transcripts, so the Nagasaki interviews are the corpus.
7. Interest profiles (historical, cultural, and so on) need their own consent and a deletion path.
