# Implementation Plan: Neighbourhood noren collection

**Branch**: `002-noren-collection`, to be cut from `main` when building starts | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-noren-collection/spec.md`, the clickable mock at `.scratch/gamify/noren-collection.html`, constitution v2.2.0, and the owner's approvals of 5 Nov 2026 (open sign-up for people aged 16 or over, both constitution amendments, `launchPackComplete` stays off).

## Summary

People fill in a neighbourhood's noren by visiting real places. Pressing "I'm here" reads the location once on the phone, and if the person is close enough, the place's fixed panel dyes and its stamp goes in their book. When every panel is dyed, the hidden picture shows and a dated badge goes on their shelf. Progress is private. After a check-in, Noren points to the next panel, shows what people mention, and asks "What did you have?".

The build has three stages that ship separately:

1. **Collection** with invited accounts, one set (Shinchi), then a walk test on the ground.
2. **Mock proposal** for local teams, a static page that can ship at any point.
3. **Open sign-up**: protections, terms and privacy notice, a sign-up page and account deletion, all shipped switched off. The owner switches sign-up on last.

Technical approach: coordinates never leave the phone, and one private record per person holds visits with a date only, so no row exists per visit. Art is delivered one panel at a time from file storage, and only to someone who has earned it.

## Technical Context

**Language/Version**: TypeScript on Node.js 24 LTS.

**Primary Dependencies**: Next.js 16.4 (App Router, `proxy.ts`), React 19, Convex ^1.48 with `convex-helpers`, `@clerk/nextjs` ^7.9 with `@clerk/localizations`, Tailwind 4. New: `sharp` as a direct dev dependency, for slicing art. No new AI provider or AI processing.

**Storage**: Convex tables and file storage (prod `careful-bee-139`, dev `brazen-gull-39`). Settings in `regions/nagasaki.json`.

**Testing**: Vitest with `convex-test` for functions and logic, Playwright with `setGeolocation` for pages, axe for accessibility, and a walk test by a person in Shinchi.

**Target Platform**: Phone browsers over HTTPS, on Vercel. No app needed.

**Project Type**: Web application (one Next.js project with Convex).

**Performance Goals**: A check-in takes under 15 seconds from press to dyed panel with location already allowed (SC-102).

**Constraints**: No coordinates stored or logged, and no time of day stored per visit (FR-105). Nothing shown between people (FR-108). `launchPackComplete` stays false. Every page stays hidden from search. Production Clerk keys don't work on localhost, so sign-up can only be fully tested on the deployed site. Production Convex redacts error messages, so the client relies on `ConvexError` codes.

**Scale/Scope**: One live set at first, and up to eight once other neighbourhoods have art. At most about 144 visit entries per person.

## Constitution Check

*GATE: passed before research and re-checked after design.*

Version 2.3.0 goes in as the first build step, with the owner's approved wording and the reason recorded. Both amendments are in the spec under "Constitution impact".

| Principle | Gate | How the design satisfies it | Pre | Post |
|---|---|---|---|---|
| I. Stories, not scores | No score for a person. Private progress allowed once amended | "2 of 6" goes only to its owner. No function takes a person. No points, ranks or streaks. Repeat-visit figures are two totals, reachable only from the CLI | Pass with amendment | Pass with amendment |
| II. Real data only | Mock data stays labelled and apart | Real places and live lines only. A demo account can't check in at a real place. The proposal uses samples, is labelled on every screen and reads no data | Pass | Pass |
| III. Humans are the source of truth | The pin is authoritative | Reach is measured to the place's pin. Stewards swap places and pick lines | Pass | Pass |
| IV. Link out, don't copy | No new third-party content | Adds none. Links use the existing path | Pass | Pass |
| V. AI is an editor | No unsourced AI text | No new generation. Lines are live, sourced sentences with the same AI label, and a line disappears if its sentence does | Pass | Pass |
| VI. Original language first | Labelled translations | Live lines keep their existing wording and label. New copy is in both languages and a person reviews the Japanese | Pass | Pass |
| VII. Region is configuration | Settings per region, no secrets | Reach, limits, panel count and the open switch live in region config. Sets are rows per region | Pass | Pass |
| Privacy and legal constraints | Accounts invite-only until the launch pack exists | Amended by the owner. Sign-up stays off until the privacy notice, terms and takedown workflow exist, and the schema refuses otherwise. Search hiding and the real-business draft rule are unchanged | Pass with amendment | Pass with amendment |
| Development workflow | Clarify, then plan, then build. Technology in the plan | The open question was settled before this plan. Stack details are here and in research | Pass | Pass |

No unjustified violations. Spec 001's FR-021 gets a note pointing at FR-125 as part of the amendment step.

## Project Structure

### Documentation (this feature)

```text
specs/002-noren-collection/
├── spec.md
├── plan.md                        # This file
├── research.md                    # R1 to R18
├── data-model.md
├── quickstart.md                  # Automated checks, walk test, owner actions, rollback
├── contracts/
│   ├── convex-functions.md
│   └── pages-and-routes.md
├── checklists/
│   └── requirements.md
└── tasks.md                       # Next step: /speckit-tasks
```

### Source Code (repository root)

```text
.specify/memory/constitution.md    # 2.3.0
regions/nagasaki.json              # collection block, legal.accountsOpen, legal.documentsVersion

convex/
├── schema.ts                      # adds collectionTables
├── tables/collection.ts           # new
├── collection.ts                  # new: book, set, forPlace, checkIn, steward and internal functions
├── people.ts                      # ensureCurrent, display name, deleteMine
├── stampBook.ts                   # reads visits as a fourth source
├── placeStories.ts                # shared helper for live sentences
├── places.ts                      # new member's place waits; listWaiting
├── checks.ts                      # daily limits
├── stories.ts, sources.ts         # name check
└── lib/rateLimit.ts               # new-account limits, check and report kinds

src/
├── lib/
│   ├── collection/
│   │   ├── reach.ts               # FR-104
│   │   ├── next-panel.ts          # FR-116
│   │   └── location.ts            # one location read
│   ├── region/schema.ts           # new settings, inviteOnly rule
│   ├── security/csp.ts            # Convex origin in img-src
│   └── i18n/messages/             # collection, account, legal documents, proposal
├── components/
│   ├── collection/                # noren, check-in card, result, book, badge, share
│   ├── steward/                   # collection page, waiting places
│   ├── account/                   # name, deletion
│   └── place/add-story.tsx        # "Shown as"
├── app/[lang]/
│   ├── collection/                # page.tsx, [neighbourhood]/page.tsx
│   ├── sign-up/[[...sign-up]]/
│   ├── account/
│   ├── terms/, privacy/
│   ├── for-local-teams/
│   └── steward/collection/
├── app/api/account/delete/route.ts
└── proxy.ts                       # /account joins ROLE_PAGES

scripts/upload-set-art.mts         # slices and uploads art; the source art stays out of git
tests/unit/, tests/e2e/            # see quickstart.md
```

**Structure Decision**: This stays in the existing single Next.js and Convex project, following its container and view split, its pure logic in `src/lib`, and its tests beside `convex/` functions. Roles and rules stay in Convex, so no route can skip them.

## Build order

| Stage | What | Done when |
|---|---|---|
| 0 | Constitution 2.3.0, note on spec 001's FR-021 | Amendments recorded |
| 1a | Region settings, tables, `collection.ts`, stamp book, tests | Automated checks pass |
| 1b | Art script, Shinchi set, CSP change | Set exists as a draft with art |
| 1c | Check-in card, result, set page, book, badge, share, in JA and EN | Page flow passes |
| 1d | Steward page, picked lines, go live | Shinchi live for invited members |
| 1e | **Walk test in Shinchi**, repeat-visit totals | SC-101 to SC-104 met |
| 2 | Proposal page | SC-106 met |
| 3a | Limits, waiting places, display name | SC-108 and FR-131 pass |
| 3b | Terms and privacy notice in JA and EN, reviewed | Owner and lawyer have read them |
| 3c | Sign-up page, account page, deletion route | SC-107 passes, all switched off |
| 3d | **Owner switches on sign-up**, live UAT | quickstart.md stage 3 passes |

Stage 1e gates stage 3: sign-up shouldn't open on a check-in that hasn't been tested in real streets. Stage 2 is independent.

## Complexity Tracking

No constitution violations need justifying.
