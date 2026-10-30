# 05. AI layer and place entity resolution

Lane: speech-to-text, translation, claim extraction and grounding checks, embeddings, Japanese place entity resolution, moderation, and cross-border handling of voice data.
Access date for every fact below: **2026-10-29** (today). Prices and terms change often, so re-check before committing money.

Method and caveats:
- Primary sources only (vendor docs, ToS, statutes, source repos, model cards, papers). Search results were used only to locate primary pages.
- Most pages were read through a summarising fetch tool. Wherever a figure drives a decision (prices, licences, shutdown dates, statute text) it was cross-checked against raw page text, the Hugging Face or GitHub API, or the e-Gov statute XML. Where a primary page could not be fetched (HTTP 403 or JavaScript-only), the fact is marked UNVERIFIED or flagged as "seen only in a search snippet of the primary page".
- No paid API was called. Free public endpoints were hit with single read-only requests: GSI address search (1 call), Wikidata API and Wikidata Query Service (a few calls).
- The model that wrote this report is Claude (Anthropic). Where Anthropic is one of the options, weigh that. Every provider recommendation below should be confirmed with a bake-off on real, consented Japanese audio.
- Not legal advice. Section 7 is a technical reading of the primary texts. Confirm with a Japanese data-protection lawyer before launch.

---

## Summary table

| # | Item | What it does for us | Verdict | One line why |
|---|---|---|---|---|
| 1.1 | OpenAI `gpt-transcribe` (hosted STT) | Japanese transcript | later | $0.0045/min and ZDR-eligible, but no diarization or timestamps; every older OpenAI transcription model shuts down 2027-02-26 |
| 1.2 | Google Gemini 3.5 Transcribe (hosted STT) | Japanese transcript with speakers and word times | **MVP** | Only hosted option verified here with ja-JP + diarization + word timestamps at about $0.005/min; paid tier only (free tier trains on data); no Japanese WER evidence |
| 1.3 | Google Cloud Speech-to-Text V2, Chirp 3 | Japanese transcript, diarization (batch) | later | GA for ja-JP, but `chirp_3` is US/EU only, heavier GCP setup, Chirp 3 price tier unverified |
| 1.4 | faster-whisper + Whisper large-v3 (open, MIT) | Self-hosted transcript | **MVP (local fallback)** | Voice never leaves our host; CER on Japanese sets is about 7 to 15%; about 1% hallucinated phrases, so human correction is mandatory |
| 1.5 | kotoba-whisper v2.x (open, Apache-2.0) | Japanese-tuned Whisper, bundled diarization recipe | later | Better than large-v3 on one broadcast test set, worse on two others; repo not updated since Oct 2024 |
| 1.6 | ReazonSpeech models (open, Apache-2.0) | Japanese ASR (NeMo, k2, espnet) | later | Models are Apache-2.0; corpus is CDLA-Sharing with Art. 30-4 purpose limit; no benchmark numbers verified |
| 2.1 | DeepL API | Translation | **avoid (free plan)** / later (paid) | Free "API Developer" plan forbids personal data and may store content perpetually; free allowance changed |
| 2.2 | Google Cloud Translation (NMT, LLM) | Translation, romanisation | later | 500k chars/month free then $20/M; has a `romanizeText` method |
| 2.3 | LLM translation (Claude, GPT, Gemini) | Context-aware ja-en with glossary | **MVP** | Same call as extraction, a few cents per interview, original text stays the record |
| 2.4 | Open translation models (NLLB, MADLAD, TranslateGemma, Hunyuan-MT, PLaMo) | Self-hosted translation | later; NLLB **avoid** | NLLB-200 and SeamlessM4T are CC-BY-NC-4.0; Gemma and Hunyuan carry use or territory restrictions |
| 3.1 | Claude API structured outputs + Citations | Schema-constrained claims, span citations | **MVP** (structured outputs) | GA and ZDR-eligible, but Citations and structured outputs cannot be used in one request |
| 3.2 | OpenAI Structured Outputs | Schema-constrained claims | **MVP (alternative)** | Strict JSON schema with enum and `pattern`; 1000-enum cap per schema |
| 3.3 | Gemini structured output + File Search | Schema output, file-level citations | later | File-level (not span-level) citations; free tier trains on data; fast model churn |
| 3.4 | Faithfulness tools (HHEM-2.1-Open, MiniCheck, RAGAS, TruLens, DeepEval, LettuceDetect) | Check each sentence is supported by its cited claim | deterministic checks + LLM judge **MVP**; NLI models later | The Japanese-capable HHEM-2.3 is hosted and commercial only; open NLI models are English |
| 4.1 | OpenAI text-embedding-3-small/-large | Candidate matching | **MVP** | $0.02/M tokens, JMTEB 70.86 avg, 1536 dims fits pgvector |
| 4.2 | BGE-M3, multilingual-e5-large (open, MIT) | Self-hosted multilingual embeddings | later | Needed for Malay/Chinese/English later; BGE-M3 has 8192-token input |
| 4.3 | Ruri-v3 (open, Apache-2.0) | Best Japanese-only embeddings | later | JMTEB 77.24 avg, but Japanese only |
| 4.4 | jina-embeddings-v3/v4, Sarashina embedding | Embeddings | **avoid** | Non-commercial or Qwen Research licence |
| 4.5 | pgvector | Vector search in Postgres | **MVP** | PostgreSQL licence; `vector` indexes to 2000 dims, `halfvec` to 4000 |
| 5.1 | Geolonia normalize-japanese-addresses | Normalise Japanese address text | **MVP** | MIT code, CC BY 4.0 data derived from the Address Base Registry; self-host the data |
| 5.2 | Jageocoder | Japanese geocoder | later | MIT; national dictionary is 20 GB or more |
| 5.3 | Digital Agency Address Base Registry + abr-geocoder | Authoritative town IDs and geocoding | later | PDL1.0 data, MIT geocoder; heavy (PostgreSQL + DuckDB) |
| 5.4 | GSI address search API | Free forward geocoding | later (sanity check only) | Works without a key (tested), but rate limits and terms unverified |
| 5.5 | pykakasi | Kana/romaji conversion | **avoid** unless project is GPL | GPL-3.0-or-later |
| 5.6 | cutlet (+ fugashi, unidic-lite) | Romaji suggestion | **MVP (suggest only)** | MIT packages; readings of proper nouns are unreliable, so human-confirm |
| 5.7 | Japan Post roman postal code CSV | Town-level kana and romaji | **MVP** | Official data, Japan Post claims no copyright on it |
| 5.8 | Wikidata reconciliation | QID for landmarks | **MVP (nullable)** | CC0, but only 460 items with coordinates under Nagasaki city |
| 5.9 | Internal place ID mapped to Google place_id, OSM id, QID | Identity layer | **MVP** | Own UUID plus an external-ID table; Google IDs are pointers, not data |
| 6.1 | OpenAI `omni-moderation-latest` | Abuse screening of text | **MVP** | Free; text and image; no audio; no Japanese-specific accuracy figure |
| 6.2 | Google Perspective API | Toxicity scores | **avoid** | Being sunset: service ends 2026-12-31; new requests stopped Feb 2026 |
| 6.3 | gpt-oss-safeguard, Llama Guard 4, ShieldGemma | Self-hosted policy classifiers | later | Heavy; Llama and Gemma terms are not OSI licences |
| 7 | Cross-border voice and transcript handling (APPI) | Compliance note | required reading | Art. 28 consent applies to foreign providers and foreign entrustment; amended law promulgated 2026-07-17 |

---

## 1. Speech-to-text for Japanese interviews

### 1.1 OpenAI transcription models

(a) What it does: file and streaming transcription of recorded speech. Current recommended model is `gpt-transcribe`. `gpt-live-transcribe` is for streaming.
(b) Auth: API key, pay-as-you-go. Default rate limits for `gpt-transcribe` are 5,000 requests/min and 2,000,000 tokens/min at the Build tier. Max file 25 MB. Inputs: mp3, mp4, mpeg, mpga, m4a, wav, webm.
(c) Pricing today (OpenAI pricing page): `gpt-transcribe` $0.0045/min; `gpt-live-transcribe` $0.017/min; `gpt-realtime-whisper` $0.017/min; legacy `gpt-4o-transcribe` $0.006/min; `gpt-4o-mini-transcribe` $0.003/min; `gpt-4o-transcribe-diarize` $0.006/min; Whisper $0.006/min. No free tier found on the page.
(d) Stability: the deprecations page (entry dated 2026-08-26) schedules **`whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` and `/v1/audio/translations` to shut down on 2027-02-26**, replacement "gpt-live-transcribe or gpt-transcribe". That is six months of notice. A further snapshot, `gpt-4o-mini-transcribe-2025-03-20`, shuts down 2027-01-20. No multi-year commitment was found.
Capability gap: per the speech-to-text guide, `gpt-transcribe` has **no diarization and no timestamps** (`timestamp_granularities` is "only supported for `whisper-1`", which is being shut down; `diarized_json` belongs to the deprecated diarize model). Response is JSON with `text` and `languages`. It accepts `prompt`, `keywords` and `languages` hints.
(e) Data terms (your-data guide): data sent to the API is not used to train models unless you opt in. Abuse-monitoring logs are kept up to 30 days by default for API features, but the endpoint table lists `/v1/audio/transcriptions` as abuse-monitoring retention "None", application state "None", ZDR eligible "Yes". These two statements are not fully reconcilable on the page; ask OpenAI sales to confirm in writing. Zero Data Retention and Modified Abuse Monitoring need prior OpenAI approval via sales (no self-serve path described). Japan (`jp.api.openai.com`): regional **storage** supported, regional **processing** not supported; `/v1/audio/transcriptions` is in Japan's storage list, but its processing list is None (transcription inference runs only in the US or Europe). Non-US regions require approval for abuse-monitoring controls. See section 7.
(f) Licence: proprietary hosted service. Output ownership terms not read (the OpenAI terms page returned 403).
(g) Japanese quality: OpenAI's guide does not mention Japanese; model page has no WER. A secondary report (The Decoder, citing Artificial Analysis) gives an English-centric AA-WER of 3.31% for GPT Transcribe. **No primary Japanese benchmark found: UNVERIFIED.** Malay/Chinese: language-hint codes include ISO 639-1 and regional `zh` codes; Malay accuracy UNVERIFIED.
(h) Verdict: **later.** Cheap and ZDR-eligible, but missing the two features claims need (speaker labels for "author", timestamps for quote spans) and its predecessors are being removed in four months.

### 1.2 Google Gemini 3.5 Transcribe (Gemini API)

(a) Speech-to-text with automatic language detection (85+ locales), speaker diarization (up to 8 speakers; attribution for 3+ is "experimental"), word-level timestamps, smart transcription (removes disfluencies), custom vocabulary up to 1,000 terms.
(b) Auth: Gemini API key via Google AI Studio; billing must be enabled to get "Paid Services" terms. Audio up to 1 hour per request, **30 minutes when diarization or word timestamps are enabled**. The model page lists no Batch API, caching or Flex support.
(c) Pricing (Gemini pricing page): paid tier $2.00 per 1M audio tokens in and $12.00 per 1M text tokens out, "about $0.005 per min" blended (25 audio tokens/s). `gemini-3.5-transcribe-live` about $0.009/min. Free tier exists but is "Used to improve our products: Yes".
(d) Stability: model page says latest update August 2026 and does not label it preview; it has no deprecations entry yet. Whether it is GA is UNVERIFIED. The Gemini API changed surface recently (docs list "Migrate to Interactions API" and "Interactions breaking changes (May 2026)"). Flash-family models are replaced every 6 to 8 weeks (3.5 on 2026-05-19, 3.6 on 07-21, 3.7 on 08-13, 3.8 on 09-02) and older endpoints "automatically route" to the newer model, so behaviour can change under the same ID. Shutdown dates in the table are "earliest possible" dates. No multi-year free or credit commitment found.
(e) Data terms (Gemini API Additional Terms): **unpaid services** (including unpaid quota): Google uses prompts and responses to "provide, improve, and develop" products and human reviewers may read them; the page says "Do not submit sensitive, confidential, or personal information to the Unpaid Services." **Paid services**: prompts and responses are not used to improve products and are processed under the Cloud Data Processing Addendum; Google logs prompts and responses "for a limited period of time" for abuse detection, and data "may be stored transiently or cached in any country in which Google or its agents maintain facilities." So Japanese voice leaves Japan, location not selectable. Japan, Malaysia and Singapore are on the available-regions list.
(f) Licence: proprietary hosted service.
(g) Japanese: ja-JP, Malay (ms-MY), Mandarin (cmn-Hans-CN) and Cantonese are listed as supported. Google's announced WER figures (via search summary, not fetched from a primary page) are 2.6% non-streaming and 5.04% on FLEURS multilingual average, and a Japanese article notes the 2.6% set is not Japanese. **Japanese WER and Japanese diarization accuracy: UNVERIFIED.** Limitation that matters to us: custom vocabulary is incompatible with diarization and with word timestamps, so place-name hints cannot be fed in the same call.
(h) Verdict: **MVP**, as the default hosted STT, behind a provider interface, with mandatory human correction and a bake-off on real consented audio. Cost for a 30-minute interview is about $0.15.

### 1.3 Google Cloud Speech-to-Text V2 (Chirp 3, Chirp 2)

(a) Batch and streaming recognition; `chirp_3` has diarization for ja-JP and Mandarin (Simplified) in batch.
(b) Auth: Google Cloud project, billing, IAM, usually a Cloud Storage bucket for `BatchRecognize`. More setup than the Gemini API.
(c) Pricing (pricing page): V2 "Standard" models (list includes `chirp`) $0.016/min up to 500,000 min/month, tiers down to $0.004/min; dynamic batch $0.003/min; V1 has 60 free minutes/month. The page does not name `chirp_2` or `chirp_3` in the price table, so which tier they bill at is **UNVERIFIED**. Billed per second.
(d) Stability: Chirp 3 doc marks ja-JP and cmn-Hans-CN as GA, ms-MY as **Preview**. Chirp 3 regions: `us` and `eu` multi-regions only. Chirp 2 runs in `asia-southeast1` and `europe-west4`. Word-level timestamps "optionally enabled" with "some transcription degradation"; the page contradicts itself on this.
(e) Data terms: V1 data-logging page says Cloud STT "does not log customer audio data or transcripts" by default; opt-in logging gives a discount and lets Google train on the data. Whether the opt-in covers V2 is not stated. Japanese audio goes to US/EU (Chirp 3) or Singapore (Chirp 2).
(f) Licence: proprietary.
(g) Japanese: GA for ja-JP; no published Japanese WER found: UNVERIFIED. Malay Preview.
(h) Verdict: **later**, as a fallback if Gemini Transcribe proves weak.

### 1.4 faster-whisper and Whisper large-v3 (open)

(a) Self-hosted transcription. faster-whisper (CTranslate2) is a faster runtime for Whisper models.
(b) Friction: no accounts; needs a GPU box or a patient CPU. Optional diarization with pyannote and WhisperX.
(c) Cost: free software. Reference from the faster-whisper README (13 minutes of audio, RTX 3070 Ti 8 GB, large-v2): fp16 beam 5 = 1m03s and 4.5 GB VRAM; int8 = 59s and 2.9 GB; batch_size 8 fp16 = 17s and 6.1 GB. CPU int8 is supported.
(d) Stability: faster-whisper pushed 2026-10-25, openai/whisper pushed 2026-08-31, whisper.cpp pushed 2026-10-28, none archived. Model weights are static files: nothing can be shut down under us. This is the only option here with a three-year horizon we control.
(e) Data terms: none; audio stays on our host. This is the strongest answer to the APPI cross-border question (section 7).
(f) Licences (GitHub and Hugging Face APIs): faster-whisper MIT; openai/whisper MIT; whisper.cpp MIT; `openai/whisper-large-v3` tagged Apache-2.0 on Hugging Face; `whisper-large-v3-turbo` MIT; WhisperX BSD-2-Clause; pyannote-audio MIT. The pyannote model `pyannote/speaker-diarization-3.1` is MIT but gated: users must accept conditions on Hugging Face before download.
(g) Japanese evidence (kotoba-whisper-v2.0 model card, CER %): whisper-large-v3 = 8.5 (CommonVoice 8 ja), 7.1 (JSUT Basic 5000), 14.9 (ReazonSpeech held-out); large-v2 = 9.7 / 8.2 / 28.1. These are read speech and TV broadcast, not noisy shop interviews, so real-world error will differ. Hallucination: Koenecke et al., "Careless Whisper" (arXiv 2402.08021): "roughly 1% of audio transcriptions contained entire hallucinated phrases or sentences", 38% of those with harmful content. The Whisper paper (arXiv 2212.04356) reports 680,000 hours of multilingual training data, no per-language breakdown on the abstract page. The large-v3 model card language list includes Japanese and Malay (Chinese not checked).
(h) Verdict: **MVP as the local fallback** for recordings whose speakers decline overseas transfer, and for later regions where hosted quality is thin.

### 1.5 kotoba-whisper (open)

(a) Distilled Whisper large-v3 for Japanese; v2.2 adds a diarization + punctuation recipe (pyannote 3.1 plus a Japanese-fine-tuned segmentation model from diarizers-community, and the `punctuators` package).
(c) Free.
(d) Stability: Hugging Face models last modified 2024-10-23; GitHub repo last pushed 2024-10-23 and **has no licence file** (GitHub reports none). Maintenance risk.
(e) None (local).
(f) Model licences: v2.0 and v2.2 Apache-2.0; `kotoba-whisper-v2.0-faster` MIT. Trained on ReazonSpeech `all` subset (TV broadcast), which carries its own terms (see 1.6); how those terms flow to derived weights is UNVERIFIED.
(g) Model card CER %: kotoba-whisper-v2.0 = 9.2 (CommonVoice 8), 8.4 (JSUT), **11.6** (ReazonSpeech held-out) versus large-v3 8.5 / 7.1 / **14.9**. So it wins only in-domain. Card claims 6.3x faster than large-v3.
(h) Verdict: **later**; try it in the bake-off, but prefer plain large-v3 for support and licence clarity.

### 1.6 ReazonSpeech (open)

(a) Japanese ASR models: `reazonspeech-nemo-v2` (long-form up to hours, Longformer attention), `reazonspeech-k2-v2`, `reazonspeech-espnet-v2`.
(d) Stability: code repo pushed 2026-06-10; models last updated 2024.
(f) Licences: models and tools Apache-2.0 (project page, Hugging Face API). **Corpus** (35,000+ hours from terrestrial TV): CDLA-Sharing-1.0 plus "solely for the purpose of Japanese Copyright Act Article 30-4" (information analysis); gated. Share-alike data licence: flag if we ever train on it.
(g) The project page claims state-of-the-art and shows CER charts for JSUT-BASIC5000, Common Voice 8.0 and TEDxJP-10K, but the numbers are in images only: **UNVERIFIED**. All training data is TV speech.
(h) Verdict: **later.**

---

## 2. Translation, Japanese to English and back

### 2.1 DeepL API

(a) Machine translation with glossaries.
(b) Auth: account plus API key header `Authorization: DeepL-Auth-Key ...`; free keys use `api-free.deepl.com`.
(c) Pricing: the DeepL terms (pro-license page) now name the free API **"DeepL API Developer"** ("provided by DeepL free of charge"). A search snippet of DeepL's support article says API Free (500,000 characters/month) "can no longer be purchased" and that API Developer has a **1,000,000-character total (not monthly)** cap; the support page returned HTTP 403, so the allowance is **UNVERIFIED**. The documentation page I could read does not state a monthly limit. Paid-plan unit prices were not on any page I could read (third-party sites disagree): UNVERIFIED.
(d) Stability: ToS 3.3.3: "DeepL reserves the right to modify the functional scope of the DeepL API Developer at any time or to completely discontinue the free provision of the API at any time."
(e) Data terms (DeepL Terms and Conditions): ToS 3.3.2: API Developer "reserves the right to perpetually store any Content or Processed Content". ToS 8.3.11: **"If Customer uses DeepL API Developer, Customer shall not process any personal data with the API"**, with indemnity. Paid plans: content stored only temporarily as technically required (3.1.2); DeepL's pricing page says Pro data is "never used to train DeepL's AI models". DeepL may choose processing location, including third-party cloud (3.1.3). An interview transcript is personal data, so the free plan is out.
(f) Licence: proprietary; ToS forbids using output to "develop, market or train a machine translation algorithm".
(g) Japanese quality: no primary benchmark found: UNVERIFIED.
(h) Verdict: **avoid on the free plan; later on a paid plan** if LLM translation proves worse on Nagasaki vocabulary.

### 2.2 Google Cloud Translation

(a) NMT translation, glossaries, an LLM translation mode, Adaptive Translation, and `romanizeText`.
(c) Pricing (Cloud Translation pricing page): NMT first 500,000 characters/month free ("applied as a $10 credit every month"), then $20 per million characters; the translation LLM is $10 per million input characters and $10 per million output characters; document translation $0.08 per page; glossary creation not charged.
(e) Data terms: not read for this product (UNVERIFIED); Japanese text goes to Google Cloud.
(g) Japanese: no primary benchmark read.
(h) Verdict: **later**; worth testing `romanizeText` as a romaji suggester.

### 2.3 LLM translation

(a) Translate each claim with place-name glossary and a "keep proper nouns" rule inside the same schema-constrained call used for extraction.
(c) Cost: Anthropic Claude Haiku 5.5 is $0.10 input and $0.50 output per million tokens (prompts up to 100k tokens); Sonnet 5.5 $2 / $10; Opus 5.5 $4 / $20. OpenAI `gpt-6-luna` $0.10 / $0.50; `gpt-5.4-mini` $0.75 / $4.50. Gemini 3.5 Flash-Lite $0.30 / $2.50. A 30-minute interview is a few thousand characters of claims, so translation cost rounds to cents.
(d) Stability: Anthropic gives at least 60 days' notice before retirement; Claude Sonnet 4.5 retires 2026-11-30 (released 2025-09-29), Opus 4.1 retired 2026-08-05. Expect to re-pin the model ID about once a year. OpenAI and Google cadence in sections 1.1 and 1.2.
(g) Japanese evidence: no vendor publishes a first-party Japanese translation benchmark I could verify. The WMT25 General MT findings (aclanthology 2025.wmt-1.22) include English-Japanese among 16 pairs, with system rankings not verified here. Nejumi and Swallow leaderboards exist for Japanese LLMs, but I could not read their tables.
(h) Verdict: **MVP.** The original-language claim is the record; the English is a labelled translation with a "machine translated" flag until the source confirms.

### 2.4 Open translation models

| Model | Licence (HF API / card) | Note |
|---|---|---|
| NLLB-200 (3.3B, distilled 600M) | **CC-BY-NC-4.0** | Non-commercial: **avoid** |
| SeamlessM4T v2 large | **CC-BY-NC-4.0** | Avoid |
| M2M100 418M | MIT | Old, lower quality (quality not benchmarked here) |
| MADLAD-400 3B | Apache-2.0 | Usable; Japanese quality not verified |
| opus-mt-ja-en | Apache-2.0 | Small baseline |
| TranslateGemma 4B/12B (Jan 2026) | Gemma Terms of Use (gated) | Report: 55 languages on WMT24++; MetricX 12B 3.60 vs 4.86 baseline from a secondary summary. Gemma Terms include a Prohibited Use Policy, a clause letting Google "restrict (remotely or otherwise)" usage of Gemma Services, and a duty to pass the restrictions to derivatives. Not an OSI licence |
| Hunyuan-MT-7B (Tencent) | Tencent Hunyuan Community licence | **Does not apply in the EU, UK or South Korea** and use of output outside the Territory is "unlicensed"; avoid for a public site |
| PLaMo-2-translate (PFN) | "plamo-community-license" | Japanese-specialist; terms not read: UNVERIFIED |

Verdict: **later**; NLLB and SeamlessM4T **avoid**. Malay and Chinese: no verified benchmark.

---

## 3. Claim extraction, schema-constrained output, citations, grounding checks

### 3.1 Claude API (structured outputs and Citations)

(a) Structured outputs: `output_config.format = {type: "json_schema", schema}` or `strict: true` on tools. Citations: documents passed with citations enabled return `cited_text` plus location (character, page or block indices).
(b) Auth: API key; no onboarding hurdle beyond billing.
(c) Pricing: see 2.3. Citations: `cited_text` "does not count toward your output tokens".
(d) Stability: both features GA. The `output_format` parameter moved to `output_config.format`; old beta header removed (a breaking change in 2026). Model retirement with at least 60 days' notice.
**Incompatibility (primary doc):** "Citations and structured outputs are incompatible": enabling citations on a document together with `output_config.format` returns an error. So you must pick one per request.
Schema limits: no recursive schemas, no `minLength`/`maxLength`, no numeric bounds, array constraints only `minItems` 0 or 1, `additionalProperties` must be false. Enums are supported (case-insensitive compare is advised). `stop_reason: "refusal"` or `"max_tokens"` can produce output not matching the schema, so check.
(e) Data terms: "Retained data is never used for model training without your express permission." Conversation content is not retained by default except for "Covered Models" (Claude Fable 5, 5.1, Mythos 5, 5.1) which require 30-day retention and are not ZDR eligible. Structured outputs: ZDR "qualified" (only the JSON schema is cached up to 24 hours); Citations: ZDR eligible. Flagged or policy-violating content may be retained up to 2 years even under ZDR. **Data residency: `inference_geo` accepts only `"us"` or `"global"`; workspace geo only `"us"`; no Japan or Asia option.** US-only inference costs 1.1x.
(f) Licence: proprietary.
(g) Japanese: no verified first-party Japanese benchmark; test.
(h) Verdict: **MVP** for extraction using structured outputs (schema with `quote`, `claim_ids` enums), not Citations, because we need typed claims.

### 3.2 OpenAI Structured Outputs

(a) `text.format = {type: "json_schema", strict: true, schema}`; SDK helpers for Pydantic and Zod.
(d) Documented limits: up to 5,000 object properties and 10 nesting levels; 120,000 total characters of names and enum values; **at most 1,000 enum values across all enum properties** (and 15,000 total characters if one enum has more than 250 values); `pattern` and `format` strings supported (e.g. a regex for claim IDs); `minItems`/`maxItems` supported; `minLength`/`maxLength` not in the supported list; every field must be `required` and objects need `additionalProperties: false`. First request with a new schema has extra latency. Refusals and truncated outputs may not match the schema.
Citations: no native span-level citation over arbitrary supplied text was found in the pages read (File Search and web search return annotations): UNVERIFIED beyond that.
(e) Terms: section 1.1 (`/v1/chat/completions` and `/v1/responses` are ZDR-eligible "with limitations").
(c) Pricing: see 2.3 and 1.1.
(h) Verdict: **MVP alternative.** A pattern-constrained ID string avoids the 1,000-enum cap.

### 3.3 Gemini structured output and File Search

Structured output supports `enum`; `minLength`/`maxLength` "are not enforced". File Search returns `file_citation` annotations (file name and source) and, from Gemini 3, can be combined with structured outputs. That is file-level, not quote-span, so span verification is still ours. Free tier trains on data (1.2). Model churn per 1.2. Verdict: **later.**

### 3.4 Making "every sentence cites a claim ID" verifiable

Design (provider-independent, no single tool is sufficient):

1. **Generation as data, not prose.** The model returns `sentences: [{text, claim_ids: [..]}]` under a strict schema; `claim_ids` is `minItems 1` and each ID is constrained by enum or `pattern`. Prose without IDs cannot be rendered. (Anthropic allows `minItems` 1; OpenAI allows `pattern` and `minItems`.)
2. **Deterministic checks** (zero model risk): every ID exists and is approved; every claim's `quote` is a verbatim substring of the stored transcript or post (after Unicode NFKC normalisation); no sentence lacks an ID; numbers, dates, names in the sentence appear in a cited claim.
3. **Entailment check** per (sentence, cited claims) pair, by a model from a different family than the generator. Fail closed: any "not supported" blocks publication and sends the page to a human.
4. **Cross-lingual**: sentences are English, claims originate in Japanese. Store an English gloss per claim and check against both.

Open-source and hosted faithfulness tools (licences from GitHub and Hugging Face APIs):

| Tool | Licence | Language and status |
|---|---|---|
| Vectara HHEM-2.1-Open | Apache-2.0 | Model card says `language: en`. The multilingual **HHEM-2.3 (English, German, French, Portuguese, Spanish, Arabic, Chinese-Simplified, Korean, Russian, Japanese, Hindi) is "available exclusively via Vectara's platform"** and described as commercial. HHEM-2.1-Open: unlimited context, under 600 MB RAM |
| MiniCheck (Flan-T5-Large, RoBERTa-Large) | MIT models, repo Apache-2.0 | English; last push 2025-08. `Bespoke-MiniCheck-7B` licence not stated on the card: UNVERIFIED |
| AlignScore | MIT | English; last push 2024-03 |
| RAGAS (now `vibrantlabsai/ragas`) | Apache-2.0 | LLM-judge based; last push 2026-02 |
| TruLens | MIT | LLM-judge based; pushed 2026-10-28 |
| DeepEval | Apache-2.0 | LLM-judge based; pushed 2026-10-27 |
| LettuceDetect | MIT | Token-level span detector; pushed 2026-10-26; Japanese support UNVERIFIED |
| RefChecker (Amazon) | Apache-2.0 | **Archived** |
| Patronus Lynx 8B | **CC-BY-NC-4.0** | Avoid |
| IBM Granite Guardian 3.3 | Apache-2.0 | Groundedness among its risk checks; Japanese UNVERIFIED |

Constrained-decoding libraries if we self-host an LLM: Outlines (Apache-2.0), XGrammar (Apache-2.0), llguidance (MIT).

Verdict: **MVP** = steps 1 to 3 with an LLM judge; **later** = NLI models (MiniCheck, HHEM-2.1) as a cheap English-side pre-filter. Note the product consequence: for Japanese-source claims, no open-licensed Japanese entailment model was found.

---

## 4. Embeddings for matching a post or transcript to a place

Use: suggest candidate places for an imported post or transcript. The user still pins the place by hand, so embeddings only rank candidates and never decide. Place matching should lean on structured signals first (name, address, distance from the human pin); embeddings are the fuzzy fallback.

| Model | Dims / input | Licence | JMTEB avg / retrieval (Ruri-v3 model card) | Price |
|---|---|---|---|---|
| OpenAI text-embedding-3-small | 1536 (shortenable via `dimensions`) / 8192 tokens | proprietary | 70.86 / 66.39 | $0.02 per 1M tokens |
| OpenAI text-embedding-3-large | 3072 / 8192 | proprietary | 73.97 / 74.48 | $0.13 per 1M tokens |
| multilingual-e5-large | 1024 (not read) | MIT | 71.65 / 70.98 | free (self-host) |
| BGE-M3 | 1024 / 8192, 100+ languages | MIT | not listed on card: UNVERIFIED | free |
| Ruri-v3-310m (Nagoya) | 768 / 8192 | Apache-2.0 | **77.24 / 81.89** | free; Japanese only |
| Qwen3-Embedding 0.6B/4B | not read | Apache-2.0 | not verified | free |
| Gemini Embedding (001) / Embedding 2 | not read | proprietary | not verified | $0.15 / $0.20 per 1M tokens; free tier trains on data |
| jina-embeddings-v3 | n/a | **CC-BY-NC-4.0** | n/a | avoid |
| jina-embeddings-v4 | n/a | **Qwen Research License** (per its card) | n/a | avoid |
| Sarashina embedding v1 | n/a | **non-commercial** | n/a | avoid |
| EmbeddingGemma 300M | n/a | Gemma terms (gated) | n/a | later |

Stability: OpenAI deprecations page lists no 2026 embedding deprecations (text-embedding-3 models unaffected). Changing the embedding model means re-embedding everything; at MVP volume that costs cents, so store `embedding_model` and `dims` per row.
Data: embeddings endpoint is ZDR-eligible on OpenAI. Embed approved claims and public text, not raw transcripts.
Japanese benchmark source: JMTEB (SB Intuitions, repo CC-BY-SA-4.0); the live leaderboard moved to the MTEB leaderboard on Hugging Face. Numbers above come from the Ruri-v3 card, not an independent run. Malay and Chinese: BGE-M3 and Qwen3 claim broad coverage; no benchmark verified.

pgvector (README and LICENSE, version in tree 0.9.0 unreleased): `vector` indexed up to 2,000 dimensions, `halfvec` up to 4,000, `bit` up to 64,000, `sparsevec` up to 1,000 non-zero elements. text-embedding-3-large at 3072 dims therefore needs `halfvec` or the `dimensions` parameter. Approximate indexes filter after the scan, so region-filtered queries can return too few rows; since 0.8.0, iterative index scans (`hnsw.iterative_scan`) address this, which matters for a multi-region app. Licence: PostgreSQL License. Verdict: **MVP.**

Verdicts: OpenAI 3-small **MVP**; BGE-M3 **later** (self-hosted, for Malay/Chinese/English); Ruri-v3 **later** (only if Japanese retrieval matters most); jina and Sarashina **avoid**.

---

## 5. Japanese place and address entity resolution

### 5.1 Geolonia normalize-japanese-addresses

(a) Normalises Japanese address strings (kanji numerals, variants, county omission) and returns a level 0 to 8 plus coordinates.
(b) npm package; runs in Node 22/24/26 and browsers. Default data endpoint `https://japanese-addresses-v2.geoloniamaps.com/api/ja`; `file://` for local data in Node.
(c) Free.
(d) Stability: MIT, repo pushed 2026-10-26, latest GitHub release v3.1.3 (2024-12-24). Data repo `japanese-addresses-v2` is "updated monthly". The data README says the hosted API is free with no limits "but may be stopped or changed", and "for commercial operation we strongly recommend generating and hosting your own data".
(e) None for self-hosted data.
(f) Code MIT. Data CC BY 4.0 (built from the Digital Agency Address Base Registry); generation scripts MIT. Attribute Digital Agency and Geolonia.
(g) Weakness stated by the README: "poor overall in areas without 住居表示 (jukyo hyoji) addressing". Nagasaki's hillside districts commonly use lot-number (地番) addressing, but how well Geolonia handles them is UNVERIFIED. Data README also says residential or lot data may be missing even where addressing exists.
(h) Verdict: **MVP**, with data self-hosted. Treat result as a suggestion beside the human pin.

### 5.2 Jageocoder

MIT (the LICENSE file text says "Released under the MIT License"; GitHub's detector reports no recognised licence). Python 3.9.2+, needs a dictionary database (20 GB or more for all Japan; the README offers a server option). Last push 2026-04-21. Verdict: **later.** Whether a Nagasaki-only dictionary is practical is UNVERIFIED.

### 5.3 Address Base Registry and abr-geocoder

Digital Agency page: the registry publishes 町字 (town/district) master data as CSV from a data download site; the page says 住居表示 and 地番 data are not yet complete (its figure marks them as unfinished), updates arrive "as needed" with no schedule. This conflicts with the geocoder README, which imports residential and parcel data (`--pos`): UNVERIFIED which is current. Town IDs (町字ID) are the stable key; prefecture and municipality use 全国地方公共団体コード. Terms: the Digital Agency site applies PDL1.0 (公共データ利用規約 第1.0版) with a source credit, a note that edits must be labelled as edited, and "must not present edited material as if the government had issued it unaltered". The 地番 datasets also carry the 登記所備付地図データ利用規約. PDL1.0 is generally treated as compatible with CC BY 4.0, which Geolonia uses for its derived data: UNVERIFIED here. abr-geocoder: MIT, Go, PostgreSQL + DuckDB cache, pushed 2026-10-21; quickstart covers Tokyo only; nationwide needs PostgreSQL. Whether the ABR master includes kana and romaji (English-letter) fields: the geocoder source handles "kana spellings", romaji fields UNVERIFIED. Verdict: **later**; take its IDs through Geolonia's derived data for the MVP.

### 5.4 GSI address search (国土地理院)

Single test call on 2026-10-29: `https://msearch.gsi.go.jp/address-search/AddressSearch?q=長崎市出島町` returned HTTP 200 with a GeoJSON point (129.87236, 32.742996), title "長崎県長崎市出島町", empty `addressCode`. No key. Content licence: GSI site content is under PDL1.0 with source credit ("出典：国土地理院ウェブサイト"). The page says nothing about request limits or commercial use for the API; rate limits and SLA are **UNVERIFIED**. Verdict: **later**, only as a sanity check on a human pin; do not build on it.

### 5.5 Kana and romaji conversion

| Library | Licence | Note |
|---|---|---|
| pykakasi 2.3.0 | **GPL-3.0-or-later** | Copyleft; avoid unless our project is GPL-compatible |
| cutlet 0.5.2 | MIT | Uses fugashi (MIT) and unidic-lite / unidic (packages tagged MIT; the underlying UniDic dictionary licence was not read: UNVERIFIED) |
| jaconv 0.5.0 | MIT | Hiragana/katakana/width conversion |
| SudachiPy | Apache-2.0, **archived** 2022 | SudachiDict (Apache-2.0, updated 2026-10) is current; Sudachi core pushed 2026-09 |
| wanakana (npm) | MIT | kana to romaji for fixed kana input |
| kuroshiro (npm) | MIT | Needs a morphological analyser such as kuromoji (Apache-2.0) |

Key point: morphological analysers guess readings of proper nouns (place and shop names have non-standard readings), so any machine reading is a *suggestion* flagged unconfirmed. Authoritative sources for readings: Japan Post data (5.7) for towns; the owner or mapper for business names.
Cloud Translation `romanizeText` is another suggester (2.2).

### 5.6 Japan Post postal code data

Japan Post offers KEN_ALL kana CSV and a **roman-letter CSV** (readings in romaji), UTF-8 and Shift-JIS variants, difference files ADD/DEL by YYMM. The page says "郵便番号データに限っては日本郵便株式会社は著作権を主張しません" (Japan Post claims no copyright on the postal code data) and "自由に配布していただいて結構です" (you may distribute freely). Commercial use is not addressed explicitly. Also an official free postal-code and digital-address API since May 2025 (registration needed). Gives town-level kana and romaji, not building or shop level. Verdict: **MVP** for address kana/romaji.

### 5.7 Wikidata reconciliation

Licence: CC0 for structured data. Reconciliation via the Wikidata API (`wbsearchentities`) or OpenRefine reconciliation endpoints; OpenRefine is BSD-3-Clause.
Coverage test (Wikidata Query Service, 2026-10-29): **460** items with coordinates whose `located in` chain reaches Nagasaki city (Q38234); of these, 178 carry a kana name (P1814, "name in kana"). Example Dejima (Q640267) has labels in en and ja and coordinates, but no P1814 and no OSM relation ID (P402). So Wikidata covers landmarks, not the tiny businesses this app targets. Verdict: **MVP as nullable enrichment** (QID, kana, English label for landmarks only).

### 5.8 One internal place ID, many external IDs, names in many scripts

Primary-source constraints that shape the design:
- **Google place_id**: Maps Platform ToS 3.2.3 forbids scraping, pre-fetching or storing Google Maps Content, forbids caching, and forbids copying and saving "business names, addresses, or user reviews". Place IDs are exempt from the caching restriction ("You can therefore store place ID values"). IDs "may change over time", the same place can have multiple IDs, an obsolete ID returns `NOT_FOUND`, and Google recommends refreshing IDs older than 12 months. The page contradicts itself on whether ID refresh is free. Consequence: store the ID as a pointer with a verification date, and never copy Google's name or address into our tables.
- **OSM**: element IDs are unique only within a type (node, way and relation each have their own ID space), so store `type/id`. The OSM wiki "Permanent ID" page (a work-in-progress proposal, not policy) says the OSM id alone is "not stable enough" and that the `wikidata=*` tag is the most stable current bridge. Data is ODbL: attribution plus share-alike on derived databases. Flag for any import of OSM data.
- **Wikidata QID**: stable and CC0 but sparse (5.7).
- **Overture GERS**: 128-bit random UUID, registry of IDs; identifiers captured before release 2025-06-25.0 "will not resolve against current data". Licence of Overture places data not read: UNVERIFIED. Later.
- **ABR 町字ID** and **全国地方公共団体コード**: stable administrative keys for the town and municipality level.

Recommended schema (design, not a source claim):

```
place(id uuid PRIMARY KEY,            -- our own, never reused, never derived from any provider
      region_id, created_by, lat, lng, geo_source='human_pin', merged_into uuid NULL)
place_name(place_id, lang_tag, value, kind, source, verified_by, verified_at)
   -- lang_tag: ja | ja-Hira | ja-Kana | ja-Latn | en | ms | zh-Hans | zh-Hant
   -- kind: official | signage | alias | former | machine_suggestion
place_external_id(place_id, scheme, value, status, first_seen, last_verified, note)
   -- scheme: google_place_id | osm (value 'node/123') | wikidata_qid | gers
   --         abr_machi_aza_id | jis_lg_code | japan_post_zip
   -- status: confirmed | suggested | obsolete
```

Rules: unique on (scheme, value) only for `confirmed`; one place may hold several IDs of the same scheme; merges are soft (`merged_into`) and IDs are never deleted; Wikidata redirects and Google `NOT_FOUND` flip status to `obsolete`, not delete; the coordinates that govern are the human pin. Machine-suggested names (cutlet, Cloud Translation, LLM) are stored with `kind=machine_suggestion` and never shown as confirmed.
Region as configuration: `region` row carries language list, geocoder adapter (Geolonia/Japan Post for JP; a different adapter for Malaysia), and name-script policy, so Malay, Chinese and English names fit the same `place_name` table.

---

## 6. Moderation

### 6.1 OpenAI `omni-moderation-latest`

(a) Classifies text and images into 13 categories (harassment, harassment/threatening, hate, hate/threatening, illicit, illicit/violent, sexual/minors, self-harm, self-harm/intent, self-harm/instructions, sexual, violence, violence/graphic). It does not classify audio, so moderate the transcript. Not designed for CSAM detection.
(c) "The moderation endpoint is free to use." ZDR-eligible per the endpoints table; in Japan's storage list.
(d) Stability: older `text-moderation-latest` was shut down on 2025-10-27 with omni-moderation as the replacement. Model may be upgraded in place, so recalibrate thresholds.
(g) The launch post (fetch returned 403; reproduced from a search snippet of that page) says 42% improvement on OpenAI's internal multilingual eval across 40 languages, gains in 98% of languages. **No Japanese-specific figure found.**
Product note: policy is "stories, not scores". Use moderation as a flag-and-review gate, never to rank or score a place or person. Defamation and third-party personal data in claims (a neighbour, an ex-employee) are not in these categories and need human review.
(h) Verdict: **MVP.**

### 6.2 Perspective API

Official notice (perspectiveapi.com): "We will be sunsetting Perspective API"; "will no longer be in service after 2026"; service available through **2026-12-31**; usage and quota-increase requests accepted only until Feb 2026 and "After that, we will no longer accept any new requests"; "We will not be offering direct migration support"; extension requests: "Unfortunately, no." Reason given: "AI capabilities have evolved, and there is now less demand for a standalone tool specific to this area." Verdict: **avoid.**

### 6.3 Open policy classifiers

gpt-oss-safeguard 20B/120B: Apache-2.0 (Hugging Face API), policy supplied at inference time, text-only, released as a research preview 2025-10-29, "slow and resource-intensive" per the technical report (as summarised in search). Llama Guard 4 12B: Llama 4 licence (`other`, gated). ShieldGemma: Gemma terms (gated). Japanese quality UNVERIFIED for all. Verdict: **later.**

---

## 7. Sending personal voice recordings and transcripts to a US-hosted provider

Technical reading of primary texts. Confirm with counsel.

What the law says (APPI via e-Gov XML, PPC Q&A):
- **Personal information** (Art. 2(1)) is information about a living individual that identifies that individual by name or other description, including "音声" (voice) among the recorded forms. An interview recording or transcript naming and describing a shop owner is personal information. Voice-print feature data (Cabinet Order Art. 1, item 1, sub-item ニ: 発声の際の声帯の振動、声門の開閉並びに声道の形状及びその変化) is a 個人識別符号. Whether a plain recording counts as that is UNVERIFIED; treat it as personal information either way.
- **Art. 28(1)**: providing personal data to a third party in a foreign country requires the principal's prior consent to the foreign transfer, unless the country is designated as equivalent (per the PPC Q&A, as of September 2021 the EU and UK) or the recipient maintains a system meeting the PPC rule standards for taking equivalent measures continuously. **Art. 28(2)**: before asking for consent you must give the principal information about that country's data-protection system and the recipient's protective measures.
- PPC Q&A 12-1: the same applies "when entrusting handling of personal data to a foreign third party", so an overseas API acting as our processor does not escape Art. 28.
- A secondary JIPDEC document says a cloud provider that by contract does not handle the data and is access-controlled may not count as "handling"; this fits storage, not an AI API that reads the content. Treat AI transcription as provision or entrustment abroad.
- Whether the operator of this open-source site is a 個人情報取扱事業者 (business operating a personal-information database) was not confirmed in this pass: UNVERIFIED.

**2026 amendment (primary: PPC):** the Act amending the APPI passed on 2026-07-10 and was promulgated **2026-07-17**; it takes effect, apart from some parts, on a date set by cabinet order **within two years of promulgation** (by 2028-07-17). PPC's overview slides list: consent exceptions for statistics and AI-development uses (Arts. 30-2, 31-3), a 16-years-and-under rule that moves consent to the legal guardian, face-feature-data rules (not voice), administrative surcharges (Arts. 148-3 to 148-17), and a review of obligations for processors entrusted with data processing (Arts. 30-3, 58-2). Implementing orders and guidelines were still being drafted as of 2026-10-14. This lands inside our three-year horizon, so design for audit logs and processor contracts now.

What each provider's own documents say (voice or transcript sent to them):

| Provider | Retention and training | Where it runs |
|---|---|---|
| OpenAI API | No training unless opted in; abuse logs up to 30 days by default (transcription endpoint table says none); ZDR or Modified Abuse Monitoring only by approval, via sales | Japan option is storage at rest only (`jp.api.openai.com`); transcription inference runs in US or Europe |
| Google Gemini API (paid) | Not used to improve products; logged "for a limited period" for abuse | Any country where Google operates |
| Google Cloud STT | No audio or transcript logging by default; opt-in logging lets Google train | `chirp_3`: US/EU; `chirp_2`: Singapore or Netherlands |
| Anthropic API | No default content retention except Covered Models (30 days); never trained on without permission; ZDR available by arrangement | `us` or `global` only; no Japan region |
| DeepL API Developer (free) | Content may be stored perpetually; personal data prohibited | DeepL chooses location |
| Self-hosted Whisper | None | Our own host |

Practical stance (design, not legal advice):
1. Make contributor consent explicit about the country (US), the named providers, and a plain statement of that country's protection regime, which is exactly the Art. 28(2) information. Ask per recording; allow "do not send abroad".
2. Offer the local path (faster-whisper) for people who decline, and default to it if consent is absent.
3. Send the minimum: transcripts and claims, not raw audio, to the LLM; strip names where not needed; never use free tiers that train.
4. Prefer providers where ZDR or no-default-retention is contractual: ask OpenAI sales for ZDR in writing; Anthropic ZDR by arrangement; avoid Covered Models.
5. Keep a processing register (which provider saw which recording, when, under which consent).
6. Recheck after the cabinet order fixes the effective date.

---

## Recommended minimal AI stack for the MVP

1. **STT:** Gemini 3.5 Transcribe, paid tier, 30-minute chunks with diarization on, behind a `Transcriber` interface; faster-whisper large-v3 as the local path for consent-sensitive recordings. Whichever runs, the stored source of truth is the **human-corrected transcript** with timestamps.
2. **LLM (one provider, behind an interface):** claim extraction, translation and sentence composition with strict schemas. Claude Haiku 5.5 or Sonnet 5.5 (structured outputs, no default retention) or OpenAI `gpt-6-luna`/`gpt-5.4-mini`, chosen by a bake-off on real consented transcripts. Do not mix Citations with structured outputs.
3. **Grounding gate:** schema with `claim_ids` per sentence, deterministic checks (IDs exist, verbatim quote substring, no ID-less sentence), then an LLM entailment judge from a different vendor; fail closed to human review.
4. **Embeddings:** OpenAI `text-embedding-3-small` into pgvector (`vector(1536)`, HNSW, iterative scans), for candidate suggestions only; store model and dims per row.
5. **Place resolution:** human pin is authoritative; Geolonia normalize (self-hosted data) plus Japan Post roman CSV for address text; own UUID plus `place_external_id`; QID and Google place_id nullable pointers; cutlet suggestions flagged unconfirmed.
6. **Moderation:** `omni-moderation-latest` on transcripts and imported text as a flag-and-review gate. Skip Perspective.

Estimated per-interview AI cost, 30 minutes: STT about $0.15, LLM a few cents, embeddings a fraction of a cent.

**Most likely to need a human in the loop: place and business names, readings and identity** (kanji to kana to romaji to English, and which place a post or transcript is about). No machine source of truth exists for small businesses: Wikidata has about 460 coordinate items for the whole city, ABR and Japan Post stop at town level, Google forbids copying its names, and every analyser guesses proper-noun readings. Errors here are public and permanent. A second place that needs people is the interviewee confirming their extracted claims in Japanese, which catches transcription, translation and attribution errors in one step.

---

## Unverified / open questions

- Email exposure: earlier in this session I sent a User-Agent containing an email address to **www.wikidata.org** (API search and entity lookups) and **query.wikidata.org** (one SPARQL query). No other host received it. Subsequent requests use only the coordinator-specified User-Agent.
- No primary Japanese WER (or Japanese diarization accuracy) for `gpt-transcribe`, Gemini 3.5 Transcribe or Chirp 3. Only English-centric or multilingual-average figures via secondary reports.
- Whether Gemini 3.5 Transcribe is GA or still a preview label; its model stability beyond Aug 2026.
- Chirp 2 and Chirp 3 billing tier on the Google price page; whether data logging opt-in covers V2.
- OpenAI: conflict between the 30-day default abuse-log statement and the "None" entry for transcription; OpenAI DPA, enterprise-privacy and moderation-launch pages returned 403; the OpenAI terms and output ownership were not read.
- DeepL: current free allowance (500,000 per month vs 1,000,000 lifetime), paid prices, and Japanese quality. DeepL support pages returned 403.
- Google Cloud Translation data-use terms; Japanese translation benchmarks for any LLM (WMT25 en-ja ranking not read; Nejumi and Swallow tables not read).
- PLaMo community licence terms; Mesolitica Malaysian-Whisper licence (not stated in the API); `Bespoke-MiniCheck-7B` licence; UniDic dictionary licence behind unidic-lite; whether the ReazonSpeech corpus terms carry onto kotoba-whisper weights.
- BGE-M3 and Qwen3-Embedding JMTEB scores; multilingual-e5 max input length; Malay and Chinese embedding and ASR quality.
- ABR: kana and romaji fields in the town master, Nagasaki coverage, and the conflict between the Digital Agency page (residential and lot data unfinished) and the geocoder README; PDL1.0 vs CC BY 4.0 compatibility; where to download the data (the catalogue host did not resolve from this machine).
- GSI address search: rate limits, SLA and commercial use. Whether a reverse geocoder from GSI is usable was not checked.
- Jageocoder: a prefecture-sized dictionary.
- Geolonia behaviour on Nagasaki lot-number (地番) addresses.
- OpenAI native citation behaviour for supplied text beyond File Search annotations.
- APPI: whether a raw voice recording is itself a 個人識別符号; whether the operator is a 個人情報取扱事業者; the PPC list of equivalent countries today (only the Sept 2021 footnote was read); exact effective date of the 2026 amendment (not yet fixed by cabinet order).
- Overture places-theme licence; Google ID refresh billing (page contradicts itself).
- Anthropic and Google DPAs and APPI-specific commitments; Anthropic availability of a Japan inference region in future.

---

## Sources

All accessed 2026-10-29. Items marked (403) could not be fetched; the fact was taken from a search snippet or marked UNVERIFIED.

OpenAI
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/models/gpt-transcribe
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/embeddings
- https://developers.openai.com/api/docs/guides/moderation
- https://openai.com/index/upgrading-the-moderation-api-with-our-new-multimodal-moderation-model/ (403; snippet only)
- https://openai.com/enterprise-privacy/ (403)
- https://openai.com/policies/data-processing-addendum/ (403)

Google
- https://cloud.google.com/speech-to-text/pricing
- https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
- https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages
- https://docs.cloud.google.com/speech-to-text/docs/data-logging
- https://cloud.google.com/translate/pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/transcribe
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/file-search
- https://ai.google.dev/gemini-api/docs/deprecations
- https://ai.google.dev/gemini-api/docs/available-regions
- https://ai.google.dev/gemma/terms
- https://developers.google.com/maps/documentation/places/web-service/place-id
- https://cloud.google.com/maps-platform/terms
- https://perspectiveapi.com/

Anthropic
- https://platform.claude.com/docs/en/build-with-claude/citations
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- https://platform.claude.com/docs/en/manage-claude/data-residency
- https://platform.claude.com/docs/en/about-claude/model-deprecations

DeepL
- https://www.deepl.com/en/pro-license (Terms and Conditions: DeepL Pro)
- https://www.deepl.com/pro-api and https://www.deepl.com/en/pro-api
- https://developers.deepl.com/docs/resources/usage-limits
- https://developers.deepl.com/docs/getting-started/intro
- https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans (403; snippet only)

Open models and tools (licence and cards)
- https://github.com/SYSTRAN/faster-whisper (README raw)
- https://github.com/openai/whisper, https://github.com/ggml-org/whisper.cpp, https://github.com/m-bain/whisperX, https://github.com/pyannote/pyannote-audio
- https://huggingface.co/openai/whisper-large-v3, https://huggingface.co/openai/whisper-large-v3-turbo, https://huggingface.co/pyannote/speaker-diarization-3.1
- https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0 and https://huggingface.co/kotoba-tech/kotoba-whisper-v2.2, https://github.com/kotoba-tech/kotoba-whisper
- https://research.reazon.jp/projects/ReazonSpeech/, https://github.com/reazon-research/ReazonSpeech, https://huggingface.co/datasets/reazon-research/reazonspeech, https://huggingface.co/reazon-research/reazonspeech-nemo-v2
- https://arxiv.org/abs/2402.08021 (Careless Whisper), https://arxiv.org/abs/2212.04356 (Whisper)
- https://huggingface.co/facebook/nllb-200-3.3B, https://huggingface.co/google/madlad400-3b-mt, https://huggingface.co/Helsinki-NLP/opus-mt-ja-en, https://huggingface.co/facebook/m2m100_418M, https://huggingface.co/facebook/seamless-m4t-v2-large
- https://huggingface.co/google/translategemma-4b-it (gated), https://arxiv.org/abs/2601.09012 (TranslateGemma report, via search)
- https://huggingface.co/tencent/Hunyuan-MT-7B (License.txt), https://huggingface.co/pfnet/plamo-2-translate
- https://aclanthology.org/2025.wmt-1.22 (WMT25 findings, via search)
- https://huggingface.co/BAAI/bge-m3, https://huggingface.co/intfloat/multilingual-e5-large, https://huggingface.co/cl-nagoya/ruri-v3-310m, https://huggingface.co/Qwen/Qwen3-Embedding-0.6B, https://huggingface.co/jinaai/jina-embeddings-v3, https://huggingface.co/jinaai/jina-embeddings-v4, https://huggingface.co/sbintuitions/sarashina-embedding-v1-1b
- https://github.com/sbintuitions/JMTEB
- https://github.com/pgvector/pgvector (README, LICENSE, CHANGELOG)
- https://huggingface.co/vectara/hallucination_evaluation_model, https://huggingface.co/lytang/MiniCheck-Flan-T5-Large, https://huggingface.co/bespokelabs/Bespoke-MiniCheck-7B, https://huggingface.co/PatronusAI/Llama-3-Patronus-Lynx-8B-Instruct
- https://github.com/vibrantlabsai/ragas, https://github.com/truera/trulens, https://github.com/confident-ai/deepeval, https://github.com/Liyan06/MiniCheck, https://github.com/yuh-zha/AlignScore, https://github.com/KRLabsOrg/LettuceDetect, https://github.com/amazon-science/RefChecker, https://github.com/vectara/hallucination-leaderboard, https://github.com/ibm-granite/granite-guardian
- https://github.com/dottxt-ai/outlines, https://github.com/mlc-ai/xgrammar, https://github.com/guidance-ai/llguidance
- https://huggingface.co/openai/gpt-oss-safeguard-20b, https://huggingface.co/meta-llama/Llama-Guard-4-12B, https://huggingface.co/google/shieldgemma-2b

Address and place resolution
- https://github.com/geolonia/normalize-japanese-addresses (README)
- https://github.com/geolonia/japanese-addresses-v2 (README, DATA.md)
- https://github.com/t-sagara/jageocoder (README, LICENSE)
- https://github.com/digital-go-jp/abr-geocoder (README)
- https://www.digital.go.jp/policies/base_registry_address and https://www.digital.go.jp/policies/base_registry_address_tos
- https://dataset.address-br.digital.go.jp/documents/b80e77a0e2d24e5692be4af885eb3de7/about (page body not rendered)
- https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html (GSI content terms) and https://msearch.gsi.go.jp/address-search/AddressSearch (one test call)
- https://github.com/miurahr/pykakasi, https://pypi.org/project/pykakasi/, https://github.com/polm/cutlet, https://pypi.org/project/cutlet/, https://pypi.org/project/unidic-lite/, https://pypi.org/project/jaconv/, https://pypi.org/project/sudachidict-core/, https://registry.npmjs.org/wanakana, https://registry.npmjs.org/kuroshiro
- https://www.post.japanpost.jp/zipcode/download.html and http://www.post.japanpost.jp/service/search/zipcode/download/readme.html
- https://www.wikidata.org/wiki/Wikidata:Licensing, https://www.wikidata.org/wiki/Property:P402, Wikidata API (`wbsearchentities`, `wbgetentities`) and https://query.wikidata.org/sparql (count query run 2026-10-29)
- https://github.com/OpenRefine/OpenRefine
- https://wiki.openstreetmap.org/wiki/Elements, https://wiki.openstreetmap.org/wiki/Permanent_ID, https://www.openstreetmap.org/copyright
- https://docs.overturemaps.org/gers/

Japan data protection
- https://laws.e-gov.go.jp/api/1/lawdata/415AC0000000057 (APPI text: Arts. 2, 27, 28)
- https://laws.e-gov.go.jp/api/1/lawdata/415CO0000000507 (Enforcement Order, 個人識別符号)
- https://www.ppc.go.jp/all_faq_index/faq1-q12-1 (PPC Q&A 12-1, Art. 28)
- https://www.ppc.go.jp/news/press/2026/260717/ (promulgation notice)
- https://www.ppc.go.jp/personalinfo/legal/r8kaiseihogohou/ (2026 amendment page)
- https://www.ppc.go.jp/files/pdf/260717_kaiseihounitsuite.pdf (2026 amendment overview slides)
- https://www.jipdec.or.jp/ materials on cloud and Art. 28 (secondary, via search only)
