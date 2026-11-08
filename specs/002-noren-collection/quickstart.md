# Quickstart: proving the collection works

This is a validation guide. Details are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

```sh
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm test
npx eslint --no-warn-ignored --ignore-pattern '.scratch/**' --ignore-pattern '.worktrees/**' .
pnpm build
```

## Stage 1: collection with invited accounts

Status, 8 Nov 2026: the collection is live with two sets, Shinchi and Shimabara Castle Town. Results are in [validation-log.md](./validation-log.md). The first passing check-ins on production were the owner's two in Shimabara Castle Town on 6 Nov. The Shinchi walk test, the Android run and SC-101 to SC-103 as numbers are still to do.

### Automated checks

| Proves | Where | Expected |
|---|---|---|
| FR-104 reach rule | `tests/unit/collection-reach.test.ts` | 80 m with 30 m accuracy passes, 81 m fails, 55 m with 5 m accuracy passes, and 40 m of reported error counts as 30 |
| FR-116 next panel | `tests/unit/collection-next-panel.test.ts` | Nearest undyed panel, from the last place or the centre |
| FR-102, FR-105, FR-110 | `convex/collection.test.ts` | The same place always gives the same panel. A repeat check-in adds nothing. The badge is added once and survives a swap |
| FR-103 | `convex/collection.test.ts` | No art URL for an undyed panel, for another person or when signed out. No whole picture before finishing |
| FR-105 storage | `convex/collection.test.ts` | Visits hold only place, set, panel and day. `checkIn` writes no audit entry |
| FR-107 | `convex/stampBook.test.ts` | The stamp appears and shows the visit's date in Japan |
| FR-108, SC-104 | `convex/collection.test.ts` | A second person sees none of the first person's progress |
| FR-117 | `convex/collection.test.ts` | A picked line disappears once its sentence is removed |
| Principle I | `convex/collection.test.ts` | No public function takes a person as an argument. `repeatVisitTotals` returns two numbers |
| Page flow | `tests/e2e/collection.spec.ts`, with Playwright's `setGeolocation` | Too far, denied and passing states, with no coordinates in any request |

### On the deployed site

Run the deployed end-to-end tests with `--workers=2`.

1. Run `collection.createSet` for Shinchi, then upload the art with `scripts/upload-set-art.mts --prod`. The upload needs the set to exist.
2. As a steward, pick the lines and set Shinchi live on `/steward/collection`.
3. While signed in as an invited member, open a Shinchi place and watch the network tab while pressing "I'm here". No request may carry coordinates.

### Walk test in Shinchi (SC-101 to SC-104)

Not run in Shinchi yet. See the status above.

This needs a person on the ground with real phones, on iPhone Safari and an Android browser.

1. Stand at or inside each of 10 places. At least 9 must pass on the first press.
2. Time each press to the dyed panel. It must take under 15 seconds with location already allowed.
3. Note every place that fails, and try one place from 300 m away. It must refuse.
4. Finish the set and check the whole picture, the dated badge and Share.
5. Sign in as a second person and confirm none of it is visible.
6. Export the `personCollection` row and search the logs. There must be zero coordinates.

If first-press success falls short, change `checkInMetres` or move the pin before going further.

## Stage 2: proposal

Live since 8 Nov 2026, with no link to it from anywhere.

| Proves | Where | Expected |
|---|---|---|
| FR-121, FR-122, SC-106 | `tests/unit/proposal.test.tsx` | The page and all four screens carry the 見本 Mock label in both languages. The statement that nobody has agreed and the line that shops see totals only are there. No name from `regions/nagasaki.json` or the Shinchi set appears in the page or its copy |
| R18 | `tests/unit/proposal.test.tsx` | The page imports nothing from Convex or Clerk, leaves noindex to the layout, and no other file in `src` mentions its address |

On the deployed site, read every screen of `/[lang]/for-local-teams` in both languages at 390 px and at desktop width (SC-106).

## Stage 3: sign-up

Status, 8 Nov 2026: sign-up has been open since 7 Nov 2026 (documents version 2026-11-07). The owner approved both documents without a lawyer's read, and no second person has checked the Japanese. The steps below were run in the order written. What was not run on production is listed in [validation-log.md](./validation-log.md).

### Automated checks

| Proves | Where | Expected |
|---|---|---|
| FR-127 | `tests/unit/region.test.ts` | `launchPackComplete` stays false. `accountsOpen: true` is refused with null documents |
| FR-128, SC-108 | `convex/rateLimit.test.ts` | Each limit refuses at its number for a new member, and the higher limits apply after 7 days, to a creator and to nothing for a steward |
| FR-129, SC-108 | `convex/places.test.ts` | A new member's place stays draft, then a steward can publish it |
| FR-130, SC-107 | `convex/people.test.ts` | Every row in the deletion table ends as described. Other roles are refused |
| FR-131 | `convex/people.test.ts`, `tests/unit/add-story.test.tsx` | A share is refused until the name is confirmed, and the form shows the name first |
| FR-126 documents | `tests/unit/legal-documents.test.tsx` | Both documents have the same sections in both languages and take their facts from the region file. Every service the code uses is named with its country, and every row of the deletion table is stated. `/terms` and `/privacy` answer 404 while `documentsVersion` is null, and the footer has no links to them |
| FR-125, FR-126 sign-up | `tests/unit/sign-up.test.tsx` | `/sign-up` answers 404 while `accountsOpen` is false. Once open, the provider and the sign-in form point to it, and the tick states the minimum age in both languages |
| FR-125 prompts | `tests/unit/check-in-card.test.tsx`, `tests/unit/welcome-ui.test.tsx` | Signed out, the card leads to sign-up and back to the same place when open, and to sign-in when closed. The welcome page's note follows `accountsOpen` |
| Routing | `tests/unit/proxy.test.ts`, `tests/e2e/public-site.spec.ts` | Signed-out visitors reach all three pages without the welcome redirect, an address with no language gets the visitor's language, and each page's status follows the region file |

### Owner review

1. Read the terms and the privacy notice in both languages, with a lawyer's check. The services named in the notice must match what the code uses on that day. Both pages are live at `/terms` and `/privacy`. Read them again after any change to a service the code uses.
2. Have a person review all new Japanese copy.
3. Set `documentsVersion`.

### Owner actions in the Clerk dashboard, in this order

1. Check the plan's monthly user limit, and that the protections below are on this plan.
2. Legal: turn on "Require express consent to legal documents", with `/terms` and `/privacy`.
3. Protect or restrictions: block disposable addresses, and keep the suspicious sign-up challenge on. The owner chose on 7 Nov 2026 to allow "+" addresses.
4. Keep "Allow users to delete their accounts" off.
5. Sign-up methods: email with a password and an email code, by the owner's decision on 7 Nov 2026. Phone and Google aren't offered, and the privacy notice no longer names Google.
6. On the Access mode page, select Open and save. Clerk's API calls this value `public`, and T067 in tasks.md and R16 in research.md call it Public. The other modes are Invite-only (`restricted`), which is where Noren is today, and Waitlist (`waitlist`), which Noren doesn't use.

Then deploy with `accountsOpen: true`. Done on 7 Nov 2026.

### Deleting an account for someone

The documents promise this for an account reported as under age, and for a creator, shop owner or steward who asks. A steward does it from the command line, because there is no screen for it yet:

1. Look at what they hold. Interviews, consents and ownership stay, and point at the empty row.
2. Run `npx convex run --prod people:deletePerson '{"personId": "..."}'`.
3. Delete the user in Clerk's dashboard. Only that ends their sign-in.

### Live UAT after opening

Use a fictional test name and a test address. Run on 7 Nov 2026, apart from the return to the same place after a real sign-up and steps 2 and 3 below.

1. On a phone, while signed out, open a Shinchi place and press "Make a free account to keep your panels" on its card. Sign up by email. The tick must state 16 or over in both languages, its two links must open the terms and the privacy notice in the visitor's language, and the person must return to the same place.
2. Only if Google is offered later: do the same through Google, starting once from the sign-up form and once from the sign-in form. The tick must appear before the account finishes, and the story form must show the Google name for confirming before any share.
3. Hit one daily limit and add one place. The place must stay off the public map, and show in the steward's waiting section.
4. Delete the test account from `/account` and check SC-107. Signing in again must not bring anything back.

## Accessibility and phone width

Run the signed-out axe suite against the deployed site with two workers:

```sh
E2E_BASE_URL=https://noren.yooi.me npx playwright test tests/e2e/a11y-public.spec.ts --workers=2
```

It covers the welcome, about, proposal, collection, terms, privacy and sign-up pages in both languages, on a phone and a desktop. It fails on serious or critical violations, sideways scroll on a phone, a control with no name, a page without exactly one heading, and a focus with no visible outline. The collection pages show "no noren here" on a site where a set isn't live, and are still checked.

Then look at every screen at 390 px. The signed-in screens need a temporary fictional member, and never press "I'm here" on production.

## Rollback

On Clerk's Access mode page, select Invite-only (API value `restricted`) and save, and deploy `accountsOpen: false`. Existing accounts keep working, and no data changes.
