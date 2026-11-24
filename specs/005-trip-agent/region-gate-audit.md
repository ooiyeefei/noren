# W4 region gate

## Tasks done

- **W4 audit** — done. Inventoried the browser-facing Convex registrations and the Next.js route handlers, including the Connector and Plan my day call graphs.
- **W4 gate** — direct entry points gated. The Story Finder's global background queue and counters, and the global slug reservation, are documented below as larger changes.
- **W4 tests** — extended `convex/regions.test.ts` under the T036 fixture. Focused checks pass. The full suite found legacy fixtures that still need preview or a registered region.
- **T043** — outside W4. The Malaysia launch switch and legal documents retain their existing values.

## Files

- Shared gate and visibility — `convex/lib/region.ts`, `convex/lib/visibility.ts`.
- Map, checks, collection and discovery — `convex/places.ts`, `convex/checks.ts`, `convex/collection.ts`, `convex/facts.ts`, `convex/missions.ts`, `convex/osmSeed.ts`, `convex/walk.ts`.
- Connector, planner and trips — `convex/connector.ts`, `convex/plannerActions.ts`, `convex/tripActions.ts`, `convex/tripShare.ts`.
- Stories and publishing — `convex/stories.ts`, `convex/placeStories.ts`, `convex/storyConnector.ts`, `convex/storyFinder.ts`, `convex/storyPhotos.ts`, `convex/storyShare.ts`, `convex/instagramPosts.ts`, `convex/postcards.ts`.
- Claims, source and moderation paths — `convex/claims.ts`, `convex/interviews.ts`, `convex/links.ts`, `convex/openText.ts`, `convex/pages.ts`, `convex/sources.ts`, `convex/takedown.ts`, `convex/translationChecks.ts`.
- HTTP — `src/app/api/geo/maps-link/route.ts`, `src/app/api/mcp/route.ts`.
- Tests and handoff — `convex/regions.test.ts`, this report.

## Checks

- `pnpm vitest run convex/regions.test.ts` — 9 passed, including 6 new tests. The tests exercise signed-out reads, signed-in account and steward access, off-region refusal and the same access with preview on, and off-region internal seeding.
- `pnpm vitest run` — 5,420 passed, 11 failed across 5 of 255 files. Four trip tests and one test each in `osmSeed.test.ts`, `overtureSeed.test.ts` and `places.test.ts` used Malaysia without preview. Three tests in `authorization.test.ts` use the unregistered ID `kuala-lumpur` as a readable region. One `places.test.ts` failure was an unintended change to the unknown-region validation error, corrected after the full run.
- `pnpm vitest run convex/regions.test.ts convex/places.test.ts -t 'region|gates|removes|lets the internal'` — 15 passed, 73 skipped by the filter. Includes the corrected unknown-region check.
- `REGIONS_PREVIEW=malaysia-west pnpm vitest run convex/osmSeed.test.ts convex/overtureSeed.test.ts convex/places.test.ts convex/trips.test.ts -t 'imports Malaysia|stores Overture names|keeps add-a-place|trip access and planning'` — 10 passed, 154 skipped by the filter. Includes all seven failures traced to missing Malaysia preview.
- `npx tsc --noEmit -p tsconfig.json` and `npx tsc -p convex/tsconfig.json` — both passed on the final code.
- `npx eslint --no-warn-ignored $(git diff --name-only)` and `git diff --check` — both passed on the changed source files.

## Decisions

- `isRegionOn` uses `enabledRegionIds()`. The shared visibility checks run before public, ownership and steward access rules. Indexed readers that already enumerate or filter by enabled IDs keep that logic.
- Queries retain their existing missing-result shapes. This includes empty collection, photo and Instagram objects, and the per-position nulls returned by trip stop hydration. Link follows retain their existing nullable contract and do not write a visit when the destination is unavailable.
- An unmatched page URL can still be reported for takedown. A URL in an off region follows that same path. A supplied fact ID requires a match. An appeal on an unavailable receipt returns the existing unknown-code conflict.
- The Maps-link resolver filters coordinates covered exclusively by an off configured region. It preserves the pre-existing result for coordinates outside all configured regions.
- Preview exposes the same underlying operations as an enabled region, subject to feature-specific switches and authentication. The new fixtures verify this with the same IDs and records on both sides of the switch. They also verify that the internal OSM importer can seed while preview is off.
- Account erasure continues to operate on the account as a whole under FR-130. Regional records are affected only as part of the signed-in account's cleanup, and the endpoint returns no regional data.

## Audit

Function names below are public Convex registrations unless the path is an HTTP route. Rows group functions that use the same boundary. The target column includes caller-supplied identifiers and the links the handler follows to find a region.

| Function | What it takes | Was there a gap? | What I did |
| --- | --- | --- | --- |
| `places.listForMap` | Region ID, optional category | Yes | `readablePlaces` returns an empty list before scanning an off region. |
| `places.getBySlug`, `places.get` | Region ID and slug, or place ID | Yes | Shared place visibility returns null through `detail`. |
| `places.inCells` | Geohash cells, optional category | No | Existing enabled-region set filters the results. |
| `places.coverage`, `places.bySlug` | No arguments, or a slug | No | Existing iteration over enabled regions. |
| `places.listMine`, `places.listAll`, `places.listWaiting` | Region ID | Yes | Empty list after the existing account or role check. |
| `places.listOwned` | Session, linked ownership place IDs | Yes | Shared visibility filters the places. |
| `places.create` | Region ID, place details | Yes | Refuses off-region creation. Unknown IDs retain the input-validation error. Global slug reservations are noted below. |
| `places.updateNames`, `places.movePin`, `places.setCategory` | Place ID, new values | Yes | `requireEditablePlace` inherits the visibility gate. |
| `places.declineWaiting`, `places.setKind`, `places.setVisibility`, `places.attachOwner` | Place ID, plus value or person ID where applicable | Yes | Direct place lookups refuse an off region. |
| `checks.confirm`, `checks.report` | Place ID, optional problem details | Yes | `checkablePlace` inherits the gate. |
| `checks.listOpenReports` | Region ID | Yes | Gate both the requested region and hydrated places. |
| `checks.resolveReport` | Check ID and outcome | Yes | Gate the check's region and linked place before writing either. |
| `facts.forPlace`, `facts.report` | Place ID, plus key and value on report | No | Existing gate now uses the shared place visibility check. |
| `facts.remove`, `facts.hide` | Fact ID, plus reason on hide | Yes | Check the fact's regional field before a status change. |
| `collection.book` | Region ID, session for personal progress | Yes | Gate sets by region and filter saved badges through their owning sets. |
| `collection.set` | Region ID and neighbourhood ID | Yes | Gate the set, and suppress an off-region place reference in the last-visited field. Existing same-region panel filtering still applies. |
| `collection.forPlace`, `collection.checkIn` | Place ID | Yes | Gate both the place and linked set. |
| `collection.listForSteward` | Region ID | Yes | Gate the set list and skip off-region place joins. |
| `collection.swapPlace`, `collection.setStatus` | Set ID, plus panel and place IDs or status | Yes | Gate the set, supplied places and usable places for publication. |
| `collection.pickLine` | Place ID and selected line | Yes | Check the place and its set before changing the selection. |
| `missions.forPlace`, `missions.forRegion` | Place ID or region ID, caller's clock | Yes | Gate before mission and neighbourhood lookups. |
| `walk.forRegion` | Region ID | Yes | Return an empty list for an off region before loading the pool. |
| `connector.walk`, `connector.omikuji`, `connector.omikujiToday` | Region ID, optional neighbourhood or starting slug and walk options | Yes | Require the region before reading the pool or recording draw exposure. |
| `plannerActions.ask` | Conversation, memory, neighbourhood or start-place slug, language | Yes through its shared data adapters | Gate the server-selected region and inherit the map, place bundle, collection and draw gates on each tool call. |
| `tripActions.plan` | Request region, town IDs, pins, optional pin place IDs, seed | Yes for regional route and calendar output. Candidate details were gated. | Require the region before loading trip inputs. Existing candidate and stop hydration gates still apply. |
| `tripActions.interpret` | Messages and party input | No | It interprets submitted text and applies the trip feature switch. There is no regional data lookup. |
| `trips.stops` | Place IDs | No | Existing stop hydration returns null for off regions. |
| `tripShare.create` | Device trip ID and days with optional stop place IDs | Yes | Gate the previous link and all resolved stop IDs before writing. Keep the first eligible stop's region for a valid mixed-region share. |
| `tripShare.read`, `tripShare.remove` | Share code | Yes | Gate the link's own region. Individual stop details remain filtered by the existing hydrator. |
| `stories.add` | Place ID, story text, optional answer, carried-target and photo IDs | Yes | Shared place gate before insert. Suppress off-region source questions, and retain the same-region target rule. |
| `stories.listForPlace`, `stories.carriedTo` | Place ID | Yes | Gate the primary place and other places reached through a carried question. |
| `stories.carryTargets`, `stories.latest` | Place ID or region ID | Yes | Gate before computing targets or building the region's feed. |
| `stories.clearQuestion`, `stories.remove` | Story ID | Yes | Check the story's place for authors and editors. A carried target can confer editor rights only while on. |
| `placeStories.request`, `placeStories.forPlace`, `placeStories.stewardPanel` | Place ID or no argument for queue | Yes | Gate the requested place and filter previously queued runs in the steward panel. |
| `storyConnector.choiceOf`, `storyConnector.setAllowed` | Story ID and consent choice on write | Yes | Gate the parent place for reading and writing the story's permission. |
| `storyPhotos.forPlace`, `storyPhotos.beginUpload` | Place ID | Yes | Use the shared place visibility gate. |
| `storyPhotos.uploadTicket`, `storyPhotos.completeUpload` | Photo ID, dimensions on completion | Yes | Gate place before returning object keys or completing the row. |
| `storyPhotos.remove`, `storyPhotos.approve`, `storyPhotos.listWaiting` | Photo ID or session for the queue | Yes | Gate the photo's place for moderation and uploader removal. |
| `storyShare.card`, `storyShare.kit`, `storyShare.queue` | Story ID or region ID for the queue | Yes | The shared card lookup gates the place; an off-region queue is empty. |
| `storyShare.consentOf`, `storyShare.setShareConsent`, `storyShare.withdraw`, `storyShare.markPosted` | Story ID and consent choice where applicable | Yes | Gate the story via its place for writers and stewards. |
| `storyFinder.stewardOverview` | Session | Yes | Gate candidate rows by region and place. The global aggregate still needs a regional index and backfill. |
| `storyFinder.attachAcceptedNow`, `storyFinder.hide` | No arguments for the batch, candidate ID for hide | Yes | Scope the synchronous acceptance batch and the candidate-ID mutation. Internal acceptance retains its existing scope. |
| `storyFinder.requestCheck` | Optional attach flag | Yes | Deferred. It schedules an internal chain that claims a global batch and returns global counts. See below. |
| `instagramPosts.overview` | Region ID | Yes | Return the empty overview shape for an off region and filter off-region place joins. |
| `instagramPosts.approve` | Story ID | Yes | Gate the story's place before queueing a post. |
| `instagramPosts.cancel`, `instagramPosts.retry`, `instagramPosts.markRemoved` | Post ID | Yes | Gate the persisted post region before transitions. |
| `instagramPosts.cardForPost` | Post ID and image token | Yes | Gate the post region and the story's place before returning card text. |
| `postcards.moments` | Session | Home-only already | Check the server-selected region before reading its moments. |
| `postcards.mine`, `postcards.remove`, `postcards.view` | Session, postcard ID or code | Yes for saved cards or joined places | Filter own cards and joined places, gate removal, and keep the existing home-region requirement for the public link. |
| `postcards.create`, `postcardActions.draft` | Story or stamped-place IDs and message fields | Off-region choices were excluded, but the refusal and lookup order differed | The shared item resolver refuses an off-region place before exposing item-specific results or passing content to the model. |
| `sources.listForPlace`, `sources.listForSteward`, `sources.add` | Place ID, plus URL and sharing fields on add | Yes | Inherit the place visibility gate. |
| `sources.remove`, `sources.markGone`, `sources.recordDemoConsent`, `sources.revokeDemoConsent` | Source ID | Yes | Common source loader checks its place, including when the caller added the source. |
| `linkRead.previewLink`, `linkRead.draftNote` | Place ID and URL, language on draft | Yes | Their internal entry to the public action already uses the shared readable-place loader, now gated. |
| `links.peek`, `links.follow`, `links.mine` | Source ID or session for own links | Yes | Gate before returning the canonical URL, recording a visit, or returning personal link statistics. |
| `claims.listForPlace` | Place ID | Yes | Uses the now-gated place loader. |
| `claims.review`, `claims.setHumanTranslation`, `claims.markDisputed` | One or two claim IDs and action data | Yes | Gate the claims by their place before mutation. |
| `claims.proposeFromSpan` | Transcript ID and proposal fields | Yes | The interview-access check gates the transcript's parent place. |
| `pages.compose`, `pages.getPublished` | Place ID | Yes | Gate the compose write and use shared visibility for the published read. |
| `interviews.create`, `interviews.listForPlace` | Place ID, language on create | Yes | Use the now-gated readable-place loader. |
| `interviews.recordConsent`, `interviews.get`, `interviews.saveCorrection`, `interviews.withdraw` | Interview ID and operation fields | Yes | Interview-access helpers gate the place. Withdrawal has a separate check before its role-sensitive path. |
| `interviews.listMine` | Session | Yes | Filter summaries by the interview's place. |
| `audio.generateUploadUrl`, `audio.attach` | Interview ID, storage ID and duration on attach | Yes | Shared interview access gates the place. |
| `aiRequests.transcribe`, `aiRequests.proposeClaims`, `aiActions.suggestFollowUps` | Interview ID, reader language for follow-ups | Yes | Shared interview gate runs before using its text or scheduling work. |
| `aiRequests.translatePlace` | Place ID | Yes | Uses the now-gated place loader before scheduling translation. |
| `aiRequests.audioFormat` | No arguments | No | Capability metadata only. |
| `translationChecks.release`, `translationChecks.checkAgain` | Claim ID and language | Yes | Check the claim's place before selecting the claim translation. |
| `translationChecks.heldExcerpts`, `translationChecks.releaseExcerpt` | No arguments or translation-check ID | Yes | Check the source's place in lists and release. |
| `openText.listUnlinked` | Session | No | Unlinked snippets have no regional association. |
| `openText.listForPlace`, `openText.link`, `openText.approveExcerpts` | Place ID, snippet ID, optional spans | Yes | Gate the linked place and any existing link before writing. |
| `osmSeed.listCandidates` | Region ID, filters, pagination | Yes | Return a finished empty page for off regions. |
| `osmSeed.confirmCandidate`, `osmSeed.dismissCandidate` | Candidate ID and optional place fields | Yes | Gate the candidate's region in the shared public candidate loader. |
| `takedown.submit` | Page URL containing a slug, optional fact ID | No for slug resolution | Retains enabled-region lookup, and verifies the fact's own region as well as its place. |
| `takedown.statusByCode`, `takedown.appeal`, `takedown.list`, `takedown.decide` | Receipt code, request ID or status and pagination | Yes | Resolve linked place and fact off-switches before reading or changing the request. |
| `stampBook.mine`, `stampBook.forPlace`, `trail.mine` | Session or place ID | Yes | Shared visibility filters joined places. |
| `storyVoice.generateUploadUrl`, `storyVoice.transcribe` | Audio hash or upload/storage IDs, language | No | Personal upload and transcription state carries no regional place or story reference. |
| `ids.normalize` | Place or interview table and ID text | No | ID format only, independent of document existence. |
| `people.current`, `people.ensureCurrent`, `people.setMyDisplayName`, `people.confirmMyDisplayName`, `people.markFilmSeen`, `people.setRole`, `stewardPeople.list` | Session, profile or role fields, person ID on role change | No | Account state and roles have no regional target. |
| `people.deleteMine` | Session | Account-wide cleanup can delete associated regional data | Preserved account erasure. It does not grant regional read or direct regional-write access. |
| `problemReport.submit`, `problemReport.list`, `problemReport.close` | Caller text including a page path, report ID or queue filters | No regional lookup | The page path is reporter text. These site-wide reports carry no region or place foreign key. |
| `/api/mcp` | Server-selected region, tool inputs such as slug or neighbourhood | Yes through shared Convex calls, plus the route relied on the feature flag alone | Return route-level 404 when its region is off. The adapter receives the Convex gates above. |
| `/api/geo/search` | Search text and language | No | The route uses enabled-region bounding boxes and countries, and filters provider results against those boxes. |
| `/api/geo/maps-link` | Google Maps URL, including possible coordinates | Yes | Suppress suggestions that resolve exclusively inside off configured regions. |
| `/api/share/[storyId]` | Story ID | Yes | Inherits the gated `storyShare.card` lookup. |
| `/api/instagram-card/[postId]` | Post ID and token | Yes | Inherits the gated `instagramPosts.cardForPost` lookup. |
| `/api/postcard/[code]/image` | Private code | Saved-place join gap | Inherits the gated postcard lookup. |
| `/api/story-photos/permit`, `/api/story-photos/finish` | Place ID or photo ID | Yes | Authenticated Convex permit and ticket lookups enforce region before returning keys or processing a photo. |
| `/out/[sourceId]` | Source ID | Yes | Null from the link handlers becomes 404 and no visit is recorded. |
| `/sitemap.xml`, `/llms.txt` | No caller selection | No | Both enumerate enabled regions and use the gated map query. |
| `/api/account/delete` | Session | Account-wide cleanup only | Preserves the account erasure path. |
| `/robots.txt` and favicon | No caller selection | No | Crawl configuration and static asset, with no regional records retrieved. |

Relevant Next.js pages were also traced. The place detail, editor and admin pages use the gated place APIs. Collection and walk pages get their results through their scoped Convex APIs. The private trip and postcard pages resolve codes through the gated Convex readers. The report, receipt and steward pages delegate to the reported Convex functions.

## Not done or unsure

- **Story Finder steward overview.** The displayed counts still include candidates from off regions.
  - Key the materialized counts by region, status and platform, backfill them from candidates, and sum only enabled and previewed regions in the overview.
- **Story Finder public check request.** The request still uses a global pending count and can schedule work on off-region candidates.
  - Count only enabled and previewed candidates at request time, and carry that scope through indexed candidate claims, scheduled batches and final attachment, checking current eligibility as the work runs.
- Place slugs are globally reserved even while another region is off, because the canonical route contains only a slug. A collision can still return the existing cross-region conflict on place creation. Making this indistinguishable requires changing the reservation or URL strategy.
- Cached pictures and SEO documents already issued while a region was on remain subject to their existing cache lifetimes. The route audit and tests exercised the backing code locally. Live serving, cache eviction and externally published copies were outside this work.
- Regression tests cover off and preview paths across the main read and write families. They do not execute every audited entry point or every HTTP handler. Existing role, feature and provider-specific suites still supply those assertions.
- The unscoped full-suite failures outside the assigned test file are listed in Checks. They need fixture updates in those files before the default suite will be green.

## For other agents

- Use `isRegionOn` for new public handlers that bypass `canReadPlace` or accept a region directly. Internal importers can continue to populate off regions.
- Update the existing Malaysia reader, creation and planning fixtures to set `REGIONS_PREVIEW=malaysia-west` where they are checking enabled behavior. Use a registered preview region in the visibility matrix's cross-region fixtures.
- Scope the Story Finder background checking and counters before relying on its steward dashboard during regional seeding.
