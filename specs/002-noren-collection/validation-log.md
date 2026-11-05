# Validation log: neighbourhood noren collection

## Stage 1 on the live site, 5 Nov 2026

Shinchi went live on production with the six panels in data-model.md, and the steward picked one line for each of its seven places.

| Check | Where | Result |
|---|---|---|
| Signed-out tests, phone and desktop | `tests/e2e/collection.spec.ts`, `public-site`, `map`, `a11y-public`, `csp-clean`, `--workers=2` | 146 passed, 10 skipped because they need sign-in or writes |
| Signed in as the real steward | Scripted browser run, phone and desktop, both languages | 31 of 31 |
| 300 m from the pin | Same run | Refused. No request carried the reading and `collection:checkIn` was never called |
| Location blocked | Same run | Told the person what to do |
| Steward's progress after the run | `personCollection` on production | 0 visits and 0 badges |
| Server logs after the run | Convex and Vercel | No errors |
| A whole walk with the real functions | Dev deployment, fictional steward, `collection:checkIn` | Six panels dyed, then a finished set with its picture and date. Repeat presses gave `already_here` and `already_dyed`. The row holds place, set, panel and day |

**Still unproven on production:** a press that passes. The owner's first press in Shinchi will be the first one, so the steward's account stays at zero until then.

**To check on the walk:** 三栄製麺 (panel 5) and 泰安洋行 (panel 6) are 37 m apart, and 三栄製麺 and 京華園 (panel 6) are 40 m apart, so one spot may collect both panels. If it does, move a place. 泰安洋行 and 京華園 share panel 6, so the steward page's warning about those two does no harm.

## Walk test in Shinchi, 7 Nov 2026

The owner walks on an iPhone. Android is still to be tested by someone else. Results go here.
