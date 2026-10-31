<!--
Sync Impact Report
Version change: 1.2.0 -> 2.0.0 (1.0.0 ratified 2026-10-29; 1.1.0 and 1.2.0 amended 2026-10-29; 2.0.0 amended 2026-10-31 by the owner)
Modified principles: II redefined (MAJOR): a place listed from open data may be shown before a person checks it, labelled "Not yet confirmed" with its source; a person's "Still here" confirms it; a report goes to a person; imports never overwrite what a person confirmed; confirmations are never counted into a score. Posts, people and claims still need a human before they are shown. Earlier: III amended in 1.2.0; privacy bullets amended in 1.1.0 and 1.2.0.
Reason: Noren lists over a thousand places from OpenStreetMap that no one has visited for Noren. Showing them as confirmed would be untrue; hiding them leaves the map empty. The owner chose to show them openly labelled, learning from Waze's "still there" checks (vision review, 2026-10-31).
Templates checked: specs/001-noren-mvp/spec.md (FR-023 restated, FR-030 added), research D20.
Follow-up TODOs: TODO(OPERATOR_OF_RECORD): named legal operator not yet decided; see specs/001-noren-mvp/spec.md
-->
# Noren Constitution

Noren is an open-source web app that lets people step into the stories behind real places: public posts, interviews with owners and contributor notes, shown with their sources. Nagasaki is the first region.

## Core Principles

### I. Stories, Not Scores (NON-NEGOTIABLE)
The product MUST NOT show or compute ratings, stars, scores, or sentiment-based labels or ordering, for any place, person or post. Practical cautions (for example closed days, cash only) are allowed only from a fixed vocabulary agreed per region. Reviews and ratings are left to the services that already do them.

### II. Real Data Only, Labelled Until Checked (NON-NEGOTIABLE)
Every place, post, person and claim shown as real MUST be real. Posts, people and claims MUST be confirmed by a human before they are shown. A place listed from open data (for example OpenStreetMap) MAY be shown before anyone has checked it, but only with a visible "Not yet confirmed" label and a way to see where it came from and under which licence. A person who has been there confirms it ("Still here"), which replaces the label and records who and when; a report that something is wrong goes to a person, and a place a person agrees is gone is hidden. An import MUST NOT overwrite what a person confirmed, and confirmations MUST NOT be counted into a score or ranking (Principle I). Anything created for a demo, test or video MUST belong to an explicitly labelled mock user, carry a visible "Demo" marker, and be excluded from every statistic and every export of real data.

### III. Humans Are the Source of Truth
A person-placed pin is the authoritative location of a place. A person-corrected transcript is the authoritative record of an interview. An owner-confirmed claim is the only kind of claim about a business that can be published. Openly licensed text about a place that has no business owner on record, such as a landmark, may be published only after a steward approves it, with its licence and attribution shown. Data from outside providers is a suggestion with a recorded source, never the truth.

### IV. Link Out, Don't Copy
Public posts MUST be shown through the originating platform's own embed, with the author credit beside it and a link to the original. The product stores only the URL, platform, author link, date and a human-written note, and hides an entry when its original disappears. It MUST NOT store, summarise or run AI over the content of third-party posts.

### V. AI Is an Editor, on Consented Text Only
AI MAY work only on text the product is licensed to process: interview transcripts with a consent record, notes a contributor typed, and openly licensed text with attribution. Every sentence AI helps write MUST carry a footnote to the claim it came from. A sentence without a source MUST NOT be published, and a failed check MUST fail closed to human review. AI-assisted text MUST be labelled as such.

### VI. Original Language First
The language the person spoke or wrote is canonical. Translations MUST be labelled as machine translation until a human confirms them. Place names are kept in every script people use (for example kanji, kana, romaji and English).

### VII. Region Is Configuration, and the Project Stays Open
Region-specific behaviour (languages, map area, enabled platforms, caution vocabulary, consent text, minimum age, retention, takedown contact) MUST live in configuration, not in code. The repository MUST NOT contain credentials or personal data. Data under different licences MUST be kept apart and attributed.

## Privacy, Consent and Legal Constraints

- Accounts stay invite-only and every page stays hidden from search engines until the launch pack exists: a named operator of record, terms of service and creator licence, a privacy notice in Japanese and English that names any transfer abroad, interview consent capture, an under-16 rule, a takedown workflow and owner verification. A public read-only demo MAY be shown before then, but only with mock content, openly licensed content and posts from creators who agreed, and never any real person's data.
- No interview audio is uploaded, or streamed to an AI service, without a recorded consent covering publication, AI processing, transfer abroad and voice retention. Withdrawal MUST hide everything derived from that interview.
- The product is a publisher of the pages it composes, so its own wording about real businesses is held to the same standard as a human editor's.
- Research under `research/` is the evidence base for external claims. Items marked UNVERIFIED there stay unverified until checked. This constitution is not legal advice; legal questions go to a qualified lawyer.

## Development Workflow

- Development is spec-driven with GitHub Spec Kit: constitution, specify, clarify, plan, tasks, implement. Clarification MUST be completed before planning, and planning before building.
- Technology choices belong in the plan, never in the spec.
- This codebase is separate from anything built for the Sea x OpenAI Codex Hackathon (2026-12-05), whose rules forbid pre-built code. No code is carried across.

## Governance

This constitution supersedes other project practices. An amendment MUST be written down with its reason, update the version, and be reviewed against the active spec and plan. Versioning follows semantic rules: MAJOR for removing or redefining a principle, MINOR for adding or materially expanding one, PATCH for wording fixes. Every plan MUST include a check against Principles I to VII, and any deviation MUST be justified in writing.

**Version**: 2.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-31
