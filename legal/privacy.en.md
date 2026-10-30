DRAFT, not legal advice, not yet in force — 2026-10-30

# Noren privacy notice

For owner, Japanese-language and legal review. The matching Japanese draft has not yet been reviewed by a Japanese speaker. This draft describes the repository as checked on this date, not a certification of the deployed service or its providers. Unresolved items must be settled before it is used to obtain consent.

## 1. Operator and contact

The operator is **Noren, an open-source project run by Yee Fei**. Noren is a free bilingual directory of Nagasaki places and their stories. Contact us through [the takedown form](https://noren.yooi.me/takedown). You do not need an account to use it.

[OWNER DECIDES: OD-01 — Confirm the responsible legal person, location and address. Options: the named individual or an identified legal entity. Recommendation: confirm the named individual's particulars and make the required APPI Article 32 information available, including the address; none has been supplied for this draft.]

## 2. What we use information for, by person

### 2.1. Visitors

You can read public pages without an account. Hosting, authentication components and map providers receive the network requests needed to serve them, which can reveal an IP address, browser information and requested resource. Noren has no integrated analytics service. Its database has no visitor browsing-history or per-visitor click table. A daily link-count table can hold source, day and total only; a working counting redirect was not found in the current app.

If you choose “locate”, your browser asks permission for your position. The current directory uses it in browser memory to calculate distances; it is not saved to Convex. Map tile requests can still reveal the area viewed to the tile provider. Place-name filtering on the public directory is local to your browser. Creator place lookup is different (clause 5).

If you sign in and submit a note, the schema can hold your account link, text, language, place, reply relationship, moderation state and translation. The schema's capacity does not mean every notes feature is deployed. See clause 13 for the full stored-data inventory.

### 2.2. Creators

We use a Clerk account identifier and verified-token identity key, display name, role, optional public profile and verification record to sign you in, authorise your work and credit it. Clerk separately handles account and sign-in contact details and session information under its configured account service; Noren's `person` table has no email or phone field.

Your contributions can include place names, pins, source links and author handles, link-card titles, your notes, recordings, transcript corrections, statements and translations. We keep attribution, approval and processing history to show where information came from and to handle disputes. Publicly cleared contributions and credits may be read by anyone. Never include another person's private data without consent.

### 2.3. Business owners interviewed

We use your link to a verified place, interview language and recording, transcript words with timing and optional speaker labels, proposed statements and quotations, corrections, approvals, translations and consent record to prepare your story and let you control it. A recording's storage metadata includes its identifier, creation time, size, type and checksum. We do not implement voiceprints or biometric speaker identification.

Consent records include all four scopes, text version and language, recording time, who recorded consent, assisted-consent status and any withdrawal time. Only confirmed statements can be published as your story. Public story text and its source footnotes may identify you; the raw recording and full transcript are not offered as public visitor content. The interviewer, verified owner and stewards have controlled workspace access.

### 2.4. Stewards and named reviewers

We use your account, role, verification links and action history to manage permissions, verify owners and creators, moderate content and respond to requests. A reviewer name and review time can accompany a translation or phrase card. Audit entries can identify the actor and record changed text as well as states, identifiers and model versions. Those records are personal data when linked to an individual.

### 2.5. People asking for removal or exercising rights

We use the submitted page address or resolved target, reasons, privacy/minor flag, optional contact, chosen language, receipt code, times, decision, appeal note and any prior visibility to handle and review your request. The form does not require a name, account or contact detail. Do not send identity documents or unrelated sensitive details. The contact field is cleared when a request is closed; reasons and appeal text remain. Anyone holding the receipt code can see status, times and the written outcome, so keep it private and keep outcomes free of personal details.

## 3. Sources and public information

Information comes from you, a consenting interviewee, a steward, openly licensed sources, and metadata supplied with a public-post link. OpenStreetMap tags, place names, source credits and public profiles can identify sole traders or other people even when they are already public. We use these to identify and attribute places and sources, not to build personal profiles.

For a linked post, Noren stores reference information and the contributor's own title or note, not a copy of the original post's image, caption or body. It does not summarise or run AI over third-party posts. Official embeds fetch from their originating platforms when you choose to load them. Records marked mock are labelled Demo.

## 4. Purposes, permission and consent

This notice states the purposes of collection for an APPI-oriented service: account access, contributions, consented story preparation and publication, attribution, moderation, requests and security. APPI does not use the GDPR's list of legal bases; we do not describe a generic “legitimate interest” as permission for everything.

Interview processing requires recorded agreement to publication, AI processing, transfer abroad and voice retention before upload or AI processing. All four are required by the current flow; if you decline, the interview cannot proceed through it. A typed transcript avoids sending audio for transcription, but does not remove the consent requirement for the interview or subsequent AI text processing. An interviewer records the agreement; only a steward can mark it as assisted in person. Signing in is not interview consent. Reading this draft is not consent.

Contribution processing also needs the rights covered by the creator licence. Use and disclosure outside the stated purposes, special-care information and foreign transfers require the permissions or exceptions applicable under law. The MVP does not accept health or similarly sensitive testimony and has no separate special-care consent field.

## 5. Who receives information

We use these services for the stated tasks. “United States” for Clerk and the AI providers is the destination declared in `draft-1`, not proof that all processing or support stays there.

| Recipient                                         | Information and task                                                                                                     | Declared or recorded location                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk                                             | Account, authentication and session data; sign-in and verified identity for Noren                                        | United States; full processing and support locations need confirmation.                                                                             |
| Convex                                            | The database information in clause 13 and stored interview audio; backend processing                                     | Production database/audio storage recorded as Sydney, Australia.                                                                                    |
| Vercel hosting                                    | Requests, URLs, network metadata and data carried through hosted pages or web handlers                                   | Functions pinned to Tokyo, Japan (`hnd1`); the research records an ingress edge in Singapore. This is not a guarantee of all edge or log locations. |
| OpenAI, if selected as the transcription provider | Consented audio, language and potentially place-name vocabulary and duration to make a transcript                        | United States as declared in the consent; the configured compatible endpoint may instead belong to another operator.                                |
| Anthropic, for the stated text workflow           | Corrected transcript, permitted statement text, language and place-name context for proposed statements and translations | United States as declared in the consent; actual models and routing depend on configuration.                                                        |
| Vercel AI Gateway, when selected                  | Audio or text requests, context and outputs routed between Noren and the selected AI provider                            | Vercel is a US provider; the Gateway's actual processing, log and onward-transfer countries are not established by the repo.                        |

The code accepts `vendor/model` language-model IDs through Vercel AI Gateway, or a slashless Anthropic model ID directly. Transcription can use Gateway or a configurable OpenAI-compatible HTTPS endpoint. “OpenAI-compatible” describes an API format, not the company receiving the data. Gateway can select other vendors. A country list naming only OpenAI and Anthropic cannot authorise an unidentified replacement.

Public readers receive cleared stories, public place facts, source references and credits. Authorised interview participants and stewards receive private workspace material for their roles. Disclosure in response to a lawful court order or another applicable legal requirement must be assessed separately; the repo does not establish a complete disclosure-request procedure.

Other external connections are:

- **OpenFreeMap**: your browser requests map styles, tiles and related resources for map display; this reveals network metadata and viewed tile areas.
- **Nominatim / OpenStreetMap service**: a creator's submitted place-search words, region bounds and language preferences are sent through Noren's server, with the server's project identifier. Successful results and search keys have an in-memory cache of up to 24 hours. Do not search for private personal details.
- **Google Maps**: resolving a creator-pasted Maps link sends that link from the server to allowed Google hosts to follow redirects. The code reads headers and URL text and cancels the page body; it does not fetch reviews for AI.
- **Meta (Instagram, Facebook, Threads), YouTube, X and TikTok**: a requested embed can send browser/network data and may use the platform's cookies. Following an external link also contacts the destination. These platforms apply their own policies.
- **Clerk security integrations**: source policy allows Clerk Protect and Cloudflare challenge hosts. Which challenges run, what they collect and where they process it require a configured-service check; an allowed host alone is not evidence that it loads.

[OWNER DECIDES: OD-15 — Complete the external-transmission and cookie inventory. Options: verify and disclose each enabled connection, or disable connections that cannot be described. Recommendation: verify recipient legal names, data, purposes, cookies, countries and onward transfers for maps, lookup services, embeds and Clerk security features; complete the Japanese external-transmission notice before launch. The repo does not establish all of these countries.]

## 6. Transfers outside Japan and country protections

The known foreign destinations are **Australia**, **Singapore** and the **United States**. Japan is the configured function location and is not a foreign transfer for a person in Japan. Sydney storage does not mean all providers, support access or AI stay in Australia.

For consent-based transfers under APPI Article 28, explain the destination country, its personal-information system and the recipient's protective measures before asking for agreement. Country summaries alone do not complete that disclosure. The [PPC's explanation](https://www.ppc.go.jp/all_faq_index/faq2-q5-8/) describes these three elements. The following summaries are starting information, not claims of Japanese-equivalent protection or provider certification.

### 6.1. United States

The United States has sector-specific federal laws rather than one comprehensive federal private-sector privacy law. State laws can add rights and duties; which apply depends on the person, business and processing. The FTC can act against unfair or deceptive practices, but that is not the same as universal APPI-style rights. The [PPC federal report](https://www.ppc.go.jp/files/pdf/USA_report.pdf) and [FTC privacy and security update](https://www.ftc.gov/system/files/ftc_gov/pdf/2024.03.21-PrivacyandDataSecurityUpdate-508.pdf) explain this structure. The PPC report is based on older research; provider-specific state-law coverage remains to be checked.

### 6.2. Australia

Australia has the Privacy Act 1988 and Australian Privacy Principles covering collection, use, security, access, correction and overseas disclosure for covered organisations. The OAIC oversees the regime. Coverage has exceptions, including many small businesses, so merely storing data in Sydney does not establish that every recipient is covered or that Japanese rights apply there. See the [OAIC's principles](https://www.oaic.gov.au/privacy/australian-privacy-principles) and [coverage explanation](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business).

### 6.3. Singapore

Singapore has a general private-sector Personal Data Protection Act, overseen by its Personal Data Protection Commission. It provides duties concerning purposes, consent, protection, retention, access and correction, and overseas transfers, subject to exceptions. Public-sector handling follows a different framework. An edge connection does not establish the legal coverage of every Vercel recipient. See the [PPC Singapore report](https://www.ppc.go.jp/files/pdf/singapore_report.pdf). That report is based on older research; its description needs a current check before operational consent use.

### 6.4. Recipient protections still to be supplied

The app checks interview consent and roles, separates private workspace data from public stories, and records consent and moderation history. Those are Noren controls, not proof of the foreign recipients' contractual measures. No signed processing terms, complete subprocessors list, provider retention settings, no-training commitment, zero-retention approval or equivalent-measures monitoring arrangement was verified in the repo. We cannot promise those protections here.

[OWNER DECIDES: OD-03 — Approve the actual transfer route and recipient safeguards for each service. Options: informed Article 28 consent using verified country and recipient information, or a documented equivalent-measures route with continuing checks if legally available. Recommendation: obtain a written recipient/country/data map and processing terms, verify no-training and retention conditions for AI, disable unassessed endpoints and Gateway vendors, and use reviewed informed consent before any real interview transfer. Include any country of operator/admin access, including Malaysia if applicable; the operator's access location is not established.]

## 7. Retention, withdrawal and deletion

The current Nagasaki setting is `audioDays: null`. It means deletion after transcript correction and completion of statement review, not zero days or a fixed number of days. The code deletes audio when owner review finishes with no proposed statements remaining across transcript versions. An unfinished interview may retain audio until review completes or consent is withdrawn. There is no age-based cleanup cron in the current code.

[OWNER DECIDES: OD-04 — Set the final audio rule and treatment of unfinished interviews. Options: keep event-based deletion or choose a fixed day limit with an implemented cleanup process. Recommendation: retain the present early deletion after review and add a 30-day review of stalled recordings, deleting them when no longer needed; this proposed review is not implemented. Do not promise a numerical deletion deadline until it is supported.]

The verified owner's withdrawal marks consent withdrawn, deletes the attached audio and clears its storage reference, hides the transcript in the workspace, hides derived claims and withholds story sentences citing them. Transcripts, quotations, translations, hidden sentences, consent and audit records are not all erased. Noren cannot recall an already sent AI request, copies already obtained by readers, or another platform's original. Provider deletion and backup expiry require separate verification.

When a takedown request is closed, its structured contact field is emptied. Reasons, appeal notes, outcome, code and times remain, including any personal details the requester typed into free text. Closing a request does not erase those texts. Rate-limit rows hold counts for fixed windows; they are not visitor IP records, and request-code keys can link to an appeal.

[OWNER DECIDES: OD-05 — Approve and implement retention limits for accounts, contributions, hidden interview text, consent, takedown and audit records, rate-limit rows, operational logs and backups. Options: a class-by-class schedule or indefinite retention; recommendation: reject indefinite retention, aim to resolve verified account/content deletion requests within 30 days, review closed-case evidence after one year, and keep a longer legal hold only where necessary and recorded. These are proposed review targets, not existing timers or a legal minimum.]

Deleting a Clerk account does not currently delete the Convex person row or contributions. A creator withdrawal and account-deletion procedure is still needed (OD-06, creator licence clause 6). Public place facts from an independent lawful source are separate from the withdrawn interview.

## 8. Your rights and how to ask

Subject to APPI's applicable conditions and exceptions, you may request disclosure of retained personal data and relevant third-party provision records, correction, addition or deletion of inaccurate data, cessation of use, erasure, and stopping third-party provision. You may withdraw interview consent at any time. These rights do not mean every record must automatically be erased in every case.

Use [the takedown form](https://noren.yooi.me/takedown); state the right you want to exercise and the relevant page or account. For an account-only request, give the home-page address. You may leave contact blank and save the receipt code to check the outcome. Identity verification and a secure way to return disclosed data will need a steward; the receipt code alone does not prove entitlement to another person's data. Do not send identification documents through the public form.

The region sets acknowledgement within 24 hours and a reasoned takedown decision within 7 days. The code gives an immediate receipt, and a privacy/minor flag immediately hides a matched public place; unmatched targets need manual investigation. These takedown times do not establish a statutory deadline for every disclosure request. Decided requests can be appealed using the code; closed requests currently require a new form submission for further review.

[OWNER DECIDES: OD-02 — Choose the privacy contact and rights procedure. Options: the existing form with a documented steward process, or a dedicated role contact/secure portal. Recommendation: retain the form as the public entry point, assign a responsible handler, use proportionate identity checks and secure delivery, state any lawful fees and reasons for refusal, and charge no fee by default. This manual disclosure/correction process is not yet documented in code.]

## 9. Security measures and limits

Clerk verifies sign-in tokens; Convex checks roles and place/interview access on the server. Ordinary account holders cannot assign their own role. Consent is checked before issuing an audio upload URL and before requesting interview AI processing. Private interview views check access before returning an audio URL. Treat that URL as confidential: the repo does not prove that every later download rechecks identity or that a copied URL expires on sign-out.

Writes use validated schemas and a transaction gate with content rules. The takedown form has a honeypot and global, place and appeal limits. The server restricts external-fetch destinations. Moderation and AI actions have audit records. Network service URLs use HTTPS. No voiceprint feature or behavioural analytics is implemented. Search-engine exclusion is requested through noindex metadata, response headers and robots rules; it is not an access-control or confidentiality guarantee.

The configured Content Security Policy is **report-only**, so it does not enforce browser blocking. The repo does not prove encryption at rest settings, backup recovery, staff access practices, complete access logs or a tested incident response process.

[OWNER DECIDES: OD-14 — Approve operational safeguards. Options: verify and document provider/storage protections and incident response before real data, or continue mock-only operation. Recommendation: remain mock-only for interviews until private audio-link handling, least-privilege administration, encryption, backups/deletion and APPI breach reporting/individual notification procedures have been checked. Do not advertise unverified security guarantees.]

## 10. Cookies, browser storage and analytics

Clerk uses session cookies for sign-in and session security. Blocking them can prevent signed-in features. The exact cookie names, durations and enabled Clerk security integrations have not been inventoried (OD-15). The public guide stores only a dismissed flag under `noren.guide.v1` in local storage; clearing site storage resets it.

There is **no analytics integration in the app code**. A schema for daily aggregate link totals is not behavioural tracking, and does not establish a running counting feature. Infrastructure and platform logs are separate; their settings and retention have not been verified.

Embedded posts wait for that post's load button; after loading, the platform can receive network data and set cookies. Map resources and account components can load without that post button. You may leave embeds unloaded and follow the original link instead. Third-party policies govern their handling; the button is not a complete consent system for every foreign transfer.

## 11. Minors and sensitive information

The configured minimum age is 16 and the interview form displays this rule. The database has no birth-date, age-verification, guardian-consent or special-care consent fields. Do not interpret the display as verified age. The recommended MVP policy is no under-16 accounts or interview subjects until a reviewed alternative is approved and implemented (OD-07).

Do not submit children's identifying details or sensitive testimony about health, survivor status or similar matters. If such material appears, pause processing and ask a steward; use the privacy/minor option on the form to report public material. This draft states a protective product rule, not a claim that every future under-16 statutory provision is already in force.

## 12. Changes

The final notice will carry a version and effective date. Material changes in purpose, recipients, countries or retention must be explained before the changed processing, with fresh consent where required. Publishing a replacement notice does not itself give new permission. The proposed notice method and timing remain OD-11 in the terms; the language choice remains OD-09. This draft has no effective date.

## 13. Stored-data inventory for reviewers

This inventory follows `convex/schema.ts` and its three imported table files, rather than the older logical model. Every document also has `_id` and `_creationTime`; optional fields may be absent. IDs link people, content and actions even when a row does not contain a name. Not every place or counter row is personal data, but it can become so when linked to a person. The descriptions above explain the purposes; the following lists the actual fields so a reviewer can check completeness.

| Table              | Fields and what they record                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person`           | `tokenIdentifier`, `clerkUserId`, `role`, `displayName`, `publicProfileUrl`, `verifiedAt`, `verifiedBy`, `isMock`: account, public identity and verification.                                                                                                                                                    |
| `place`            | `regionId`, `slug`, `kind`, `visibility`, `demoPublicBasis`, `category`, `createdBy`, `isMock`: place classification, publication state and contributor.                                                                                                                                                         |
| `placeOwner`       | `placeId`, `personId`, `verifiedBy`, `verifiedAt`: owner association and verification.                                                                                                                                                                                                                           |
| `placeName`        | `placeId`, `lang`, `script`, `value`, `confirmedBy`, `isPrimary`: names and their confirmation.                                                                                                                                                                                                                  |
| `pin`              | `placeId`, `lat`, `lng`, `placedBy`, `placedAt`: place coordinates and contributor, not a visitor's saved location.                                                                                                                                                                                              |
| `placeExternalRef` | `placeId`, `provider`, `ref`, `licence`, `attribution`, `retrievedAt`: external references and credits.                                                                                                                                                                                                          |
| `seedOsmCandidate` | `regionId`, `osmType`, `osmId`, `tags`, `lat`, `lng`, `licence`, `confirmedPlaceId`, `retrievedAt`, `osmVersion`, `osmTimestamp`, `category`, `dismissedAt`, `isChain`: OSM candidates and provenance; tags can contain identifying public facts.                                                                |
| `openTextSnippet`  | `placeId`, `lang`, `text`, `licence`, `sourceUrl`, `attribution`, `revisionRef`, `retrievedAt`, `approvedBy`: licensed text, credit and approval.                                                                                                                                                                |
| `source`           | `placeId`, `platform`, `adapter`, `url`, `canonicalUrl`, `title`, `authorHandle`, `authorUrl`, `postedAt`, `creatorNote`, `noteLang`, `addedBy`, `status`, `lastCheckedAt`, `demoConsentAt`, `demoConsentBy`, `isMock`: post references, contributor text and permission/check history.                          |
| `interview`        | `placeId`, `interviewerId`, `ownerPersonId`, `language`, `audioStorageId`, `durationS`, `status`, `processingError`, `isMock`: participants, recording reference and processing state.                                                                                                                           |
| `consent`          | `interviewId`, `scope` (`publish`, `aiProcessing`, `transferAbroad`, `voiceRetention`), `textVersion`, `textLang`, `recordedAt`, `recordedBy`, `assisted`, `withdrawnAt`: permission and withdrawal evidence.                                                                                                    |
| `transcript`       | `interviewId`, `version`, `lang`, `origin`, `modelVersion`, `segments` (each `start`, `end`, optional `speaker`, `text`), `createdBy`: spoken words, timing and corrections.                                                                                                                                     |
| `claim`            | `placeId`, `kind`, `cautionType`, `textOriginal`, `langOriginal`, `origin`, `sourceTranscriptId`, `spanStart`, `spanEnd`, `quote`, `sourceOpenTextId`, `authorId`, `status`, `reviewerId`, `modelVersion`, `confirmedAt`, `disputedWith`, `isMock`: statements, quotations, sources, approval and dispute links. |
| `claimTranslation` | `claimId`, `lang`, `text`, `origin`, `modelVersion`, `reviewedBy`, `reviewedAt`: translated statements and named review.                                                                                                                                                                                         |
| `pageVersion`      | `placeId`, `version`, `generatedBy`, `reviewedBy`, `status`: story version, model/composer and reviewer.                                                                                                                                                                                                         |
| `pageSentence`     | `pageVersionId`, `ordinal`, `lang`, `text`, `held`, `claimIds`: story text, withheld state and source citations.                                                                                                                                                                                                 |
| `note`             | `placeId`, `parentId`, `authorPersonId`, `body`, `lang`, `status`, `isMock`: visitor notes and replies.                                                                                                                                                                                                          |
| `noteTranslation`  | `noteId`, `lang`, `text`, `origin`, `modelVersion`: translated notes.                                                                                                                                                                                                                                            |
| `phraseCard`       | `regionId`, `key`, `textJa`, `textEn`, `reviewedBy`, `reviewedAt`: bilingual phrases and named review.                                                                                                                                                                                                           |
| `linkCountDaily`   | `sourceId`, `day`, `count`, `isMock`: daily totals only, with no visitor identifier.                                                                                                                                                                                                                             |
| `takedownRequest`  | `targetType`, `targetId`, `reason`, `privacyOrMinor`, `requesterContact`, `status`, `outcome`, `receivedAt`, `acknowledgedAt`, `decidedAt`, `code`, `locale`, `appealNote`, `appealedAt`, `hiddenPlaceId`, `previousVisibility`: requests, decisions, appeals and hiding history.                                |
| `rateLimit`        | `key`, `windowStart`, `count`: fixed-window abuse prevention; keys can include a place ID or appeal receipt code.                                                                                                                                                                                                |
| `auditLog`         | `actorKind`, `actorPersonId`, `action`, `targetType`, `targetId`, `diff`, `modelVersion`: moderation and AI history; `diff` can contain before/after text and other personal data, not just counts.                                                                                                              |

Convex file storage additionally holds audio bytes and system metadata (`_id`, `_creationTime`, `contentType` where supplied, `size`, `sha256`). Clerk account/session information and provider request/log information are outside this application-table inventory and need the provider checks described above.
