import type { ClaimCardData } from "@/components/claims/claim-card";
import type {
  ClaimKind,
  ClaimOrigin,
  ClaimStatus,
  Licence,
  TranslationOrigin,
} from "@/lib/domain/constants";
import type { Locale } from "@/lib/i18n";
import { pickPlaceName, type PlaceNameLike } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";

export type ClaimTranslationLike = {
  lang: string;
  text: string;
  origin: TranslationOrigin;
  reviewedBy?: string;
};
/** Structurally what `claims.listForPlace` returns, so the pure code never imports Convex types. */
export type ClaimViewLike = {
  _id: string;
  kind: ClaimKind;
  cautionType?: string;
  textOriginal: string;
  langOriginal: string;
  origin: ClaimOrigin;
  quote?: string;
  spanStart?: number;
  sourceTranscriptId?: string;
  status: ClaimStatus;
  aiAssisted: boolean;
  isMock: boolean;
  translations: readonly ClaimTranslationLike[];
};
export type OpenTextSource = {
  sourceUrl: string;
  attribution: string;
  licence: Licence;
  revisionRef?: string;
};
/** `listForPlace` does not carry the source of an open-text claim; the container joins it in. */
export type OwnerClaim = ClaimViewLike & { openText?: OpenTextSource };

export type OwnerRegionProps = Pick<
  RegionConfig,
  "locales" | "defaultLocale" | "nameFallback" | "cautionVocabulary"
>;

export function toOwnerRegion(region: RegionConfig): OwnerRegionProps {
  const { locales, defaultLocale, nameFallback, cautionVocabulary } = region;
  return { locales, defaultLocale, nameFallback, cautionVocabulary };
}

export type ReviewGroups<T> = { toReview: T[]; confirmed: T[]; published: T[] };
type Groupable = {
  status: ClaimStatus;
  spanStart?: number;
  origin: ClaimOrigin;
  sourceTranscriptId?: string;
};

// A Record, so a status added later has to be placed here before the code compiles.
const GROUP_OF: Record<ClaimStatus, keyof ReviewGroups<never> | null> = {
  proposed: "toReview",
  owner_confirmed: "confirmed",
  published: "published",
  disputed: "published",
  hidden: null,
};

function compare(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Interview claims first, one interview after another, each in the order it was spoken. The
 * query returns claims oldest first, so the first claim seen from a transcript places that
 * transcript (a claim carries no interview date).
 */
function inReviewOrder<T extends Groupable>(claims: readonly T[]): T[] {
  const firstSeen = new Map<string, number>();
  claims.forEach(({ sourceTranscriptId }, index) => {
    if (sourceTranscriptId !== undefined && !firstSeen.has(sourceTranscriptId)) {
      firstSeen.set(sourceTranscriptId, index);
    }
  });
  const key = (claim: T, index: number) => [
    claim.origin === "interview" ? 0 : 1,
    claim.sourceTranscriptId === undefined
      ? index
      : (firstSeen.get(claim.sourceTranscriptId) ?? index),
    claim.spanStart ?? Number.POSITIVE_INFINITY,
    index,
  ];
  return claims
    .map((claim, index) => ({ claim, key: key(claim, index) }))
    .sort((a, b) => {
      for (const [position, value] of a.key.entries()) {
        const order = compare(value, b.key[position]!);
        if (order !== 0) return order;
      }
      return 0;
    })
    .map(({ claim }) => claim);
}

/** proposed -> toReview; owner_confirmed -> confirmed; published and disputed -> published; hidden is never shown. */
export function groupClaims<T extends Groupable>(claims: readonly T[]): ReviewGroups<T> {
  const groups: ReviewGroups<T> = { toReview: [], confirmed: [], published: [] };
  for (const claim of claims) {
    const group = GROUP_OF[claim.status];
    if (group !== null) groups[group].push(claim);
  }
  return {
    toReview: inReviewOrder(groups.toReview),
    confirmed: inReviewOrder(groups.confirmed),
    published: inReviewOrder(groups.published),
  };
}

/**
 * Open text is quoted from a public source and never passes through an owner (constitution III),
 * so an owner has no action on it. Confirm/edit here are limited to proposed statements.
 */
export function ownerMayAct(claim: Pick<ClaimViewLike, "origin" | "status">): boolean {
  return claim.origin !== "open_text" && claim.status === "proposed";
}

export function ownerMayRemove(claim: Pick<ClaimViewLike, "origin" | "status">): boolean {
  return (
    claim.origin !== "open_text" &&
    (["proposed", "owner_confirmed", "published", "disputed"] as const).some(
      (status) => status === claim.status,
    )
  );
}

export function toCardData(
  claim: ClaimViewLike,
  locale: Locale,
  vocabulary: RegionConfig["cautionVocabulary"],
  defaultLocale: string,
): { card: ClaimCardData; cautionLabel?: string; cautionReviewed?: boolean } {
  const card: ClaimCardData = {
    id: String(claim._id),
    kind: claim.kind,
    cautionType: claim.cautionType,
    textOriginal: claim.textOriginal,
    langOriginal: claim.langOriginal,
    quote: claim.quote,
    status: claim.status,
    aiAssisted: claim.aiAssisted,
    isMock: claim.isMock,
  };
  if (claim.kind !== "caution" || claim.cautionType === undefined) return { card };
  const entry = vocabulary.find(({ key }) => key === claim.cautionType);
  return {
    card,
    // A key the vocabulary no longer knows is shown as it is rather than hidden.
    cautionLabel: entry
      ? (entry.labels[locale] ?? entry.labels[defaultLocale] ?? entry.key)
      : claim.cautionType,
    cautionReviewed: entry !== undefined && entry.labelsReviewedBy !== null,
  };
}

export type TranslationRow = {
  lang: string;
  state: "machine" | "human" | "pending";
  text?: string;
  reviewedBy?: string;
};

/** For each region language other than the claim's own: the translation to show, or "pending". */
export function translationRows(
  claim: ClaimViewLike,
  locales: readonly string[],
): TranslationRow[] {
  return locales
    .filter((lang) => lang !== claim.langOriginal)
    .map((lang): TranslationRow => {
      const rows = claim.translations.filter((row) => row.lang === lang);
      const chosen = rows.find((row) => row.origin === "human") ?? rows[0];
      return chosen === undefined
        ? { lang, state: "pending" }
        : { lang, state: chosen.origin, text: chosen.text, reviewedBy: chosen.reviewedBy };
    });
}

const CONFIRMED: readonly ClaimStatus[] = ["owner_confirmed", "published", "disputed"];

/**
 * `untranslated` counts what the translate button can act on, which is what `claims.listUntranslated`
 * offers the translator: confirmed interview claims.
 */
export function reviewCounts(
  claims: readonly ClaimViewLike[],
  locales: readonly string[],
): { toReview: number; untranslated: number } {
  let toReview = 0;
  let untranslated = 0;
  for (const claim of claims) {
    if (ownerMayAct(claim)) toReview += 1;
    else if (
      claim.origin === "interview" &&
      CONFIRMED.includes(claim.status) &&
      translationRows(claim, locales).some((row) => row.state === "pending")
    ) {
      untranslated += 1;
    }
  }
  return { toReview, untranslated };
}

/** The place name in the viewer's language and script order, with the language to tag it with. */
export function placeLabel(
  names: readonly PlaceNameLike[],
  locale: Locale,
  region: Pick<RegionConfig, "nameFallback" | "defaultLocale">,
  unnamed: string,
): { text: string; lang: string } {
  const { primary } = pickPlaceName(names, locale, region);
  return { text: primary?.value ?? unnamed, lang: primary?.lang ?? locale };
}

export function languageName(lang: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames(locale, { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

/** Convex rejects an id of the wrong shape or table before the function runs. */
export function isInvalidIdError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null ? error : {};
  const text = [
    "name" in record ? record.name : undefined,
    "message" in record ? record.message : undefined,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return /ArgumentValidationError|does not match (?:the table name in )?validator|Invalid argument/i.test(
    text,
  );
}
