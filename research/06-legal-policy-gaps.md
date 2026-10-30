# 06 - Legal, policy, consent and spec gaps

Lane: LEGAL / POLICY / CONSENT AND SPEC GAPS. Prepared 2026-10-29 (all sources accessed 2026-10-29).
This is a briefing for a non-lawyer to take to a lawyer. It is not legal advice.

Method and conventions:
- Primary sources only: statute text pulled from e-Gov Laws (API v2, current in-force revision), court PDFs from courts.go.jp, regulator documents (PPC, CAA, MIC, MCMC, PDP Commissioner), Malaysian Acts from the AGC / MCMC / PDP sites, and the platforms' own terms pages. Bracketed tags like [S10] point to the Sources list at the end.
- Anything I could not confirm from a primary source is written UNVERIFIED. Statements that are my reading or inference rather than the source's words are marked "Inference".
- Risk level means risk to OUR DESIGN as described in the brief (hand-pinned places, pasted URLs rendered with attribution, AI-blended "every sentence cites a source" pages, outbound-click counting, interview transcripts), not risk in the abstract. HIGH = a design choice in the brief likely needs to change or be lawyer-cleared before launch. MEDIUM = manageable with defined controls. LOW = routine.

## Summary table

| # | Issue | Jurisdiction | Risk for our design | What the design must do |
|---|-------|--------------|---------------------|-------------------------|
| 1 | Rendering other people's posts: attribution, cropping, inline display (moral rights; 2020 Supreme Court Twitter ruling) | JP | HIGH | Show author name/handle and platform in the same view as the content; never crop or overlay away a credit; prefer the platform's own embed or a link card over re-hosting; click-through to the original does not count as attribution unless users ordinarily click. |
| 2 | Quotation exception (Copyright Act Art. 32) as the basis for excerpts/images | JP | HIGH | Do not rely on Art. 32 for galleries or illustration. Use it only for genuine commentary; keep source indication (Art. 48); otherwise get permission or link out. |
| 3 | AI extraction of "claims" from third-party posts/reviews | JP + platform terms | HIGH | Do not run AI over content obtained through Meta oEmbed, Google Maps APIs or X API. Extract claims only from material the contributor owns (their own text/transcript) or that the creator/owner licenses to us. |
| 4 | Defamation: true statements can still be defamatory; "factual cautions" about small businesses | JP | HIGH | Restrict cautions to neutral, verifiable operating facts in structured fields; anything reputation-lowering needs public interest + public-benefit purpose + provable truth; keep an evidence file; notify the business before publishing; fast takedown. |
| 5 | We are the publisher of AI-written place pages (no intermediary safe harbour for our own synthesis) | JP | HIGH | AI may only restate sourced claims, never infer or add implications; every sentence carries claim ID, source span and date; human review gate for any negative or business-affecting sentence. |
| 6 | APPI: interview audio, transcripts, names, voice | JP | HIGH | Specify purposes in advance, notify/publish them, record consent per interview (scope: publication, AI processing, transfer abroad), no voiceprint features, retention limits, request channel (disclosure/correction/cessation). |
| 7 | Special-care information (Nagasaki testimonies) and minors | JP | MEDIUM | Consent form must separately cover health/status disclosures; guardian consent for under-16 subjects (PPC says 12-15 and under; 2026 amendment moves to under-16); account holders 16+. |
| 8 | Cross-border transfer to US AI providers (APPI Art. 28) | JP | MEDIUM | Either (a) consent that names the country and the recipient's protections, or (b) a recipient with equivalent-measures arrangement plus ongoing checks; plus no-training terms (PPC 2023 alert). |
| 9 | Outbound-click counting by first-party redirect | JP | LOW | Own-domain redirect, minimal log, no third-party scripts, purpose stated in privacy notice, aggregate-only reporting to creators. |
| 10 | Cookies / analytics / third-party embeds: Telecommunications Business Act Art. 27-12 "external transmission" duty | JP | MEDIUM | Treat the service as in scope until counsel says otherwise: publish a Japanese notice listing every third-party transmission (embeds, analytics, map tiles); minimise third-party loads. |
| 11 | Stealth marketing designation (effective 2023-10-01) | JP | MEDIUM | Any content a business pays for, supplies free goods for, or directs must be labelled as the business's own; owner-supplied content labelled "from the owner"; no "customer voices" framing for commissioned posts. |
| 12 | Provider Liability Act / Information Distribution Platform Act | JP | MEDIUM | We are a provider with liability limits (Art. 3) and disclosure-order exposure (Art. 5) but are far below the large-platform thresholds; adopt the 7-day sender-inquiry process as our takedown SLA; plan for disclosure orders (log retention). |
| 13 | Portrait and publicity rights; real people's images | JP | MEDIUM | No faces of identifiable people in our own marketing without consent; publicity right is limited to commercial-draw uses (bromide, merchandise, advertising use). |
| 14 | PDPA 2010 + 2024 amendments | MY | MEDIUM | Scope turns on "commercial transactions" (counsel); treat voice/biometric as sensitive; DPO and breach-notification duties since 2025-06-01; cross-border now an adequacy-or-conditions test. |
| 15 | Online Safety Act 2025, social media licensing, Child Protection Code | MY | LOW now, MEDIUM later | Duties attach to licensed service providers; the licensing trigger is 8 million Malaysian users. Keep a Malaysia legal pack ready; design for age 16+ accounts. |
| 16 | CMA 1998 s.233 (as amended 2025) | MY | MEDIUM | Needs intent to annoy/abuse/threaten/harass etc.; "false" content explicitly covers incomplete content; good-faith true statements are carved out. Keep factual-only caution rule. |
| 17 | Defamation Act 1957 / Penal Code s.499 | MY | MEDIUM | Truth-only is not enough in the criminal code (public good also required); keep the same caution gating as Japan; own the Malaysian wording separately. |
| 18 | Meta / Instagram terms: embeds, automated collection | Platform | HIGH | No scraping; oEmbed content may only be a front-end view (no storing, no analytics, no AI); respect deletion; do not "import" captions/images into our DB. |
| 19 | Google Maps Platform terms | Platform | HIGH | Do not copy/save business names, addresses or user reviews; no AI/ML use of Google content; Places content only on a Google map with attribution; store only place_id. Hand-pinned coordinates and a non-Google base map avoid most of this. |
| 20 | TikTok developer terms and embed | Platform | MEDIUM | Link or use the official embed only; no scraping; delete on request/termination; embed API flagged for deprecation. |
| 21 | X developer terms | Platform | MEDIUM | No scraping; no training on X content; keep stored X content in sync within 24h of deletion/privacy change; redistribution limited to IDs. |
| 22 | Code licence (MIT/Apache vs AGPL) | Open source | LOW | Decide deliberately: AGPL-3.0 keeps hosted forks open; MIT/Apache do not. Keep code licence separate from data/content licences. |
| 23 | ODbL (OpenStreetMap) | Open source | MEDIUM | Do not merge OSM features into our place table unless we are willing to publish that database under ODbL; attribute on every map; do not use tile.openstreetmap.org as production tile server. |
| 24 | CC BY-SA 4.0 (Wikipedia text) | Open source | MEDIUM | Quoting or adapting Wikipedia text makes the adapted text CC BY-SA 4.0 with attribution; prefer Wikidata (CC0) for facts. CC licences are irrevocable and do not license moral rights, which interacts with withdrawal rights. |
| 25 | Demo videos and seed data using real people's posts/images | Project rule | HIGH | Mock user must be explicitly labelled; any real third-party post, face or handle in a demo needs written permission or an open licence; exclude demo clicks from creator-facing counts; Google Maps/Street View video rules apply. |

## Part A - Legal and policy

### Things in this research that contradict or change the plan

1. "Paste a URL and the app imports it" cannot mean "copy the content into our database and run AI on it" for Instagram, X, Google Maps or TikTok. Meta's oEmbed documentation says content from the endpoint may be used only to provide a front-end view and prohibits "consuming, manipulating, extracting, or persisting the metadata and content", including for analytics [S36]. Google's Maps terms forbid copying and saving user reviews and using Maps content to train or improve ML/AI models [S39]. X's Developer Agreement forbids using X API/Content to fine-tune or train a foundation model [S42]. So the claim-extraction pipeline has to be fed by contributor-owned or owner-licensed text, not by scraped posts. A pasted URL is a pointer, not a source of text for the AI.
2. The blended "Wikipedia-style" page is our own speech. The Japanese liability limitation (Provider Liability Act Art. 3) excludes a provider that is itself the sender of the infringing information [S5]. AI-composed sentences are ours. That is the single biggest defamation exposure in the design.
3. The brief's rule for negative claims (named author, first-hand evidence, corroboration) is sensible but is not the legal test. Japanese criminal law makes a defamatory statement punishable "regardless of whether the fact exists" [S2 Art. 230]; the exemption needs public-interest subject, an exclusively public-benefit purpose, and proof of truth (or reasonable grounds for believing it) [S2 Art. 230-2; S11].
4. Embedding is not legally "free". The 2020 Supreme Court ruling shows that merely displaying someone else's photo on our page through an inline link can infringe the author's attribution right, even though no copy is made by us [S10].
5. Region-as-configuration is not enough on its own. Age thresholds, consent wording, takedown channel and timelines, cross-border rules and licence regimes all differ by country; each region needs a "legal pack" (config plus signed-off text) before it can be switched on.
6. Third-party embeds and analytics may trigger a Japanese-language disclosure duty under the Telecommunications Business Act (Art. 27-12) if our service counts as an SNS/bulletin-board/information-distribution service [S7, S8, S28]. That makes "just drop in the Instagram embed and Google Analytics" a compliance item, not a freebie.
7. The 2026 amendment of the Japanese APPI (promulgated 2026-07-17) adds guardian-consent rules for under-16 subjects and administrative surcharges; the scheduled in-force date shown in e-Gov for the text containing those rules is 2028-07-16 [S3, S37, S17, S18]. Build the guardian flow now.

---

### A1. Copyright, embedding, linking and quotation (Japan)

What the statute says (current in-force revision effective 2026-06-24) [S1]:
- Art. 2(1)(i): a "work" is a creative expression of thoughts or sentiments within literature, science, art or music. Plain facts are not themselves protected expression (Inference from Art. 2(1)(i); not tested against case law here).
- Art. 32(1): a published work may be quoted, but the quotation must conform to fair practice and be within the scope justified by the purpose, such as news reporting, criticism or research.
- Art. 48(1)(i), (iii) and (2): when a work is used under Art. 32 the source must be indicated by a method reasonable for the use, and the author's name shown if displayed at the source.
- Art. 50: limitation provisions (including Art. 32) must not be read as affecting moral rights.
- Art. 19(1): the author has the right to decide whether and how their name appears when the work is offered or presented to the public; Art. 19(3) allows omission only where the author's interest in claiming authorship is not harmed and it does not offend fair practice. Art. 20: right to integrity (no alteration against the author's will); Art. 20(2)(iv) exempts alterations unavoidable given the nature of the work and the purpose and manner of use.
- Art. 119(2)(i): infringing moral rights is a criminal offence, up to 5 years' imprisonment or a fine up to JPY 5,000,000 (or both). Art. 112: injunction available.
- Art. 47-5: limited "minor use" exception for services that search or analyse information by computer and return results; use must be minor in proportion/quantity/precision and incidental; excluded where the source is known to infringe or where the rightsholder's interest is unfairly harmed.
- Art. 30-4: use not aimed at enjoying the expressed thoughts/sentiments (e.g., information analysis) is permitted, subject to a proviso where the rightsholder's interest is unfairly harmed.

How courts treat Art. 32 (IP High Court, 2022-10-19, case 令和4年(ネ)第10019号) [S12]: a lawful quotation must (1) match fair practice and (2) be within a scope justified by a purpose such as criticism. The court accepted quotation where the images were used to compare and verify allegations of tracing and were not used for independent appreciation. It also treated automatic cropping in a Twitter timeline as an "unavoidable alteration" under Art. 20(2)(iv) in that setting. Caveat: that case was a disclosure claim decided on the "obviousness of rights infringement" standard, so it is weak authority for a general rule. Inference: a place page that shows others' photos to illustrate a place is unlikely to be "criticism/research"; Art. 32 will not carry a gallery.

Plain hyperlinks: no Japanese primary ruling on a text-only hyperlink was retrieved. UNVERIFIED whether a bare link or a link card (title + our own words) engages any right at all; the 2020 Supreme Court case concerned inline display of an image.

Art. 47-5 and AI/RAG-style services: the Agency for Cultural Affairs report says that where a retrieval-augmented system's purpose includes outputting the creative expression of the retrieved works, Art. 30-4 does not apply to the related copying; Art. 47-5(1)(i)/(ii) may apply but only to minor, incidental use, and not where providing the creative expression is the main purpose [S14]. The report is a subcommittee view and is non-binding (stated in the document).

Design consequences:
- Default rendering for a pasted URL: platform-provided official embed or a link card containing: our own short description written by the contributor, author's name/handle, platform name, date, and the link. Do not copy images or captions into our storage.
- If an image must be shown by us (e.g., from an owner who licenses it), store the licence and credit line with the asset, and display them next to the image.
- The pasted post may itself be an unauthorised repost of someone else's photo. The Supreme Court's supplementary opinion notes that problems arise mostly where the source is unclear or the original post was unauthorised [S10]. Provide a "report infringement" link on every rendered source.
- Ask counsel: whether adding a standing contributor warranty and an indemnity/notice-and-takedown process is sufficient for link-card rendering; and whether a moral-rights non-assertion clause ("著作者人格権を行使しない" covenant) belongs in the contributor terms. (The clause is common Japanese contracting practice; not verified in a primary source here. See A12 for the CC BY-SA 4.0 provision that moral rights are not licensed.)

### A2. The 2020 Supreme Court ruling on Twitter image display (cropping, missing attribution)

Verified details [S10]:
- Supreme Court, Third Petty Bench, judgment of 2020-07-21, case 平成30年(受)第1412号, 発信者情報開示請求事件. Appeal dismissed. Presiding judge Tokura Saburo; Judge Hayashi Keiichi dissented; supplementary opinion by Tokura. (Reported at 民集74巻4号1407頁 per the 2022 IP High Court decision, which cites it [S12]; I did not find the report citation in the PDF itself.)
- Parties: respondent is a photographer; appellant is the US company operating Twitter. The claim was for disclosure of sender information under the Provider Liability Limitation Act Art. 4(1) (old numbering) against people who retweeted an unauthorised upload of the photo.
- Facts: the photographer had placed a "(c) + name" credit in the corner of the image on his own site. Someone uploaded it to Twitter without permission. Others retweeted it. Twitter's system, through HTML display instructions that inline-link to the image file, showed the image cropped at top and bottom in the retweeters' timelines, which removed the credit.
- Holding (majority opinion): (1) Art. 19(1)'s "offering or presentation to the public" does not require a use that falls under Arts. 21-27; showing the image on a screen via an inline link is a "presentation" even if no copyright-act use occurs. (2) Letting users click the image to reach the original page with the credit does not by itself make the attribution: the credit is on a separate page, users do not see it unless they click, and nothing suggested users ordinarily click. (3) The retweeters infringed the attribution right and are "senders" of the infringing information (their retweet caused the link-and-display data to be recorded on the server and sent), so disclosure was upheld.
- Qualifications (these are in Justice Tokura's supplementary opinion, not the majority text): attribution by click-through might be accepted where users ordinarily click the displayed image (judged by the ordinary user's attention, the content and display, and any prompt to click); Art. 19(3) omission may apply in some cases; the burden on a retweeter is therefore not excessive; and the platform is expected to inform users, given the automatic cropping. The dissent (Judge Hayashi) said the platform's specification, not the retweeters, caused the cropping and the original uploader was the one who posted without permission.
- Not decided: the majority text does not decide the right to integrity (Art. 20); that right appears in the PDF only in the dissent's description of the lower court. The Court addressed only the accepted grounds (attribution and sender status).

Implications for rendering other people's posts (Inference, flagged for counsel):
- If our page causes someone else's image to appear, we are exposed on attribution even if we did not copy the file. Our contributors who paste the URL are the "senders" in the Court's sense, and we are the provider that may receive disclosure demands.
- Put the author's name/handle and platform adjacent to every displayed item. Do not apply our own crop/zoom to images, and do not place content in a container that clips embedded credits. A "view original" link is useful but is not the attribution.
- Because the right can be asserted against any displayer, also provide a fast "my name is missing/removal" channel.
- Platform embeds: whether Instagram/X/TikTok embed widgets show the author's name by default is UNVERIFIED (not examined in this pass).

### A3. AI processing of third-party content and "claims" (Japan, plus platform terms)

- Copyright side: Art. 30-4 allows information analysis and similar non-enjoyment use, subject to the proviso. The Agency for Cultural Affairs report [S14] says output that reproduces creative expression is outside the "non-enjoyment" purpose, and that RAG-style systems whose output includes retrieved expression need Art. 47-5 minor-use or permission. A claims extractor that outputs short factual statements (not expression) sits more comfortably than one that quotes or paraphrases closely. Inference.
- Contract side is stricter than copyright: the platform terms in A11 prohibit the ingestion and AI use that the statute might otherwise allow. Contractual limits bind us as users of the APIs/embeds even where copyright would not.
- Design: the extractor's input must be (a) text the contributor typed or dictated, (b) transcript of an interview we recorded with consent, or (c) licensed material. The claim record must carry input provenance and licence, and the extractor must refuse inputs that came through a restricted channel.

### A4. Portrait and publicity rights (Japan)

- There is no statute; the right arises from case law. The Supreme Court's publicity-right judgment (First Petty Bench, "Pink Lady" case) states that a person's name and likeness cannot be used without permission as a personality right; the publicity right is infringed where use is "solely for" the commercial draw of the likeness, for example (1) as an item to be appreciated on its own, (2) on merchandise to differentiate it, (3) as an advertisement for goods; editorial use alongside an article was lawful [S13]. It cites the 1969 Grand Bench (portrait) and the 2005 First Petty Bench judgments for the underlying personality right. The PDF text does not show its own date/case number (UNVERIFIED in the PDF; PDF metadata shows creation on 2012-02-02).
- Design: our own marketing and demo material must not use identifiable people's faces or posts as advertising without written permission. User-submitted photos with identifiable faces need a contributor warranty and a report/removal path (Inference). Photos of shop owners are within APPI as personal information as well (A6).

### A5. Defamation (Japan) and what it means for "factual cautions"

Statute [S2]:
- Art. 230(1): publicly stating a fact and damaging a person's reputation is punishable by up to 3 years' detention (拘禁刑) or JPY 500,000, "regardless of whether the fact exists".
- Art. 230-2(1): not punished if the fact concerns the public interest, the purpose was exclusively to serve the public benefit, and the truth is proved. Art. 230-2(2): facts about someone's alleged crime before indictment count as public interest; (3) facts about public officials/candidates need only truth.
- Art. 231: insult without stating a fact (up to 1 year or JPY 300,000).
- Art. 233: spreading false rumours or using deception to damage credit or obstruct business (up to 3 years or JPY 500,000). Applies to false information about a business.
- Civil [S15]: Civil Code Art. 709 (tort), 710 (non-pecuniary damages including for reputation), 723 (court may order measures to restore reputation, e.g., correction).

Case law verified [S11]: Supreme Court, First Petty Bench, decision of 2010-03-15 (case number as indexed on courts.go.jp: 平成21年(あ)第360号; the number is not in the PDF text). An individual's website said a franchise company was a "cult" and its ads false. The Court held that internet individuals get no relaxed standard: a mistaken belief in truth negates the offence only if there were reasonable grounds based on reliable materials ("確実な資料、根拠"), citing the 1969 Grand Bench decision (昭和44年6月25日, 刑集23巻7号975頁). Reasons given: information on the internet can be viewed instantly by many, damage can be serious, lost reputation is hard to restore, and rebuttal online does not guarantee recovery. The defendant lost because he relied on one-sided materials, misunderstood the system, and never checked with the company. The victim was a company (a legal person).

How a court reads "defamation" (IP High Court 2022 [S12]): the question is whether the statement lowers the person's social reputation as understood by an ordinary reader with ordinary attention. A statement implying that a business repeated bad conduct was held to lower reputation.

Application to factual cautions (Inference; ask counsel):
- Neutral operating facts ("closed Mondays", "cash only", "reservation required", "no English menu") are unlikely to lower social evaluation, but can be false or stale. The harm is the opposite risk: customers turned away, or a business annoyed enough to demand takedown. Use structured fields with "as of" date, source and re-verification date.
- Anything implying wrongdoing, hygiene, safety, rudeness, overcharging or discrimination can lower reputation. True statements remain actionable unless the three conditions of Art. 230-2 are proved. The burden to prove truth sits with the speaker. Public-interest status of a private small shop's conduct is a judgment call; I did not retrieve case law on that: UNVERIFIED.
- Calling something "factual" does not change that. The brief's gate (named author, first-hand evidence, corroboration) maps onto the "reasonable grounds from reliable materials" and "verified with the subject" elements in the 2010 decision, which is helpful. Add: notify the business and take its reply before surfacing (the 2010 defendant never checked with the company), keep the evidence file, and publish a right-of-reply field.
- Because we are the publisher of the blended page (contradiction 2), the AI must not generalise ("this place has a reputation for...") or imply. Rule: one claim per sentence, attributed ("According to X, on date"), no adjectives not in the source.
- Dead people: Art. 230(2) protects the dead only against false statements. Relevant for historical stories in Nagasaki.

### A6. APPI: transcripts, voice, names (Japan)

Applicability [S3]:
- Art. 16(2): a "personal information handling business operator" is anyone using a personal information database for business; the text contains no minimum-records threshold and does not exclude non-profits. The PPC's General Rules guideline would be the place to confirm how "business" is read for an open-source community project: UNVERIFIED (guideline not read).
- Art. 2(1)(i): "personal information" includes information identifying a specific individual by name or other description, including descriptions "expressed by voice, movement or other means" (the text includes voice among the means of description). A recorded interview with a named owner is personal information. Names, faces and handles in pasted posts are also personal information we acquire.
- Art. 2(2) with the Cabinet Order Art. 1(i)(ニ) [S4]: personal identification codes include body features (face, voice-production characteristics, etc.) when converted for computer use and meeting the PPC rule's identification standard. Do not generate speaker embeddings/voiceprints. IP addresses and cookie IDs are not on the Cabinet Order list.
- Art. 2(3) and Cabinet Order Art. 2 [S3, S4]: special-care personal information includes race, creed, social status, medical history, criminal record and (by order) disability, health examination results, medical guidance/treatment, criminal proceedings and juvenile proceedings. Art. 20(2): acquisition requires prior consent unless an exception applies; Art. 20(2)(vii) covers special-care information already made public by the person, a government body, etc.
- Whether a person's status as an atomic-bomb survivor (hibakusha) or a description of radiation-related illness is special-care information: the order's list I read does not name hibakusha status; "medical history" and "social status" are in the Act. UNVERIFIED how the PPC classes it. Treat Nagasaki testimony as potentially special-care and obtain explicit consent.

Duties in play [S3]:
- Arts. 17, 18, 21: specify the purpose as far as possible, do not use beyond it without consent, and notify or publish the purpose promptly on acquisition (publishing in a privacy policy is allowed; Art. 21(4)(iv) excepts cases where the purpose is obvious from the circumstances).
- Art. 20(1): no acquisition by deception or unfair means.
- Art. 25: supervise entrustees. Art. 26: report serious leaks to the PPC and notify individuals. Art. 27: no third-party provision without consent, with exceptions including entrustment within purpose (Art. 27(5)(i)). Arts. 33-35: disclosure, correction, cessation requests for retained personal data; Art. 35(3) cessation of third-party provision.
- Art. 57: exemptions for news organisations and professional authors for their reporting/writing purposes. We are not within these; creators who contribute may be. Do not assume the exemption covers the platform.

Minors:
- PPC Q&A A1-62: the age at which a legal representative's consent is needed depends on the item and business, but "generally" those aged 12 to 15 and under need a legal representative's consent [S16].
- The 2026 amendment (promulgated 2026-07-17; passed 2026-07-10) writes into the Act that for subjects under 16, consent and notices go to the legal representative, loosens cessation requests, and creates a duty to prioritise the child's best interests; it also adds administrative surcharges, rules on facial-feature data, a statistical/AI-development exception, and a ban on improper use of non-personal data that lets someone target a specific individual [S17, S18]. The e-Gov revision list shows the revision containing the under-16/surcharge text as not yet in force with date 2028-07-16, and an earlier partial revision dated 2027-01-17 without those terms [S3]. PPC says the effective date is, in principle, within two years of promulgation [S17]. Exact commencement per provision: UNVERIFIED (PPC roadmap not read).

Design:
- One consent record per interview: purposes (publish on place page; AI processing for transcription/claim extraction; storage; transfer to named foreign providers; optional release of audio), what we do on withdrawal, special-care checkbox, third parties mentioned (staff, customers, family) and a rule to omit or anonymise them, language the subject understands (Japanese original; English translation attached).
- Audio kept only as long as needed to produce and verify the transcript unless separately consented; transcripts and claims keep a link to the consent record, so withdrawal can cascade.
- Account holders 16+ only; any subject under 16 needs a guardian signature. Malaysia's rule differs (see A10).
- Operator of record must exist for the notices and the request channel (see Part B).

### A7. Cross-border transfer to US AI providers (APPI Art. 28)

- Art. 28(1) [S3]: providing personal data to a third party in a foreign country requires prior consent that allows the foreign transfer, unless the country is recognised as equivalent by PPC rule, or the recipient has a system meeting the PPC standard for continuously taking measures equivalent to the Act, or an Art. 27(1) exception applies. Art. 28(2): before seeking consent, give the individual information about that country's personal-information system, the recipient's measures and other helpful information. Art. 28(3): when relying on the recipient's compliant system, take measures to ensure continued equivalent handling and, on request, give the individual information about them.
- Equivalent countries per PPC: the guideline names the EU (as defined by PPC notice) and the UK [S19]. The US is not listed there. (Inference: so a US AI provider needs either consent with Art. 28(2) information or the "equivalent system" route; the guideline gives intra-contract measures and APEC CBPR certification as ways to show the system standard.)
- Entrustment: PPC Q&A A7-53 says using a cloud service is not a "provision" when the provider is contractually and technically a non-handler of the data (contract term plus access control) [S16]. An AI API that reads and processes the transcript is handling it, so the "non-handler cloud" reasoning does not fit (Inference). The 2024 PPC alert on cloud providers adds that a provider who may use the data under its terms or can access it with maintenance IDs is not a non-handler [S20: found via search; PDF not read: UNVERIFIED in detail].
- PPC 2023 alert on generative AI services: before putting personal data into a prompt, check it is within the stated purpose; if personal data is entered without consent and handled for purposes other than producing the response, the operator may breach the Act; therefore confirm the provider does not use it for machine learning [S21].
- Design: choose providers with contractual no-training and no-retention terms, document sub-processors and country, put the country and provider name into the consent text, and keep a way to switch region/provider per region (Malaysia has its own transfer rule, A10).

### A8. Analytics, outbound clicks, cookies (Japan)

APPI [S3, S16]:
- IP addresses and cookie IDs are not personal identification codes (Cabinet Order list). Cookie IDs are "personal-related information" if they do not identify an individual, and become personal information together with other data if easily matched (PPC Q&A A8-1). If logged-in users' account IDs are stored with click events, the click log is personal data.
- A first-party redirect we run does not hand anything to a third party; the Art. 31 rule on providing personal-related information to a third party that will treat it as personal data applies only to such provisions (Q&A A8-3). Where a third-party tag collects browsing data directly, PPC says the site is not "providing" it, but the tag owner must follow Arts. 20-21 (A8-10).
- We still must tell people the purpose (Art. 21) and honour requests if the log is personal data.

Telecommunications Business Act Art. 27-12 and Rules Art. 22-2-27 to 22-2-31 [S7, S8, S28, S29]:
- In force since 2023-06-16 (MIC page). A telecom business operator or an exempt "third-kind" business (Art. 164(3) applies Art. 27-12 to the latter) providing a covered service must, before sending an instruction that makes the user's terminal send user information to someone else, notify the user or put these items where they can easily find them: the content of the information, the name of the party that will handle it, and the purpose; in Japanese, plain language, easily reachable (Rules Art. 22-2-28/29). Exempt items include information truly necessary to display the service and some security/load items (Art. 22-2-30). Alternatives to notice: consent, or an opt-out.
- Covered services (Rules Art. 22-2-27): (i) messaging; (ii) a service that receives information from users and sends it on request to the public (SNS, bulletin board, video sharing, etc.); (iii) search; (iv) services that send information to unspecified users for public browsing. The MIC page lists news, "matome", maps and similar information sites; it says the rule does not cover online sales of a company's own goods or individuals' blogs [S28].
- MIC FAQ says the destination includes the operator's own server, with an exception for an ID stored in a first-party cookie to identify the user to the operator itself (Q1-1, Q1-16, Q6-2); and it applies even without cookies (Q1-7); user count does not affect coverage (Q1-11) [S29].
- Applicability to us: a UGC place-story site plausibly falls under (ii)/(iv). Whether an open-source hosted MVP is a "telecommunications business" (Art. 2(iv)) or a third-kind business, and whether a foreign-run service is reached, was not resolved: UNVERIFIED (the FAQ does not address foreign operators).
- Penalty/enforcement route was not stated on the pages I read; UNVERIFIED.

Design:
- Outbound link = own-domain redirect `/out/<opaque-id>`: server records time, link ID, place ID, coarse referrer page, a truncated and salted IP hash for de-duplication and bot filtering (rotating salt), no persistent cookie, no account ID by default. Report to creators only aggregate counts by day and place; no per-person lists.
- Add `utm_source=<our-brand>&utm_medium=referral` to the outbound URL as well. Inference: UTM lets a creator see us in their own analytics, but it is invisible on Instagram or Google Maps pages, so the redirect count is the only count we control. UTM is a disclosure to the destination of where the visitor came from, which is the nature of a link anyway; mention in the privacy notice.
- Set `Referrer-Policy` deliberately; avoid sending a full URL with identifiers.
- Do not load third-party analytics. If an embed or map script from another company loads on the page, list it in the Art. 27-12 notice.
- Cookie banners: Japan has no ePrivacy-style general consent law on my reading of these sources; the closest obligation is Art. 27-12 above. EU/UK visitors: out of my lane, UNVERIFIED.

### A9. Stealth marketing (Japan)

- Notice No. 19 of 2023 of the Cabinet Office (令和5年内閣府告示第19号, 2023-03-28), under Act Art. 5(iii), designates "advertisements that a general consumer cannot recognise as a business operator's advertisement", effective 2023-10-01 [S9, S22]. The operational standard (CAA Commissioner decision, 2023-03-28) says the rule applies where the business operator was involved in deciding the content of an apparently third-party post, including SNS posts and reviews it caused others to write, and affiliate content [S23].
- Who is liable: the advertiser (the operator of the goods/services), not an influencer who merely posts on request (CAA page and Q&A Q1) [S22, S24]. Enforcement is a cease-and-desist type order (措置命令); no surcharge unless the content is also misleading on quality or price (Q&A Q2).
- Disclosure: words like "ad", "PR", "promotion", or a sentence such as "posting after receiving the product from Company A" suffice if clear over the whole display; a reply-thread disclosure often is not clear; for video, an on-screen label throughout is preferable (Q&A Q11, Q14, Q15).
- Platform/aggregator points: selecting only favourable posts of a business to quote is likely the business's representation (Q10); presenting a commissioned influencer post as "customer voice" is not appropriate (Q16); a business asking only for correction of false statements does not itself make the post an ad (Q9).
- Our design: our app's partner/owner content is by definition the business's own expression (clearly the business's representation); label it "From the owner". If a business pays us for features, or gives creators free meals/trips in connection with our product, add a required disclosure field ("provided free", "commissioned", "paid") to contributor and creator posts. Do not present partner-supplied content as independent visitor stories. We are not the advertiser unless we ourselves sell/promote goods or services with it; counsel to confirm how the Act treats a platform that sells partner packages.

### A10. Provider Liability Act / Information Distribution Platform Act (Japan)

Act (e-Gov title: 特定電気通信による情報の流通によって発生する権利侵害等への対処に関する法律; MIC calls the large-platform part the "Information Distribution Platform Act") [S5, S6]:
- Art. 1 purpose: liability limits, a right to disclosure of sender information, court procedure for disclosure orders, and duties of large platforms to speed up removal handling and be transparent.
- Art. 3(1): a provider is not liable for damage caused by infringing information unless it knew of the infringement, or knew of the distribution and had reasonable grounds to know of the infringement; this does not protect a provider who is the sender. Art. 3(2): not liable for removing information if it reasonably believed rights were unjustly infringed, or, after an aggrieved person's request naming the infringing information and reasons, it asked the sender whether they consent to removal and seven days passed with no objection.
- Art. 5: a person whose rights are clearly infringed may demand sender information from the provider (and from related telecom providers for connection logs), where needed to claim damages or other legitimate reason. We will hold IP and log data that could be demanded; retention and request-handling must be defined.
- Chapter 5 (Arts. 20-34): large providers designated by the Minister must publish a request channel, investigate, appoint investigation specialists, notify the requester of the decision within a period set by MIC ordinance, and publish removal standards. Designation thresholds in the ordinance: average monthly senders above 10,000,000, or average monthly total sender-count above 2,000,000 (both averaged over one year), for all service types; the notification period in Art. 25 is 7 days by ordinance; reporting of user numbers is required once a provider reaches 9,000,000 senders or 1,800,000 total [S6].
- Are we in scope? We would be a "specified telecommunications service provider" for Arts. 3 and 5 (Inference), but far below the designation thresholds, so Chapter 5 duties do not apply. Adopt the 7-day sender-inquiry as policy anyway.
- Important distinction: the safe harbour covers third-party content. Our AI-synthesised statements are our own.
- Ask counsel: whether our "pin a place + paste a URL" feature makes contributors "senders" of the linked content (the 2020 Supreme Court ruling treated retweeters as senders for inline-link display) [S10].

### A11. Platform terms (one paragraph each)

Meta Platform Terms and Instagram: Instagram Terms of Use say users "can't attempt to create accounts or access or collect information in unauthorized ways", which "includes ... accessing or collecting information in an automated way without our express permission", and that users cannot "sell, license, or purchase any ... data obtained from us or our Service" [S34]. Meta's Automated Data Collection Terms (effective 2024-10-07) forbid automated collection without prior express written permission and allow collected data only for specified purposes such as search-engine results or previews of Meta URLs [S35]. The Meta Platform Terms (updated 2026-02-03) require promptly updating or deleting Platform Data on request, and delete when it is no longer needed, when the product stops, or when a user asks or leaves; they prohibit processing Platform Data for purposes other than permitted ones, and selling, licensing or purchasing Platform Data; the page I read did not mention AI training [S33]. The Instagram oEmbed documentation: public posts only; private, inactive and age-restricted accounts and accounts with embeds disabled are not supported; the endpoint is only for embedding in sites and apps; any use of metadata and content other than a front-end view is "strictly prohibited", including "consuming, manipulating, extracting, or persisting", including deriving information for analytics; limit 1,000 requests per hour [S36]. Our design implication: oEmbed output may be displayed, not stored or analysed; no AI over Instagram content; no scraping of captions/images. Whether the access-token / app-review requirements apply to our use is not on that page: UNVERIFIED.

Google Maps Platform: the Terms (last modified 2026-08-26) bar scraping Google Maps Content and give as examples pre-fetching, indexing, storing, bulk download, and "copy and save business names, addresses, or user reviews" (3.2.3(a)); no caching except as the Service Specific Terms allow (3.2.3(b)); no creating content based on Maps Content, including using it "to improve machine learning and artificial intelligence models, including to train, test, validate or fine-tune" (3.2.3(c)(vii)); no use of Core Services in "a listings or directory service" (3.2.3(d)(iii)); and no Places content on a non-Google map (3.2.3(e)) [S39]. The Service Specific Terms (last modified 2026-10-28) allow caching Google IDs such as place_id [S40]. The Places API policies page (updated 2026-10-28) says Places content must be shown on a Google Map or with the Google logo, authors of reviews and photos must be credited, and you must not "pre-fetch, cache, or store Places API content beyond the allowed exceptions" while place IDs may be stored indefinitely [S41]. Implication: "import a Google Maps review" is not allowed as a copy; the safe form is a link (and optionally storing the place_id). Using Google Maps APIs for a place directory with a non-Google map would breach 3.2.3(d)/(e); a hand-pinned point on an open base map (see 01-maps-geocoding.md in this folder for map choices, which I did not review) avoids those clauses. Google's Geo Guidelines also restrict Street View screenshots in videos and require attribution in demo videos (A13) [S43].

TikTok: the Developer Terms (last modified 2025-12-26) allow automated means only as described in the developer documentation, prohibit robots/spiders to collect user information for unauthorised purposes and excessive requests, limit use of TikTok information to developing and supporting the approved application, and require deletion of TikTok information on termination; the page I read did not address AI training or give a general refresh duty [S44]. The TikTok oEmbed page says embed videos "will be deprecated soon" and to use Embed Player for new integrations; the embed becomes inaccessible when TikTok removes the video; no authentication is mentioned [S45]. Implication: use the official embed/player or just a link; plan for the endpoint to change. The consumer Terms of Service were not read: UNVERIFIED.

X: the Developer Agreement (last updated 2026-04-27) prohibits using the X API or X Content "to fine-tune or train a foundation or frontier model" [S42]. The Developer Policy requires that stored X Content be kept up to date and deleted or modified "as soon as reasonably possible, or within 24 hours" after a request or when it is deleted, made private or withheld on X, and limits redistribution to Post IDs/User IDs (plus a small allowance for non-automated downloads) [S46]. The X Terms of Service (effective 2026-10-09) say users may not scrape the Services without X's express written permission and may not access the Services other than via published interfaces; the same terms give X a broad licence to use user content for AI training, which is a rule about X's use, not ours [S47]. Implication: if we show X posts, use the embed or link; no stored copies and no AI.

Compliance table for the "paste URL" feature (Inference summarising the above):

| Source | Show official embed | Store text/image/captions | AI-extract claims | Count outbound clicks |
|---|---|---|---|---|
| Instagram | Yes (oEmbed) | No | No | Yes (our redirect) |
| Google Maps review/place | Only via Google map/API, with attribution | place_id only | No | Yes |
| TikTok | Yes (embed/player; deprecation pending) | No (UNVERIFIED beyond terms read) | No (UNVERIFIED; not addressed in terms read) | Yes |
| X | Yes (embed) | Only IDs, keep in sync | No | Yes |
| Blog/other web page | Link card with contributor-written summary | Short quote only under A1 limits | Only if licensed | Yes |

### A12. Open-source licensing (code, OSM data, Wikipedia text, user content)

Code licence:
- MIT: permission grant, one condition (keep copyright and permission notice), disclaimer of warranty [S48]. No obligation to share modifications; a competitor could run a closed hosted fork.
- Apache-2.0: adds an express patent licence from each contributor, terminating if a licensee sues over patents, and requires notices/changed-file marking [S49]. No share-alike.
- AGPL-3.0: Section 13 says that if you modify the program, your modified version must prominently offer all users interacting with it remotely over a network the chance to receive the Corresponding Source, from a network server at no charge; GPLv3 combination is permitted [S50]. This is the licence that fits "hosted and wants to stay open". Cost: some companies refuse AGPL dependencies; contributions need compatible licences.
- Recommendation for counsel: AGPL-3.0-or-later for the application code if staying open against closed hosted forks is a priority; Apache-2.0 if adoption and low friction matter more. Whatever is chosen, keep code, data and content licences separate and written down; scan dependency licences.

OpenStreetMap / ODbL:
- ODbL 1.0 [S51]: a Derivative Database that you publicly use must be offered only under the ODbL (4.4); internal use is outside share-alike (4.5); if you publicly use a Derivative Database or a Produced Work from it you must offer the derivative database or a way to get it (4.6); a Produced Work (e.g., a rendered map) needs a notice but not share-alike (4.3). A Collective Database (independent databases side by side) is not a derivative.
- OSMF guidance: geocoding results are insubstantial extracts and storing them does not trigger share-alike unless aggregated into a new database containing a whole or substantial part of OSM (guideline status "endorsed by the OSMF board 2017-08-24") [S52]. The OSM wiki Legal FAQ (page says it does not represent OSMF views; last edited 2026-08-13) says merging OSM data with your own database makes a derivative database that must be under the ODbL, and automated matching on a simple criterion like name or locality is not "substantial" [S53]. I could not retrieve the OSMF's own Collective/Derivative guideline page: UNVERIFIED.
- Attribution: "OpenStreetMap" with a link to openstreetmap.org/copyright, normally in a corner of the map [S54].
- Operating policies: tile.openstreetmap.org prohibits bulk downloads/prefetch, has no SLA, requires a unique User-Agent, and points production services to alternatives [S55]. Nominatim: at most 1 request per second, no client-side autocomplete, required caching, attribution [S56].
- Implication: user-pinned coordinates are ours. A place table that stores OSM IDs/names/addresses beyond trivial use risks becoming an ODbL derivative that we must publish; decide deliberately (publishing it may be acceptable for an open project, but it constrains how place data can be combined with CC BY-SA or Google data). Use a production-grade tile provider or self-hosted tiles with attribution. The Geospatial Information Authority of Japan's content (page revised 2025-11-20) applies the Public Data License 1.0 with required source attribution and a ban on implying GSI made your modified data; commercial-use detail sits in PDL 1.0, not read: UNVERIFIED [S57].

Wikipedia / CC BY-SA 4.0:
- Wikipedia text is CC BY-SA (reuse page, last edited 2024-08-22): credit the authors (link, stable copy, or list); share modifications under CC BY-SA 4.0 or later; state the licence; media files have their own licences [S58]. The CC BY-SA 4.0 legal code requires attribution (3(a)); adapted material must be under BY-SA 4.0 or a "BY-SA Compatible License" with licence link (3(b)); where you include all or a substantial part of a database's contents in your database, your database (not its individual contents) must be under the same terms for that portion (Section 4) [S59]. CC lists GPLv3 as a one-way compatible licence for adaptations, but BY-SA material cannot be moved into MIT/Apache by that route [S60].
- Wikidata structured data is CC0 [S61]. Prefer Wikidata for facts (coordinates, identifiers, dates) over Wikipedia sentences.
- A "blended" page that paraphrases a Wikipedia paragraph is an adaptation; the whole adapted passage needs CC BY-SA attribution and licence. Simplest rule: no Wikipedia prose in AI prompts as source text; use Wikidata or link to Wikipedia.

User contributions and withdrawal:
- CC BY-SA 4.0's grant is "irrevocable" (2(a)(1)); the licensor can stop distributing without ending the licence (6(c)); moral rights are not licensed beyond a limited waiver or non-assertion needed to exercise the licensed rights (2(b)(1)) [S59]. Inference: if interviewees may withdraw, do not publish their text under an irrevocable CC licence by default; use a contributor licence that lets us display and lets them withdraw (with a cascade), and publish only our own AI-assisted synthesis under the open licence after consent. Ask counsel to draft a contributor agreement in Japanese that deals with moral-rights non-assertion, withdrawal, and AI processing.

### A13. Real people's posts and images in demo videos and seed data

Project rule: seed data must be real; demo content must belong to an explicitly labelled mock user. Flags (all Inference unless cited):
- Copyright: showing a real third-party photo or post in a demo video reproduces it. Art. 32 quotation needs criticism/research-type purpose; a product demo is not obviously that [S1, S12]. Use your own content, openly licensed content (credit and keep licence), or get written permission.
- Moral rights: attribution must appear in the video frame, not only in the description (cf. A2) [S10]. Criminal exposure exists for moral-right infringement (Art. 119(2)(i)) [S1].
- Portrait/publicity: faces and names used to make the product look good lean toward "advertising use" [S13].
- APPI: handles, names and faces in recordings are personal information; if the demo is public we are processing it for a new purpose. Get consent or blur/omit [S3].
- Platform terms: a demo that displays an Instagram embed is arguably within "front-end view"; storing or analysing the post would not be [S36]. X: keep content current [S46].
- Google Maps/Earth/Street View in video: promotional or advertising videos need submission for approval and may use only standard Google Maps imagery (no satellite view); Street View may not be screenshotted; attribution must not be cropped or moved to end credits [S43]. Use the open base map in demos.
- Mock user integrity: a mock user is a fabricated person and must be labelled in the UI and the video. The mock user's "outbound clicks" to a real creator's post must not appear in any creator-facing statistic; exclude demo traffic or use a separate demo environment, because the count is the value promised to creators.
- Where the demo shows real businesses in Nagasaki, get their agreement or use businesses owned by the team; do not show negative or cautionary statements about a real named business in a demo.

### A14. Malaysia (later region)

Personal Data Protection Act 2010 and the 2024 amendments [S25, S26, S27]:
- Scope: Act 709 s.2(1) applies to a person who processes, or controls or authorises processing of, personal data "in respect of commercial transactions", defined as transactions of a commercial nature including supply or exchange of goods or services [S27]. Whether a non-profit story platform without sales is within the Act is a matter for counsel: UNVERIFIED how the Commissioner reads this. If partners pay us, assume it applies. s.2(2) reaches an entity established in Malaysia, or one using equipment in Malaysia for processing (with a Malaysian representative).
- Act A1727 (royal assent 2024-10-09; gazetted 2024-10-17) [S26]: "data user" becomes "data controller"; "biometric data" (data from technical processing of physical, physiological or behavioural characteristics) added to sensitive personal data; processors must comply with the Security Principle; penalty for breaching the principles raised to MYR 1,000,000 and/or 3 years; new duty to appoint a data protection officer and notify the Commissioner; new data breach notification (to Commissioner as soon as practicable; to data subjects without undue delay if significant harm likely; offence MYR 250,000 and/or 2 years); data portability right; the cross-border section 129 is rewritten so there is no minister's whitelist: a controller may transfer to a place with a substantially similar law or an adequate level of protection, or under the listed conditions such as consent. Commencement by P.U.(B) 522 of 2024-12-24 [S25]: 2025-01-01 (ss.7, 11, 13, 14), 2025-04-01 (ss.2, 3, 4, 5, 8, 10, 12) and 2025-06-01 (ss.6 and 9, which are the DPO/breach-notification and portability sections).
- A JPDP cross-border transfer guideline (3/2025) exists on the PDP site; I did not read it: UNVERIFIED.
- Design: treat voice recordings as potentially biometric/sensitive; breach playbook that works for APPI Art. 26 and PDPA s.12B; a DPO contact for the Malaysian pack.

Online Safety Act 2025 (Act 866) and licensing [S30, S31, S32]:
- Royal assent 2025-05-06, gazetted 2025-05-22; MCMC states it has been enforced since 2026-01-01 [S31]. s.2: applies to applications services enabling communication between users, content applications services, and network services (not private messaging features). Parts III-IV duties (risk mitigation, reporting mechanism, child protection, online safety plan) are placed on licensed application/content service providers. s.3: extraterritorial for persons who provide services in Malaysia and are licensees under the CMA. A "child" is under 18 [S30].
- Licensing: MCMC says internet messaging and social media providers with eight million or more users in Malaysia must be licensed (ASP(C)) under a framework in force from 2025-01-01, and that from 2026-01-01 those meeting the criteria are deemed registered under CMA s.46A (named examples include Facebook, Instagram, TikTok, YouTube) [S32]. MCMC's FAQ says s.46A came into force on 2025-02-11, deemed registration has no fixed validity, and deemed providers must nominate a local representative [S62]. We are far below 8 million users; the duties attach if we become licensed or are declared deemed.
- Child Protection Code (published 2026-05-22, effective 2026-06-01): licensed social media providers likely to be accessed by children must verify that only users aged 16+ can register, using government records or equivalent [S63]. If we ever become a licensee, accounts need age verification; until then, set 16+ as policy.

Communications and Multimedia Act 1998 s.233 as amended by Act A1743 (royal assent 2025-01-27, gazetted 2025-02-07; in force 2025-02-11 except provisions the Minister defers; per a secondary source - the Gazette notice itself was not retrieved: UNVERIFIED) [S64]:
- s.233(1)(a) offence needs knowing creation/solicitation and initiation of a transmission of a communication that is obscene, indecent, false, menacing or "grossly offensive" with intent to annoy, abuse, threaten, harass, or commit an offence involving fraud or dishonesty against any person; penalty up to MYR 500,000 and/or 2 years, up to 5 years where a child under 18 is the target. Explanations: "false content" includes untrue, confusing, incomplete or fabricated content; satire and obvious fiction are not false; good-faith communication of true statements of fact is not "grossly offensive" (Explanation 6(d)). Take: factual cautions with verified sources and no intent to harass are outside the offence on the text; "incomplete" content is a flagged risk.
- The older s.233 text still appears in MCMC's Act 588 PDF [S65]; use the A1743 text for current law.

Defamation [S66, S67]:
- Defamation Act 1957 (Act 286; reprint) s.8 (justification not defeated if unproved charges do not materially injure reputation) and s.9 (fair comment where some facts unproved) show justification and fair comment as defences; s.7 allows an offer of amends for innocent publication, with conditions; s.7(6) says the innocent-publication defence does not apply to words the publisher did not write unless it proves the author wrote them without malice. Our relevance: a correction/offer-of-amends route; "innocent" is unlikely where our AI composes the words.
- Penal Code s.499 (reprint dated 2018; current text UNVERIFIED): defamation includes imputations about a company; the First Exception protects true imputations only "if it is for the public good", a question of fact.
- Design: the same gating rule as Japan; a Malaysian wording pack, a lawyer review before activation, plus a correction mechanism.

Regional config implication: legal parameters are data (languages, age threshold, consent text version, transfer basis per AI provider, takedown contact, retention, allowed embed platforms, DPO), but each region's text needs counsel sign-off before the region flag can be turned on.

---

## Part B - Spec gaps checklist

Ranking: MUST-HAVE-FOR-MVP = launch should not happen without a decision and an implementation (or an explicit, recorded waiver). LATER = important but can follow the first release. One line of reason each.

### MUST-HAVE-FOR-MVP

| # | Item | Why (one line) |
|---|------|----------------|
| 1 | Operator of record (legal entity or named individuals) | The Japanese APPI duties, takedown notices, disclosure orders and contracts all need a responsible party; "open source" is not an operator (A6, A10). |
| 2 | Terms of Service and contributor licence (JP authoritative, EN courtesy) | Defines licence to display, AI processing, warranty of rights, moral-rights non-assertion, withdrawal, and who owns what (A1, A12). |
| 3 | Privacy notice in Japanese and English | APPI Art. 21 requires purpose notice; the notice must also name foreign transfers and third-party loads (A6-A8). |
| 4 | Interview consent capture: recorded consent, scope, withdrawal, language | Consent must cover publication, AI processing, foreign transfer and special-care topics; withdrawal needs a cascade (A6, A7). |
| 5 | Minors and age policy: account holders 16+, guardian consent for subject under 16 | PPC Q&A says 12-15 and under need guardian consent; the 2026 amendment sets under-16 in law (A6). |
| 6 | Voice-data handling rule: no voiceprints, audio retention default, deletion on withdrawal | Voice is personal information and may become an identification code when converted; MY treats biometric as sensitive (A6, A14). |
| 7 | Special-care information protocol for testimonies (health, status, hibakusha) | Acquisition needs prior consent; classification of hibakusha status is unverified, so be explicit (A6). |
| 8 | Owner verification that works for tiny Japanese businesses | Ladder: callback or SMS to a number on a public source; postcard code to the address; a code posted on their LINE/Instagram/Google profile (control of listed channel); steward in-person vouch; for corporations, check the NTA corporate-number site (free Web-API with application ID and mandatory source notice [S68]); invoice registry lookup optional [S69]. Verify control of a channel, not legal identity; do not collect ID documents. |
| 9 | Creator/partner identity verification | The brief ties verified creators to a public profile; use control-of-account proof and consent to display; define what "partner" means for the stealth-marketing label (A9). |
| 10 | Contributor vetting and tiers | New accounts cannot add cautions; negative claims need a named author; rate limits and strike policy; reduces defamation and spam (A5). |
| 11 | Negative-claim gating spec (taxonomy of allowed cautions, evidence, corroboration, right of reply) | The core legal protection; define allowed structured fields (closed days, cash only, reservations, language support, allergens listed by the owner) versus banned categories (hygiene, behaviour, honesty) (A5). |
| 12 | AI provenance schema: claim -> source span -> permission status -> reviewer -> model/version | Needed to show "every sentence cites its source", to block restricted inputs, and to defend a takedown (A3, A5). |
| 13 | AI output rules: no inference, one claim per sentence, "AI-assisted" label, human review for business-affecting text | We are the publisher of the blended page (contradiction 2). |
| 14 | Takedown and appeal workflow with SLA | Public JA/EN form, acknowledgement, 7-day sender inquiry (Art. 3(2)(ii)), reasoned outcome, appeal, evidence preservation, emergency hide for privacy/minors (A10). |
| 15 | Disclosure-order and police-request playbook | Art. 5 sender-information demands and criminal defamation complaints will need a lawyer and a log-retention rule (A10). |
| 16 | Moderation tooling: queue, claim-level hide, audit log, diff of AI edits, steward roles | Without tooling the takedown SLA cannot be met and decisions cannot be audited. |
| 17 | Handling deleted or changed source posts | Meta and X require deletion/updates; TikTok removal disables the embed; need a liveness check, hide-on-gone rule, and a decision on claims derived from vanished sources (A11). |
| 18 | Outbound-click tracking design (redirect + UTM, bot filtering, aggregate-only reports, honest definitions) | The core value promise to creators; first-party redirect keeps APPI risk low (A8). |
| 19 | Third-party transmission inventory and Japanese notice (embeds, tiles, analytics) | Telecommunications Business Act Art. 27-12 may apply (A8). |
| 20 | Japanese-first UX and i18n: JA original canonical, EN translation labelled as translation, place names in JA and romaji | Businesses are Japanese-speaking; mistranslation is a defamation and accuracy risk. |
| 21 | Accessibility: target WCAG 2.2 AA (Japan's JIS X 8341-3 mapping not verified here), keyboard access, non-map list view, transcripts and alt text for all audio and images | Visitors and owners include older and disabled users; accessible alternatives to the map are essential. (The WCAG and JIS references were not retrieved in this pass: UNVERIFIED.) |
| 22 | Data residency and retention schedule | APPI Arts. 25-28; Art. 28 consent text must name the foreign country; set hosting region and per-data-class retention. |
| 23 | AI provider transfer terms: no-training, no-retention, region, sub-processors; consent wording | PPC 2023 alert and Art. 28 (A7). Vendor-specific terms belong to the AI-provider research lane and were not checked here. |
| 24 | Base map choice and licence compliance (OSM/GSI/other), attribution component | Avoids Google restrictions and ODbL surprises (A11, A12). |
| 25 | Content and data licence policy (CC BY-SA vs CC BY vs CC0; ODbL boundary) | Decides what can be reused and what we must publish (A12). |
| 26 | Security baseline and breach plan | APPI Art. 26 reporting; encrypt audio at rest, access logging, least privilege, tested backups. |
| 27 | Seed and demo data protocol | The project rule requires real seed data and labelled mock users; add a provenance field and an exclusion of demo traffic from creator stats (A13). |
| 28 | Region configuration schema includes legal fields | Languages, age threshold, consent text version, transfer basis, takedown contact, retention, allowed platforms, base map licence; region off until counsel signs the pack (A14). |
| 29 | Regional steward charter | Appointment, powers, conflicts of interest (stewards who are business owners), recusal, training, escalation to counsel, their own personal data. |
| 30 | Open-source governance basics: LICENSE, CONTRIBUTING, Code of Conduct, SECURITY.md with a private reporting address, contributor sign-off (DCO or CLA), no-personal-data-in-repo rule | Public repo from day one; vulnerability and conduct reports need a route (A12). |
| 31 | Name, domain and brand check | Trademark search in JA and EN, avoid platform trademarks (Instagram, Google, Maps) in the name, confirm the domain and handles; JPO's J-PlatPat search for Japan and equivalent for Malaysia (not run here: UNVERIFIED). |
| 32 | Cost model with caps | AI transcription and extraction cost per interview, tiles, storage, steward time, legal review; a monthly cap and a degrade plan. |

### LATER

| # | Item | Why (one line) |
|---|------|----------------|
| 33 | Paid partner plans and invoicing (Japanese invoice system, commercial transaction law) | Brings PDPA "commercial transaction" scope, advertiser status under stealth-marketing rules, and tax duties. |
| 34 | Formal certifications (privacy mark, ISMS) and DPO appointment (MY if in scope) | Trust signals; MY DPO duty exists since 2025-06-01 if the Act applies. |
| 35 | Native apps and app-store policy review | Adds store rules and permissions, not needed for a web MVP. |
| 36 | Self-hosted tiles/geocoder | Cost and independence once traffic grows (A12). |
| 37 | Automated claim-conflict detection and contributor trust scores (internal only) | Public ranking is outside the "stories, not scores" policy; keep any scoring internal. |
| 38 | DSAR portal and bulk export (APPI Arts. 33-35; PDPA portability) | Manual handling is acceptable at small volume. |
| 39 | Additional regions' legal packs beyond JP and MY | Each needs its own counsel review. |
| 40 | Public API and federation | Raises licence, privacy and abuse questions. |
| 41 | Audio redaction and speaker separation tools | Useful for third-party mentions; manual at first. |
| 42 | Bug bounty, penetration test, SBOM publishing | Valuable once there is real data volume. |
| 43 | Community moderation features (peer flags, reputation badges) | Needs a policy fit with "stories not scores". |
| 44 | Trademark filing | After the name check passes. |
| 45 | Chat-style AI Q&A over pages | Adds a new publisher surface with its own defamation and accuracy risk. |

---

## Unverified / open questions

Each item is UNVERIFIED or needs counsel. None of these was resolved from a primary source in this pass.

Japan - copyright and platforms
1. Whether a text-only hyperlink or a link card (our own words plus URL) engages any right in Japan. No primary ruling retrieved.
2. Whether Instagram, X and TikTok embed widgets display the author's name by default (relevant to A2).
3. Whether the 2026-06-24 amendment to the Copyright Act changed any article cited here (the current text was read; the amending Act's content was not).
4. Whether Meta's oEmbed requires an access token or app review (the page read is silent); and whether the Instagram help-centre embed option is governed by different terms than the Graph API oEmbed.
5. TikTok's consumer Terms of Service; TikTok embed deprecation timeline; whether TikTok terms address AI training (the developer terms read do not).
6. Google Places API review display rules for a non-Google map and the exact scope of "listings or directory service" in 3.2.3(d)(iii) for a story site.
7. OSMF's own Collective Database, Derivative Database and Produced Work guideline pages (not retrieved; the OSM wiki Legal FAQ I used states it does not represent OSMF views).
8. GSI (Japan) tile terms in PDL 1.0 detail.

Japan - defamation and privacy
9. How Japanese courts treat "public interest" for private small-shop conduct, and whether neutral operating facts (cash only, closed Monday) can ever lower reputation. No case retrieved.
10. Civil-law standard for a business operator's reputation versus consumer-information interest: not retrieved.
11. Whether hibakusha status or testimony of illness is special-care information under the APPI (PPC guideline not read).
12. The PPC General Rules guideline on whether a non-profit open-source project is a "business" operator (statute text has no threshold).
13. Exact commencement dates by provision for the 2026 APPI amendment (e-Gov shows revision dates 2027-01-17 and 2028-07-16; PPC roadmap not read), and the final text of the new facial-feature, under-16 and surcharge rules.
14. The PPC 2024 cloud-provider alert (read only through a search summary).
15. Whether the Telecommunications Business Act classes our service as a telecommunications business or third-kind business, whether foreign operators are reached, and what enforcement attaches to a breach of Art. 27-12.
16. Whether stealth-marketing rules or the Act changed after 2024 (not checked), and how the Act treats a platform that sells partner packages.
17. EU/UK/US visitor privacy laws (GDPR, UK GDPR, state laws) applying to travellers: out of lane.
18. The PPC "recipient equivalent system" standard (Rules Art. 16) in detail and APEC CBPR status of any chosen AI provider.
19. Whether the invoice-registration Web-API returns sole proprietors' names and addresses (page did not say).
20. WCAG 2.2 AA and JIS X 8341-3:2016 mapping.
21a. MIC external-transmission FAQ and CAA stealth-marketing Q&A question numbers were taken from a page-reader's output (the MIC page was partly garbled in transit); confirm the numbers against the live pages before quoting them to counsel.

Malaysia
21. Whether PDPA s.2(1) "commercial transactions" covers a non-profit story platform.
22. Current text of the Penal Code (the reprint I read is dated 2018) and of the Defamation Act reprint.
23. The Gazette notice appointing the commencement of Act A1743 (date taken from MCMC's FAQ for s.46A and a secondary summary; section 92 exclusion unverified).
24. The Ministerial Declaration under s.46A (which activities are deemed) and obligations of ASP class licensees below 8 million users.
25. The JPDP cross-border transfer guideline 3/2025 and codes of practice.
26. Whether MCMC's Child Protection Code applies to unlicensed platforms.

Platform and other
27. Platform behaviour of third-party tags used in a design not yet chosen.
28. Whether Tabelog, note.com, Ameblo, LINE VOOM and other Japanese platforms' terms allow link-outs and embeds at all: not researched.
29. AI vendor terms (data retention, region, training) were left to the AI-provider lane.
30. Contributor-terms drafting: the moral-rights non-assertion covenant and irrevocability of CC BY-SA 4.0 licences against withdrawal rights; the 2022 IP High Court decision is a disclosure-stage ruling and not general authority.

## Sources

All accessed 2026-10-29. Statutes were retrieved through the e-Gov Laws API v2 (`https://laws.e-gov.go.jp/api/2/law_data/<law-id>`), which returns the in-force text; revision IDs are shown. Human-readable page for each is `https://laws.e-gov.go.jp/law/<law-id>`.

Japan - statutes and orders
- [S1] Copyright Act (著作権法, 昭和45年法律第48号), law ID 345AC0000000048, revision 345AC0000000048_20260624_508AC0000000048. https://laws.e-gov.go.jp/law/345AC0000000048
- [S2] Penal Code (刑法), 140AC0000000045, revision 140AC0000000045_20260521_507AC0000000039. https://laws.e-gov.go.jp/law/140AC0000000045
- [S3] Act on the Protection of Personal Information (個人情報の保護に関する法律), 415AC0000000057, revision 415AC0000000057_20261001_507AC0000000070. https://laws.e-gov.go.jp/law/415AC0000000057
- [S4] Order for Enforcement of the APPI (個人情報の保護に関する法律施行令), 415CO0000000507, revision 415CO0000000507_20260930_508CO0000000309. https://laws.e-gov.go.jp/law/415CO0000000507
- [S5] Act on Limitation of Liability of Specified Telecommunications Service Providers and Right to Request Disclosure of Sender Information (特定電気通信による情報の流通によって発生する権利侵害等への対処に関する法律), 413AC0000000137, revision 413AC0000000137_20260717_508AC1000000058. https://laws.e-gov.go.jp/law/413AC0000000137
- [S6] Ministerial ordinance for the above (同法施行規則), 504M60000008039. https://laws.e-gov.go.jp/law/504M60000008039
- [S7] Telecommunications Business Act (電気通信事業法), 359AC0000000086, revision 359AC0000000086_20260527_507AC0000000046. https://laws.e-gov.go.jp/law/359AC0000000086
- [S8] Telecommunications Business Act Enforcement Rules (電気通信事業法施行規則), 360M50001000025. https://laws.e-gov.go.jp/law/360M50001000025
- [S9] Act against Unjustifiable Premiums and Misleading Representations (不当景品類及び不当表示防止法), 337AC0000000134, revision 337AC0000000134_20260521_504AC0000000048. https://laws.e-gov.go.jp/law/337AC0000000134
- [S15] Civil Code (民法), 129AC0000000089, revision 129AC0000000089_20260624_508AC0000000045. https://laws.e-gov.go.jp/law/129AC0000000089

Japan - courts
- [S10] Supreme Court, Third Petty Bench, 2020-07-21, 平成30年(受)第1412号. https://www.courts.go.jp/assets/hanrei/hanrei-pdf-89597.pdf
- [S11] Supreme Court, First Petty Bench, decision of 2010-03-15 (internet individual defamation). https://www.courts.go.jp/assets/hanrei/hanrei-pdf-38704.pdf
- [S12] IP High Court, 2022-10-19, 令和4年(ネ)第10019号. https://www.courts.go.jp/assets/hanrei/hanrei-pdf-91469.pdf
- [S13] Supreme Court, First Petty Bench, publicity-right judgment ("Pink Lady"). https://www.courts.go.jp/assets/hanrei/hanrei-pdf-81957.pdf

Japan - regulators
- [S14] Agency for Cultural Affairs / Council for Cultural Affairs, 「AIと著作権に関する考え方について」, 2024-03-15. https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/pdf/94037901_01.pdf
- [S16] PPC, Q&A on the APPI Guidelines (updated 2023-12-25; A1-62, A7-53, A8-1, A8-3, A8-10). https://www.ppc.go.jp/files/pdf/2312_APPI_QA.pdf
- [S17] PPC, 令和8年 改正個人情報保護法について (states bill submitted 2026-04-07, passed 2026-07-10, promulgated 2026-07-17). https://www.ppc.go.jp/personalinfo/legal/r8kaiseihogohou/
- [S37] e-Gov revision list for the APPI (shows not-yet-in-force revisions 415AC0000000057_20270117_508AC0000000056 and 415AC0000000057_20280716_508AC0000000056, amending Act 個人情報の保護に関する法律等の一部を改正する法律); the 2028-07-16 revision text, read via https://laws.e-gov.go.jp/api/2/law_data/415AC0000000057_20280716_508AC0000000056, contains the under-16, surcharge and biometric terms; the 2027-01-17 revision does not. https://laws.e-gov.go.jp/api/2/law_revisions/415AC0000000057
- [S38] PPC press release 2026-07-17 on promulgation (surfaced in search results; page itself not opened). https://www.ppc.go.jp/news/press/2026/260717/
- [S18] PPC, 個人情報保護法等の一部を改正する法律について (July 2026 overview deck). https://www.ppc.go.jp/files/pdf/260717_kaiseihounitsuite.pdf
- [S19] PPC, Guidelines on the APPI (Provision to a Third Party in a Foreign Country), amended December 2025. https://www.ppc.go.jp/files/pdf/251212_guidelines02.pdf (the earlier December 2023 version https://www.ppc.go.jp/files/pdf/231227_guidelines02.pdf was also read; the 2025 file was read for the equivalent-countries rule text)
- [S20] PPC, alert on cloud service providers that are personal information handling operators, 2024-03-25 (read only via search result; not opened). https://www.ppc.go.jp/files/pdf/240325_alert_cloud_service_provider.pdf
- [S21] PPC, 生成AIサービスの利用に関する注意喚起等, 2023-06-02. https://www.ppc.go.jp/files/pdf/230602_alert_generative_AI_service.pdf
- [S22] CAA, ステルスマーケティング page. https://www.caa.go.jp/policies/policy/representation/fair_labeling/stealth_marketing
- [S23] CAA, 運用基準 (2023-03-28). https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_230328_03.pdf and 告示 https://www.caa.go.jp/policies/policy/representation/fair_labeling/public_notice/assets/representation_cms216_230328_07.pdf
- [S24] CAA, ステルスマーケティングに関するQ&A. https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/stealth_marketing/
- [S28] MIC, 外部送信規律 overview. https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu.html
- [S29] MIC, 外部送信規律 FAQ. https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu_00002.html
- [S68] NTA, Corporate Number Publication Site Web-API. https://www.houjin-bangou.nta.go.jp/webapi/
- [S69] NTA, Qualified Invoice Issuer Publication System Web-API. https://www.invoice-kohyo.nta.go.jp/web-api/index.html
- [S57] GSI, site content terms (revised 2025-11-20). https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html

Malaysia
- [S25] Gazette P.U.(B) 522, appointment of commencement dates for Act A1727 (2024-12-24). https://www.pdp.gov.my/wp-content/uploads/2024/12/PENETAPAN-TARIKH-PERMULAAN-KUAT-KUASA.pdf (linked from https://www.pdp.gov.my/en/akta/personal-data-protection-amendment-act-2024-appointment-of-date-of-coming-into-operation/)
- [S26] Personal Data Protection (Amendment) Act 2024 (Act A1727). https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2024/11/Act-A1727.pdf
- [S27] Personal Data Protection Act 2010 (Act 709), PDP Commissioner copy. https://www.pdp.gov.my/wp-content/uploads/2024/07/UNDANG-UNDANG-MALAYSIA_AKTA_PERLINDUNGAN_DATA_PERIBADI_2010_709_MALAY_AND-ENG_V2022.pdf
- [S30] Online Safety Act 2025 (Act 866), AGC. https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/2867049_BI/Act%20866-Online%20Safety%20Act%202025.pdf
- [S31] MCMC, Act 866 page (states enforced 2026-01-01). https://www.mcmc.gov.my/en/legal/acts/communications-and-multimedia-amendment-act-20-1
- [S32] MCMC media statement, 2025-12-15 (deemed registration). https://www.mcmc.gov.my/skmmgovmy/media/General/pdf2/MEDIA-STATEMENT_Internet-Messaging-and-Social-Media-Service-Providers-Deemed-Registered-Effective-1-January-2026_15-Dec-2025.pdf
- [S62] MCMC, FAQ on the Deeming Provision, 2025-12-15. https://www.mcmc.gov.my/skmmgovmy/media/General/pdf2/FAQ_Deeming-Provision_15-December-2025.pdf
- [S63] MCMC, Online Safety Act 2025: Child Protection Code (effective 2026-06-01). https://www.mcmc.gov.my/skmmgovmy/media/General/pdf2/ONSA-Child-Protection-Code_1.pdf
- [S64] Communications and Multimedia (Amendment) Act 2025 (Act A1743). https://lom.agc.gov.my/ilims/upload/portal/akta/outputaktap/2669326_BI/A1743%20BI-%20COMMUNICATIONS%20AND%20MULTIMEDIA%20(AMENDMENT)%20ACT%202025.pdf
- [S65] Communications and Multimedia Act 1998 (Act 588), MCMC-hosted older text. https://www.mcmc.gov.my/skmmgovmy/media/General/pdf/Act588bi_1.pdf
- [S66] Defamation Act 1957 (Act 286), AGC reprint. https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20286.pdf
- [S67] Penal Code (Act 574), AGC reprint as at 2018. https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Penal%20Code%2018%20Dis%202018.pdf

Platform terms and policies
- [S33] Meta Platform Terms (updated 2026-02-03). https://developers.facebook.com/terms/
- [S34] Instagram Terms of Use (no effective date visible on the page). https://help.instagram.com/581066165581870
- [S35] Meta Automated Data Collection Terms (effective 2024-10-07). https://www.facebook.com/apps/site_scraping_tos_terms.php
- [S36] Instagram oEmbed documentation. https://developers.facebook.com/documentation/instagram-platform/oembed (redirect of https://developers.facebook.com/docs/instagram-platform/oembed)
- [S39] Google Maps Platform Terms of Service (last modified 2026-08-26). https://cloud.google.com/maps-platform/terms
- [S40] Google Maps Platform Service Specific Terms (last modified 2026-10-28). https://cloud.google.com/maps-platform/terms/maps-service-terms
- [S41] Google Places API policies (updated 2026-10-28). https://developers.google.com/maps/documentation/places/web-service/policies
- [S43] Google Geo Guidelines. https://about.google/brand-resource-center/products-and-services/geo-guidelines/
- [S44] TikTok Developer Terms of Service (last modified 2025-12-26). https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en
- [S45] TikTok Embed Videos documentation. https://developers.tiktok.com/doc/embed-videos
- [S42] X Developer Agreement (last updated 2026-04-27). https://docs.x.com/developer-terms/agreement
- [S46] X Developer Policy. https://docs.x.com/developer-terms/policy (redirect of https://developer.x.com/en/developer-terms/agreement-and-policy)
- [S47] X Terms of Service (effective 2026-10-09). https://x.com/en/tos

Open-source and data licences
- [S48] MIT licence. https://opensource.org/license/mit
- [S49] Apache License 2.0. https://www.apache.org/licenses/LICENSE-2.0
- [S50] GNU AGPL-3.0. https://www.gnu.org/licenses/agpl-3.0.html
- [S51] ODbL 1.0. https://opendatacommons.org/licenses/odbl/1-0/
- [S52] OSMF Geocoding guideline (endorsed 2017-08-24). https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline
- [S53] OSM Wiki Legal FAQ (not an OSMF statement; last edited 2026-08-13). https://wiki.openstreetmap.org/wiki/Legal_FAQ
- [S54] OSMF Attribution Guidelines. https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- [S55] OSMF Tile Usage Policy. https://operations.osmfoundation.org/policies/tiles/
- [S56] OSMF Nominatim Usage Policy. https://operations.osmfoundation.org/policies/nominatim/
- [S58] Wikipedia: Reusing Wikipedia content (last edited 2024-08-22). https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
- [S59] CC BY-SA 4.0 legal code. https://creativecommons.org/licenses/by-sa/4.0/legalcode
- [S60] Creative Commons, compatible licences. https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/
- [S61] Wikidata licensing. https://www.wikidata.org/wiki/Wikidata:Licensing

Source numbering follows the order sources were added to the working notes, so the list is not in numeric order.
