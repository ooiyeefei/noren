# Feature Specification: Noren MVP

**Feature Branch**: N/A (no git repository; feature directory `specs/001-noren-mvp`)

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "A web app that lets people pin real places, attach public posts as live embeds that link back to their creators, and contribute interviews with business owners. AI transcribes, translates and structures interviews into sourced claims, the owner confirms them, and each place page blends the confirmed claims with footnotes. No ratings or sentiment. Nagasaki first, other regions by configuration." Source notes: `SPEC.md` and `research/01` to `research/07`.

> **Amendment 2026-10-30 (the owner's rule, research D20).** Noren is a public directory of local businesses (bars,
> restaurants, cafes, retail shops, music shops, artist galleries) built from open data; tourist attractions are not the
> focus but nothing is excluded. A place page is readable by anyone and needs no owner approval; a steward confirms the place
> is real. The owner's approval applies to the owner's own story (FR-011, FR-013). Wherever this document says "landmark"
> (the first-MVP clarification, User Story 5, SC-009, SC-010, the assumptions) or says a real business stays a private draft
> until its owner agrees (FR-021, FR-029), read it as superseded by this rule. SC-009 and SC-010 were restated on 2026-10-30 with the owner's approval (see Success Criteria). On the same day the owner approved dropping the held-sentence approve/edit/reject queue: see FR-014.

## Clarifications

### Session 2026-10-29

- Q: What should the MVP be able to do when shown to the programme team in about two weeks? → A: A show-and-tell prototype: landmark pages, creators' consented posts and one labelled mock-owner walkthrough in Japanese and English; no real owner interviews yet; real business pages stay private drafts.
- Q: How should programme staff and business owners open a private preview and confirm their claims, and who can create an account in the pilot? → A: Everyone uses an account with a simple role: user, creator, business owner or steward (verification and moderation). Sign-up is invite-only; a steward grants the creator and business-owner roles after verifying the person. A draft page is visible to stewards and to that place's verified business owner.
- Q: Who will check the Japanese wording (translations and phrase cards) before it reaches a business owner or the programme demo? → A: Named volunteer Japanese speakers review the phrase cards and a sample of translations. Review must not block shipping: anything not yet reviewed stays labelled as unreviewed machine translation.
- Q: When you share the video, should people also be able to open the app itself? → A: Yes, as a public read-only demo with mock and openly licensed data only, no sign-up, hidden from search engines. Accounts stay invite-only, and a short Japanese and English notice covers third-party embeds.

### Session 2026-10-29 (analysis follow-up)

Applied after `/speckit-analyze` on the instruction to fix the critical and high findings:

- A draft page is also visible to the creator who made the place, so a creator can check their own work (finding I3). Stewards may do everything a creator can, for example to seed landmark pages (I4).
- Claims about a business are publishable only when the owner confirmed them; openly licensed text about a place with no business owner may be published after a steward approves it, with licence and attribution (constitution v1.2.0, finding C1).
- Streaming interview audio to an AI service needs the same recorded consent as an upload (C2).
- Phrase cards ship labelled unreviewed until a Japanese speaker reviews them, as clarification Q3 already said (I1).
- A post shown in the public demo always needs its author's agreement, recorded by a steward, even when the place is mock (I5).
- A steward can mark two published claims as disputed; both stay visible and cited (I6).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pin a real place and attach public posts (Priority: P1)

A creator adds a real place by finding it or dropping a pin on the map, names it in the scripts people use, and pastes links to public posts about it. Each post appears in the place's page as a live embed with the author's credit and a link to the original, plus a short note the creator wrote.

**Why this priority**: Without places and linked posts there is nothing to tell stories about. It also delivers visible value to creators on its own, since their posts get traffic.

**Independent Test**: Pin one real place, paste three public post links from different platforms and one unsupported link, and view the page. Delivers a usable, sourced place page with no interviews.

**Acceptance Scenarios**:

1. **Given** a creator who is signed in, **When** they search for a place and confirm or move the pin, **Then** the place exists with the person-placed pin as its location and any provider suggestion labelled as a suggestion.
2. **Given** a place, **When** the creator pastes the URL of a public post on a supported platform, **Then** the post is shown live through the platform's own embed, with the author credit adjacent and a link to the original.
3. **Given** a pasted URL on an unsupported platform, **When** it is added, **Then** it appears as a link card with a title the creator typed.
4. **Given** a source whose original post has been deleted, **When** the next check runs, **Then** the entry is hidden and no copied content remains.

---

### User Story 2 - Capture an owner's story and let the owner confirm it (Priority: P1)

An interviewer records a conversation with a business owner after the owner gives recorded consent. The system produces a transcript in the language spoken, a person corrects it, and the system proposes claims, each tied to a quoted span. The owner sees the claims in their own language and confirms, edits or removes each one.

**Why this priority**: This is the heart of the product: stories in the owner's own words, with the owner's approval. It also satisfies the consent and quality checks. In the first demo it runs under a mock user; real interviews start only after owners agree.

**Independent Test**: Run one mock interview under a mock user: consent, upload, correct the transcript, review claims as the owner in Japanese, confirm two and remove one. Only the two confirmed claims are marked publishable.

**Acceptance Scenarios**:

1. **Given** an interview without a recorded consent, **When** the interviewer tries to upload audio, **Then** the upload is refused.
2. **Given** an uploaded interview, **When** processing completes, **Then** a transcript in the language spoken is available for a person to correct, and the corrected version becomes the record of truth.
3. **Given** a corrected transcript, **When** claims are proposed, **Then** every claim cites a quoted span from the transcript and none is created without one.
4. **Given** proposed claims, **When** the owner reviews them in their own language, **Then** they can confirm, edit or remove each, and only confirmed claims can be published.
5. **Given** a published interview, **When** the owner withdraws consent, **Then** its claims, transcript and recording are hidden everywhere.

---

### User Story 3 - Read a bilingual place page where every sentence is footnoted (Priority: P1)

A visitor opens a place and reads its story in English beside the owner's original Japanese. Each sentence has a footnote pointing to the claim and person it came from. Linked posts appear beside the story as evidence. There are no stars, scores or sentiment labels.

**Why this priority**: This is what visitors and the programme team will actually see, and it is where trust is won.

**Independent Test**: Open a place with three confirmed claims. Verify each sentence has at least one footnote, the original text sits beside the labelled machine translation, and nothing resembles a rating.

**Acceptance Scenarios**:

1. **Given** a place with published claims, **When** a visitor opens it, **Then** the page shows only sentences built from published claims or openly licensed text, each with a footnote.
2. **Given** a sentence that cannot be tied to a published claim, **When** a page is composed, **Then** the sentence is not shown and is marked held; it stays hidden until a published claim supports it and the page is composed again.
3. **Given** any page, **When** a visitor looks for a rating, a score or a sentiment-based ordering, **Then** none exists.
4. **Given** an English translation, **When** it is shown, **Then** it is labelled machine translation until a human confirms it, and the original is one tap away.

---

### User Story 4 - Cross the language gap in both directions (Priority: P2)

An English-speaking visitor leaves a note about a place and the owner reads it in Japanese; the owner's reply goes back in English. The owner can list topics they love to talk about, and visitors can show the owner a short bilingual card from a phrase-card library (for example asking about vegetarian options).

**Why this priority**: It closes the language barrier that motivated the product, but the core pages work without it.

**Independent Test**: As a mock visitor, leave an English note; as the mock owner, see it in Japanese and reply; verify the reply is shown to the visitor in English and both are labelled machine translation.

**Acceptance Scenarios**:

1. **Given** a visitor note in English, **When** the owner opens it, **Then** it is shown in Japanese, labelled as machine translation, with the original available.
2. **Given** an owner's list of topics, **When** a visitor views the place, **Then** the topics appear in both languages as conversation starters.
3. **Given** the phrase-card library, **When** a visitor opens a card, **Then** it displays the phrase in Japanese and English, and a card that no Japanese speaker has reviewed yet is labelled unreviewed.

---

### User Story 5 - Show what is possible before any owner has agreed (Priority: P1)

A steward shows the programme team and individual owners what the product can do. Landmark pages built from openly licensed sources and creators' consented posts are real. A clearly labelled fictional demo place with a mock owner runs the whole interview-to-page flow. Real business pages stay as private drafts that only stewards, that place's verified owner and the creator who made them can see.

**Why this priority**: Owners cannot be asked for consent without a picture of what they are agreeing to. It is also the purpose of the first MVP: a show-and-tell prototype for the programme team.

**Independent Test**: As a steward, open a landmark page, run the mock walkthrough, and open a draft preview of a real business. Verify mock items show a Demo marker, drafts are invisible to everyone except stewards, the place's verified owner and the creator who made it, and none of it is counted in statistics.

**Acceptance Scenarios**:

1. **Given** any mock record, **When** it is displayed, **Then** it carries a visible Demo marker and is excluded from every statistic and export of real data.
2. **Given** a draft page for a real business, **When** anyone other than a steward, that place's verified owner or the creator who made it, or a search engine, requests it, **Then** it is not available.
3. **Given** a draft preview, **When** a steward shows it to the owner, **Then** it contains only public facts and consenting creators' posts, with no claims about the business.
4. **Given** a demo environment, **When** a presenter signs in with the mock account for each role (user, creator, business owner, steward), **Then** each role's tasks can be done end to end and every mock account is labelled Demo.
5. **Given** the public demo, **When** a visitor who is not signed in opens it, **Then** they can read the landmark pages and the labelled mock walkthrough, cannot sign up, see no draft or real person's data, and search engines are told not to index it.

---

### User Story 6 - Creators and owners see the traffic sent to them (Priority: P2)

A creator or owner sees how many people followed links from Noren to their original posts or pages, as totals only.

**Why this priority**: It is the value promised back to creators, but it can follow the core pages.

**Independent Test**: Follow three links as a test visitor and verify the creator sees a count of three, with no personal details, and mock activity is excluded.

**Acceptance Scenarios**:

1. **Given** a creator's linked post, **When** visitors follow the link to the original, **Then** the creator's view shows a total count and nothing identifying the visitors.
2. **Given** mock-user activity, **When** counts are computed, **Then** it is excluded.

---

### User Story 7 - Take something down or withdraw (Priority: P3)

Anyone can ask for content to be removed through a public form in Japanese or English. The request is acknowledged, privacy or minor-related content is hidden immediately, a reasoned outcome is given, and an appeal is possible.

**Why this priority**: Required before any public launch; not needed for the first demo.

**Independent Test**: Submit a takedown request for a mock claim and walk it through acknowledgement, hide, outcome and appeal.

**Acceptance Scenarios**:

1. **Given** a takedown request that mentions privacy or a minor, **When** it is received, **Then** the content is hidden immediately pending review.
2. **Given** any takedown request, **When** it is decided, **Then** the requester receives a reasoned outcome and can appeal.

---

### User Story 8 - Live bilingual captions during an interview (Priority: P3, stretch)

During an in-person interview, an interviewer sees the owner's speech as Japanese text with an English version appearing within a few seconds.

**Why this priority**: Valuable but not required for the MVP; recording and post-hoc transcription already deliver the core flow.

**Independent Test**: Speak a short Japanese passage near the device and verify captions in both languages appear within the target delay.

**Acceptance Scenarios**:

1. **Given** an interview in progress whose recorded consent covers AI processing and transfer abroad, **When** the owner speaks, **Then** bilingual captions appear in near-real time, and the final record is still the human-corrected transcript.
2. **Given** an interview without that consent, **When** live captions are requested, **Then** no audio is sent for processing.

---

### User Story 9 - Operate and adapt the product (Priority: P3)

A steward can see what moderation actions and AI edits happened, an administrator can define a second region with different languages and a different caution vocabulary, and everyone can use the product with a keyboard or without seeing the map.

**Why this priority**: These are operating basics that protect trust and let the product travel, but they do not change the first demo.

**Independent Test**: Review the audit log after one moderation action and one AI edit; define a second region and check its settings apply; use a page with only a keyboard and the list view.

**Acceptance Scenarios**:

1. **Given** a moderation action or an AI edit, **When** a steward opens the audit log, **Then** the action, who or what did it, when, and what changed are listed.
2. **Given** a new region defined with its own languages, map area and caution vocabulary, **When** it is switched on, **Then** its pages use those settings with no change to the rest of the product.
3. **Given** any page, **When** a person uses only a keyboard or a screen reader, **Then** every place can be reached through the list view, and images and audio have text alternatives.

---

### Edge Cases

- A source post is deleted, made private, or moved: the entry is hidden and nothing copied remains.
- An owner withdraws consent after publication: everything derived from the interview is hidden everywhere, including footnotes pointing to it.
- The transcript gets a business or place name wrong: the person correcting can fix it, and the corrected name is what claims use.
- Two interviews or notes disagree: the page says accounts differ and does not pick a winner. A steward marks the claims as disputed; both stay visible and cited.
- The same place is pinned twice: a steward can merge duplicates without losing sources.
- The owner cannot be reached or cannot use a screen: a steward can run the confirmation in person, recorded as such.
- A visitor note contains personal information or a minor's details: it is held for review before the owner sees it.
- A caution is proposed by a new account: it is rejected until a named author and the owner's confirmation exist.
- A regional dialect or noisy shop lowers transcript accuracy: a person must correct it before claims are proposed.
- Machine translation of a proper noun or culturally loaded term looks wrong: it is flagged for review rather than silently shown.
- A translation service is unavailable: the original language is still shown and the translation is marked pending.

## Requirements *(mandatory)*

### Functional Requirements

**Places and sources**

- **FR-001**: Creators MUST be able to create a place by searching or by placing a pin on a map; the person-placed pin MUST be the authoritative location.
- **FR-002**: A place MUST hold names in several scripts (for example kanji, kana, romaji and English), each confirmed by a person.
- **FR-003**: Names or coordinates suggested by outside providers MUST be labelled as suggestions with their source and MUST NOT overwrite a person-placed pin.
- **FR-004**: Creators MUST be able to attach a public post by pasting its URL; the post MUST be displayed through the originating platform's own embed with the author credit adjacent and a link to the original.
- **FR-005**: For unsupported URLs the system MUST offer a link card using a title the creator types.
- **FR-006**: The system MUST store only a post's URL, platform, author link, date and the creator's note, and MUST NOT store, summarise or analyse the content of the post.
- **FR-007**: The system MUST periodically check each source and hide entries whose original no longer exists.

**Interviews, claims and consent**

- **FR-008**: The system MUST refuse an interview upload, and any streaming of interview audio to an AI service, without a recorded consent covering publication, AI processing, transfer abroad and voice retention, and MUST keep the consent text version with the record.
- **FR-009**: The system MUST produce a transcript in the language spoken and MUST let a person correct it; the corrected transcript MUST be the authoritative record.
- **FR-010**: The system MUST propose claims only from corrected transcripts, creator-typed notes and openly licensed text, each tied to a quoted source span, and MUST NOT create a claim without one.
- **FR-011**: Owners MUST be able to confirm, edit or remove each proposed claim in their own language, and only owner-confirmed claims about a business MUST be publishable.
- **FR-012**: Cautions MUST come from the region's fixed vocabulary (closed days or irregular hours; cash only; reservation required; English menu or English spoken; small space or limited seats; owner asks for no photography; steps or accessibility; seasonal availability), MUST have a named author, and MUST be owner-confirmed before they appear.
- **FR-013**: Withdrawing consent MUST hide the interview's recording, transcript, claims and every sentence that cites them.

**Place pages and language**

- **FR-014**: A place page MUST be composed only from published claims (including claims a steward has marked disputed, shown as differing accounts) and openly licensed text, and every sentence MUST carry a footnote to its source claim; a sentence without a source MUST be withheld and marked held (the compose result lists it). Nobody can approve or edit a held sentence into the page: it returns only when a published claim supports it and the page is composed again (owner decision 2026-10-30, replacing a steward review queue that would have let an unsourced sentence be published).
- **FR-015**: The system MUST NOT display or compute ratings, stars, scores or sentiment-based labels or ordering anywhere.
- **FR-016**: Text MUST be shown in its original language beside a translation that is labelled machine translation until a person confirms it.
- **FR-017**: Visitor notes and owner replies MUST be shown to the other party in their language, labelled machine translation, with the original available.
- **FR-018**: Owners MUST be able to list conversation topics, shown in both languages, and the system MUST offer a small library of bilingual phrase cards, each labelled unreviewed until a Japanese speaker has reviewed it.
- **FR-019**: AI-assisted text MUST be labelled as such.

**Roles, visibility and demo**

- **FR-020**: The system MUST use accounts with four roles: user (a visitor: reads published pages and leaves notes), creator (creates places, attaches posts and runs interviews, tied to a public profile), business owner (confirms, edits or removes claims about their own place, replies to notes and sets conversation topics) and steward (verifies creators and owners, moderates, handles takedowns and manages region settings, and may do everything a creator can, for example to seed landmark pages). The creator and business-owner roles MUST be granted by a steward after verification, and new accounts MUST NOT be able to add cautions.
- **FR-021**: In the pilot, accounts MUST be invite-only (an account can be created only with a steward's invitation), draft pages MUST be visible only to stewards, to the verified business owner of that place and to the creator who made it, and every page MUST be hidden from search engines.
- **FR-022**: Every mock record MUST be flagged, display a visible Demo marker, and be excluded from all statistics and from any export of real data.
- **FR-023**: Seed places listed from open data MAY be shown before a person checks them, labelled as in FR-030 (constitution 2.0.0, principle II); openly licensed data MUST be kept separate by licence and attributed. Openly licensed text about a place with no business owner MAY be published only after a steward approves it, with its licence and attribution shown.

**Traffic, takedown and operations**

- **FR-024**: Links from the product to an original MUST be counted, and creators and owners MUST see totals only with no information identifying visitors.
- **FR-025**: A public takedown and withdrawal form in Japanese and English MUST exist, with acknowledgement, immediate hiding for privacy or minors, a reasoned outcome, and appeal.
- **FR-026**: The system MUST keep an audit log of moderation actions and AI edits.
- **FR-027**: Region-specific settings (languages, map area, enabled platforms, caution vocabulary, consent text, minimum age, retention, takedown contact) MUST be configuration, so a new region needs no change to core behaviour.
- **FR-028**: Every page MUST offer a list view as an alternative to the map and MUST be usable by keyboard with text alternatives for images and audio.
- **FR-029**: A public, read-only demo MUST be available that shows only mock content, openly licensed content and posts whose creators have agreed (a steward records each agreement, even for a mock place), requires no sign-up, never shows a real business draft or any real person's data, and carries a short notice in Japanese and English that its pages load third-party embeds.
- **FR-030** (added 2026-10-31, owner): A place listed from open data that no person has checked MUST show "Not yet confirmed" (未確認) on its page and in the list, with a way to reach the data page that credits its source and licence. Any signed-in member MAY say "Still here", which records who and when and shows "Confirmed in person" instead; a confirmation older than 12 months MUST say so. Any signed-in member MAY report that something is wrong (closed or gone, in a different place, wrong name or details, or something else, with an optional note); a report changes nothing in public until a steward keeps the place or hides it, and the steward MUST see open reports in one list. A place a person placed the pin for counts as confirmed when it is made. Confirmations MUST NOT be counted or ranked (FR-015).
- **FR-031** (added 2026-10-31, owner): The map MUST list places worth a visit, not errands. A listing from open data is left off when it is a shop whose type is not on the region's visit list (convenience stores, supermarkets, phone shops and the like) or a chain shop, restaurant, café or bar; places to stay, museums and sights stay. A listing already on the map that fails the rule is taken off it as a draft marked with the reason, which keeps it off the map for stewards too; a steward can put any such place back. The same mark applies when a steward upholds a report (FR-030). User-facing copy MUST NOT name the data providers except where their licence requires it (the map's corner credit); they are credited on the data page.

### Key Entities *(include if feature involves data)*

- **Region**: A configured area with its languages, map area, enabled platforms, caution vocabulary, consent text version, minimum age, retention rules and takedown contact.
- **Place**: A real place in a region, with names in several scripts and one person-placed pin, plus optional pointers to outside identifiers.
- **Source**: A reference to a public post or page about a place: URL, platform, author link, date, the creator's note, and a status (live, gone, hidden).
- **Interview**: A recorded conversation with an owner about a place, linked to a consent record and a transcript.
- **Consent**: What the owner agreed to (publication, AI processing, transfer abroad, voice retention), the text version shown, and any withdrawal.
- **Transcript**: The words spoken, with timing and speakers, machine-made first and then person-corrected.
- **Claim**: One statement about a place with its original language, its translations, its kind (story, caution, fact), its source span, its author and its status (proposed, owner-confirmed, published, disputed, hidden).
- **Place page**: The reader-facing rendering of published claims, each sentence pointing to its claim.
- **Person and role**: An account with one role (user, creator, business owner or steward); creators are tied to a public profile; mock users are flagged.
- **Link count**: A total of how often readers followed a link to an original, per source.
- **Takedown request**: A removal or withdrawal request with its reason, status and outcome.
- **Place check**: One person saying a place is still there, or reporting what is wrong with it (the kind of problem and an optional note), with when, and for a report the steward's outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of first-time creators can pin a real place and attach a public post in under 3 minutes.
- **SC-002**: Within 1 hour of uploading a 30-minute interview, the owner or a steward can review proposed claims in the language spoken.
- **SC-003**: 100% of sentences on every published place page have at least one footnote to a published claim or an attributed open-licence source (zero unsourced sentences, checked automatically).
- **SC-004**: 100% of published claims about a business have been confirmed by its owner.
- **SC-005**: A full audit of the product finds zero ratings, scores or sentiment-based labels or orderings.
- **SC-006**: 100% of mock records show the Demo marker and 0 appear in any statistic or export of real data.
- **SC-007**: A Japanese-speaking reviewer judges at least 90% of English translations of a sample of 30 owner-confirmed claims acceptable.
- **SC-008**: Every takedown request is acknowledged within 24 hours and given a reasoned outcome within 7 days.
- **SC-009**: At the programme demo, a signed-out visitor can browse a map and a list of at least 30 real local places in both languages (at least 5 of them cafes or bars), each credited to its open-data source, and can read one complete, clearly labelled mock walkthrough of an owner-confirmed story; no real person's story appears unless they confirmed it. (Restated 2026-10-30, owner approved.)
- **SC-010**: A first-time visitor reaches a place page and the mock walkthrough within 30 seconds without signing up. (Restated 2026-10-30, owner approved.)

## Assumptions

- The pilot is invite-only: a steward invites each person and grants the creator and business-owner roles after verifying them. Owners can also be helped in person by a steward.
- The product is used mostly on phones, so layouts are phone-first and also work on larger screens.
- The interface is available in Japanese and English; other languages come later through region configuration.
- The first region is Nagasaki; sites such as the Spectacles Bridge and Hashima are possible landmark pages, subject to the seed pull.
- Interviews are about shops and places. Testimonies about health, atomic-bomb survivor status or similar sensitive topics are not accepted in the MVP; interviewers pause and a steward decides.
- Nothing about a real business is published until its owner agrees; before that, only draft previews of public facts exist, visible to stewards, the place's verified owner and the creator who made the place.
- The first MVP is a lightweight working app, not a mock-up, shown to the programme team in about two weeks: landmark pages, creators' consented posts and a labelled mock-owner walkthrough in both languages, using dummy (mock) accounts for every role. A promotional video recorded against it is made separately. Real owner interviews are not needed for it.
- Named volunteer Japanese speakers (still to be asked) review phrase cards and a sample of translations. Review never blocks shipping: text not yet reviewed stays labelled as unreviewed machine translation.
- The public demo holds no real person's personal data. The project owner is the working operator named on its notice.
- The operator of record (named legal party) is not yet decided; the working assumption for the pilot is the project owner. This blocks publishing real people's stories, not the build.
- The numeric targets in the Success Criteria are proposals to be confirmed during clarification.
- Technology, hosting and vendors are chosen in the plan, using `research/` as evidence.
- Live bilingual captions (User Story 8) are a stretch goal and may be delivered as near-live captions first.
- The AI walking companion (working name Backlane) is out of scope for the MVP; see `SPEC.md` section 15.
- Also out of scope for the MVP: scraping or bulk collection of platform content, capacity controls for owners, native apps, paid plans, a public API or federation, chat-style Q&A over pages, and any rating or ranking by sentiment.
