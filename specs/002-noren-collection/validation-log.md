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

## Shimabara Castle Town set, 6 Nov 2026 JST

Before the owner's first visits as a real user. Scripted browser runs on production as the real steward, with the location simulated at the stop. Nothing was pressed that writes to the account.

| Check | How | Result |
| --- | --- | --- |
| Set live with art on all six panels | `collection:setStatus`, steward list | Live, no warnings |
| Map, place page, Link a post previews, stamp book, set page | Phone and desktop, standing at Inohara | 29 of 29 |
| Add a place at Bravo World, wider map box | Phone, up to the last screen, then left | 5 of 5, nothing added |
| Show my location, pressed as soon as the button appears | Desktop, signed in and signed out | Blue dot and the map moves |
| Search by English and Japanese name | Phone | Found. Bravo returns nothing until it is added |
| Fill from link | Phone | `maps.app.goo.gl` works. `share.google` is refused, though Link a post accepts it |
| Signed-out suite against production | Playwright, two workers | 155 passed, 12 skipped, 1 flaky from the test machine's `ERR_NETWORK_CHANGED` |
| Server logs | Convex | No failures |

**Still unproven on production:** a press that passes. The owner's first I'm here in Shimabara or Shinchi will be the first one.

**Known and harmless:** the `listForMap` warning reads "5275 places, showing 5000" for a steward because it counts 776 hidden drafts before filtering them. The map holds 4,498 public places, with room for about 500 more.

**Known defects:** the two hand-published refs for Inohara and Hibaruyama carry `retrievedAt` one day late (not shown in the UI). Odd OpenStreetMap rows remain in Castle Town, such as 島原市 and Castle/volcano picture.

## Walk test in Shimabara, 6 Nov 2026

The owner walks on an iPhone with a field guide. Results go here.

The owner reported the walk done at Inohara and Shimabara Castle (T045, walked in Shimabara Castle Town rather than Shinchi). Their record holds two visits on 2026-11-06, panels 1 and 2 of the Castle Town set: the first passing check-ins on production. The owner reported no problems.

## The owner's first stories in Shimabara, 6 Nov 2026 JST

At the owner's request, from their own notes, on their account:

- Added Bravo World to the map through `places.create` with the pin from their itinerary link. The add form's last button is still untested on production.
- Added the English name Shimabara City to the row `osm-node-4757957896`.
- Published four stories: one on Bravo World, one on Honda Japanese Wax Workshop, two on Shimabara City. None of these places is in a set, so no panel changed.
- No check-in ran. A passing check-in on production is still waiting for the owner's first "I'm here".

Live check signed out, phone and desktop: each story shows with its place name and author, the Japanese page shows the Bravo World name and story, map search finds Bravo World, no page errors. Signed out, `/en/creator` and `/en/stamps` redirect to sign-in in a browser, so the earlier note about "page not found" was wrong (curl sees a 404).

Update the same day: the owner said they met the teacher, and learned about the dialect, at a welcome party at Bravo World. Both stories moved there in their words, and the copies on Shimabara City were hidden. Bravo World now carries three stories, and Shimabara City carries none.

## Open sign-up on the live site, 7 Nov 2026 JST

PR #96 turned on `accountsOpen`, `voice.enabled` and `sharing.norenAccount`, with documents version 2026-11-07. PR #97 and #98 fixed what this check found.

Signed out, phone size, both languages:

- The sign-in page links to sign-up. The sign-up page has email, password and the tick, which says 16 or over.
- The tick's two links open the terms and the privacy notice in the visitor's language.
- The privacy notice has the new words on speech, Noren's own accounts and the welcome film, and no longer offers Google. The terms cover Noren's own accounts.
- The welcome page and a place card offer a free account, and neither says invite-only.

On a temporary fictional account with a "+" address, in Chromium at phone size:

- Opening a form to write leaves the film closed. The Noren tick shows, unticked. The mic waits for its own agreement.
- A real recording went through a fake microphone, playing a line of the owner's own film narration. It came back as words in 5.3 s through Meta's service in production. No recording stayed in storage, and no story was made.
- The words survived a reload as a draft. No page errors.
- Noren's delete button removed the Clerk login, which then answered 404, and left the person row as "Former member" with a `deleted:` ID.

**Found and fixed:** a new member's name is unconfirmed until they press "Use this name", and the mic was greyed out until then, with no reason given (PR #97). The server refused too, so a recording then failed (PR #98). FR-131 asks for the name before a share, and speech input shares nothing, so neither now asks. Sharing still does, and the daily recording limit still applies.

**Not run on production:**

- A real email-code sign-up, which needs an inbox I can't read, and the return to the same place after it. The owner will try one.
- Adding a place and hitting a daily limit (step 3). Convex tests cover both.
- The mic in real iPhone Safari.
- Google isn't offered, so step 2 doesn't apply.

Clerk's own delete button is still on (T067), though Noren doesn't link to it. Pressing it would remove the login and leave the person's name and stories on Noren.
