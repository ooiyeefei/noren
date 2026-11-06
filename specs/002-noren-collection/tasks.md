---

description: "Task list for the neighbourhood noren collection"
---

# Tasks: Neighbourhood noren collection

**Input**: Design documents from `specs/002-noren-collection/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included, because quickstart.md lists them and they protect the rules that matter most: nothing shown between people, no coordinates, no time of day, no art before it is earned.

**Organization**: Grouped by user story, in the stage order from plan.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task serves (US1 to US6)
- **OWNER ACTION**: Needs the owner. I stop and ask when I reach one.

Before writing any Convex code, read `convex/_generated/ai/guidelines.md`. All mutations come from `convex/lib/gate.ts`. Errors are `appError` codes, because production redacts messages.

---

## Phase 1: Setup

**Purpose**: The branch and the amendments that allow everything after them.

- [X] T001 Cut branch `002-noren-collection` from the latest `origin/main`, and confirm the branch, toplevel and author `Yee Fei <12832335+ooiyeefei@users.noreply.github.com>`
- [X] T002 Amend `.specify/memory/constitution.md` to 2.3.0 with the two approved wordings from the spec's "Constitution impact", recording the reason and the owner's approval of 5 Nov 2026
- [X] T003 [P] Add a note under FR-021 in `specs/001-noren-mvp/spec.md` pointing at FR-125 in spec 002
- [X] T004 [P] Add `sharp` as a direct dev dependency in `package.json`, pinned to the version already in the lockfile

**Checkpoint**: The constitution permits private progress. Nothing in the app has changed.

---

## Phase 2: Foundational

**Purpose**: Settings, tables and pure logic every story needs.

**⚠️ CRITICAL**: No story work starts until this phase is complete.

- [X] T005 Add the `collection` block (`panelsPerSet`, `checkInMetres`, `accuracyAllowanceMetres`, `utcOffsetHours`, `newAccount.days`, `newAccount.perDay`) and `legal.accountsOpen` and `legal.documentsVersion` to `src/lib/region/schema.ts`. Refuse `accountsOpen: true` while `documentsVersion`, `operatorName` or `takedown.contact` is null. Change `inviteOnly` to `!(launchPackComplete || accountsOpen)`, and leave the other three policy values on `launchPackComplete`
- [X] T006 Add the same values to `regions/nagasaki.json`, as in data-model.md, with `accountsOpen: false` and `documentsVersion: null`. `launchPackComplete` stays false
- [X] T007 [P] Extend `tests/unit/region.test.ts` for T005: the refusal, the new `inviteOnly` rule, and that turning on `accountsOpen` leaves `allowPilotVisibility` and `realBusinessesDraftOnly` as they were
- [X] T008 Create `convex/tables/collection.ts` with `collectionSet`, `collectionPanel`, `collectionPlace` and `personCollection` exactly as in data-model.md, and spread it into `convex/schema.ts`. `visits` entries hold `placeId`, `setId`, `panelIndex` and `day` only
- [X] T009 [P] Create `src/lib/collection/reach.ts` with the FR-104 rule, `distance - min(accuracy, allowance) <= limit`, and the `day` helper from `utcOffsetHours`, with tests in `tests/unit/collection-reach.test.ts`: 80 m with 30 m accuracy passes, 81 m fails, 55 m with 5 m passes, and 40 m of error counts as 30
- [X] T010 [P] Create `src/lib/collection/location.ts`, one read with `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15000`, returning position and accuracy or one of `denied`, `unavailable`, `timeout`, `unsupported`, with tests in `tests/unit/collection-location.test.ts`
- [X] T011 [P] Create `src/lib/collection/next-panel.ts` for FR-116, using `distanceMetres` from `src/lib/overture/dedupe`, measured from a given point, with tests in `tests/unit/collection-next-panel.test.ts`
- [X] T012 Change `people.ensureCurrent` in `convex/people.ts` to create the `personCollection` row for a new person and for an existing person with none, with tests in `convex/people.test.ts`. It still takes nothing from the client
- [X] T013 Move the body of `placeStories.forPlace` in `convex/placeStories.ts` into a helper returning live sentences for a viewer and a place, used by both the query and the collection, with no change to the query's behaviour
- [X] T014 [P] Create `src/lib/i18n/messages/collection.ts` with all collection copy in Japanese and English, following `src/lib/i18n/messages/stamps.ts`
- [X] T015 Add the Convex origin to `img-src` in `src/lib/security/csp.ts`, with a test beside the existing CSP tests

**Checkpoint**: The schema deploys and `pnpm test` passes.

---

## Phase 3: User Story 1 - Fill a neighbourhood's noren by visiting (Priority: P1) 🎯 MVP

**Goal**: A person at a place presses "I'm here", and that place's fixed panel dyes.

**Independent Test**: In a phone browser at a place in a set, press "I'm here" and see one panel dye. From 300 m away it refuses and says how far.

### Tests for User Story 1

- [X] T016 [P] [US1] Write `convex/collection.test.ts`: same place always gives the same panel, repeat check-in adds nothing, no art URL for an undyed panel or for another person or when signed out, no audit entry written, visits hold only the four fields, a second person sees nothing, a demo account is refused at a real place, a place outside a live set is refused
- [X] T017 [P] [US1] Extend `convex/stampBook.test.ts`: a check-in adds a stamp showing the visit's date, a stamp already there isn't duplicated, and there is still no total

### Implementation for User Story 1

- [X] T018 [US1] Create `convex/collection.ts` with `book`, `set`, `forPlace` and `checkIn` as in contracts/convex-functions.md. `checkIn` takes only `placeId`, works out `day` from `Date.now()` and `utcOffsetHours`, writes no audit entry, and refuses using the `checkablePlace` rule from `convex/checks.ts`
- [X] T019 [US1] Add the caller's visits as a fourth source in `earliestByPlace` in `convex/stampBook.ts`, using `Date.UTC` of the visit's `day`, because `checkDate` formats in UTC
- [X] T020 [P] [US1] Create `src/components/collection/noren.tsx`: six panels with the app's slits, each showing its art only when given a URL, with the dye animation stopping under `prefers-reduced-motion`, and text for screen readers ("2 of 6 panels dyed")
- [X] T021 [US1] Create `src/components/collection/check-in-card.tsx`, a view taking actions as props like `PlaceCheck`, with every state in contracts/pages-and-routes.md, and tests in `tests/unit/check-in-card.test.tsx`
- [X] T022 [US1] Wire the card into `src/components/public/place-container.tsx` and `src/components/public/place-view.tsx`: read `collection.forPlace`, compute reach on the phone, call `collection.checkIn`, and use the existing `StampSeal` press
- [X] T023 [US1] Create `src/app/[lang]/collection/[neighbourhood]/page.tsx` (a readable address such as `/en/collection/shinchi`, changed from `[setId]` while building) and `src/components/collection/set-container.tsx` and `set-view.tsx`, public, showing the noren and each panel's places
- [X] T024 [US1] Create `src/app/[lang]/collection/page.tsx` and `src/components/collection/book-container.tsx` and `book-view.tsx`, public, listing live sets with the caller's own count
- [X] T025 [P] [US1] Add links to the collection in `src/components/layout/account-menu.tsx` and `src/components/stamps/stamps-view.tsx`, with copy in `src/lib/i18n/messages/shell.ts` and `stamps.ts`
- [X] T026 [US1] Add `collection.createSet`, `collection.generateArtUploadUrl`, `collection.attachArt` and `collection.setStatus` to `convex/collection.ts`. Going live needs art on every panel and a public place with a pin on every panel. Add tests in `convex/collection.test.ts`
- [X] T027 [US1] Create `scripts/upload-set-art.mts`: render the owner-approved picture from a path given as an argument, slice it into `panelsPerSet` images plus the whole, and upload them. The source art isn't committed
- [X] T028 [US1] Write `tests/e2e/collection.spec.ts` with Playwright's `setGeolocation`: too far, denied and passing states, and no request carrying coordinates

**Checkpoint**: A member can dye a panel. The set isn't live on production yet.

---

## Phase 4: User Story 2 - Finish a set and keep the badge (Priority: P1)

**Goal**: The last panel shows the whole picture for the first time and adds a dated badge.

**Independent Test**: Complete all six panels and see the full picture and a dated badge, then reload and see it still there.

- [X] T029 [P] [US2] Add to `convex/collection.test.ts`: the badge is added once with the last panel, no whole picture URL before finishing, and a later swap or going back to draft leaves the badge and its art
- [X] T030 [US2] Add the badge write to `collection.checkIn`, copying the set's names and `wholeArtId`, and return badges from `collection.book`
- [X] T031 [P] [US2] Create `src/components/collection/badge-shelf.tsx` and add it to `book-view.tsx`, with the existing `StampSeal` look and the date
- [X] T032 [P] [US2] Create `src/components/collection/finished.tsx` with the whole picture, alt text only when whole, and Share through `navigator.share` with an image file, falling back to opening the image. The shared item carries no progress numbers (FR-108)

**Checkpoint**: The P1 loop is complete.

---

## Phase 5: User Story 3 - Know where to go next (Priority: P2)

**Goal**: After a check-in or on opening the set, the person sees their nearest undyed panel, its distance and a real line.

**Independent Test**: Check in at one place and see the nearest undyed panel named with a distance and a live line from that place's story.

- [X] T033 [P] [US3] Add to `convex/collection.test.ts`: `line` is the picked line if live, otherwise the first live sentence, otherwise null, and a withdrawn story gives null
- [X] T034 [US3] Fill `places[].line` and `lastVisitedPlaceId` in `collection.set`
- [X] T035 [US3] Create `src/components/collection/next-panel-card.tsx` and show it in `set-view.tsx` and after a check-in, measuring from the last visited place or the neighbourhood centre. Never read location here (FR-105) It also shows on the book page, as FR-116 asks.

**Checkpoint**: One visit points to the next.

---

## Phase 6: User Story 4 - What to order, and one line for the next person (Priority: P2)

**Goal**: After check-in, the person sees what people mention and is asked "What did you have?".

**Independent Test**: Check in at a place with a picked line and see it with its AI label. Add a line and see it on the place page under the member's name.

- [X] T036 [P] [US4] Add to `convex/collection.test.ts`: `collection.pickLine` refuses text that isn't a live sentence, and a picked line disappears when its sentence is removed
- [X] T037 [US4] Add `collection.pickLine`, `collection.swapPlace` and `collection.listForSteward` to `convex/collection.ts`, steward only and audited, keeping 1 to 3 places per panel and flagging two places closer than 50 m
- [X] T038 [US4] Create `src/components/collection/check-in-result.tsx`: panel, stamp, "People mention" with the AI label from `src/components/place/place-story.tsx`, the existing `AddStory`, the existing "Still here" action, and the next panel. A check-in alone records no confirmation Built as a one-line box in the check-in result, as in the owner-approved mock, writing through the same `stories.add` as `AddStory`; "Still here" is a plain button calling `checks.confirm`, because a check-in alone confirms nothing.
- [X] T039 [US4] Create `src/app/[lang]/steward/collection/page.tsx` and `src/components/steward/collection-admin.tsx` to swap places, pick lines and set a set live, and link it from `src/components/steward/steward-home-view.tsx`
- [X] T040 [US4] Add `collection.repeatVisitTotals`, internal only, returning two totals and leaving out demo accounts, with a test in `convex/collection.test.ts` (R17)

**Checkpoint**: Stage 1 is built. Everything passes on the branch.

---

## Phase 7: Stage 1 release and walk test

**Purpose**: Get Shinchi live for invited members and test it in the real streets.

- [X] T041 Run `pnpm test`, lint and `pnpm build`, then review the diff against the spec, using `pnpm test:e2e` with `--workers=2` for deployed checks
- [X] T042 **OWNER ACTION**: The owner approves merging. Then commit with `-F`, rebase on the latest `origin/main`, open a PR and rebase-merge it, using `GH_TOKEN=$(gh auth token --user ooiyeefei)` for that command
- [X] T043 Deploy Convex first and Vercel second, because the new place page fails without the new functions. Then run `collection.createSet` for Shinchi with the slugs in data-model.md, and upload the art with `scripts/upload-set-art.mts --prod`
- [X] T044 As the real steward, pick lines and set Shinchi live, then run the live UAT in quickstart.md stage 1 and read the server logs
- [ ] T045 **OWNER ACTION**: Walk test in Shinchi on the owner's iPhone, using the steps in quickstart.md. Android is still to be tested by someone else. Record the results in `specs/002-noren-collection/validation-log.md`, and tune `checkInMetres` or pins if first-press success falls short

**Checkpoint**: SC-101 to SC-104 are met, which opens the way to Phase 9.

---

## Phase 8: User Story 5 - A mock proposal to show local teams (Priority: P3)

**Goal**: A link the owner can send to a local team, labelled mock on every screen.

**Independent Test**: Read every screen in both languages, finding the 見本 Mock label on each, sample names only, and the statement that nobody has agreed.

- [ ] T046 [P] [US5] Create `src/lib/i18n/messages/proposal.ts` from the proposal in `.scratch/gamify/noren-collection.html`, in Japanese and English, with no real place names
- [ ] T047 [US5] Create `src/app/[lang]/for-local-teams/page.tsx` and `src/components/proposal/proposal-view.tsx`, static with no Convex reads and no navigation link, carrying the 見本 Mock label on every screen
- [ ] T048 [P] [US5] Add `tests/unit/proposal.test.tsx`: every screen has the label, the statement is there in both languages, and no name from `regions/nagasaki.json` or the Shinchi set appears

**Checkpoint**: The owner has a link for local teams.

---

## Phase 9: User Story 6 - Anyone 16 or over can join, and can leave (Priority: P3)

**Goal**: Open sign-up with its protections, all shipped switched off, then the owner turns it on.

**Independent Test**: Sign up as a new test person, confirm the 16+ tick, hit a limit, add a place that waits, then delete the account and find nothing left.

### Protections

- [X] T049 [P] [US6] Extend `convex/rateLimit.test.ts`: each new-account limit refuses at its number, and the higher limits apply after 7 days, to a creator, and no limit to a steward
- [X] T050 [US6] Add `check: 100` and `report: 20` to `CONTRIBUTIONS_PER_DAY` and the region's `newAccount.perDay` branch to `limitContribution` in `convex/lib/rateLimit.ts`, for `role === "user"` within `newAccount.days` of `person._creationTime`
- [X] T051 [US6] Call `limitContribution` from `checks.confirm`, after its existing repeat-press return, and from `checks.report` in `convex/checks.ts`, with tests in `convex/checks.test.ts`
- [X] T052 [US6] In `places.create` in `convex/places.ts`, store a new member's `onMap` place as `draft` with `sharedAt` set and return `waiting: true`, with tests in `convex/places.test.ts` that a steward can then publish it through `places.setVisibility`
- [X] T053 [US6] Add `places.listWaiting` and a "waiting" section in `src/components/steward/` on the steward places page, and make the add-place form say the place is waiting

### Name

- [X] T054 [US6] Add `nameConfirmedAt` to `person` in `convex/tables/places.ts`, plus `people.setMyDisplayName`, `people.confirmMyDisplayName` and `people.backfillNameConfirmed`, and `nameConfirmed` on `people.current`, with tests in `convex/people.test.ts`. Name rule: 1 to 80 characters, no `@`
- [X] T055 [US6] Refuse with `name_not_confirmed` in `stories.add`, `sources.add` and `places.create` for an unconfirmed real member, with tests in the matching `convex/*.test.ts` files
- [X] T056 [US6] Show "Shown as" with an edit control in `src/components/place/add-story.tsx` and the add-place form until the name is confirmed, with tests in `tests/unit/add-story.test.tsx`

### Documents

- [X] T057 [US6] Draft the terms and privacy notice in `src/lib/i18n/messages/legal-documents.ts`, in Japanese and English, naming every service outside Japan that holds or processes account data as the code uses them that day, and stating what deletion removes and that places a person added stay without their name
- [X] T058 [US6] Create `src/app/[lang]/terms/page.tsx` and `src/app/[lang]/privacy/page.tsx`, answering 404 while `documentsVersion` is null, and add footer links in `src/components/layout/site-footer.tsx` under the same condition
- [ ] T059 **OWNER ACTION**: The owner and a lawyer read both documents, a person reviews all new Japanese copy, and then `documentsVersion` is set in `regions/nagasaki.json`

### Sign-up and deletion

- [X] T060 [US6] Create `src/app/[lang]/sign-up/[[...sign-up]]/page.tsx`, answering 404 while `accountsOpen` is false. Pass `signUpUrl` to `ClerkProvider` in `src/app/[lang]/layout.tsx` and `SignIn` when open. Override `signUp.legalConsent.checkbox.label__termsOfServiceAndPrivacyPolicy` in `CLERK_LOCALIZATION` to state 16 or over, in both languages
- [X] T061 [US6] Make the check-in card's signed-out state link to sign-up with `redirect_url` back to the same place when open, and sign-in when closed, and make `membersNote` in `src/lib/i18n/messages/welcome.ts` follow `accountsOpen`
- [X] T062 [P] [US6] Write tests in `convex/people.test.ts` for `people.deleteMine`, checking every row of the deletion table in data-model.md and refusing other roles
- [X] T063 [US6] Add `people.deleteMine` and `people.continueDeletion` to `convex/people.ts`, first checking the table against every `v.id("person")` field in `convex/tables/`
- [X] T064 [US6] Create `src/app/api/account/delete/route.ts` as in contracts/pages-and-routes.md, using `src/lib/convex/server.ts` and `clerkClient().users.deleteUser`, logging the error's name and a fallback on failure
- [X] T065 [US6] Create `src/app/[lang]/account/page.tsx` and `src/components/account/account-view.tsx` for the name and deletion, add `/account` to `ROLE_PAGES` in `src/proxy.ts`, and link it from `src/components/layout/account-menu.tsx`

### Release

- [ ] T066 Run all checks, then ship Phase 9 switched off through a PR once the owner approves merging, and deploy
- [ ] T067 **OWNER ACTION**: In the Clerk dashboard, in the order in quickstart.md: check the plan limit and protections, turn on legal consent with `/terms` and `/privacy`, block disposable addresses and subaddresses, keep self-deletion off, choose sign-up methods, and set access to Public
- [ ] T068 Deploy with `accountsOpen: true` and run the live UAT in quickstart.md stage 3 with a fictional test name, recording results in `specs/002-noren-collection/validation-log.md`

**Checkpoint**: Real visitors can play.

---

## Phase 10: Polish

- [ ] T069 [P] Run axe on the new pages through `tests/e2e/a11y-public.spec.ts`, and check every screen at 390 px on the deployed site
- [ ] T070 [P] Update `README.md` and `specs/002-noren-collection/quickstart.md` with what was actually built, leaving out anything not live
- [ ] T071 Reread every task and FR, and mark any gap
- [X] T072 Before T068, stop demo accounts reaching real data. Done 6 Nov 2026: the owner had the four demo logins deleted in Clerk, so no one can sign in as a demo account. About 40 steward functions plus `canReadPlace` and `stories.remove` still trust a demo steward, so make those refuse demo accounts before ever creating a demo login again

---

## Dependencies & Execution Order

- **Setup (Phase 1)** comes first, then **Foundational (Phase 2)**, which blocks every story.
- **US1 → US2 → US3 → US4** in order, because they share `convex/collection.ts` and the check-in result.
- **Stage 1 release (Phase 7)** needs US1 to US4.
- **US5 (Phase 8)** needs only Phase 1 and can ship at any point.
- **US6 (Phase 9)** can be built after Phase 2, but T067 and T068 wait for the walk test in T045.
- **Polish** comes last.

## Parallel Example: Foundational

```text
T009 src/lib/collection/reach.ts
T010 src/lib/collection/location.ts
T011 src/lib/collection/next-panel.ts
T014 src/lib/i18n/messages/collection.ts
```

## Implementation Strategy

- **MVP**: Phases 1 to 4 prove the loop, and Phases 5 and 6 add the pull and the stories.
- **First release**: Phase 7 puts Shinchi in front of invited members, followed by the walk test.
- **After that**: the proposal any time, and open sign-up once the walk test passes and the owner has done T059 and T067.

## Notes

- Commit only when the owner has asked. Land through a PR, never a direct push.
- Keep the owner's email out of files, headers and requests. Tests use fictional names.
- Don't turn on `launchPackComplete`. Never use the mock steward.
