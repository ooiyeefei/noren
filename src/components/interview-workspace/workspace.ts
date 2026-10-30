import type { InterviewStatus, TranscriptOrigin } from "@/lib/domain/constants";
import type { RegionConfig } from "@/lib/region/schema";

export type WorkspaceRole = "creator" | "steward" | "business_owner" | "user";
export type InterviewViewLike = {
  _id: string;
  placeId: string;
  placeSlug: string;
  language: string;
  status: InterviewStatus;
  processingError?: string;
  hasAudio: boolean;
  audioUrl: string | null;
  durationS?: number;
  isMock: boolean;
  consent: {
    textVersion: string;
    textLang: string;
    recordedAt: number;
    assisted: boolean;
    withdrawn: boolean;
  } | null;
  latestTranscript: {
    _id: string;
    version: number;
    origin: TranscriptOrigin;
    lang: string;
    segments: { start: number; end: number; speaker?: string; text: string }[];
    modelVersion?: string;
  } | null;
  canWithdraw: boolean;
};
export type WorkspaceRegion = Pick<
  RegionConfig,
  "consent" | "defaultLocale" | "locales" | "minimumAge" | "cautionVocabulary"
>;
export type WorkspacePanels = {
  withdrawn: boolean;
  consent: "needed" | "recorded";
  canRecord: boolean;
  canTranscribe: boolean;
  canTypeTranscript: boolean;
  editor: "hidden" | "editable" | "readonly";
  canProposeSpan: boolean;
  canProposeWithAi: boolean;
  processing: boolean;
  canWithdraw: boolean;
  assistedConsentAllowed: boolean;
};
export function workspacePanels(view: InterviewViewLike, role: WorkspaceRole): WorkspacePanels {
  const withdrawn = view.status === "withdrawn" || view.consent?.withdrawn === true;
  const live = view.consent !== null && !withdrawn;
  const manager = role === "creator" || role === "steward";
  const processing = !withdrawn && view.status === "transcribing";
  const editable = live && manager && view.status !== "done" && !processing;
  const propose = editable && view.latestTranscript?.origin === "human_corrected";
  return {
    withdrawn,
    consent: live ? "recorded" : "needed",
    canRecord:
      editable && ["consent_pending", "uploaded", "transcript_ready"].includes(view.status),
    canTranscribe:
      editable && view.hasAudio && ["uploaded", "transcript_ready"].includes(view.status),
    canTypeTranscript: editable && !view.latestTranscript,
    editor: !live || !view.latestTranscript ? "hidden" : editable ? "editable" : "readonly",
    canProposeSpan: propose,
    canProposeWithAi: propose,
    processing,
    canWithdraw: !withdrawn && view.canWithdraw,
    assistedConsentAllowed: !withdrawn && role === "steward",
  };
}
export function claimsForTranscript<
  T extends { sourceTranscriptId?: string; status: string; spanStart?: number },
>(claims: readonly T[], transcriptId: string): T[] {
  return claims
    .filter((c) => c.sourceTranscriptId === transcriptId)
    .sort(
      (a, b) =>
        Number(b.status === "proposed") - Number(a.status === "proposed") ||
        (a.spanStart ?? 0) - (b.spanStart ?? 0),
    );
}
export type ProposalDraft = {
  spanStart: number;
  spanEnd: number;
  quote: string;
  kind: "story" | "fact" | "caution";
  cautionType: string;
  textOriginal: string;
};
export function validateProposal(
  draft: ProposalDraft,
  vocabulary: readonly { key: string }[],
): "ok" | "blank" | "too_long" | "caution_key" {
  const text = draft.textOriginal.trim();
  if (!text) return "blank";
  if (text.length > 1000) return "too_long";
  if (draft.kind === "caution" && !vocabulary.some((v) => v.key === draft.cautionType))
    return "caution_key";
  return "ok";
}
export function proposalArgs(
  draft: ProposalDraft,
  transcriptId: string,
): {
  transcriptId: string;
  spanStart: number;
  spanEnd: number;
  textOriginal: string;
  kind: ProposalDraft["kind"];
  cautionType?: string;
} {
  return {
    transcriptId,
    spanStart: draft.spanStart,
    spanEnd: draft.spanEnd,
    textOriginal: draft.textOriginal.trim(),
    kind: draft.kind,
    ...(draft.kind === "caution" ? { cautionType: draft.cautionType } : {}),
  };
}
export function emptyTranscript(): { start: number; end: number; text: string }[] {
  return [{ start: 0, end: 0, text: "" }];
}
export function consentTextFor(
  region: Pick<RegionConfig, "consent" | "defaultLocale">,
  lang: string,
): { text: string; textLang: string; textVersion: string } {
  const textLang = Object.hasOwn(region.consent.text, lang) ? lang : region.defaultLocale;
  return {
    text: region.consent.text[textLang]!,
    textLang,
    textVersion: region.consent.textVersion,
  };
}
