// Value lists shared by the region schema, the database enums and the app. Names match
// specs/001-noren-mvp/data-model.md. Plain arrays, so nothing here depends on a library.

export const ROLES = ["user", "creator", "business_owner", "steward"] as const;
/** Roles a steward may hand out. A steward is made only with the admin command (research D2). */
export const ASSIGNABLE_ROLES = [
  "user",
  "creator",
  "business_owner",
] as const satisfies readonly Role[];
/**
 * draft: staff, the creator and the verified owner only. public: a confirmed real place, readable by anyone
 * (owner's rule 2026-10-30, research D20). demo_public: the labelled fictional mock place only. pilot: legacy,
 * readable by signed-in people; nothing sets it in the product now.
 */
export const VISIBILITIES = ["draft", "demo_public", "pilot", "public"] as const;
export const SCRIPTS = ["kanji", "kana", "romaji", "latin"] as const;

/**
 * Noren is about local businesses (owner's rule 2026-10-30, research D20). `landmark` is a legacy label that
 * grants nothing: it never makes a place public, and a place is a business unless a steward says otherwise.
 */
export const PLACE_KINDS = ["business", "landmark"] as const;

export const SOURCE_STATUSES = ["live", "gone", "hidden"] as const;
/** Adapters the core code can run; a region chooses which are enabled. */
export const SOURCE_ADAPTER_IDS = [
  "link_card",
  "meta_embed",
  "youtube",
  "x",
  "google_maps_link",
  "tiktok",
] as const;

export const CLAIM_KINDS = ["story", "caution", "fact", "topic"] as const;
export const CLAIM_ORIGINS = ["interview", "creator_note", "open_text"] as const;
export const CLAIM_STATUSES = [
  "proposed",
  "owner_confirmed",
  "published",
  "disputed",
  "hidden",
] as const;
export const TRANSLATION_ORIGINS = ["machine", "human"] as const;

export const INTERVIEW_STATUSES = [
  "consent_pending",
  "uploaded",
  "transcribing",
  "transcript_ready",
  "correcting",
  "claims_proposed",
  "owner_review",
  "done",
  "withdrawn",
] as const;
export const CONSENT_SCOPES = [
  "publish",
  "aiProcessing",
  "transferAbroad",
  "voiceRetention",
] as const;
export const TRANSCRIPT_ORIGINS = ["machine", "human_corrected"] as const;

export const LICENCES = [
  "CC0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "PDL-1.0",
  "ODbL-1.0",
  "CDLA-Permissive-2.0",
] as const;
export const EXTERNAL_PROVIDERS = [
  "osm",
  "wikidata",
  "google_place_id",
  "overture",
  "mlit",
] as const;

export const PAGE_VERSION_STATUSES = ["held", "published"] as const;
export const NOTE_STATUSES = ["new", "held", "visible", "hidden"] as const;
export const TAKEDOWN_STATUSES = ["received", "hidden", "decided", "appealed", "closed"] as const;
export const TAKEDOWN_TARGET_TYPES = ["place", "source", "claim", "interview", "note"] as const;
export const ACTOR_KINDS = ["person", "ai", "system"] as const;

export type Role = (typeof ROLES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type ConsentScope = (typeof CONSENT_SCOPES)[number];
export type PlaceKind = (typeof PLACE_KINDS)[number];
export type Script = (typeof SCRIPTS)[number];
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export type SourceAdapterId = (typeof SOURCE_ADAPTER_IDS)[number];
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export type ClaimOrigin = (typeof CLAIM_ORIGINS)[number];
export type TranslationOrigin = (typeof TRANSLATION_ORIGINS)[number];
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export type TranscriptOrigin = (typeof TRANSCRIPT_ORIGINS)[number];
export type Licence = (typeof LICENCES)[number];
