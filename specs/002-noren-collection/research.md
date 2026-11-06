# Research: Neighbourhood noren collection

Decisions for [plan.md](./plan.md). Code references were read on 5 Nov 2026 at commit `481698e`. Clerk behaviour comes from Clerk's docs, and items marked "verify" can only be proven on the deployed site, because production Clerk keys are refused on localhost.

## R1. Work out the distance on the phone

- **Decision**: The browser reads the location once, works out the distance to the pin and applies FR-104. The mutation takes only `placeId`, so coordinates never leave the phone.
- **Rationale**: FR-105 forbids storing or logging coordinates, and this makes storing them impossible. A server check would prove nothing extra, because the phone supplies the coordinates either way and a faked location is already an accepted edge case while no prize exists.
- **Alternatives**: Sending coordinates to a mutation and checking there. It looks stricter, stops no one who can fake GPS, and puts coordinates in transit. If a prize ever exists, the QR path in the proposal is what would prove a visit.

## R2. One record per person, with no row per visit

- **Decision**: One `personCollection` row per person holds a list of visits and badges. It is created with the person, so its `_creationTime` says nothing about any visit. Check-ins write no audit entry.
- **Rationale**: Convex stamps `_creationTime` on every row and it can't be removed. A `checkIn` row per visit would store the exact time of each visit, which FR-105 forbids and which would make a precise location history. The list is bounded: one entry per place in a set, at most about 144 entries (8 sets, 6 panels, 3 places), so the guideline against unbounded lists in a document holds.
- **Alternatives**: A `checkIn` table is the usual shape and is easier to query, but it can't meet FR-105. A list on the `person` row would rerun every query that reads a person after each check-in.
- **Known limit**: A brand-new member who signs up at their first "I'm here" has a sign-up time close to that first visit. That is the time of signing up, which Clerk records anyway, and it names no place.

## R3. The date uses a fixed offset, and stamps store UTC midnight

- **Decision**: Region config gains `collection.utcOffsetHours` (9 for Japan). A visit's `day` is `YYYY-MM-DD` worked out with plain arithmetic. The stamp book turns it into `Date.UTC(y, m - 1, d)`.
- **Rationale**: `checkDate` in `src/components/place/check-state.ts:7` formats in UTC, so midnight in Japan would show the day before. The neighbourhoods in scope have no daylight saving, and plain arithmetic avoids depending on `Intl` inside Convex.

## R4. Sets live in the database, settings in region config

- **Decision**: Tables hold sets, panels and which places fill them. Region config holds the numbers: reach, allowance and new-account limits. The first set is created by an internal seed function.
- **Rationale**: FR-114 needs a steward to swap a place without a deploy, and FR-124 needs a new city to add a set without code. Places already work this way.
- **Alternatives**: Listing sets in `regions/nagasaki.json` keeps them reviewable in git, but a closed shop would then wait for a deploy.

## R5. Six separate images, delivered only when earned

- **Decision**: A script slices the picture into one image per panel, plus the whole picture, and uploads them to Convex file storage. A query returns a panel's URL only to someone who has dyed it, and the whole picture's URL only when the set is finished.
- **Rationale**: FR-103 says an undyed panel shows none of the picture. One image behind CSS clips would be readable from the page source. The source art stays out of the public repository so the picture isn't spoiled there.
- **Changes this forces**: `img-src` in `src/lib/security/csp.ts:90` doesn't list the Convex origin. The policy is report-only today, but it must be correct before it is enforced (T121 in spec 001). `sharp` becomes a direct dev dependency, because today it only arrives through Next.
- **Verify**: Convex storage URLs allow the cross-origin fetch that sharing an image file needs. If they don't, sharing falls back to opening the image.

## R6. A picked line points at the sentence's text

- **Decision**: `collectionPlace.pickedLineEn` stores the English sentence. Each read looks for an exact match in the place's current live story and shows nothing if there is none.
- **Rationale**: Sentence positions shift, because `convex/lib/foundPosts.ts:72` removes sentences when a post is taken down and a new run rewrites them. A stored index could point at the wrong sentence, while a text match can only ever show a line that is live. This meets "no line is ever invented" in FR-117.
- **Reuse**: The body of `placeStories.forPlace` becomes a shared helper, so the line follows the same visibility rules as the page. The AI label comes from the same message.

## R7. "Nearest" is measured from the last place, with no new location read

- **Decision**: The result screen measures from the place just checked. The book measures from the person's most recently added visit in that set, or from the neighbourhood centre if they have none.
- **Rationale**: FR-105 allows no location read outside the press. `distanceMetres` in `src/lib/overture/dedupe` already does the arithmetic.

## R8. Opening sign-up doesn't need `launchPackComplete`

- **Decision**: Add `legal.accountsOpen` and `legal.documentsVersion` to region config. `inviteOnly` becomes `!(launchPackComplete || accountsOpen)`. The schema refuses `accountsOpen: true` while `documentsVersion`, `operatorName` or `takedown.contact` is null. `launchPackComplete` stays false.
- **Evidence**: In `deriveRegionPolicy` (`src/lib/region/schema.ts:241`) one flag sets four values. No non-test code reads `inviteOnly` or `noindex`. `allowPilotVisibility` and `realBusinessesDraftOnly` are read in `convex/places.ts` and `convex/lib/access.ts`, so turning the flag on would change what can be published. Search hiding is hard-coded in `next.config.ts:19`, `src/app/robots.ts` and the page layout. The actual lock on accounts is Clerk's access setting plus the missing sign-up page.
- **Alternatives**: Turning on `launchPackComplete` would lift the draft rule for real businesses, which the owner hasn't agreed to and `CONTRIBUTING.md:12` forbids for making a feature work.

## R9. Use Clerk's consent checkbox for terms and age

- **Decision**: Turn on Clerk's "Require express consent to legal documents" with `/terms` and `/privacy` as the links. Override `signUp.legalConsent.checkbox.label__termsOfServiceAndPrivacyPolicy` in `CLERK_LOCALIZATION` so one tick says "I am 16 or over and agree to the Terms and the Privacy Notice", in both languages.
- **Rationale**: The tick comes before the account exists. Clerk also asks for it when someone returns from Google, and stores `legalAcceptedAt`. A Noren prompt after sign-up would come after an under-16's email had already been collected, and would need its own server gate on every write.
- **Known limit**: Members who joined before this have no acceptance recorded (`legalAcceptedAt` is null). They are few and invited, so the owner can tell them directly.
- **Verify**: The overridden label renders in both languages on the deployed site, on the email path and the Google path.

## R10. What a brand-new account can reach

Every Convex function using `requirePerson` and every signed-in route was checked. All other writes need a role.

| Path | Today | Risk once sign-up opens | Decision |
|---|---|---|---|
| `stories.add` | Live at once, 50 a day | A stranger's words under a real place | Live at once, 5 a day for 7 days (FR-128, FR-129) |
| `places.create` | Public at once with `onMap`, 20 a day | A false pin every visitor can walk to | Waits for a steward for 7 days, 3 a day (FR-129) |
| `sources.add` | 50 a day | Link spam | 5 a day for 7 days |
| `sources` preview and draft | 200 and 30 a day | Drafts are paid model calls | 20 and 3 a day for 7 days |
| `checks.confirm` | No limit | One account could mark every listing "still here", which changes mission counts and earns stamps | New limit (FR-128) |
| `checks.report` | No limit beyond one open report per place | Floods the steward queue | New limit (FR-128) |
| `/api/geo/maps-link` | One call a second per user | Low: it resolves a link | No change |
| `aiRequests.translatePlace`, `interviews.listForPlace`, `links.mine`, `places.listMine`, `places.listOwned`, `stampBook.mine`, `stories.remove`, `sources.remove` | Checked further inside, or read-only, or the caller's own | Low | No change |

- **Decision**: The new limits go in `limitContribution` (`convex/lib/rateLimit.ts`). They apply to `role === "user"` for 7 days from `person._creationTime`. Stewards stay exempt, and a creator has been vouched for by a steward, so the higher limits apply.
- **Alternative rejected**: A steward queue for stories. One person would have to read every first story, and the crowd loses its speed. The removal path covers mistakes.

## R11. A new member's place waits using what already exists

- **Decision**: In `places.create`, a new member's `onMap` place is stored with `visibility: "draft"` and still gets `sharedAt`, which records their agreement to be named. `places.setVisibility` already allows a real place out of draft when `sharedAt` is set (`convex/places.ts:495`), so a steward's normal publish works. It also gets `awaitingSteward: true`, and the waiting list is those rows. `sharedAt` and a missing `hiddenReason` can't tell it apart, because a place a steward hid, or an older takedown, looks the same and would sit one press from going back on the map.
- **Alternatives**: A new `pendingApproval` status would touch every visibility check for no gain.

## R12. Account deletion runs on the server, Noren first

- **Decision**: `POST /api/account/delete` checks the session, calls `people.deleteMine` with the person's Convex token through `src/lib/convex/server.ts`, then calls `clerkClient().users.deleteUser(userId)`. Clerk's "Allow users to delete their accounts" stays off, so this is the only way to delete.
- **Rationale**: Noren's step needs the token, so it must run first. Doing both in one request means closing the tab can't leave it half done. If the Clerk step fails, the person is told and can press again, which empties any new `person` row a page load made. `deleteMine` also schedules `sweepAfterDeletion` for ten minutes later, past the life of a Clerk token, for a row made in another tab with their name. It runs whatever became of the request, and Convex keeps that scheduled call's Clerk ID in its record of finished jobs for about a week.
- **What happens to each record**: see [data-model.md](./data-model.md#account-deletion).
- **Role limit**: Self-service is for `user` only. Interviews, consents and ownership depend on the other roles, so they ask a steward (FR-130).

## R13. A chosen display name

- **Decision**: Add `people.setMyDisplayName` for the caller only, with the existing rule (1 to 80 characters, no `@`). Record `person.nameConfirmedAt` when they confirm it. The story and place forms show "Shown as" with an edit control until it is set, and the writes refuse with `name_not_confirmed` if it isn't.
- **Rationale**: `displayNameFrom` in `convex/people.ts:17` takes the name from the sign-in token, so a Google sign-up would put someone's full real name on a public page without their having seen it. An email sign-up gets "New member", and only a CLI function can change that today.
- **Existing members**: A one-off internal function sets `nameConfirmedAt` for members who have already shared, because they have already seen their name on the page.

## R14. Bots and repeat accounts

- **Decision**: Keep Clerk's challenge for suspicious sign-ups on, and turn on its blocks for disposable addresses and email subaddresses. New-account limits per account would mean little if one person could make unlimited accounts.
- **Evidence**: Clerk lists these under system protections on every plan. `src/lib/security/csp.ts` already allows Clerk's and Cloudflare's challenge origins.
- **Verify**: The settings exist on this instance's plan, and check the plan's monthly user limit before opening.

## R15. Location read for check-in

- **Decision**: A new helper asks for `enableHighAccuracy: true`, `maximumAge: 0` and `timeout: 15000`. It returns the position and `coords.accuracy`, or one of `denied`, `unavailable`, `timeout` or `unsupported`.
- **Rationale**: `locateInBrowser` in `src/components/explore/helpers.ts:153` accepts a reading up to 60 seconds old, drops the accuracy and collapses every failure into one, and FR-106 needs a different next step for each.

## R16. Rollout order

1. Collection, with invited accounts only. Walk test in Shinchi.
2. The proposal page can ship at any point, because it touches no data.
3. Documents, the sign-up page and photos ship switched off. Protections and deletion go live with that deploy, for invited members, because SC-108 needs them working before sign-up opens. A steward is exempt from the limits and can't delete their own account this way.
4. The owner turns on Clerk's consent setting and the two blocks.
5. The owner switches Clerk's access setting to Public, then `accountsOpen` is deployed as true.

Rolling back reverses step 5 and leaves existing accounts in place.

## R17. Measuring the second visit

- **Decision**: An internal function reads `personCollection` a page at a time and returns only two totals: people with one or more visits, and people with visits at a second place on the same or next day. Demo accounts are left out. It can only be run from the CLI.
- **Rationale**: SC-105 needs a number, and FR-108 forbids any view of one person. A date is enough for this, so no time of day is needed.

## R18. The proposal is a static page

- **Decision**: One page at `/[lang]/for-local-teams`, in Japanese and English, built from sample copy with no database reads. It isn't linked from the navigation, and it is hidden from search like every page.
- **Rationale**: FR-120 keeps it apart from the working product, and the owner needs a link to send to local teams. With no data access, a real place can't appear beside a reward by accident.
