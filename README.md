# Noren

Noren is a bilingual (Japanese and English) map and directory of Nagasaki's local places, built from OpenStreetMap data and places local creators add. A place can carry its owner's own story, made from an interview the owner consented to and approved sentence by sentence. There are no ratings, scores or reviews; pages are not indexed by search engines; AI runs only on text people consented to. The live site is [noren.yooi.me](https://noren.yooi.me). It is run as “Noren, an open-source project run by Yee Fei”.

## Status

This is an MVP. Real places are not published until the launch pack (terms, creator licence and privacy notice) is complete. The labelled demo place, Demo Cafe Noren (fictional), is fictional and belongs to a labelled mock account.

## Stack

- Next.js 16 on Vercel: pages and web request handling.
- Convex: backend functions, database and audio storage; production is in Sydney.
- Clerk: accounts with invite-only sign-up.
- MapLibre with OpenFreeMap tiles: the map.
- An OpenAI-compatible transcription endpoint: consented interview audio to text.
- Anthropic: story drafting from consented text.

## Run it locally

You need Node.js 24, installed project dependencies, a Convex dev deployment and a Clerk development instance for local sign-in. The project uses pnpm as its package manager; keep its lockfile when installing dependencies. Production Clerk keys do not work on localhost. The existing [quickstart](specs/001-noren-mvp/quickstart.md) describes the operator's production-only sign-in setup; use your own development instance for local accounts.

Copy the environment template:

```sh
cp .env.example .env.local
```

Set these variables for your own services. Never commit their values.

| Variable                            | Purpose                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CLERK_SECRET_KEY`                  | Server access to your Clerk development instance.                                                                     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser access to that Clerk instance.                                                                                |
| `NEXT_PUBLIC_CONVEX_URL`            | Convex client endpoint, supplied by the dev deployment.                                                               |
| `NEXT_PUBLIC_CONVEX_SITE_URL`       | Convex HTTP endpoint for that deployment.                                                                             |
| `CONVEX_DEPLOYMENT`                 | Deployment selected by the Convex CLI.                                                                                |
| `CLERK_JWT_ISSUER_DOMAIN`           | Clerk Frontend API issuer; also configure it on the matching Convex deployment and enable Clerk's Convex integration. |
| `GEO_USER_AGENT`                    | Geocoding request identification: project name and repository URL, with no personal contact details.                  |

The AI variables in the template are optional and belong on the Convex deployment, where the AI steps run. `AI_MODEL_EXTRACT`, `AI_MODEL_TRANSLATE`, `AI_MODEL_COMPOSE` and `AI_MODEL_ENTAIL` choose the model for claim extraction, translation, composition and grounding checks. A `vendor/model` id goes through AI Gateway (`AI_GATEWAY_API_KEY`) and a slashless id calls Anthropic directly (`ANTHROPIC_API_KEY`). Transcription uses `TRANSCRIBE_PROVIDER` (`gateway` or `openai-compatible`), `TRANSCRIBE_MODEL`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY` and, optionally, `TRANSCRIBE_MAX_BYTES`. The [AI configuration](src/lib/ai/config.ts) checks them. Without them the app offers the typed-transcript fallback.

Start Convex, then leave it running and start Next.js in a second terminal:

```sh
npx convex dev
```

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm run dev` first copies the MapLibre worker so the map can load it from the same origin under the Content Security Policy.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes.

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
```

`npm test` runs Vitest unit and contract tests plus Convex function tests against a mock backend.

For end-to-end tests, set `E2E_BASE_URL` to the running site, then run:

```sh
npm run test:e2e
```

Against production, use this command:

```sh
E2E_BASE_URL=https://noren.yooi.me npm run test:e2e -- --workers=2
```

Production e2e must use `--workers=2`: a full parallel run trips Vercel's automatic DDoS protection and blocks your IP. Without `E2E_BASE_URL`, Playwright starts a local dev server using pnpm.

## Adding a region

Regions are configuration in `regions/<id>.json`. Start from [Nagasaki](regions/nagasaki.json) and follow the [region schema](src/lib/region/schema.ts), rather than hard-coding regional behaviour. A region file holds languages, map bounds and providers, name fallbacks, source adapters, categories, caution labels, consent, retention, takedown, demo and legal settings. The server loader validates region files; register new files in [the shared registry](src/lib/region/registry.ts) too. Set `REGION_ID` when choosing among multiple regions.

## Data and licences

The code is [Apache-2.0](LICENSE). OpenStreetMap data is ODbL, kept in its own tables, credited on every page that shows it and never committed to the repository. Stories belong to their owners and creators under the creator licence, which is still to be written.

## Repository layout

| Folder           | Contents                                                    |
| ---------------- | ----------------------------------------------------------- |
| `src/app`        | Japanese and English pages and web endpoints.               |
| `src/components` | UI components and containers.                               |
| `src/lib`        | Shared logic, adapters, region schema and translations.     |
| `convex`         | Backend schema, functions, access rules and function tests. |
| `regions`        | Region configuration files.                                 |
| `scripts`        | Seed, import and maintenance tools.                         |
| `tests`          | Unit, contract and end-to-end tests and fixtures.           |
| `specs`          | Product requirements, plans and research decisions.         |
