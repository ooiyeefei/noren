# Signed-out browser checks

Run against the deployed site (no local server starts):

```sh
E2E_BASE_URL=https://noren.yooi.me npx playwright test
npx playwright show-report
```

Both Pixel 7 (`phone`) and Desktop Chrome (`desktop`) run. External runs retry
once; HTML reports never open automatically. With no `E2E_BASE_URL`, Playwright
starts `pnpm dev` at localhost:3000, where production Clerk keys cannot sign in.

Offline discovery (no browser, server or network):

```sh
E2E_BASE_URL=https://example.invalid npx playwright test --list
npx tsc --noEmit
npx eslint tests/e2e playwright.config.ts
npx prettier --check tests/e2e playwright.config.ts
```

Default runs are read-only. The live submission is skipped with `writes disabled`.
Desktop horizontal-scroll checks are skipped with `phone viewport check only`.
Clerk's `.cl-rootBox` is excluded from axe and form-control naming checks; the surrounding shell is
included. Minor/moderate axe violations become `a11y-warning` annotations;
serious/critical violations fail. Other accessibility assertions still cover the page.

Only with explicit authorization, set `E2E_ALLOW_WRITES=1` to create one request:

```sh
E2E_BASE_URL=https://noren.yooi.me E2E_ALLOW_WRITES=1 npx playwright test takedown-form.spec.ts
```

The write runs only on desktop, with no retries, uses a random nonexistent place,
leaves privacy unchecked and starts details with `E2E TEST: please ignore`.
Its phone counterpart skips with an explicit reason. Do not use repeat runs,
`--repeat-each`, multiple shards or concurrent write-enabled invocations: each
invocation can create another request. No live tests were run in the sandbox.

Specs: `public-site.spec.ts`, `takedown-form.spec.ts`, `a11y-public.spec.ts`,
`csp-clean.spec.ts`, and `map.spec.ts`. The map spec checks both home-page
canvases, worker errors, translated failure messages and the worker JavaScript response.
Map checks run by default; set `E2E_SKIP_MAP=1` only where WebGL is unavailable.
Chromium without a GPU needs software GL fallback (for example
`--enable-unsafe-swiftshader`); the project config currently sets no launch flag.
