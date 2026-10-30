# 07. Live transcription, live translation, voice memos, read-time translation, place-name speech

Lane: streaming and near-live speech-to-text for Japanese, browser and on-device options, live translation, Japanese text-to-speech for place names, noisy-room handling (VAD, noise, speaker separation). Batch transcription, claim extraction, embeddings and APPI basics are in `05-ai-layer.md` and are not repeated; this report cites "(05)" where it reuses a 05 fact.

Access date for every fact below: **2026-10-29** (today). Prices and terms change often. Re-check before committing money.

## Method and caveats

- Primary sources only: vendor docs, pricing pages, official public price-list APIs (Azure Retail Prices API, AWS price list), source repos and licence files (GitHub and Hugging Face APIs), W3C Community Group spec, Chromium source, blink-dev and TAG threads, papers. Web search was used only to locate primary pages. Where a fact comes only from a search-result summary, it is marked as such.
- Most pages were read through a summarising fetch tool. Where a figure drives a decision (prices, licences, shutdown dates) it was cross-checked against a second primary page or an API. Where a page could not be read or did not state a fact, the fact is marked **UNVERIFIED**.
- No paid API was called and no app code was run. Free public endpoints were read with single GET requests: Azure Retail Prices API, AWS price-list JSON, GitHub and Hugging Face metadata APIs. The only User-Agent sent from this machine was `NagasakiStoryLayer-research/0.1 (one-off research queries)`. No email address or personal contact detail was put in any header, query string or request in this lane. (Contact addresses that appear on vendor pages were deliberately not copied here.)
- **Central evidence gap:** for every hosted streaming speech-to-text candidate, **no primary-source Japanese accuracy (CER/WER) or Japanese latency figure was found**. The only latency numbers are vendor-run or English-aggregate, and they are labelled as such. The Japanese numbers that exist are for open Whisper-family models (05, plus the Moonshine and kotoba model cards). Every provider choice below therefore needs a bake-off on real, consented Nagasaki shop audio.
- Not legal advice. Region and transfer statements are technical readings of vendor documents.

---

## Summary table

| # | Option | What it does for us | Verdict | One line why |
|---|---|---|---|---|
| 1 | Soniox real-time (`stt-rt-v5`) | JA streaming text plus EN translation in one WebSocket | **MVP (streaming lane)** | Only candidate verified with Japanese in the language list, a **Japan region** (storage and processing), browser temporary keys, in-stream translation, $0.12/h, no training on data; small vendor, no Japanese benchmark |
| 2 | Chunked upload: browser VAD, then batch STT (Gemini 3.5 Transcribe, OpenAI `gpt-transcribe`, Azure Fast Transcription, Soniox async) | "Near-live" captions 3 to 8 s behind speech (estimate), and the voice-memo path | **MVP (baseline lane)** | Provider-neutral, works in every browser, survives bad Wi-Fi, reuses 05 batch choices; cannot meet the 3 s target |
| 3 | Azure AI Speech: real-time STT, speech translation, Live Interpreter, Fast Transcription | STT and JA-to-EN translation, Japan East | later (best big-vendor fallback) | Japan East processing, no retention for real-time, 5 free h/month; 8 to 20 times Soniox's price and needs an Azure subscription |
| 4 | OpenAI Realtime transcription (`gpt-live-transcribe`, `gpt-transcribe`) | Streaming JA transcript over WebSocket or WebRTC | later | $0.017/min; **processing US/EU only**; Japanese not named on the guide; current models are the replacements for the ones retiring 2027-02-26 |
| 5 | OpenAI `gpt-realtime-translate` | Speech-to-speech interpreter with text of both sides | later | $0.034/min, WebRTC and client secrets; US/EU processing; we need captions, not a voice talking over the room |
| 6 | Gemini Live transcription (`gemini-3.5-transcribe-live`) | Streaming JA transcript, interim plus final | later | 10-minute sessions, no diarization or word times in live, about $0.009/min; free tier trains on data; processed in any Google country (05) |
| 7 | Gemini Live translate (`gemini-3.5-live-translate-preview`) | Speech-to-speech translation, transcripts of both sides | avoid | Preview; audio-only output; about $0.037/min |
| 8 | Google Cloud Speech-to-Text v2 streaming (Chirp 3) | JA streaming over gRPC | avoid (for MVP) | gRPC only (needs our proxy), `chirp_3` US/EU only, no streaming diarization, Chirp 3 price UNVERIFIED |
| 9 | Amazon Transcribe streaming plus Amazon Translate (Tokyo) | JA streaming, EN translation, Tokyo region | later | ap-northeast-1 supports ja-JP streaming, $0.01/min, $15/M chars; Japanese quality UNVERIFIED; heavier AWS onboarding |
| 10 | Deepgram Nova-3 / Flux multilingual | Streaming STT | later | Japanese is listed for Nova-3 and Flux multilingual but streaming-Japanese support and quality are not documented; no Japan region found |
| 11 | AssemblyAI Universal-3.6 Pro Realtime | Streaming STT | later | Japanese only on the $0.45/h model (the $0.15/h streaming model has no Japanese); no Japan region found, data terms unread |
| 12 | ElevenLabs Scribe v2 Realtime | Streaming STT | later | $0.39/h, JA in its best accuracy tier (general Scribe v2 claim); US storage by default, zero retention enterprise-only |
| 13 | Speechmatics real-time | Streaming STT plus JA/EN translation | later | Translation $0.65/h and partials under 0.5 s; regions EU/US/AU only; never enable the training discount |
| 14 | Web Speech API (`SpeechRecognition`) | Free browser dictation | **avoid as a dependency** | Chrome's default sends audio to Google's web service; on-device mode is desktop-only and its Japanese pack is UNVERIFIED; Safari and Firefox unreliable |
| 15 | transformers.js Whisper / kotoba-whisper ONNX (WebGPU or WASM) | Fully in-browser ASR | later (experimental local mode) | Works only on capable devices; about 530 MB q4 download for the Japanese-tuned model; no phone benchmark |
| 16 | whisper.cpp WASM | In-browser Whisper | avoid | Browser example limited to tiny/base (small at most) and 120 s clips; poor Japanese at those sizes |
| 17 | sherpa-onnx (ReazonSpeech zipformer, parakeet-ja, SenseVoice, Moonshine-ja) | Local ASR runtime | later | Japanese models are offline (non-streaming) plus VAD; no Japanese streaming model on the official list |
| 18 | Moonshine Japanese models | Tiny on-device ASR | avoid | Japanese models are legacy and under the Moonshine Community Licence (non-commercial, registration needed); Fleurs CER 17.9 (tiny) |
| 19 | kotoba-whisper (v2.2, bilingual-v1.0) | Japanese-tuned Whisper; ja-to-en and en-to-ja speech translation | later | Apache-2.0, ONNX build exists; trails large-v3 on read-speech CER; translation scores low |
| 20 | WhisperLiveKit | Self-hosted live ASR server with browser client | later | Apache-2.0, WebSocket server; GPU recommended; its default translation backend uses NLLB (CC-BY-NC weights); no latency figures |
| 21 | whisper_streaming / SimulStreaming | Streaming wrappers around Whisper | whisper_streaming **avoid**; SimulStreaming later | README says whisper_streaming is outdated; 3.3 s latency in the paper (English-centric); SimulStreaming wants 10 GB+ GPU |
| 22 | Chrome Translator and Language Detector APIs | On-device translation and language detection | later (progressive enhancement) | Stable from Chrome 138 but **desktop only**; Japanese, English, Chinese yes, Malay not listed |
| 23 | DeepL API and DeepL Voice | Text translation; streaming speech translation | avoid (free); later (paid) | Free plan bans personal data (05); Voice needs a paid API plan and Japanese is not confirmed |
| 24 | Google Cloud Translation, Amazon Translate | Server text translation | later | Both support ja, en, ms, zh; Translate $15/M chars in Tokyo; Google price carried from 05 |
| 25 | LLM translation | Context-aware JA/EN with glossary | **MVP** | Cents per interview (05); partial-sentence handling is a design problem, not a cost one |
| 26 | Meta Seamless (SeamlessStreaming, M4T v2) | Open speech-to-speech and speech-to-text translation | **avoid** | Models are CC-BY-NC-4.0 |
| 27 | Browser `speechSynthesis` | Speak a confirmed kana reading | **MVP (D)** | Free, no key, Baseline widely available; voice quality depends on the device |
| 28 | Azure Neural TTS (ja-JP) | Cached place-name audio | later | $15/M chars, 0.5M free per month, many ja-JP voices, Japan East |
| 29 | Gemini TTS | Cached place-name audio | later | Free tier exists but trains on data; price doubles on 2027-01-01; Japanese support not confirmed on pages read |
| 30 | Google Cloud TTS Chirp 3 HD | Cached place-name audio | later | ja-JP listed; custom pronunciation not available for ja-JP; price UNVERIFIED |
| 31 | OpenAI TTS (`gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`) | Spoken names | **avoid** | **Shut down 2027-01-06**; replacement is a realtime model, not a TTS endpoint |
| 32 | Amazon Polly (Tokyo) | Cached place-name audio | later | Neural $16/M chars in Tokyo; Takumi, Kazuha, Tomoko neural |
| 33 | VOICEVOX engine | Self-hosted Japanese TTS with user dictionary and accent control | later | Engine LGPL-3.0 (dual); every voice library has its own terms and credit is required |
| 34 | Style-Bert-VITS2 | Self-hosted expressive TTS | **avoid** | AGPL-3.0 |
| 35 | Silero VAD (`@ricky0123/vad-web`) | Cut speech from noise in the browser | **MVP** | MIT and ISC; under 1 ms per chunk on one CPU thread (vendor claim) |
| 36 | TEN VAD | Alternative VAD | **avoid** | Apache-2.0 plus Agora anti-competition conditions |
| 37 | Noise suppression: `getUserMedia` constraints, RNNoise, DeepFilterNet | Cleaner audio | constraints MVP; models later | Constraints are free but "limited availability"; RNNoise BSD-3 (last push 2025-02) |
| 38 | Diarization: language-as-speaker, provider diarization, pyannote community-1, Sortformer | Who said it | language-as-speaker MVP; others later | In a JA/EN interview the language identifies the speaker; open diarizers are offline or English-trained |

---

## 1. Streaming speech-to-text for Japanese (hosted)

### 1.1 Soniox real-time

(a) What it does: one WebSocket (`wss://stt-rt.soniox.com/transcribe-websocket`) returns Japanese tokens, optional per-token language labels, optional speaker labels, and, with a `translation` block, translated tokens in the same stream (`translation_status` marks original vs translated). One-way (`target_language`) and two-way (`language_a`/`language_b`) translation exist. Translated tokens carry no timestamps and are not 1:1 aligned with spoken tokens.
(b) Auth and browser: API key per project; for browsers the server mints a temporary key (`POST /v1/auth/temporary-api-key`, `usage_type: transcribe_websocket`, `expires_in_seconds` 1 to 3600, optional `single_use`, optional `max_session_duration_seconds` up to 18,000). So no credential ever ships in the repo or the page. Real-time limits: 300 minutes per session (fixed), 10 concurrent streams and 100 requests per minute by default (raisable except duration), per a search summary of the limits page. Japan, Malay, Chinese and English are all in the supported-language table.
(c) Price: real-time $0.12/h, async $0.10/h, translation included at no extra cost (pricing page). No free tier or free credit is stated on the page: UNVERIFIED.
(d) Latency and quality: on Soniox's own August 2026 benchmark page (Pipecat STT benchmark, 1,000 English-centric voice-agent samples, vendor-hosted, real-time only) `stt-rt-v5` shows 260 ms median and 305 ms P95 time to final segment and 1.34% mean semantic WER; Azure shows 1.21% WER at 1016 ms median. **No Japanese WER or latency figure is published**, and the benchmark says nothing about noise or proper nouns. Context terms (`context.terms`, `context.translation_terms`) can bias place names.
(e) Data: audio and transcripts are not stored unless you use the async API (async data is deleted after 30 days); never used for training; logs hold no audio or transcript content; SOC 2 Type 2, ISO 27001:2022, GDPR, HIPAA listed. **Regions: US, EU, Japan, India**, each with regional storage and processing; residency is per project, you request region access in the Console, and the project's keys only work on the regional domain (`stt-rt.jp.soniox.com`). Account metadata, usage and billing data are excluded and may be processed elsewhere. This is the only hosted streaming option in this report that offers Japan processing with documented no-training and no-default-storage terms in one place.
(f) Stability: model churn is high but managed: stt-rt-preview-v1 deprecated 2025-08-15, preview-v2 retired 2025-10-31, v3 (2025-10-21) removed 2026-02-28, v4 (2026-02-05) now an alias, v5 released 2026-06-16. Retired models are auto-routed to the successor with no API change; the page states no formal notice period. Small vendor, no multi-year commitment found.
(g) Licence: proprietary hosted service; we would use the raw WebSocket, so no SDK licence is involved. Terms of service not read: UNVERIFIED.
(h) Verdict: **MVP for the streaming lane**, behind a provider interface, gated on a bake-off with real Nagasaki shop audio. Biggest unknowns: Japanese proper-noun accuracy, whether silence is billed, whether JP region access is immediate.

### 1.2 Chunked upload baseline (browser VAD, then batch STT)

(a) The browser cuts the mic stream into utterances with Silero VAD (section 8.1) and POSTs each to our route, which calls a batch or "fast" STT and then the LLM translation (2.3). Each utterance is independent, so retry, ordering and reconnect are ordinary HTTP problems. The same code serves flow B (voice memo is one long utterance).
(b) Auth: server-held key only; no browser tokens needed. Works in any browser that can record audio (iOS Safari recording behaviour is UNVERIFIED here and must be tested).
(c) Price per audio hour (all from today's pages or APIs): Gemini 3.5 Transcribe about $0.30 ($0.005/min blended, 05); OpenAI `gpt-transcribe` $0.27 ($0.0045/min); Azure Fast Transcription $0.36/h (Retail Prices API, Japan East) with a "Fast Transcription Promo" row at $0.10/h effective 2026-09-01 whose end date is UNVERIFIED; Soniox async $0.10/h; ElevenLabs Scribe v2 batch $0.22/h; AssemblyAI batch $0.15 to $0.21/h.
(d) Latency: estimate only, no primary figure: utterance length plus end-of-speech silence threshold, plus upload, plus provider time, plus one LLM call. Plan on roughly 3 to 8 s after the speaker pauses. This does not meet "under about 3 seconds".
(e) Data and region: choose the provider by the transfer question (section 11). Azure Japan East and Soniox Japan are the Japan-processing choices.
(f) Stability: because the provider sits behind an interface and the contract is "audio in, text and timestamps out", a provider retirement costs a config change. Note OpenAI's 2027-02-26 retirements (05) and Gemini's model churn (05).
(g) Licence: n/a (our code).
(h) Verdict: **MVP baseline lane** and the guaranteed fallback if the streaming bake-off fails.

### 1.3 Azure AI Speech (real-time STT, speech translation, Live Interpreter, Fast Transcription)

(a) Real-time STT and translation over the Speech SDK (JavaScript SDK works in browsers); interim results arrive as speech is detected; two target languages included in the speech-translation price. **Live Interpreter** (Japan East supports it) does continuous language identification, language switching and speech-to-speech. Real-time diarization exists (limit 240 minutes per session). Whether the classic speech-translation source list includes ja-JP to en was not readable (page truncated): UNVERIFIED, though the LLM Speech page lists `ja` and `en` as target languages and Japan East lists real-time translation.
(b) Auth: Azure subscription, a Speech resource (key plus region), Entra ID or key-based tokens for browsers (token lifetime not read: UNVERIFIED). Heaviest onboarding of the hosted options. F0 free tier allows 1 concurrent request.
(c) Price (Azure Retail Prices API filtered to Japan East; the marketing pricing page rendered "$-" placeholders): real-time STT $1.00/h; speech translation $2.50/h; Fast Transcription $0.36/h; Live Interpreter input $1.00/h, standard audio output $1.50/h, text output $10 per 1M characters; Conversation Transcription $1.20/h (whether real-time diarization bills here: UNVERIFIED); neural TTS $15 per 1M characters. Free per month: 5 audio hours of real-time STT, 5 hours of speech translation, 0.5M TTS characters.
(d) Latency and Japanese quality: Soniox's benchmark lists Azure at 1016 ms median time to final and 1.21% English semantic WER (vendor-run). No Japanese figure. Japanese is GA for real-time and fast transcription with phrase lists; Custom Speech and phrase lists can bias place names.
(e) Data: for real-time STT, fast transcription and speech translation, "Microsoft does not retain or store the data"; real-time audio is processed in server memory only. Speech data is stored and processed in the region of the resource (Japan East or Japan West), Voice Live excepted. Containers can run on-prem (not evaluated).
(f) Stability: Microsoft documentation pages updated within the last month; Live Interpreter priced since 2025-09; no deprecation found for these features. Largest-vendor longevity of the options here.
(g) Licence: proprietary service; JavaScript SDK repository reports no recognised SPDX licence (UNVERIFIED terms).
(h) Verdict: **later**, as the fallback with the strongest longevity and Japan processing; promote to MVP only if Soniox fails the bake-off or a deployment already has Azure.

### 1.4 OpenAI Realtime transcription (`gpt-live-transcribe`, `gpt-transcribe`)

(a) Streaming transcript deltas over `wss://api.openai.com/v1/realtime?intent=transcription` (server) or WebRTC (browser). `gpt-live-transcribe` is the recommended model; `gpt-transcribe` in realtime needs a committed turn and a WebSocket. For `gpt-live-transcribe` server VAD is **not** supported: you run client-side VAD and send `input_audio_buffer.commit`. A `delay` setting from `minimal` to `xhigh` trades speed against accuracy. It takes `languages`, `prompt` and `keywords` hints. 24 kHz PCM16.
(b) Auth: API key; the translation guide documents server-minted client secrets for browsers, but the transcription guide only points to the sessions reference and does not describe browser tokens: UNVERIFIED for transcription sessions. Default limits (Build): 2,000 RPM, 210,000 TPM.
(c) Price: `gpt-live-transcribe` $0.017/min (about $0.51 per 30 min); `gpt-realtime-whisper` $0.017/min; `gpt-transcribe` $0.0045/min. No free tier stated.
(d) Latency and Japanese quality: no figures; the guide says delay varies and to benchmark with your own audio. **Japanese is not named** on the guide or the model page.
(e) Data: regional table lists `/v1/realtime/transcription_sessions` and `/v1/realtime/translations` as **United States, Europe (EEA + Switzerland)** only. Japan (`jp.api.openai.com`) is storage-only and lists no realtime endpoint. The retention table has no row for transcription sessions; the generic `/v1/realtime` row is reported as 30 days abuse-monitoring retention and ZDR-eligible. Treat Japanese audio as leaving Japan (05, section 7).
(f) Stability: Realtime Beta API removed 2026-05-12; `gpt-realtime` and `gpt-realtime-mini` families shut down 2027-01-20; `whisper-1`, `gpt-4o-transcribe*` and `/v1/audio/translations` on 2027-02-26; TTS models on 2027-01-06. `gpt-live-transcribe` and `gpt-transcribe` are the named replacements. Audio and realtime models drew deprecation announcements on 2025-09-15, 2026-04-22, 2026-07-20, 2026-08-26 and 2026-10-01, with roughly three to six months' notice each.
(g) Licence: proprietary.
(h) Verdict: **later**: $1.02/h is about twice Gemini Live, Deepgram, AssemblyAI or ElevenLabs and about eight times Soniox, with no Japan processing and Japanese support not documented.

### 1.5 OpenAI `gpt-realtime-translate`

(a) Streaming "interpreter": `v1/realtime/translations`, translated audio plus text deltas for both source (`session.input_transcript.delta`) and translation (`session.output_transcript.delta`). Browser WebRTC with server-minted client secrets; server WebSocket at 24 kHz PCM16.
(b) 16k context, audio-only input, audio and text output. Rate limits 200/650/850 audio-minutes per minute (Build/Launch/Grow).
(c) $0.034/min (about $1.02 per 30 min).
(d) The developer pages read do not list languages. A search-result summary of OpenAI's cookbook and announcement says 70+ input languages and 13 output languages with Japanese in both: UNVERIFIED by direct read. No latency or quality figures.
(e) US/EU processing only (above); retention not stated for this endpoint.
(f) It replaces `/v1/audio/translations`, which shuts down 2027-02-26.
(h) Verdict: **later**. We want text on a screen, not a synthesized voice over a live conversation.

### 1.6 Gemini Live transcription (`gemini-3.5-transcribe-live`)

(a) Live API speech-to-text: interim (`interim_input_transcription`) and final (`input_transcription`) results, VERBATIM or SMART mode, custom vocabulary up to 1,000 terms (about 100 works best), hybrid VAD (client sends end of speech). ja-JP is in the language list; empty `language_codes` enables auto-detect with code-switching.
(b) Browser: server mints an ephemeral token (`auth_tokens.create`, `uses` default 1, 30-minute expiry, 1 minute to open a session, session resumption about every 10 minutes). Ephemeral tokens are **Preview**, `v1beta` only and "only compatible with Live API". Audio is 16 kHz mono PCM in 100 ms chunks.
(c) Price: $3.50 per 1M audio tokens in plus $21 per 1M text tokens out, about $0.009/min (about $0.27 per 30 min). A free tier exists, and per 05 the free tier trains on data.
(d) Limits that matter: **10-minute sessions** ("continuous streaming for up to 10 minutes"), **no speaker diarization, no word-level timestamps** in live. A 30-minute interview needs session rotation. No numeric latency. No Japanese accuracy figure (05 has Google's multilingual figures only).
(e) Data: terms and any-country processing as in 05 (paid tier not used to improve products; processed in any Google country). No Japan option.
(f) Stability: the models page lists `gemini-3.5-transcribe` under "Stable"; the Live endpoint's own status is not stated. Flash-family churn per 05.
(h) Verdict: **later**: workable but weaker than Soniox on session length, diarization and region.

### 1.7 Gemini Live translate (`gemini-3.5-live-translate-preview`)

Speech-to-speech translation, audio in (16 kHz PCM) and translated audio out (24 kHz PCM); text exists only as transcripts of input and output audio. `ja` is supported. It is labelled **Preview** on the models page (latest update June 2026). Pricing: $3.50 per 1M audio tokens in, $21 per 1M audio tokens out, about $0.0368/min (about $1.10 per 30 min). A developer-forum field report (not primary) alleges that the documented setup shape for transcription settings is rejected at runtime. A search summary claimed the models page calls this "legacy"; the models page itself does not say so. Verdict: **avoid** while preview and audio-first.

### 1.8 Google Cloud Speech-to-Text v2 streaming (Chirp 3)

(a) `StreamingRecognize` is GA for ja-JP on Chirp 3 with utterance-level timestamps. **Diarization and word timestamps are batch/Recognize only** ("Chirp 3 supports transcription and diarization only in BatchRecognize and Recognize").
(b) Streaming is **gRPC only**, so a browser needs our server as proxy, plus a Google Cloud project, billing and IAM.
(c) Price: V2 Standard $0.016/min first tier (05); which tier `chirp_3` bills at is UNVERIFIED (the pricing page text would not render today). Streaming request limits read were V1 (about 5 minutes per stream); V2 limits UNVERIFIED.
(e) Regions: `chirp_3` is `us` and `eu` multi-regions only (more "planned"); Chirp 2 runs in `asia-southeast1` (05). No audio logging by default (05).
(h) Verdict: **avoid for MVP**: proxy burden, no Japan region, no streaming diarization, price unclear.

### 1.9 Amazon Transcribe streaming plus Amazon Translate

(a) ja-JP supports batch and **streaming**, custom language models (batch and streaming) and number formatting; ms-MY and zh-CN also stream. Streaming over SDK, HTTP/2 or WebSockets; PCM, FLAC or Ogg-Opus; advice to send 50 to 200 ms chunks and to send silence as zero bytes. Translate supports ja, en, ms and zh.
(b) Auth: AWS account, IAM; browser use needs signed WebSocket URLs or Cognito-style credentials (not read: UNVERIFIED).
(c) Price (AWS public price list published 2026-09-11): Tokyo streaming `StreamingAudio` $0.0001667 per second, which is $0.01/min or **$0.30 per 30 min**; Translate text in Tokyo $15 per 1M characters; Polly Tokyo neural $16 per 1M characters. Free tier: 60 minutes per month for 12 months (pricing page).
(d) Latency and Japanese quality: no figures (only chunk-size guidance). The streaming doc warns streaming "may have accuracy limitations in some cases".
(e) Data: Tokyo region (ap-northeast-1) offers Japanese streaming; whether AWS uses Transcribe content to improve services and how the opt-out works were not found in the Service Terms text read (the page cut off): UNVERIFIED.
(h) Verdict: **later**: the only big-cloud option besides Azure with Tokyo processing; check content-use terms and run the bake-off first.

### 1.10 Deepgram

(a) Streaming WebSocket; models Nova-3 (monolingual `ja`) and Flux multilingual (10 languages including Japanese). Chinese and Malay are Nova-3 languages. The docs do not say per language whether streaming is supported or whether diarization and keyterm prompting work for Japanese: UNVERIFIED.
(b) Temporary tokens: `POST /v1/auth/grant`, default 30 s TTL, up to 3,600 s, valid only at connection open (the stream continues after expiry). Opt-out of the Model Improvement Partnership Program is a request parameter (`mip_opt_out=true`); the default and retention period are not stated: UNVERIFIED.
(c) Price (per min, pay-as-you-go): Nova-3 monolingual $0.0077, multilingual $0.0092, Flux multilingual $0.0078; $200 free credit that does not expire (about $0.23 to $0.28 per 30 min).
(e) Regions: none mentioned for Japan; the page read does not mention EU either: UNVERIFIED.
(h) Verdict: **later**: Japanese streaming support is not documented, the data default needs a flag, no Japan region.

### 1.11 AssemblyAI

(a) Streaming (`universal-3-6-pro`, "Universal-3.6 Pro Realtime") supports 32 languages including Japanese, with mid-sentence code switching; the cheaper Universal-Streaming Multilingual ($0.15/h) covers only English, Spanish, German, French, Portuguese and Italian. Streaming diarization is an add-on.
(b) Browser: temporary token from `https://streaming.assemblyai.com/v3/token`, `expires_in_seconds` 1 to 600, optional `max_session_duration_seconds` 60 to 10,800 (default 3 h); sessions are billed on connection time. $50 free credit.
(c) Price: $0.45/h (about $0.225 per 30 min); diarization +$0.12/h (about $0.285 total).
(d) No accuracy or latency figure on the page read.
(e) Data retention and regions: page not found (404): UNVERIFIED.
(h) Verdict: **later**.

### 1.12 ElevenLabs Scribe v2 Realtime

(a) `wss://api.elevenlabs.io/v1/speech-to-text/realtime`, model `scribe_v2_realtime`; partial and committed transcripts, optional word timestamps; commit by VAD, manual, or turn prediction. Realtime diarization is not listed (diarization is listed for Scribe v2 batch only). Language by ISO code. The overview page claims "~150ms" with a footnote that was not readable, and places Japanese in the "Excellent (up to 5% WER)" tier for Scribe v2 generally, not for realtime.
(b) Browser: single-use token in the `token` query parameter. Billing counts every second sent, including silence.
(c) Price: $0.39/h realtime (about $0.195 per 30 min); batch $0.22/h; no free-credit figure on the page.
(e) Data: default storage in the US; isolated environments (EU, India, Singapore) are enterprise-only and STT coverage is not stated; **zero retention (`enable_logging=false`) is enterprise-only**. No Japan option.
(h) Verdict: **later**.

### 1.13 Speechmatics

(a) Real-time over WebSocket with JWTs; partials under 500 ms, finals about 0.7 to 2 s (docs), `max_delay` tunable; translation to and from English including Japanese, $0.65/h for up to five targets in batch and real-time. Whether Japanese real-time transcription is listed per feature is "not stated" on the languages page; a search summary says supported: UNVERIFIED.
(c) Price: Standard $0.45/h, Enhanced $0.80/h; opt-in model-training discount (33%) must stay off for personal data; $100 free credit (2 concurrent real-time sessions on free accounts). About $0.225 per 30 min plus $0.325 for translation.
(e) Data: real-time inputs and outputs "never stored" unless you opt into training; pre-recorded data auto-deletes after 7 days. Regions per a search summary of the docs: EU, US and Australia, no Japan (the regions page itself returned 404): treat as UNVERIFIED.
(h) Verdict: **later**.

---

## 2. Translation for live captions, read-time translation, speech translation

### 2.1 Chrome built-in Translator and Language Detector APIs

(a) On-device text translation (`Translator.create`, `translate`, `translateStreaming`) and language detection. Fits flow C (translate-on-read) as progressive enhancement and live-caption translation on a desktop laptop.
(b) No key; model and language packs download on demand, `Translator.availability()` first; creation needs user activation. Not available in Web Workers; top-level windows and same-origin iframes by default.
(c) Free.
(d) Status: **stable from Chrome 138** (Edge 148 also listed); Firefox and Safari not supported; MDN flags it "limited availability", experimental. Languages: Japanese, English and Chinese (including `zh-Hant`) yes; **Malay not listed**. "These APIs do not work on mobile devices." The Chrome hardware page puts the 22 GB / 4 GB VRAM requirements on the foundation-model APIs (Prompt, Summarizer, Writer, Rewriter, Proofreader), says Translator and Language Detector "use expert models", and gives no separate requirement for them. Translation quality is not benchmarked in any primary source read.
(e) Privacy: translation runs on-device; text need not leave the machine.
(f) Stability: W3C-track browser feature, one vendor ships it today.
(g) Licence: browser API, no licence issue.
(h) Verdict: **later, as optional enhancement**. Owners will mostly be on phones, where it does not exist, so it cannot be the main path for C.

### 2.2 DeepL API and DeepL Voice

Text API: free "Developer" plan forbids processing personal data and may store content perpetually (05); a search summary says the free allowance is 500,000 characters per month while another DeepL page says 1,000,000 characters total: still UNVERIFIED; paid per-character prices not found on any page readable today. DeepL Voice: WebSocket transcription plus multi-target translation plus translated speech, generally available **only to paid DeepL API subscribers** under enterprise terms (extra sub-processors for some languages); the page read does not list Japanese or give price or latency; the supported-languages page returned 404. Verdict: **avoid free; later paid**.

### 2.3 LLM translation

Same conclusion as 05 section 2.3 (verdict MVP). New points for live use: (1) translate only **finalised** segments (Soniox final tokens, VAD utterances), because Japanese is verb-final and a partial sentence translates badly (design reasoning, not a source claim); (2) pass the place-name glossary and prior two segments as context; (3) label the English as machine translation until the owner confirms; (4) text-only calls keep audio out of the LLM provider. Cost: about $0.02 per 30-minute interview at Claude Haiku-class prices from 05 (my assumption: 100k input and 20k output tokens including repeated context; prices not re-verified today).

### 2.4 Google Cloud Translation and Amazon Translate

Google: NMT $20 per 1M characters with 500,000 free per month, LLM mode $10 in and $10 out per 1M characters (carried from 05; today's page text would not render). Amazon Translate: Tokyo $15 per 1M characters; ja, en, ms, zh supported; real-time translation supports to and from English. Both are text-only and add a vendor hop. Verdict: **later**.

### 2.5 Meta Seamless

SeamlessStreaming (speech in, text or speech out, "around 100 languages") and SeamlessM4T v2 are **CC-BY-NC-4.0** (confirmed on the Hugging Face model tags and the repo README); the repo's own licence is "other"; "Seamless" and Expressive models fall under a separate Seamless Licence (not read: UNVERIFIED). Repo pushed 2026-09-08, not archived. Verdict: **avoid**. Same finding as 05 for NLLB.

---

## 3. Browser speech: the Web Speech API

(a) `SpeechRecognition` / `webkitSpeechRecognition` gives free in-page dictation. No translation, no diarization, no custom vocabulary except an experimental `phrases` biasing proposal.
(b) Chrome: default recognition uses a server engine. The Chromium source (`NetworkSpeechRecognitionEngineImpl`) points at `https://www.google.com/speech-api/full-duplex/v1` with Chrome's Google API key. **Audio leaves the device**; MDN says so for "some browsers, like Chrome". What Google retains is not stated in anything read: UNVERIFIED (the Chrome privacy whitepaper page returned no body text).
(c) Free.
(d) **On-device mode:** spec attribute `processLocally` (true means the user agent MUST process locally; default false lets it choose), `SpeechRecognition.available()` and `install()`. Chrome shipped it on **desktop in Chrome 135** (Windows, Mac, Linux; ChromeOS later; **Android and WebView unsupported**), about 60 MB per language pack, one pack per language. Whether the Japanese pack is available is UNVERIFIED (no source lists languages). Chrome states on the TAG review thread that it "is also moving away from cloud-based recognition and plans to phase it out over time." Firefox "is committed to supporting only on-device speech recognition"; per a November 2025 Google slide deck Firefox has it "behind a flag, shipping soon" (caniuse: disabled by default through Firefox 162). Safari: caniuse lists partial support since 14.1 on macOS and 14.5 on iOS; the engine Safari uses and whether audio leaves the device are UNVERIFIED. The spec is a "Draft Community Group Report" dated 27 October 2026 (Google's slides say the Audio Working Group adopted the work in 2024). The Chrome 135 desktop milestone comes from the Intent to Ship thread; the Chrome Platform Status page could not be rendered to confirm the stable release.
(e) Retention: see above; on-device mode keeps audio and text local per the spec text ("neither the audio nor the transcribed speech are sent to a third-party service").
(f) Stability: a feature in flux (cloud being phased out, on-device Japanese unknown); session behaviour in long interviews not checked.
(g) Licence: browser API.
(h) Verdict: **avoid as a dependency**. Use at most as an optional zero-key desktop demo with `processLocally: true`, hidden if `available()` is not `available`.

---

## 4. Fully local and in-browser ASR

### 4.1 transformers.js and ONNX Whisper (WebGPU or WASM)

(a) Whisper and kotoba-whisper run in the page via `@huggingface/transformers` (Apache-2.0, pushed 2026-10-29). The Japanese-tuned `onnx-community/kotoba-whisper-v2.2-ONNX` exists (last modified 2025-04-25, about 1,300 downloads a month) as does `onnx-community/kotoba-whisper-bilingual-v1.0-ONNX`.
(b) No keys. Downloads: kotoba v2.2 q4f16 about 370 MB encoder plus about 160 MB decoder (approximately **530 MB**); whisper-large-v3-turbo q4f16 about 370 MB plus 190 MB (about 560 MB); whisper-small q4 about 66 MB plus 224 MB (about 290 MB); whisper-base q4 about 19 MB plus 123 MB (about 140 MB) (Hugging Face file sizes).
(c) Free.
(d) Compute: docs call WebGPU "experimental" and default to WASM with q8; WebGPU support per caniuse: Chrome desktop 113+, Chrome Android 156, Safari iOS 26+, Safari macOS 26+ (partial), Firefox not supported. **Mid-range phone: no primary benchmark found, and none of the model pages state memory or speed for phones: UNVERIFIED.** The size column alone makes large Whisper-class models a poor fit for a mid-range phone on mobile data. Japanese quality at small sizes is poor: the Moonshine card reports Fleurs-ja CER 47.2 for Whisper tiny and 11.5 for Whisper medium; for large-v3 05 has 8.5 / 7.1 / 14.9 (Common Voice 8 / JSUT / ReazonSpeech).
(e) Data: audio never leaves the device.
(f) Stability: active, but WebGPU on mobile is new (Chrome Android 156 is the only listed version).
(h) Verdict: **later**, as an "offline / no-consent-to-upload" mode on laptops. Not MVP.

### 4.2 whisper.cpp WASM

README of `whisper.wasm`: suggests tiny and base ("x2 or x3 real-time"), runs up to small, beyond that "memory requirements and performance are unsatisfactory", audio limited to 120 s, greedy sampling only, needs WASM SIMD, "performance is not great". MIT, pushed 2026-10-28. Verdict: **avoid** for this app: tiny/base Japanese is not good enough and 120 s caps do not suit live captions.

### 4.3 sherpa-onnx and Japanese models

(a) Apache-2.0 runtime (pushed 2026-10-29). Japanese models in the `asr-models` release: `sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01`, `sherpa-onnx-zipformer-ja-en-reazonspeech-2025-01-17`, `sherpa-onnx-nemo-parakeet-tdt_ctc-0.6b-ja-35000-int8`, SenseVoice (zh/en/ja/ko/yue), `sherpa-onnx-moonshine-{tiny,base}-ja-quantized-2026-02-27`.
(d) The official pretrained-models doc lists the Japanese zipformer, parakeet-ja and SenseVoice models as **offline (non-streaming)**, used with VAD for microphone input, and lists **no Japanese streaming model**; the WebAssembly page lists browser demos only for English, Chinese-English and Cantonese. A browser build for Japanese is therefore UNVERIFIED. ReazonSpeech-k2-v2: about 159M parameters, RNN-T zipformer, Apache-2.0, clips up to about 30 s (model card); no CER on the card (05: numbers only in images).
(e) Local.
(h) Verdict: **later**: the realistic "live-ish" local design is VAD plus offline recognition per utterance (the same shape as lane 2 above), not true streaming.

### 4.4 Moonshine

MIT by default "in every language and at every size", **except** the legacy non-streaming models for non-English languages, which include **Japanese Base and Tiny** under the Moonshine Community Licence ("a non-commercial license", though the agreement text grants commercial use with registration and requires an enterprise licence above USD 1M annual revenue). Hugging Face card for the tiny-ja model: 27M parameters, Fleurs CER 17.87 and Common Voice 17 CER 18.3 (Whisper medium 11.5 / 29.09). Verdict: **avoid** for an open-source project: licence friction and weaker CER.

### 4.5 kotoba-whisper

As in 05 (Apache-2.0 models; v2.x trails or matches large-v3 depending on set). New: `kotoba-whisper-bilingual-v1.0` (Apache-2.0, 756M parameters) does Japanese ASR, English ASR and ja-to-en and en-to-ja speech translation, but its own card shows Ja-to-En translation WER 73.9 (CoVoST2) and 98.7 (Fleurs) against large-v3's 71 and 86.1, ASR CER 9.8 / 9.3 / 16.8 against large-v3's 8.5 / 7.1 / 14.9, and says cascaded NLLB pipelines translate Ja-to-En better. Verdict: **later**; use it only if a single local model for both directions is worth the quality loss.

---

## 5. Open-source streaming wrappers around Whisper

### 5.1 WhisperLiveKit

(a) Self-hosted server: WebSocket `ws://localhost:8000/asr`, OpenAI-compatible REST, bundled HTML/JS client (MediaRecorder by default, AudioWorklet with PCM input), VAD on by default ("`--no-vad` NOT ADVISED"). Default streaming policy is SimulStreaming (AlignAtt); alternatives LocalAgreement, faster-whisper, MLX, plus SenseVoiceSmall (Japanese listed), Voxtral, Qwen3-ASR, Canary. Sortformer is the default diarizer (Diart "not recommended"). `--language auto` "tends to bias towards English".
(c) Free software. GPU recommended, CPU supported; "one realtime session per GPU" for Qwen3 streaming.
(d) **No latency numbers** in the README (benchmarks ran on an H100 but figures are not given). Japanese streaming latency and quality: UNVERIFIED.
(e) Local: audio stays on our host.
(f) Apache-2.0 (GitHub), pushed 2026-10-23. Some bundled models carry their own terms: Canary-1b-v2 CC-BY-4.0, SenseVoiceSmall "its model license" (not read). Its translation uses NLLB (the README states no NC restriction; the NLLB weights themselves are CC-BY-NC-4.0 per 05), or an LLM-based `alignatt` backend.
(h) Verdict: **later**: a good laptop-in-the-shop demo mode; disable NLLB.

### 5.2 whisper_streaming and SimulStreaming

whisper_streaming (LocalAgreement-n): paper abstract reports **3.3 s latency** on an unsegmented long-form transcription test set (language not stated; a conference setting). README: "WhisperStreaming is becoming outdated in 2025", replaced by SimulStreaming; backends faster-whisper (GPU), MLX, OpenAI API. MIT (GitHub), last push 2025-11-12. SimulStreaming: MIT per README, about five times faster than its predecessor, "a GPU with at least 10 GB VRAM is recommended for large-v3", CPU "too slow for real-time use", 99 transcription languages; EuroLLM translation cascade to 35 targets. No Japanese latency figure for either. Verdicts: whisper_streaming **avoid**; SimulStreaming **later**.

---

## 6. Speech-to-speech and speech-to-text translation services

Covered in the option sections above; side by side:

| Service | Output | Japan processing | Price | Status |
|---|---|---|---|---|
| Soniox translation (in-stream) | Text (original plus translated tokens) | Yes (JP region) | included in $0.12/h | active, v5 |
| Azure speech translation / Live Interpreter | Text and/or audio | Yes (Japan East) | $2.50/h; Live Interpreter $1.00/h in plus $1.50/h audio out | GA |
| OpenAI `gpt-realtime-translate` | Audio plus text of both sides | No (US/EU) | $0.034/min | active |
| Gemini 3.5 Live Translate | Audio (transcripts optional) | No (any Google country, 05) | about $0.0368/min | **Preview** |
| Speechmatics translation | Text | No (EU/US/AU) | $0.65/h extra | active |
| DeepL Voice | Text and audio | not stated | not stated | paid API only |
| Meta Seamless | Audio or text | self-host | free | **CC-BY-NC-4.0** |

---

## 7. Japanese text-to-speech for place-name pronunciation (D)

Context: the hard problem is not voice quality but **reading**: a TTS must be given a human-confirmed kana reading (05 section 5: machine readings of proper nouns are suggestions). Feed kana, not kanji, wherever possible. A name is about 5 to 20 characters, so any paid engine costs well under a cent per name, and audio should be generated once and cached.

| Option | Terms read today | Notes |
|---|---|---|
| Browser `speechSynthesis` | Baseline widely available since 2018-09 (MDN); voices are "available on the current device" | Free, no key, works offline if an OS voice is installed. Japanese voice presence and quality per device: UNVERIFIED. **MVP.** |
| Azure Neural TTS | $15 per 1M characters; 0.5M free per month; Japan East; ja-JP voices: Nanami, Masaru (HD Dragon), Sakura and Haruto (HD Flash), Aoi, Mayu, Shiori, Keita, Daichi, Naoki | SSML with phonemes (not tested here). **Later.** |
| Gemini TTS | 3.8 Flash TTS $0.50 text in and $9 per 1M audio tokens out until 2026-12-31, then $1.00 and $18 from 2027-01-01; Free tier trains on data (05) | Japanese support not confirmed on the pages read. **Later.** |
| Google Cloud TTS Chirp 3 HD | ja-JP listed GA; **custom pronunciations and pause control are not available for ja-JP**; SSML and voice controls are Preview; regions include `asia-northeast1` | Price page would not render: UNVERIFIED. **Later.** |
| Amazon Polly | Tokyo neural $16 per 1M characters, standard $4; Japanese voices Mizuki (standard), Takumi (standard and neural), Kazuha and Tomoko (neural) | Lexicons and SSML not read. **Later.** |
| OpenAI TTS | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` **removed 2027-01-06** (announced 2026-10-01); replacement `gpt-realtime-2.1-mini` is not supported on `/v1/audio/speech` | No pronunciation control (only an `instructions` prompt). Also requires disclosing that the voice is AI-generated. **Avoid.** |
| VOICEVOX engine | Engine **LGPL-3.0 with a dual commercial licence**; software terms: commercial and non-commercial use allowed, **credit notation required**, "follow the terms of each voice library"; no redistribution of the software; engine runs on CPU, Docker images, **user dictionary API (surface, katakana reading, accent nucleus)** and an `accent_phrases` endpoint for kana editing | Best control over reading and accent among open options; per-character terms were not read (UNVERIFIED). **Later**, run as a separate service. |
| Style-Bert-VITS2 | **AGPL-3.0** (user-dictionary module LGPL); default-model terms not read | CPU and ONNX inference possible. **Avoid** for an open-source codebase that is not AGPL. |
| Deepgram Aura-2, Soniox TTS, Speechmatics TTS | Prices listed ($0.030/1K characters Aura-2; Speechmatics $0.011/1K characters with 1M free); Japanese support not verified | Not evaluated. |

Open point: whether generated audio from cloud TTS may be stored and published inside an open dataset is a terms question not read for any provider: UNVERIFIED.

---

## 8. Noisy shops: VAD, noise suppression, speaker separation

### 8.1 Voice activity detection

Silero VAD (MIT, pushed 2026-10-22): vendor claims one 30+ ms chunk in under 1 ms on a single CPU thread and training on "over 6000 languages"; `@ricky0123/vad-web` (ISC) runs it in the browser via ONNX Runtime Web with `onSpeechStart` and `onSpeechEnd(audio: Float32Array 16 kHz)`. **MVP.** VAD is also the main defence against Whisper-family hallucinations on silence and noise (about 1% of transcripts contain hallucinated phrases, 05). TEN VAD is Apache-2.0 plus conditions that forbid deployments that compete with Agora's offerings: **avoid**.

### 8.2 Noise

`getUserMedia({audio: {noiseSuppression: true, echoCancellation: true, autoGainControl: true}})` requests built-in processing (MDN: browser tries but does not fail; marked "limited availability"). RNNoise (BSD-3-Clause, last push 2025-02-22) and DeepFilterNet (dual-licensed, last push 2024-10-17) are ML denoisers; neither has been evaluated on Japanese ASR accuracy in any source read. Aggressive denoising can hurt ASR; test with the bake-off set. The cheapest fix is physical: the phone or a lavalier near the owner, and a second device or a channel per speaker.

### 8.3 Who is speaking

- **Language as speaker (MVP idea, design not source claim):** in a Japanese owner / English visitor interview the spoken language identifies the speaker. Soniox adds a `language` field to each token (`enable_language_identification`) and has two-way translation; Azure Live Interpreter identifies language continuously. This avoids diarization for two people.
- Provider diarization: Soniox `enable_speaker_diarization` (real-time, token-level `speaker`); Azure real-time diarization (voice signals discarded after annotation, 240 minute cap); Gemini diarization is batch only (up to 8 speakers; 30-minute audio cap); Chirp 3 batch only; ElevenLabs real-time not listed.
- Open models: pyannote `speaker-diarization-community-1` (CC-BY-4.0, gated, offline; DER 11.2% VoxConverse, 17.0% AMI, 26.7% CALLHOME part 2; no Japanese evaluation stated); NVIDIA `diar_streaming_sortformer_4spk-v2` (CC-BY-4.0, streaming, **max 4 speakers**, trained mainly on English with a stated warning for non-English and noisy audio, latency presets from 0.32 s to 30.4 s). Verdict: **later**, only for post-interview correction.

---

## 9. Credentials and open source

The repo ships no key. Pattern that works for every hosted candidate with a browser-capable live API: each deployment sets its provider key as a server environment variable and a small route mints a **short-lived token**:

| Provider | Browser credential | Limits read |
|---|---|---|
| Soniox | temporary API key | 1 to 3,600 s expiry, optional single-use and session cap |
| OpenAI (translation) | client secret from `/v1/realtime/translations/client_secrets` | transcription-session equivalent not described: UNVERIFIED |
| Gemini Live | ephemeral token (Preview, `v1beta`, Live API only) | `uses` 1, 30 min expiry default, 1 min to start |
| Deepgram | `/v1/auth/grant` JWT | 30 s default, max 3,600 s, only needed to connect |
| AssemblyAI | `/v3/token` | 1 to 600 s |
| ElevenLabs | single-use token query parameter | not read |
| Speechmatics | JWT (`ttl` example 60 s) | not read |
| Azure | authorization token or Entra | lifetime not read |
| Google Cloud STT v2 | none (gRPC): server proxy required | n/a |

Licence note for the repo: calling a hosted API over HTTP or WebSocket creates no licence obligation for our code; each deployer accepts the vendor's terms. Components with copyleft or non-commercial terms found: Style-Bert-VITS2 (AGPL-3.0), NLLB and Seamless (CC-BY-NC-4.0), Moonshine Japanese (community licence), TEN VAD (anti-competition clause), VOICEVOX voice libraries (per-voice terms plus credit). Safe: Whisper, faster-whisper, whisper.cpp, WhisperLiveKit, SimulStreaming (MIT or Apache-2.0), kotoba-whisper (Apache-2.0), ReazonSpeech models (Apache-2.0), sherpa-onnx and transformers.js (Apache-2.0), Silero (MIT), vad-web (ISC), RNNoise (BSD-3), pyannote code (MIT, gated models).

## 10. Provider processing locations (APPI Art. 28, builds on 05 section 7)

| Provider | Where audio is processed | Default retention / training |
|---|---|---|
| Soniox | **Japan** (project in JP region; account metadata and billing may be elsewhere) | none unless async; never trained on |
| Azure Speech | **Japan East or West** (region of the resource) | real-time: not stored |
| Amazon Transcribe | Tokyo region available for ja-JP streaming | UNVERIFIED |
| OpenAI Realtime | **US or EEA/Switzerland only**; Japan storage-only | `/v1/realtime`: 30 days abuse monitoring, ZDR by approval |
| Gemini API | any Google country (05) | paid: not trained; free: trained |
| Google Cloud STT | `chirp_3` US/EU; Chirp 2 asia-southeast1 | no audio logging by default (05) |
| Deepgram, AssemblyAI | not Japan; details UNVERIFIED | MIP opt-out flag (Deepgram) |
| ElevenLabs | US default; EU/India/Singapore enterprise | ZRM enterprise-only |
| Speechmatics | EU, US, AU | not stored in real time unless opted in |
| Web Speech (Chrome default) | Google web service | UNVERIFIED |
| Local, on-device | the device | none |

Regional processing narrows the transfer question for audio content but does not by itself satisfy Art. 28 for sub-processors or support access; confirm with counsel (05).

## 11. Cost per 30-minute interview (STT and translation only)

Assumptions: one continuous 30-minute mic stream, billed audio equals wall time, one translation pass. LLM translation about $0.02 (above). AWS Translate assumes 15,000 source characters (my estimate). Prices are the ones quoted in each section.

| Path | STT | Translation | Total |
|---|---|---|---|
| Soniox streaming (JP) | $0.06 | included | **$0.06** (plus optional LLM polish $0.02) |
| ElevenLabs Scribe v2 RT + LLM | $0.195 | $0.02 | $0.22 |
| AssemblyAI U3.6 Pro RT + LLM (with diarization add-on) | $0.225 ($0.285) | $0.02 | $0.245 ($0.305) |
| Speechmatics Standard RT + its translation | $0.225 | $0.325 | $0.55 |
| Deepgram Nova-3 (mono) + LLM | $0.23 | $0.02 | $0.25 |
| Gemini 3.5 Transcribe Live + LLM | $0.27 | $0.02 | $0.29 |
| Amazon Transcribe Tokyo + Translate Tokyo | $0.30 | about $0.23 | about $0.53 |
| OpenAI `gpt-live-transcribe` + LLM | $0.51 | $0.02 | $0.53 |
| Azure real-time STT + LLM | $0.50 | $0.02 | $0.52 |
| Azure speech translation | included | $1.25 total | $1.25 |
| OpenAI `gpt-realtime-translate` | included | $1.02 total | $1.02 |
| Gemini 3.5 Live Translate (preview) | included | $1.10 total | $1.10 |
| Chunked batch: Gemini 3.5 Transcribe + LLM | $0.15 | $0.02 | **$0.17** |
| Chunked batch: OpenAI `gpt-transcribe` + LLM | $0.135 | $0.02 | $0.155 |
| Chunked batch: Azure Fast Transcription + LLM (promo $0.05) | $0.18 | $0.02 | $0.20 ($0.07) |
| Chunked batch: Soniox async + LLM | $0.05 | $0.02 | $0.07 |
| Google Cloud STT Chirp 3 streaming | UNVERIFIED (about $0.48 if billed at the $0.016/min Standard tier) | | |
| Local (faster-whisper / WhisperLiveKit) | $0 API; GPU host cost not estimated | | |

Place-name TTS: a few cents per thousand names at most; cache the audio.

---

## 12. Recommended architecture

### Tier 1: "MVP near-live" (least risky)

Two lanes behind one `Transcriber` interface; ship lane A first because it is also the voice-memo path.

**Lane A, chunked upload (baseline, any browser).**
1. Browser captures mic with `noiseSuppression`, `echoCancellation`, `autoGainControl` requested; Silero VAD in the page cuts utterances (tune: end after roughly 0.6 to 0.8 s of silence, cap at 15 to 20 s, 0.3 s pre-roll; my parameters).
2. Each utterance POSTs to our route; STT by a configured provider (Gemini 3.5 Transcribe, `gpt-transcribe`, Azure Fast Transcription in Japan East, or Soniox async in the JP region). Japanese text appears first; the LLM translation (with place-name glossary and two prior segments) follows and is labelled machine translation.
3. Everything (audio if consented, raw ASR, translation draft) is stored with timestamps; the **human-corrected transcript stays the source of truth**; claims come only from consented, corrected transcripts (05).
4. Estimated delay 3 to 8 s after the speaker pauses (UNVERIFIED, to be measured). Cost about $0.15 to $0.20 per 30 minutes.
5. Flow B (voice memo) is the same pipeline with one long utterance and batch settings; flow C uses the LLM translation on stored text, with Chrome's Translator as an optional desktop enhancement.

**Lane B, simple streaming (preferred for the "under 3 s" target).** Browser opens a WebSocket to Soniox's Japan region with a server-minted single-use temporary key, streams 16 kHz PCM, renders non-final tokens in grey and final tokens in black, shows translated tokens in a second line, and uses the per-token language field to colour the speaker (owner Japanese, visitor English). Reconnect before the 300-minute session cap; no Gemini-style 10-minute rotation. After the interview a batch re-transcription (lane A provider) replaces the live text with the version the owner corrects. Cost about $0.06 live plus about $0.15 batch. Gate: a bake-off of at least five real shop recordings (owner voice, background noise, place and shop names) comparing Soniox, Azure Japan East streaming and lane A before committing.

**Privacy of Tier 1:** lane A sends audio utterances to one chosen vendor (choose by region: Azure Japan East or Soniox JP keeps processing in Japan); lane B streams continuous audio to Soniox JP; text-only goes to the LLM provider. Both need per-recording consent naming provider and country (05 section 7). Record nothing if the owner declines; offer the local fallback only as a laptop-side mode.

**Place names (D):** MVP `speechSynthesis` fed with the human-confirmed kana reading; add cached cloud or VOICEVOX audio later.

### Tier 2: "True live" (later)

- Streaming becomes the default: browser to provider WebSocket with short-lived tokens, partial plus final tokens, in-stream translation, language-as-speaker, automatic session rotation, offline-tolerant queue for dropped Wi-Fi, a correction UI that edits finals while the interview is running.
- Add providers behind the same interface only after bake-offs: Azure Japan East (longevity), AWS Tokyo, OpenAI `gpt-live-transcribe` (if Japan processing appears), Gemini Live (if session limits and diarization improve).
- Optional on-device mode for owners who refuse any upload: a laptop-side WhisperLiveKit or SimulStreaming server on a GPU with SenseVoice or large-v3 (no NLLB), or an in-browser kotoba-whisper ONNX path on WebGPU laptops. No primary evidence supports a mid-range-phone local live mode today.
- Privacy trade-off: continuous audio to a vendor for the whole interview is more exposure than lane A's per-utterance uploads; local mode removes the vendor but costs hardware and accuracy. Cost about $0.06 to $0.30 per 30 minutes for hosted streaming, plus batch re-transcription $0.15.

### Biggest technical risk

**Accuracy of Japanese speech recognition on proper nouns (shop names, place names, local words, Nagasaki dialect) in a noisy shop, with no verified Japanese benchmark for any hosted streaming candidate.** Live captions amplify it: a mis-heard name is shown immediately and the English visitor cannot judge it. Second-order: JA-to-EN translation of unfinished sentences (verb-final grammar) trades delay against correctness. Mitigations: show the Japanese line prominently so the owner can spot errors; label English as machine translation; push the place-name glossary into Soniox context terms and LLM prompts; keep VAD so silence never reaches Whisper-family models; run the bake-off before choosing a default.

---

## Unverified / open questions

- Japanese WER/CER and Japanese latency for every hosted streaming option (Soniox, Azure, OpenAI, Gemini, Deepgram, AssemblyAI, ElevenLabs, Speechmatics, Amazon). Only English-aggregate or vendor-claimed figures exist (Soniox/Pipecat benchmark; ElevenLabs "~150ms" footnote unreadable).
- Soniox: free credits, terms of service, whether silence is billed, whether JP region access is instant, Japanese proper-noun accuracy.
- OpenAI: whether `gpt-live-transcribe` officially supports Japanese; browser token flow for transcription sessions; retention row for transcription sessions; Japanese in `gpt-realtime-translate` was seen only in a search summary of OpenAI's cookbook and announcement.
- Gemini: Live endpoint status label; Japanese TTS support; the "legacy" label for 3.5 live translate (a search summary claimed it, the models page does not).
- Google Cloud: `chirp_3` price tier; V2 streaming limits; TTS and Translation prices (pages would not render); Chrome's Web Speech retention terms.
- Azure: ja-JP to en pair in the classic speech-translation table; token lifetime; whether real-time diarization bills at the Conversation Transcription meter; end date of the Fast Transcription promo; JS SDK licence terms.
- AWS: content-use terms for Transcribe, Translate and Polly; browser credential pattern; hard maximum streaming session length; Japanese streaming accuracy.
- Deepgram: Japanese streaming support per model, MIP default, regions. AssemblyAI: data retention, regions. ElevenLabs: realtime diarization, STT in isolated environments. Speechmatics: Japanese real-time per-feature support, regions page (404).
- DeepL: free allowance (500,000 per month vs 1,000,000 total), paid prices, Voice language list and price.
- Chrome: whether Japanese is available in the on-device Web Speech pack; which engine Safari uses; Firefox ship date.
- Mid-range phone: CPU/GPU, memory, battery and speed for in-browser Whisper/kotoba on WebGPU or WASM. iOS Safari mic recording behaviour.
- sherpa-onnx: Japanese WebAssembly build; whether the 2025 ja-en zipformer is streaming (the docs page lists no Japanese streaming model).
- WhisperLiveKit and SimulStreaming Japanese latency; whisper_streaming's evaluated language.
- VOICEVOX per-voice terms; Style-Bert-VITS2 default-model terms; whether cloud-TTS output may be stored and published in an open dataset; SenseVoice model licence; Seamless Licence text.
- Whether the Moonshine streaming models cover Japanese under MIT (the README says all streaming models are MIT; languages not listed in what was read).
- Contract terms (ToS, DPAs) for all providers were not read, except where cited.

---

## Sources

All accessed 2026-10-29. "(snippet)" means seen only in a search-result summary of the page; "(404)" means the page could not be read.

OpenAI
- https://developers.openai.com/api/docs/guides/realtime-transcription
- https://developers.openai.com/api/docs/guides/realtime-translation
- https://developers.openai.com/api/docs/models/gpt-live-transcribe
- https://developers.openai.com/api/docs/models/gpt-realtime-translate
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide (snippet)
- https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/ (snippet)

Google
- https://ai.google.dev/gemini-api/docs/live-api
- https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
- https://ai.google.dev/gemini-api/docs/live-api/live-translate
- https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- https://ai.google.dev/gemini-api/docs/transcribe
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview
- https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
- https://docs.cloud.google.com/speech-to-text/docs/streaming-recognize
- https://docs.cloud.google.com/speech-to-text/quotas (V1 limits)
- https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- https://cloud.google.com/speech-to-text/pricing, https://cloud.google.com/translate/pricing, https://cloud.google.com/text-to-speech/pricing (pages did not render pricing)

Microsoft Azure
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-translation
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security
- https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ (free allowances; paid rates not rendered)
- https://prices.azure.com/api/retail/prices (Azure Retail Prices API, Japan East, Speech)
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-configure-azure-ad-auth

Amazon Web Services
- https://aws.amazon.com/transcribe/pricing/
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/transcribe/current/index.json, .../translate/current/index.json, .../AmazonPolly/current/index.json (public price lists, publication 2026-09-11)
- https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html
- https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
- https://docs.aws.amazon.com/transcribe/latest/dg/data-protection.html
- https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
- https://docs.aws.amazon.com/polly/latest/dg/available-voices.html
- https://aws.amazon.com/service-terms/ (partial read)

Other speech vendors
- Soniox: https://soniox.com/pricing, /docs/stt/get-started, /docs/stt/rt/real-time-transcription, /docs/stt/rt/real-time-translation, /docs/stt/data-residency, /docs/stt/security-and-privacy, /docs/stt/models, /docs/stt/concepts/supported-languages, /docs/stt/api-reference/auth/create_temporary_api_key, /benchmarks, https://soniox.com/docs/stt/rt/limits-and-quotas (snippet)
- Deepgram: https://deepgram.com/pricing, https://developers.deepgram.com/docs/models-languages-overview, /docs/model, /docs/token-based-authentication, /docs/the-deepgram-model-improvement-partnership-program
- AssemblyAI: https://www.assemblyai.com/pricing, https://www.assemblyai.com/docs/streaming/universal-streaming/multilingual-transcription, https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token
- ElevenLabs: https://elevenlabs.io/docs/overview/capabilities/speech-to-text, https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime, https://elevenlabs.io/pricing/api, https://elevenlabs.io/docs/overview/administration/data-residency
- Speechmatics: https://www.speechmatics.com/pricing, https://docs.speechmatics.com/speech-to-text/languages, https://docs.speechmatics.com/speech-to-text/realtime/quickstart, regions via https://docs.speechmatics.com/get-started/authentication (snippet)
- DeepL: https://developers.deepl.com/api-reference/voice, https://www.deepl.com/en/pro-api, https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans (snippet)

Browser platform
- https://developer.chrome.com/docs/ai/translator-api, /docs/ai/language-detection, /docs/ai/get-started, /docs/ai/built-in-apis
- https://developer.mozilla.org/en-US/docs/Web/API/Translator, /Web/API/SpeechRecognition, /Web/API/Web_Speech_API/Using_the_Web_Speech_API, /Web/API/SpeechSynthesis, /Web/API/MediaTrackConstraints/noiseSuppression
- https://webaudio.github.io/web-speech-api/ (W3C Community Group draft, 27 October 2026)
- https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/TQpe9shjCgAJ (Intent to Ship: On-device Web Speech API)
- https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1038 (TAG review)
- https://docs.google.com/presentation/d/1zRSgSCJ32FtvwtxbVaStyxt6ZERlKL8obApqwBHRWGU/htmlpresent (Google slides, Nov 2025)
- https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/network_speech_recognition_engine_impl.cc and speech_recognition_manager_impl.cc
- https://caniuse.com/speech-recognition, https://caniuse.com/webgpu
- https://www.google.com/chrome/privacy/whitepaper.html (no usable body text)

Open models, runtimes, repos (licence and activity via GitHub and Hugging Face APIs)
- https://github.com/k2-fsa/sherpa-onnx, https://k2-fsa.github.io/sherpa/onnx/pretrained_models/index.html, https://k2-fsa.github.io/sherpa/onnx/wasm/index.html, https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/asr-models
- https://github.com/huggingface/transformers.js, https://huggingface.co/docs/transformers.js/index, https://huggingface.co/onnx-community/kotoba-whisper-v2.2-ONNX, https://huggingface.co/onnx-community/whisper-large-v3-turbo, /whisper-small, /whisper-base
- https://github.com/ggml-org/whisper.cpp and https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/whisper.wasm/README.md
- https://github.com/moonshine-ai/moonshine (README, LICENSE), https://huggingface.co/UsefulSensors/moonshine-tiny-ja
- https://huggingface.co/kotoba-tech/kotoba-whisper-bilingual-v1.0, https://huggingface.co/reazon-research/reazonspeech-k2-v2
- https://github.com/QuentinFuxa/WhisperLiveKit, https://github.com/ufal/whisper_streaming, https://github.com/ufal/SimulStreaming, https://arxiv.org/abs/2307.14743
- https://github.com/facebookresearch/seamless_communication, https://huggingface.co/facebook/seamless-streaming, https://huggingface.co/facebook/seamless-m4t-v2-large
- https://github.com/snakers4/silero-vad, https://github.com/ricky0123/vad, https://github.com/TEN-framework/ten-vad (LICENSE), https://github.com/xiph/rnnoise, https://github.com/Rikorose/DeepFilterNet
- https://huggingface.co/pyannote/speaker-diarization-community-1, https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2, https://github.com/pyannote/pyannote-audio
- https://github.com/VOICEVOX/voicevox_engine (README, LICENSE), https://voicevox.hiroshiba.jp/term/
- https://github.com/litagin02/Style-Bert-VITS2
- Prior lane: research/05-ai-layer.md (sections 1, 2, 5, 7)
