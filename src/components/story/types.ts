import type { ClaimKind, ClaimOrigin, Licence } from "@/lib/domain/constants";
import type { Locale } from "@/lib/i18n";

export type StoryTranslation = {
  lang: string;
  text: string;
  origin: "machine" | "human";
  reviewedBy?: string;
};
export type StoryClaimView = {
  id: string;
  kind: ClaimKind;
  cautionType?: string;
  textOriginal: string;
  langOriginal: string;
  origin: ClaimOrigin;
  status: "published" | "disputed";
  disputedWith?: string;
  quote?: string;
  confirmedAt?: number;
  aiAssisted: boolean;
  isMock: boolean;
  translations: StoryTranslation[];
  openText?: { sourceUrl: string; attribution: string; licence: Licence; revisionRef?: string };
};
export type StorySentenceView = {
  lang: string;
  ordinal: number;
  text: string;
  textLang: string;
  translation: "original" | "machine" | "human";
  claimIds: string[];
};
export type StoryViewModel = {
  locale: Locale;
  placeName: string;
  version: number;
  composedAt: number;
  /** True when a model wrote the prose rather than the deterministic composer. */
  aiComposed: boolean;
  sentences: StorySentenceView[];
  claims: StoryClaimView[];
  cautionLabels: Readonly<Record<string, { label: string; reviewed: boolean }>>;
};
