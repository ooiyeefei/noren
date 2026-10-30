# Validation log

Results of running the scenarios in `quickstart.md` against the real app. One row per scenario; a scenario is "pass" only when it was run and the expected result was seen. Nothing here is estimated.

## 2026-10-30: deployed site, signed out (`https://noren.yooi.me`)

Run with `E2E_BASE_URL=https://noren.yooi.me npx playwright test` (both projects: desktop and phone): **138 passed, 10 skipped by design, 0 failed.** The skips are the live-write takedown test (writes disabled by default) and the desktop copy of the phone-only horizontal-scroll check.

| # | Scenario | Status | Evidence |
|---|---|---|---|
| 9 | Every response carries `X-Robots-Tag: noindex, nofollow`; robots.txt disallows all | **Pass** | `public-site.spec.ts`: `/ja`, `/en`, `/ja/notice`, `/en/takedown` and a 404 path send the header; `/robots.txt` disallows everything. Also read by hand: `/api/geo/search` (401), `/en` (200) and an unknown place page all carry the header. |
| 8 | Signed-out visitor sees only mock and open content; drafts refused | **Partial** | Signed out, production shows no place at all: the 3,090 imported OpenStreetMap places are private until the launch pack is complete, and the signed-out list is refused. Creator, owner and steward pages redirect to sign-in with the return address. NOT run: the Demo Cafe and "refused as another role" parts, because the Demo Cafe is not seeded on production and there are no test accounts yet. |
| 11 | Takedown, privacy request hides at once, outcome, appeal | **Partial** | The public form renders, validates client-side without sending anything, and shows a neutral message for an unknown code (e2e, live). Hide-at-once, outcome and appeal are covered by backend tests (R7a, every status transition and the rate limits) and were checked signed-out on the dev deployment; the live write test is off by default. NOT run live end to end. |
| 13 | The five invariants as tests | **Pass (unit)** | `tests/unit/invariants.test.ts` and the other A6 tests pass in the full suite (83 files, 1594 tests). I did not re-map each of the five to its test in this pass. |
| 1 to 7, 10, 12 | Creator, interview, owner, page, notes, link counts, audit, keyboard | **Not run** | Need signed-in mock accounts (invite-only Clerk), a recorded Japanese interview, or stories not built yet (US4, US6, US8, US9). |

Also recorded today:

- Accessibility (axe, serious and critical fail the test): `/ja`, `/en`, notice, takedown, takedown status and sign-in (Clerk's own widget excluded) pass in both projects. Moderate and minor findings are attached to the report as warnings, not failures.
- Map: the worker bug found by the first live run is fixed and guarded by `tests/e2e/map.spec.ts` (canvas draws, no worker error, worker file served as JavaScript without redirect). Japanese labels verified (research D5, V5).
- Content Security Policy is still report-only. Live, 0 violations on the pages above after the Clerk Protect hosts were added. Enforce only after a signed-in walkthrough with a real embed and map tiles.

Open before the public demo: seed the Demo Cafe under a labelled mock user (needs mock accounts), run scenarios 1 to 7 signed in, review the embed notice wording (T125) and name the operator (T134).
