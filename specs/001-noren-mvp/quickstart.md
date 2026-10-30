# Quickstart: validating the Noren MVP

A run-and-check guide, not implementation. Each scenario names the spec story it proves. Details live in `data-model.md` and `contracts/`.

## Prerequisites

- Node.js 24 and a package manager.
- Accounts you already use, never mocked: Clerk and Convex. The data layer can be built and tested first against an anonymous local Convex deployment, which needs no account; the cloud deployment is created with `npx convex dev` (log in when asked) and its region is chosen then, because it cannot be changed afterwards (research D17).
- A domain you own, for Clerk's production instance (a `*.vercel.app` address will not do), and access to its DNS records: `noren.yooi.me`, with DNS at Spaceship.
- The Vercel CLI (the installed 64.0.2 is outdated; update it) and `vercel link` are needed only to deploy the app, not for local work.
- AI Gateway access for language models; one transcription provider key chosen at the bake-off (V2).
- Environment variable names (values are never committed): `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CLERK_JWT_ISSUER_DOMAIN` (also set on the Convex deployment), `AI_GATEWAY_API_KEY` (or the platform's OIDC on Vercel), and the transcription settings (`TRANSCRIBE_*`; see `.env.example`). `CRON_SECRET` is no longer used: a Convex cron replaced the Vercel cron route (decision D-4).
- Scripts outside Next.js do not read `.env.local` on their own, so load it explicitly.

## Clerk setup (once)

The app uses a Clerk production instance (research D2), so there is no development-only stage.

1. Create the production instance for your domain, add the DNS records shown on Clerk's Domains page, wait for them to propagate (up to 48 hours) and deploy certificates.
2. On that instance set Access mode to Invite-only, and on the User & authentication page turn off Phone number so sign-up asks for an email address only (Clerk's SMS allowlist defaults to the US and Canada, so other countries' numbers are refused, and the app has no use for phone numbers). Settings under Integrations do not copy over from development, so check each one.
3. Activate Clerk's Convex integration, copy the Frontend API URL (`https://clerk.noren.yooi.me`) and set it as `CLERK_JWT_ISSUER_DOMAIN` on the dev Convex deployment now and on the Convex production deployment when it exists (`convex/auth.config.ts` reads it).
4. Put the production publishable and secret keys in `.env.local` and in the Vercel Production environment variables. Clerk refuses them on `localhost`, so sign-in is tried only on the deployed site at `https://noren.yooi.me` (there is no development subdomain, research D2).
5. Invite yourself and sign in once, then make that person the first steward with the admin-only `npx convex run` command (task T018), run once against each Convex deployment you use (the Clerk user ID is the same on both). Use the steward page to invite everyone else and set their roles; an invitation carries no role.

## Local run

Run the tests with `pnpm test` (they need no Clerk). Start the Convex dev deployment and the Next.js dev server with `pnpm dev`, run the seed scripts, and open `http://localhost:3000` to look at pages; Clerk's production keys refuse sign-in on `localhost`, so sign in on the deployed site. `seed-demo` creates one mock account per role and the fictional "Demo Cafe", all flagged mock. `seed-landmarks` loads landmark candidates that a person must confirm before use.

## Validation scenarios

| # | Story | Steps | Expected |
|---|---|---|---|
| 1 | US1 | Sign in as the mock creator; search a landmark and confirm the pin; paste public post URLs from three platforms and one unsupported URL | Place created with the person-placed pin; posts shown through platform embeds with credit and link; unsupported URL is a link card; nothing stored besides URL, platform, author link, date and note; the creator can open the draft page |
| 2 | US1 | Mark a source as gone, then run the source check | Entry hidden; no content remained |
| 3 | US2 | As the mock creator start an interview without consent, then with consent; upload a mock Japanese recording | First attempt refused; second succeeds; transcript appears; correcting it creates a new version; proposed claims each carry a quote |
| 4 | US2 | As the mock owner open the confirmation cards in Japanese; confirm two, remove one | Only the two confirmed claims can be published |
| 5 | US2 | Withdraw consent | Audio, transcript, claims and the sentences citing them disappear from every page |
| 6 | US3 | Compose the page | Every sentence has a footnote; a sentence with a deleted claim is held; no rating or score anywhere; original beside labelled translation |
| 7 | US4 | As the mock user leave an English note; as the mock owner read and reply | Owner sees Japanese with the original available; reply returns in English; both labelled machine translation |
| 8 | US5 | Open the app signed out; request a draft page signed out and as another role | Landmarks and the Demo Cafe visible and badged; drafts refused for everyone except stewards, that place's verified owner and its creator; a public source shows only if a steward recorded its author's agreement |
| 9 | US5 | Fetch any page headers; fetch `/robots.txt` | `X-Robots-Tag: noindex, nofollow` on every response; robots disallows all |
| 10 | US6 | Follow three source links as a test visitor | Creator view shows a total of three, with no personal details; mock activity excluded |
| 11 | US7 | Submit a takedown for a mock claim marked privacy-related | Content hidden at once; acknowledgement shown; outcome and appeal recorded |
| 12 | US9 | Perform a moderation action and an AI edit; define a second region file; navigate with only the keyboard | Audit log lists both; second region's settings apply; every place reachable through the list view |
| 13 | Gates | Run the invariants in `data-model.md` as tests | All five pass: no ratings, mock flags propagate, no unsourced sentence, owner confirmation, demo contains no real data |

## Before sharing the public demo

- Embed notice wording reviewed (V8); the demo shows only mock, openly licensed or consenting-creator content; the Demo marker is visible; no real business draft or personal data is reachable while signed out.
