# Noren

Noren is a bilingual (Japanese and English) map and directory of Nagasaki's local places, built from OpenStreetMap data and places local creators add. A place can carry its owner's own story, made from an interview the owner consented to and approved sentence by sentence. There are no ratings, scores or reviews; pages are not indexed by search engines; AI runs only on text people consented to. The live site is [noren.yooi.me](https://noren.yooi.me). It is run as “Noren, an open-source project run by Yee Fei”.

## Status

This is an MVP. Real places are not published until the launch pack (terms, creator licence and privacy notice) is complete. The labelled demo place, Demo Cafe Noren (fictional), is fictional and belongs to a labelled mock account.

## Stack

- Next.js 16 on Vercel: pages and web request handling.
- Convex: backend functions, database and audio storage; production is in Sydney.
- Clerk: accounts with invite-only sign-up.
- MapLibre with OpenFreeMap tiles: the map.
- AI, chosen per step by a setting: Meta's Muse Spark and Muse Voice Transcribe through the Meta Model API, Anthropic's Claude, or an OpenAI-compatible transcription endpoint. See [AI, step by step](#ai-step-by-step).

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

The AI variables in the template are optional and belong on the Convex deployment, where the AI steps run. `AI_MODEL_EXTRACT`, `AI_MODEL_TRANSLATE`, `AI_MODEL_FOLLOWUP` and `AI_MODEL_CHECK_TRANSLATION` choose the model for claim extraction, translation, follow-up questions and the translation check. The template also lists `AI_MODEL_COMPOSE` and `AI_MODEL_ENTAIL`, which the configuration check accepts but no step reads: page composition and the grounding check use no model (see [AI, step by step](#ai-step-by-step)). A `meta:` id such as `meta:muse-spark-1.3` calls the Meta Model API (`META_API_KEY`), a `modal:` id such as `modal:noren-glimmer` calls our OpenAI-compatible Modal endpoint (`MODAL_BASE_URL`, `MODAL_PROXY_TOKEN`), a `vendor/model` id goes through AI Gateway (`AI_GATEWAY_API_KEY`) and a slashless id calls Anthropic directly (`ANTHROPIC_API_KEY`). Transcription uses `TRANSCRIBE_PROVIDER` (`meta`, `gateway` or `openai-compatible`), `TRANSCRIBE_MODEL`, `TRANSCRIBE_BASE_URL`, `TRANSCRIBE_API_KEY` and, optionally, `TRANSCRIBE_MAX_BYTES`. The [AI configuration](src/lib/ai/config.ts) checks them. Without them the app offers the typed-transcript fallback.

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

## AI, step by step

AI only ever works on words people agreed to share: an owner's recorded interview and the sentences they approve. Each step names its model in one Convex setting, so a step moves between Meta's models and Claude without a code change.

| Step | What it does | Setting | With Meta's models | Alternative |
| --- | --- | --- | --- | --- |
| Transcribe | Turns the owner's recording into text the interviewer then corrects | `TRANSCRIBE_PROVIDER=meta`, `TRANSCRIBE_MODEL` | `muse-voice-transcribe-1.0` (Japanese; the recorder sends 16 kHz WAV, split into 9-minute parts) | `openai-compatible` with `whisper-1` |
| Extract | Proposes short statements, each with a quote copied from the corrected transcript | `AI_MODEL_EXTRACT` | `meta:muse-spark-1.3`, strict JSON schema | `claude-sonnet-5-5` |
| Translate | Japanese ↔ English drafts of approved statements, labelled machine until a person checks them | `AI_MODEL_TRANSLATE` | `meta:muse-spark-1.3` | `claude-sonnet-5-5` |
| Follow up | An agent that reads the interview so far and suggests what to ask next | `AI_MODEL_FOLLOWUP` | `meta:muse-spark-1.3` with tool calling | `claude-sonnet-5-5` |
| Check translation | Compares each machine translation with the owner's words, or with a found post's quote, and lists claims it adds or leaves out | `AI_MODEL_CHECK_TRANSLATION` (unset: off) | `modal:noren-glimmer`, Muse Glimmer 30B (open weights) on a Modal endpoint, one forced tool call | any model above |

The follow-up agent ([src/lib/ai/follow-ups.ts](src/lib/ai/follow-ups.ts)) runs a tool loop. It searches the transcript, lists what earlier interviews already recorded and lists the region's practical topics (cash only, closed days and the rest). It then hands back up to five questions in the owner's language, each translated for the interviewer. Code keeps only questions that quote the owner exactly or ask about a topic nobody has covered, and nothing it suggests is stored or published.

Two steps that sound like AI work use no model. The page composer ([src/lib/claims/compose.ts](src/lib/claims/compose.ts)) is deterministic: it lists published statements in the owner's own words, or a stored translation of them, and writes no prose of its own. The grounding check ([src/lib/claims/grounding.ts](src/lib/claims/grounding.ts)) confirms that each sentence cites published statements that carry a quote. Its entailment stage is verbatim-only: a sentence passes only when it is exactly the text of a cited statement or its translation, and anything else is held back from the page (it fails closed). A model-based entailment judge from a different vendor is planned but not built (task T072 in [tasks.md](specs/001-noren-mvp/tasks.md)), so `AI_MODEL_COMPOSE` and `AI_MODEL_ENTAIL` do nothing yet.

The translation check ([src/lib/ai/translation-check.ts](src/lib/ai/translation-check.ts), [convex/translationChecks.ts](convex/translationChecks.ts)) is a small loop that can verify its own work. A faithful translation is marked checked. An unfaithful one is translated again once, with the check's lists as feedback ("do not add …; keep …"), and checked again; if it still differs, the public page shows the owner's own words with a "translation under review" note, and stewards see the lists on the place's admin page and decide: show the translation, or write their own. The endpoint scales to zero, and a sleeping one answers 503 at once while it starts. So checks queue for one scheduled run that sends one request, waits 30 seconds by scheduling another run, and then checks every queued translation on the one wake; after 9 minutes a check is marked unavailable and a steward can queue it again. Verdicts, lists, attempt counts and the setting used are stored and audited. The check runs only on an interview whose owner agreed to a consent text that names Modal and has not withdrawn it: the region file lists those versions in `consent.versionsNamingModal`, and the loader refuses a listed current text that does not name Modal in every language. Owners who agreed to an older text get no check; their machine translation stays as it was, shown and labelled machine-translated, and nothing of theirs is sent to Modal. The quotes of posts the story finder found are checked the same way, in the same run and on the same wake: they are public posts, not an owner's words, so no consent applies to them, and the consent rule above still decides alone for every interview statement. A quote's translation that is still unfaithful after its one re-translation is left off the card, which then shows the quote in its own words.

Limits that hold whichever model runs:

- A model never adds a place, story, caution or pick. Every statement must quote the transcript, and an owner approves it before anyone sees it.
- The owner's consent names both possible services for each step (Meta Platforms or OpenAI; Meta Platforms or Anthropic), and Modal, which runs the open-weight model that checks translations.
- Meta's `-contributor` models are refused, because Meta trains on what they receive. The standard models are not used for training.
- The app names no AI provider; the badge says only that AI assisted.

Noren was built from 30 October 2026; the Meta Model API steps and the follow-up agent were added on 2 November 2026.

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
