# Contract: pages and routes

All pages keep `X-Robots-Tag: noindex, nofollow`. All copy exists in Japanese and English, and a person reviews the Japanese before release (FR-123).

## Pages

| Route | Who | What it shows |
|---|---|---|
| `/[lang]/collection` | Anyone | Live sets, the next panel (FR-116), the caller's own progress and badge shelf. Signed-out visitors see the sets undyed |
| `/[lang]/collection/[neighbourhood]` | Anyone | The noren, each panel's places, the next-panel card. Art appears only for panels the caller has dyed |
| `/[lang]/places/[slug]` (changed) | Anyone | Adds the check-in card when the place is in a live set |
| `/[lang]/stamps` (changed) | Member | Adds a link to the collection. Keeps its rule of no total |
| `/[lang]/sign-up/[[...sign-up]]` | Anyone | Clerk's sign-up form. 404 while `accountsOpen` is false |
| `/[lang]/account` | Member | Name shown beside what they share, and account deletion. Other roles see who to ask |
| `/[lang]/terms`, `/[lang]/privacy` | Anyone | The documents with their version date. 404 while `documentsVersion` is null |
| `/[lang]/for-local-teams` | Anyone with the link | The mock proposal. Not in the navigation and reads no data (R18) |
| `/[lang]/steward/collection` | Steward | Swap places, pick lines, set a set live |
| `/[lang]/steward/places` (changed) | Steward | Adds a "waiting" section for new members' places |

`/account` joins `ROLE_PAGES` in `src/proxy.ts`. Unprefixed `/terms` and `/privacy` already redirect to the visitor's language, so Clerk's legal settings can use one URL for each.

Footer: add Terms and Privacy links once `documentsVersion` is set. Account menu: add links to the collection and the account page.

`src/app/[lang]/layout.tsx`: pass `signUpUrl` to `ClerkProvider` when `accountsOpen` is true. `welcome.ts` `membersNote` changes with `accountsOpen`.

## Route

### `POST /api/account/delete`

```text
401 unauthenticated  no session
403 forbidden        role is not user
502 clerk_failed     Noren's data is gone and the Clerk step failed; pressing again is safe
200 { ok: true }
```

Steps are in [research R12](../research.md#r12-account-deletion-runs-on-the-server-noren-first). Failures log the error's name and a fallback, so a non-`Error` throw can't produce an empty diagnostic. The client signs out and goes to `/welcome`.

## Check-in card states

| State | What the person sees | Recorded |
|---|---|---|
| Signed out, accounts open | "Make a free account to keep your panels", then back to this place | Nothing |
| Signed out, accounts closed | "Sign in", and that accounts are invite-only for now | Nothing |
| Ready | "I'm here" and which panel this place gives | Nothing |
| Reading location | A progress message | Nothing |
| Denied | How to turn location on for this site | Nothing |
| Unavailable or timed out | Step outside or nearer the door, and try again | Nothing |
| Too far | "You are 240 m from this place. Come within 50 m and press again." | Nothing |
| Dyed | Panel dyes, hanko presses, then the result below | Visit, stamp |
| Already dyed | "This panel is already yours." The stamp is still added if new | Visit, stamp |
| Already been here | A short card with no button and no location read: what they hold, what people mention, the next panel. The place page's own story form stays open for the line they'd add | Nothing new |

The person presses "I'm here" again after returning from sign-up, so location is only ever read on a press (FR-104).

Result, in order: panel dyes, "People mention" (only with a live picked line, with the AI label), "What did you have?" (a one-line box through `stories.add`, the path `AddStory` uses), "Still here" (`checks.confirm`, the action behind `PlaceCheck`), next panel with distance and line. On the last panel, "See the whole picture" leads to the set page, with the badge and Share.

## Accessibility

- Progress is available as text ("2 of 6 panels dyed") to screen readers.
- The dye and hanko animations stop under `prefers-reduced-motion`.
- Buttons keep the existing 44 px minimum height.
- The picture has alt text only once it is whole, so it can't spoil the surprise.
