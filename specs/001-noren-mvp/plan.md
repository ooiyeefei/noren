# Implementation Plan: Noren MVP

**Branch**: N/A (no git repository; feature directory `specs/001-noren-mvp`) | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-noren-mvp/spec.md`, constitution v1.2.0, design notes in `SPEC.md`, evidence in `research/01` to `research/07`.

## Summary

A phone-first web app where invited creators pin real places, attach public posts as live embeds that link back to their authors, and run owner interviews. Interviews are transcribed, corrected by a person, turned into quote-backed claims by AI, and confirmed by the business owner in Japanese. Place pages are composed only from published claims, every sentence footnoted, with the original beside a labelled machine translation. No ratings anywhere. A public read-only demo shows mock and openly licensed content only. The first MVP is a lightweight working app used with dummy accounts to record a story video. Technical approach: one Next.js project on Vercel, Clerk for invite-only sign-up, Convex for data, server functions, roles and audio storage, MapLibre with OpenFreeMap tiles, the AI SDK for language work, and every external service behind a small interface so a region or vendor changes by configuration (research/01, 03, 05).

## Technical Context

**Language/Version**: TypeScript on Node.js 24 LTS (AI SDK 7 needs Node 22 or later; Clerk needs 20.9 or later).

**Primary Dependencies**: Next.js 16 (App Router, `proxy.ts`) and React; `@clerk/nextjs` v7; `ai` (AI SDK) with AI Gateway for language models and one direct provider package for transcription (chosen by bake-off); `convex` with `convex-helpers` (triggers) and `convex-test`; MapLibre GL JS; Zod; Tailwind CSS with shadcn/ui. Versions are pinned at scaffold time from current releases.

**Storage**: Convex for all data and for interview audio (file storage); region configuration as JSON files in the repository. Convex has no Tokyo region, so the owner picks one at creation (D17); the switch from the first draft's Neon and Blob is recorded in D19.

**Testing**: Vitest for pure logic and port contract tests; Playwright with axe for end-to-end checks of the user stories and accessibility.

**Target Platform**: Vercel (Fluid Compute, Node runtime), phone-first responsive web; function region near Tokyo, to be verified (V6).

**Project Type**: Web application (single Next.js project).

**Performance Goals**: Only the spec's targets apply: SC-001 (pin and attach in under 3 minutes), SC-002 (claims reviewable within 1 hour of uploading a 30-minute interview, processed asynchronously), SC-010 (landmark page reachable within 30 seconds). Pages must be usable on a mid-range phone on mobile data.

**Constraints**: Embed-only handling of platform content; no AI over third-party posts; third-party scripts load only on pages that show embeds; no real person's data in the public demo; invite-only accounts; every page and response hidden from search engines; per-deployment keys, none in the repository.

**Scale/Scope**: Pilot scale: tens of places, under 50 accounts, under 10 interviews. No horizontal-scaling design.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | How the design satisfies it | Pre | Post |
|---|---|---|---|---|
| I. Stories, not scores | No rating, score or sentiment field, label or ordering | No such columns or UI; ordering by recency and story density only; SC-005 audit test | Pass | Pass |
| II. Real data only | Mock data only under a labelled mock user | `is_mock` on person and propagated to every row it creates; Demo badge; excluded from counts and exports (D14, FR-022) | Pass | Pass |
| III. Humans are the source of truth | Person pin, corrected transcript, owner-confirmed claims | `pin` table is authoritative; transcript versions; claim status machine requires `owner_confirmed` before `published`, except steward-approved open text on places with no owner (v1.2.0) | Pass | Pass |
| IV. Link out, don't copy | Store URL and human note only; embeds via platform; hide when gone | `source` table holds no content; markup built by us from validated URLs; liveness cron; AI never reads embeds (D6) | Pass | Pass |
| V. AI is an editor on consented text | Consent, quote span, footnote, fail closed | Interview needs consent; claims need a quote span; grounding gate withholds unsourced sentences; AI labels; model versions logged (D7) | Pass | Pass |
| VI. Original language first | Original canonical, translation labelled | `claim.text_original` plus `claim_translation.origin`; unreviewed label (D8) | Pass | Pass |
| VII. Region is configuration; open | Config not code; no credentials; licences apart | `regions/*.json`; keys from env; licence-separated tables; thin adapters (D15) | Pass | Pass |
| Privacy and legal constraints (v1.2.0) | Invite-only accounts, no indexing, consent, demo limited to mock/open data | Clerk Invite-only mode; noindex header and robots; public demo serves only `demo_public` rows; consent gate on upload (D2, D11) | Pass | Pass |
| Development workflow | Spec-driven; tech in plan; separate from hackathon code | This plan holds the stack; separate directory and repository from any hackathon build | Pass | Pass |

Constitution amended during planning to v1.1.0 to allow the public read-only demo already decided in clarification Q4, and to v1.2.0 after the task analysis to allow steward-approved open text on places with no business owner and to require consent before interview audio is streamed to an AI service. No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-noren-mvp/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions D1 to D17 and verify-at-build items
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── http-api.md      # Pages, route handlers, auth rules
│   ├── ports.md         # Interfaces for adapters and AI components
│   └── region-config.md # Region configuration schema
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── [lang]/                  # Japanese and English routes
│   │   ├── page.tsx             # Map and list of places
│   │   ├── places/[slug]/       # Place page (bilingual, footnoted)
│   │   ├── creator/             # Pin, sources, interviews
│   │   ├── owner/               # Claim confirmation, notes, topics
│   │   ├── steward/             # Invitations, verification, moderation, takedowns
│   │   └── takedown/            # Public takedown form
│   ├── api/                     # Route handlers (contracts/http-api.md)
│   ├── out/[sourceId]/route.ts  # First-party link redirect with counting
│   └── robots.ts
├── components/                  # shadcn/ui based, accessible
├── lib/
│   ├── auth/                    # Clerk token for Convex calls; role and visibility helpers shared with convex/
│   ├── convex/                  # Server-side Convex client helpers (fetchQuery with the Clerk token)
│   ├── region/                  # Loader and Zod schema
│   ├── adapters/                # Source adapters (embeds, link card, Maps link)
│   ├── geo/                     # GeoProvider: OpenFreeMap style, Nominatim
│   ├── ai/                      # Transcriber, Translator, ClaimExtractor, GroundingChecker
│   ├── claims/                  # State machine and page composer
│   ├── i18n/                    # Dictionaries for ja and en
│   ├── stats/                   # Link counts
│   └── audit/                   # Audit log writer
├── proxy.ts                     # Clerk middleware plus noindex header
convex/                          # Schema, write gate (triggers), queries, mutations, actions, auth.config.ts
regions/
└── nagasaki.json
scripts/                         # seed-landmarks, seed-demo, check-sources
tests/
├── unit/
├── contract/
└── e2e/
```

**Structure Decision**: One Next.js project at the repository root. A separate backend adds nothing at pilot scale, and route handlers plus server actions already give a clear boundary. External services sit in `src/lib/*` behind the ports in `contracts/ports.md`.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Hosted auth (Clerk) rather than own accounts | Owner's choice; invite-only mode and invitations work out of the box (verified in Clerk docs) | Building accounts, invites and recovery by hand costs more than the two-week target allows. Mitigation: roles live in our own `person` row, not in Clerk, so the provider can change |
| Third-party embed scripts on pages | The only legitimate way to show platform posts (research/03) | Copying content is barred by platform terms. Mitigation: scripts load only where an embed is shown, and a Japanese and English notice covers them |

## Open Verify-at-Build Items

These are facts the plan assumes and will confirm in the first tasks. None blocks planning. Details in `research.md`.

- V1 Where Clerk processes account data, for the privacy notice; Clerk's Convex integration issues a token that Convex accepts.
- V2 Transcription bake-off on a Japanese mock recording, with processing location noted.
- V3 Convex triggers fire on every write path the app uses, and the invariant tests pass in `convex-test`.
- V4 Deleted-post signals for Meta embeds (for the liveness check) and the 1,000 requests per hour oEmbed cap.
- V5 OpenFreeMap Japanese label rendering for Nagasaki.
- V6 Vercel function region, and the Convex region (no Tokyo; fixed at creation) against the deferred data-residency decision.
- V7 Current model list from the gateway; structured output with a schema; a different-vendor entailment check.
- V8 Embed notice wording reviewed by a qualified Japanese reader before the public demo is shared.
