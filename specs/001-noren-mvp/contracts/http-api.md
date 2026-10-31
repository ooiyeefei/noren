# Contract: Pages and HTTP API

Conventions. All responses carry `X-Robots-Tag: noindex, nofollow`. Authentication is a Clerk session whose token Convex verifies; the role comes from the caller's `person` row (research D2) and is checked inside the server function for every request below. Since the Convex decision (D19) each row is a Convex query, mutation or action called straight from the page or a server component; a Next route handler exists only where a plain URL is needed. The behaviour, roles and error codes are unchanged (Convex functions return the same codes as `ConvexError` data). Errors are JSON `{ "error": { "code": string, "message": string } }` with 400 (invalid input), 401 (not signed in), 403 (wrong role or not your place), 404, 409 (state conflict), 429. All inputs are validated with Zod. Roles: U user, C creator (a steward may do everything a creator can), O business owner (for their own place only), S steward. "Public" means no sign-in.

## Pages (GET, server rendered, `/[lang]/...` with `ja` or `en`)

| Path | Who | Shows |
|---|---|---|
| `/[lang]` | Public | Map and list of `demo_public` places (signed-in users also see `pilot`); a list view is always present |
| `/[lang]/places/[slug]` | Public for `demo_public`; U and above for `pilot`; S, that place's O and the place's creator for `draft` | Bilingual footnoted page; "Stories from people who've been here": written stories and embeds, newest first (to the public only sources with `shared_at` or `demo_consent_at`, FR-033); topics, phrase cards, notes |
| `/[lang]/creator` | U and above | Add places and attach sources (FR-032); C and S also run interviews |
| `/[lang]/owner/[placeId]` | O (own place) | Confirmation cards, topics, notes and replies |
| `/[lang]/steward` | S | Invitations, verification, moderation, takedowns, audit log |
| `/[lang]/takedown` | Public | Takedown and withdrawal form |
| `/[lang]/notice` | Public | Short notice that pages load third-party embeds |
| `/robots.txt` | Public | Disallow all |

## Route handlers

| Method and path | Who | Request | Response |
|---|---|---|---|
| `GET /api/geo/search?q&lang` | U and above (FR-032) | Query text | Up to 5 suggestions `{name, lat, lng, provider, attribution}`; server cached; 429 above 1 request per second (FR-003) |
| `POST /api/places` | U and above (FR-032) | `{regionId, names[{lang, script, value}], pin{lat,lng}, category?, onMap?}` | Place in `draft`, or `public` with `onMap` and `shared_at` set (needs a category, a business and a real account, else 400; before launch too, FR-033); 429 above 20 a day except for S |
| `PATCH /api/places/:id/pin` | C (creator of place), S | `{lat, lng}` | Updated pin |
| `POST /api/places/:id/sources` | U and above, on a place they can read (FR-032) | `{url, note, noteLang, title?, authorHandle?}` | Source with the matched adapter and an embed descriptor, public at once with `shared_at` set and shown with the member's name; unsupported URLs become a link card (FR-004, 005, 033); 429 above 50 a day except for S |
| `DELETE /api/sources/:id` | The member who linked it, the place's editor, S (FR-033) | none | Source hidden; audit entry when S removes someone else's |
| `GET /api/places/:id/stories` | Anyone who can read the place | none | Live written stories, newest first, each `{body, lang, authorName, addedAt, canRemove}`; a demo account's story only to its writer on a real place (FR-033) |
| `POST /api/places/:id/stories` | U and above, on a place they can read (FR-033) | `{body, lang}` | Story, public at once with the member's name; 400 for an empty body, over 1,000 characters or a language the region does not use; 429 above 50 a day except for S |
| `DELETE /api/stories/:id` | The writer, the place's editor, S (FR-033) | none | Story hidden; audit entry when S removes someone else's |
| `POST /api/interviews` | C | `{placeId, language}` | Interview in `consent_pending` |
| `POST /api/interviews/:id/consent` | C or S (assisted) | `{scope{publish, aiProcessing, transferAbroad, voiceRetention}, textVersion, assisted}` | Consent row; 409 if any scope is missing (FR-008) |
| `POST /api/interviews/:id/audio/token` | C | `{contentType, size}` | Short-lived upload token; 409 without consent |
| `POST /api/interviews/:id/process` | C | none | 202; starts transcription, then marks `transcript_ready` |
| `PUT /api/interviews/:id/transcript` | C | `{segments[]}` | New `human_corrected` version |
| `POST /api/interviews/:id/claims/propose` | C | none | Proposed claims, each with a quote span; none without one (FR-010); 409 unless the latest transcript is `human_corrected` (FR-009) |
| `POST /api/interviews/:id/withdraw` | O (own place), S | none | Hides the audio, transcript, claims and every sentence citing them, and deletes the stored audio (FR-013) |
| `POST /api/interviews/:id/live-chunk` | C | one short audio chunk | Caption text in the spoken language plus a machine translation; 409 unless the interview's consent covers aiProcessing and transferAbroad; nothing is stored as a transcript (stretch, US8) |
| `PATCH /api/claims/:id` | O (own place) | `{action: "confirm"\|"edit"\|"remove", text?}` | Updated claim; translations regenerated on edit (FR-011) |
| `POST /api/places/:id/compose` | S | none | New page version; `{held: [sentenceIds]}` listing withheld sentences (FR-014) |
| `POST /api/notes` | U and above | `{placeId, parentId?, body, lang}` | Note, translated on read (FR-017) |
| `PUT /api/places/:id/topics` | O (own place) | `{topics[{lang, text}]}` | Topic claims, owner-confirmed (FR-018) |
| `POST /api/steward/invitations` | S | `{email}` | Clerk invitation created, carrying no role; the person starts as `user` and a steward sets the role afterwards (next row) (FR-020, 021) |
| `POST /api/steward/people/:id/role` | S | `{role}` | Sets the role; must be user, creator or business_owner (never steward); audit entry |
| `POST /api/steward/people/:id/verify` | S | `{role, placeId?}` | Grants creator or business-owner role; for owners also writes `place_owner` |
| `POST /api/steward/places/:id/visibility` | S | `{visibility, agreementRecorded?}` | 409 moving a real business out of `draft` without `agreementRecorded` |
| `POST /api/steward/sources/:id/demo-consent` | S | none | Sets `demo_consent_at` and `demo_consent_by` after the post's author agreed to appear in the public demo; audit entry (FR-029) |
| `POST /api/takedown` | Public | `{targetType, targetId, reason, privacyOrMinor, contact}` | 202; hides at once when `privacyOrMinor` (FR-025) |
| `PATCH /api/steward/takedowns/:id` | S | `{status, outcome}` | Updated request |
| `GET /api/steward/audit` | S | filters | Audit log entries (FR-026) |
| `POST /api/cron/check-sources` | Cron secret | none | Hides sources that no longer exist (FR-007) |

## Link redirect

`GET /out/:sourceId` (Public): increments the day's aggregate count (skipped for bots and prefetches; tagged when the source is mock) and returns a temporary redirect to the source URL. No cookie is set and no address is stored (FR-024).

## Authorisation matrix (tested)

| Action | U | C | O | S |
|---|---|---|---|---|
| Read `demo_public` | yes | yes | yes | yes |
| Read `draft` | no | places they created | own place | yes |
| Create place, sources, stories (FR-032, FR-033) | yes | yes | yes | yes |
| Remove a source or story | their own, or on a place they added | their own, or on a place they added | their own, or on a place they added | yes |
| Create interviews | no | yes | no | yes |
| Confirm or edit claims | no | no | own place | no |
| Add cautions | no | no | via claim confirmation | no |
| Invite, verify, moderate | no | no | no | yes |
| Leave notes | yes | yes | reply on own place | yes |
