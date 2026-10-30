# Contributing

Follow [Run it locally](README.md#run-it-locally) to set up the app. Read the [constitution](.specify/memory/constitution.md), [active spec](specs/001-noren-mvp/spec.md), [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before changing it.

## Product rules

- No ratings, scores or sentiment words, labels or ordering. Practical cautions use the region's fixed vocabulary.
- AI works only on consented text. Never process third-party posts with AI; show them through their platform's embeds with credit and a link.
- Every page stays noindex.
- Mock content belongs only to labelled mock users, carries a visible Demo marker and stays out of real-data statistics and exports.
- An owner approves their own story before publication. Every story sentence needs a source; withhold unsupported sentences. Withdrawal hides everything derived from the interview.
- `launchPackComplete` is the operator's switch. Do not bypass it or turn it on to make a feature or test work; real places wait for the launch pack.

## Working rules

- Write tests first. Every test must be able to fail: deliberately break the behaviour, observe the failure, then restore it and check that it passes.
- Containers fetch data; views are pure and receive data and callbacks through props.
- Add both Japanese and English for every new user-facing string. Keep Japanese plain and mark it unreviewed until a Japanese speaker reviews it. Keep originals canonical and machine translations labelled.
- Pin new dependencies to exact versions.
- Never put secrets in code or logs, or commit credentials or personal data.
- Convex code follows [convex/_generated/ai/guidelines.md](convex/_generated/ai/guidelines.md); read it first.
- Before writing Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/`, as required by AGENTS.md.

## Before opening a change

Run these checks and report any failures:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
```

## Reporting security problems

Please do not open a public issue for a security problem. Report it privately as described in [SECURITY.md](SECURITY.md).
