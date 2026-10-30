# Contract: Ports (interfaces between the app and external services)

Each port has one or more adapters selected by the region config or environment. Every adapter runs the same contract tests. Shapes are descriptive, not code.

## SourceAdapter

Turns a pasted URL into something the app can show and store.

- `matches(url) -> boolean`: pure URL pattern check; never fetches.
- `describe(url) -> { platform, canonicalUrl, embed }`: `embed` is a descriptor the UI turns into markup we generate (blockquote plus platform script, or iframe). It never contains HTML returned by a remote service.
- `liveness(canonicalUrl) -> "live" | "gone" | "unknown"`: uses a public signal where one exists; `unknown` means a steward decides.
- `policy`: `{ storesContent: false, aiAllowed: false, scriptHosts: [...] }`; the app refuses any adapter that sets `storesContent` or `aiAllowed` to true (Principle IV).

MVP adapters, in order: LinkCard, MetaEmbed (Instagram, Facebook, Threads), YouTube, X, GoogleMapsPlaceLink (stores `place_id`, links out), TikTokEmbedPlayer. Later: GenericWeb (needs an SSRF guard), Hatena, Bluesky.

## GeoProvider

Three separate concerns:

- `MapStyle`: `styleUrl(region, theme, lang)`, `attribution`, `glyphs`, `cjkMode`. Returns a MapLibre style.
- `Search`: `search(query, { bbox, countrycodes, languages, mode })` returns candidates `{ names, lat, lng, category, providerRef, attribution }`; `mode: "typeahead"` raises an error unless the adapter allows it.
- `Reverse`: `reverse(lat, lng, languages)`; used only after a person drops a pin.
- `policy`: `{ rateLimit, userAgent, cacheTtl, storage: "none" | "reference-only" | "full" }`, enforced centrally.

Default adapters: OpenFreeMap style and Nominatim (submit-only). Provider output is never stored as truth.

## Transcriber

`transcribe(audio, { language }) -> { text, segments[{start, end, text}], language, durationSeconds, modelVersion }`. Implemented with the AI SDK `transcribe` and one provider package. Speakers are not returned; they are set during correction. Streaming is out of the MVP.

## Translator

`translate(items[], { from, to, glossary, inputKind }) -> [{ itemId, text, modelVersion }]`. Allowed `inputKind` values, following constitution V: `claim` (owner-confirmed claims), `note` (notes and replies a contributor typed) and `live_chunk` (text from an interview whose consent covers AI processing). Never platform content, and never text from a source without a consent record; the port refuses any other kind. Output is labelled `machine` until a person confirms.

## ClaimExtractor

`extract(transcript, { regionConfig }) -> [{ kind, cautionType?, textOriginal, quote, spanStart, spanEnd }]`. Schema-constrained output. Contract: every item has a non-empty `quote` that is a substring of the transcript between the span offsets; items without one are dropped before they reach the database. Cautions must use a vocabulary key.

## GroundingChecker

`check(sentences[{ text, claimIds }], claims) -> [{ sentenceIndex, verdict: "pass" | "hold", reasons[] }]`. Two stages: deterministic (IDs exist and are published, no sentence without an ID, quoted material present) and an entailment check by a model from a different vendor than the composer. Any failure returns `hold`, and the app fails closed to human review.

## Storage (audio)

`putToken(path, contentType) -> uploadToken`, `stream(path) -> ReadableStream`, `delete(path)`. Default adapter: Convex file storage (upload URL issued by a mutation that checks consent; delete on withdrawal). Access only through authenticated functions. A Vercel Blob adapter is the fallback if the two-minute upload limit proves too short (research D4).

## Auth helper

`requireRole(roles[], { placeId? }) -> { person }` reads the role from the session token and, for owners, checks `place_owner`. All route handlers and server actions call it first.
