# Quickstart: proving the collection works

This is a validation guide. Details are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

```sh
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm test
npx eslint --no-warn-ignored --ignore-pattern '.scratch/**' --ignore-pattern '.worktrees/**' .
pnpm build
```

## Stage 1: collection with invited accounts

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

This needs a person on the ground with real phones, on iPhone Safari and an Android browser.

1. Stand at or inside each of 10 places. At least 9 must pass on the first press.
2. Time each press to the dyed panel. It must take under 15 seconds with location already allowed.
3. Note every place that fails, and try one place from 300 m away. It must refuse.
4. Finish the set and check the whole picture, the dated badge and Share.
5. Sign in as a second person and confirm none of it is visible.
6. Export the `personCollection` row and search the logs. There must be zero coordinates.

If first-press success falls short, change `checkInMetres` or move the pin before going further.

## Stage 2: proposal

Read every screen of `/[lang]/for-local-teams` in both languages (SC-106). Each needs the 見本 Mock label, sample names only, and the statement that nobody has agreed.

## Stage 3: before sign-up opens

### Automated checks

| Proves | Where | Expected |
|---|---|---|
| FR-127 | `tests/unit/region.test.ts` | `launchPackComplete` stays false. `accountsOpen: true` is refused with null documents |
| FR-128, SC-108 | `convex/rateLimit.test.ts` | Each limit refuses at its number for a new member, and the higher limits apply after 7 days, to a creator and to nothing for a steward |
| FR-129, SC-108 | `convex/places.test.ts` | A new member's place stays draft, then a steward can publish it |
| FR-130, SC-107 | `convex/people.test.ts` | Every row in the deletion table ends as described. Other roles are refused |
| FR-131 | `convex/people.test.ts`, `tests/unit/add-story.test.tsx` | A share is refused until the name is confirmed, and the form shows the name first |

### Owner review

1. Read `/terms` and `/privacy` in both languages, with a lawyer's check. The services named in the notice must match what the code uses on that day.
2. Have a person review all new Japanese copy.
3. Set `documentsVersion`.

### Owner actions in the Clerk dashboard, in this order

1. Check the plan's monthly user limit, and that the protections below are on this plan.
2. Legal: turn on "Require express consent to legal documents", with `/terms` and `/privacy`.
3. Protect or restrictions: block disposable addresses and email subaddresses, and keep the suspicious sign-up challenge on.
4. Keep "Allow users to delete their accounts" off.
5. Choose which sign-up methods to offer. Email code and Google are the suggestion for now.
6. Set the access setting to Public.

Then deploy with `accountsOpen: true`.

### Live UAT after opening

Use a fictional test name and a test address.

1. On a phone, while signed out, press "I'm here" at a Shinchi place. Sign up by email. The tick must state 16 or over, and the person must return to the same place.
2. Do the same through Google. The tick must appear before the account finishes, and the story form must show the Google name for confirming before any share.
3. Hit one daily limit and add one place. The place must stay off the public map, and show in the steward's waiting section.
4. Delete the test account from `/account` and check SC-107. Signing in again must not bring anything back.

## Rollback

Set Clerk's access setting back to Restricted and deploy `accountsOpen: false`. Existing accounts keep working, and no data changes.
