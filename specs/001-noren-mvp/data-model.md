# Data Model: Noren MVP

Logical model derived from the spec's Key Entities. Types are indicative; names are stable. It is realised as Convex tables (research D19): "table" below means a Convex table and "row" a document; "unique", "check" and "constraint" rules are enforced by the write gate's triggers and indexed reads inside each mutation, not by the database engine. Every table carries `created_at`. `region_id` is a text key checked against the loaded region config (no region table). Convex names tables and fields in camelCase (`clerk_user_id` is `clerkUserId`, `place_owner` is `placeOwner`), and `created_at` is Convex's own `_creationTime`. Rows created by a mock person set `is_mock = true`, and every statistic and every export filters on it (FR-022).

## Enumerations

- `role`: user, creator, business_owner, steward
- `visibility`: draft, demo_public, pilot
- `source_status`: live, gone, hidden
- `claim_kind`: story, caution, fact, topic
- `claim_origin`: interview, creator_note, open_text
- `claim_status`: proposed, owner_confirmed, published, disputed, hidden
- `translation_origin`: machine, human
- `interview_status`: consent_pending, uploaded, transcribing, transcript_ready, correcting, claims_proposed, owner_review, done, withdrawn
- `check_verdict`: still_here, something_wrong
- `check_problem`: closed, moved, details, other
- `check_outcome`: kept, hidden
- `licence`: CC0, CC-BY-4.0, CC-BY-SA-4.0, PDL-1.0, ODbL-1.0, CDLA-Permissive-2.0

## Tables

### person
`id`, `token_identifier` (unique, the canonical key from the verified Clerk token), `clerk_user_id`, `role`, `display_name`, `public_profile_url` (creators), `verified_at`, `verified_by`, `is_mock`.
Created on a person's first sign-in with role `user`. The Clerk user ID comes from the verified token; the role lives only here and only a steward changes it (research D2, D19).

### place_owner
`place_id`, `person_id`, `verified_by`, `verified_at`. Links a business owner to the one place they may confirm. Unique per pair.

### place
`id`, `region_id`, `slug` (unique per region), `visibility`, `created_by`, `confirmed_at`, `confirmed_by`, `is_mock`.
A real place or a labelled mock place. Visibility `draft` for real businesses until the owner agrees. A draft is readable only by stewards, the place's verified owner and the place's creator (`created_by`).
`confirmed_at`/`confirmed_by` record the last person who said in person that the place is there: set when a person places the pin or says "Still here", never by an import or a steward's desk approval. Unset shows "Not yet confirmed"; older than 12 months shows as such (FR-030).

### place_check
`place_id`, `region_id`, `person_id`, `verdict`, `problem` (reports only), `note` (reports only, at most 500 characters), `reviewed_by`, `reviewed_at`, `outcome` (the three set together, reports only), `is_mock`.
One "Still here" or one "Something's wrong" report (FR-030). Never counted into a score (SC-005).

### place_name
`place_id`, `lang`, `script` (kanji, kana, romaji, latin), `value`, `confirmed_by`, `is_primary`.
At least one confirmed name before a place can leave `draft`.

### pin
`place_id` (unique), `lat`, `lng`, `placed_by`, `placed_at`. The authoritative location (FR-001).

### place_external_ref
`place_id`, `provider` (osm, wikidata, google_place_id, overture, mlit), `ref`, `licence`, `attribution`, `retrieved_at`.
Pointers only; never truth (FR-003). OSM-derived rows are kept apart in `seed_osm_candidate` (ODbL) and are never merged into other tables.

### seed_osm_candidate
`id`, `region_id`, `osm_type`, `osm_id`, `tags` (jsonb), `lat`, `lng`, `licence` (ODbL-1.0), `confirmed_place_id` (null until a person confirms).

### open_text_snippet
`id`, `place_id` (null until a steward links the snippet to a confirmed place), `lang`, `text`, `licence`, `source_url`, `attribution`, `revision_ref`, `retrieved_at`, `approved_by`.
Openly licensed text (Wikipedia, tourism database). Approved snippets feed `claim` with origin `open_text`. CC BY-SA content stays in this table, apart from ODbL data.

### source
`id`, `place_id`, `platform`, `adapter`, `url`, `canonical_url`, `author_handle`, `author_url`, `posted_at` (nullable), `creator_note`, `note_lang`, `added_by`, `status`, `last_checked_at`, `demo_consent_at` (nullable), `demo_consent_by` (nullable), `is_mock`.
Stores no captions, images or post content (FR-006). `demo_consent_at` is set by a steward, who records `demo_consent_by`, once the post's author has agreed to appear in the public demo. A source without it is never shown to the public, whether or not the place or the person who added it is mock (FR-029).

### interview
`id`, `place_id`, `interviewer_id`, `owner_person_id` (nullable), `language`, `audio_pathname` (private store, nullable), `duration_s`, `status`, `is_mock`.

### consent
`id`, `interview_id`, `scope` (jsonb: publish, ai_processing, transfer_abroad, voice_retention), `text_version`, `text_lang`, `recorded_at`, `recorded_by`, `assisted` (steward recorded it in person), `withdrawn_at`.
An interview cannot reach `uploaded` without a consent row covering all four scopes (FR-008).

### transcript
`id`, `interview_id`, `version`, `lang`, `origin` (machine or human_corrected), `model_version`, `segments` (jsonb: start, end, speaker, text), `created_by`.
The latest `human_corrected` version is the record of truth (FR-009).

### claim
`id`, `place_id`, `kind`, `caution_type` (key from the region vocabulary, caution only), `text_original`, `lang_original`, `origin`, `source_transcript_id`, `span_start`, `span_end`, `quote`, `source_open_text_id`, `author_id`, `status`, `reviewer_id`, `model_version`, `confirmed_at`, `disputed_with` (claim id, nullable), `is_mock`.
Rules: origin `interview` requires a `human_corrected` transcript version, a span and a quote (FR-010); a caution requires an author, a vocabulary key and owner confirmation (FR-012); `published` or `disputed` requires `owner_confirmed`, or origin `open_text` approved by a steward for a place that has no `place_owner` row (constitution III); the consent for the source interview must not be withdrawn.

### claim_translation
`claim_id`, `lang`, `text`, `origin`, `model_version`, `reviewed_by`, `reviewed_at`. Unreviewed rows display the unreviewed label (FR-016).

### page_version
`id`, `place_id`, `version`, `generated_by` (model version), `reviewed_by`, `status` (held, published).

### page_sentence
`id`, `page_version_id`, `ordinal`, `lang`, `text`, `held` (bool), `claim_ids` (the claims it cites).
A sentence that is not held cites at least one claim, every cited claim is about the page's place, and each is published or disputed; this is checked when the sentence is written (SC-003). Held when any cited claim is neither published nor disputed, or the grounding gate fails (FR-014).

### sentence_claim
Replaced by `page_sentence.claim_ids` under Convex (research D19): a join table could not enforce "at least one citation" at write time. To find the sentences that cite a claim, read the sentences of that place's page versions.

### note
`id`, `place_id`, `parent_id` (reply), `author_person_id`, `body`, `lang`, `status` (new, held, visible, hidden), `is_mock`.
Visitor notes and owner replies (FR-017). Notes with personal information are held for review.

### note_translation
`note_id`, `lang`, `text`, `origin`, `model_version`.

### phrase_card
`id`, `region_id`, `key`, `text_ja`, `text_en`, `reviewed_by`, `reviewed_at`. Cards without a reviewer show the unreviewed label (FR-018).

### link_count_daily
`source_id`, `day`, `count`, `is_mock`. Totals only; no IP address or cookie (FR-024).

### takedown_request
`id`, `target_type`, `target_id`, `reason`, `privacy_or_minor` (bool), `requester_contact`, `status` (received, hidden, decided, appealed, closed), `outcome`, `received_at`, `acknowledged_at`, `decided_at`.

### audit_log
`id`, `actor_kind` (person, ai, system), `actor_person_id`, `action`, `target_type`, `target_id`, `diff` (jsonb), `model_version` (FR-026). The time of an entry is its creation time.

## Relationships

- person (creator) 1..n place via `created_by`; person (business_owner) 1..1 place via `place_owner`.
- place 1..n place_name, place_check, source, interview, claim, note, page_version; place 1..1 pin.
- interview 1..1 consent, 1..n transcript; interview 1..n claim (origin interview).
- claim 1..n claim_translation; page_sentence n..n claim via `claim_ids`.
- source 1..n link_count_daily.

## State transitions

**Claim**: proposed -> owner_confirmed -> published. Any state -> hidden (takedown, consent withdrawal, owner removal). published -> disputed when a steward marks two published claims as conflicting (each points to the other through `disputed_with`); both stay citable, the page says accounts differ, and neither is hidden. Attaching a verified owner to a place returns that place's `open_text` claims to `proposed`, so the owner decides.

**Interview**: consent_pending -> uploaded -> transcribing -> transcript_ready -> correcting -> claims_proposed -> owner_review -> done. Any state -> withdrawn, which hides the audio, transcript, claims and every sentence citing them.

**Place check**: a report is open until a steward records `kept` (nothing changes) or `hidden` (the place returns to `draft`). One open report per person and place; sending again replaces it. A person's second "Still here" within a day records nothing.

**Place visibility**: draft -> demo_public (mock or open-licensed content only) or pilot (after the owner agrees). Changing a real business out of `draft` requires a steward and a recorded owner agreement.

## Invariants checked in tests

1. No table, column or view holds a rating, score or sentiment value (SC-005).
2. Every row created by a mock person has `is_mock = true`; `link_count_daily` and all exports exclude them (SC-006).
3. A non-held sentence has at least one entry in `claim_ids`, each a published or disputed claim about the same place (SC-003).
4. A published or disputed claim about a place that has a business owner has `owner_confirmed` history (SC-004), and `open_text` claims exist only on places with no owner.
5. A `demo_public` place shows no draft data, every source shown to the public has `demo_consent_at`, and every other row shown to the public is mock or openly licensed (FR-029).
