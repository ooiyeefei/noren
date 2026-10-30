import {
  ASSIGNABLE_ROLES,
  VISIBILITIES,
  type ClaimOrigin,
  type ClaimStatus,
  type PlaceKind,
  type Role,
  type Visibility,
} from "@/lib/domain/constants";
import type { Locale } from "@/lib/i18n";
import type { RegionConfig } from "@/lib/region/schema";
import { pickPlaceName, type PlaceNameLike } from "@/lib/region/names";

export type VisibilityChoice = {
  visibility: Visibility;
  allowed: boolean;
  needs:
    | "nothing"
    | "landmark_kind"
    | "real_only"
    | "confirm_fictional"
    | "owner_agreement"
    | "launch_pack";
};
export function visibilityChoices(
  place: { kind: PlaceKind; isMock: boolean; visibility: Visibility },
  region: Pick<RegionConfig, "legal">,
): VisibilityChoice[] {
  return VISIBILITIES.map((visibility) => {
    if (visibility === "draft") return { visibility, allowed: true, needs: "nothing" };
    if (visibility === "public") {
      if (place.isMock) return { visibility, allowed: false, needs: "real_only" };
      return region.legal.launchPackComplete
        ? { visibility, allowed: true, needs: "nothing" }
        : { visibility, allowed: false, needs: "launch_pack" };
    }
    if (visibility === "demo_public") {
      return place.isMock
        ? { visibility, allowed: true, needs: "confirm_fictional" }
        : { visibility, allowed: false, needs: "landmark_kind" };
    }
    if (!region.legal.launchPackComplete && visibility === "pilot")
      return { visibility, allowed: false, needs: "launch_pack" };
    return {
      visibility,
      allowed: true,
      needs: !place.isMock ? "owner_agreement" : "nothing",
    };
  });
}
export function visibilityArgs(
  placeId: string,
  visibility: Visibility,
  boxes: { agreementRecorded: boolean; confirmFictional: boolean },
  choice: VisibilityChoice,
): {
  placeId: string;
  visibility: Visibility;
  agreementRecorded?: boolean;
  confirmFictional?: boolean;
} | null {
  if (!choice.allowed || choice.visibility !== visibility) return null;
  if (choice.needs === "confirm_fictional")
    return boxes.confirmFictional ? { placeId, visibility, confirmFictional: true } : null;
  if (choice.needs === "owner_agreement")
    return boxes.agreementRecorded ? { placeId, visibility, agreementRecorded: true } : null;
  if (choice.needs !== "nothing") return null;
  return { placeId, visibility };
}
export function disputeArgs(
  selected: readonly { _id: string; status: ClaimStatus }[],
): { claimIdA: string; claimIdB: string } | { error: "pick_two" | "not_published" } {
  if (selected.length !== 2 || selected[0]!._id === selected[1]!._id) return { error: "pick_two" };
  if (selected.some((claim) => claim.status !== "published")) return { error: "not_published" };
  return { claimIdA: selected[0]!._id, claimIdB: selected[1]!._id };
}
export function missingTranslations(
  claim: {
    origin: ClaimOrigin;
    status: ClaimStatus;
    langOriginal: string;
    translations: readonly { lang: string }[];
  },
  locales: readonly string[],
): string[] {
  if (
    claim.origin !== "interview" ||
    !["owner_confirmed", "published", "disputed"].includes(claim.status)
  )
    return [];
  return [...new Set(locales)].filter(
    (lang) =>
      lang !== claim.langOriginal &&
      !claim.translations.some((translation) => translation.lang === lang),
  );
}
export type Excerpt = { start: number; end: number; kind: "story" | "fact" };
export function addExcerpt(
  text: string,
  chosen: readonly Excerpt[],
  selection: { start: number; end: number },
  kind: "story" | "fact",
): { ok: true; excerpts: Excerpt[] } | { ok: false; reason: "blank" | "range" | "overlap" } {
  const { start, end } = selection;
  const splitsPair = (offset: number) =>
    offset > 0 &&
    offset < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset - 1]!) &&
    /[\uDC00-\uDFFF]/.test(text[offset]!);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length ||
    end - start > 600 ||
    chosen.length >= 20 ||
    splitsPair(start) ||
    splitsPair(end)
  )
    return { ok: false, reason: "range" };
  if (!text.slice(start, end).trim()) return { ok: false, reason: "blank" };
  if (chosen.some((span) => start < span.end && end > span.start))
    return { ok: false, reason: "overlap" };
  return { ok: true, excerpts: [...chosen, { start, end, kind }] };
}
export function roleOptions(person: { role: Role }): readonly Role[] | null {
  return person.role === "steward" ? null : ASSIGNABLE_ROLES;
}
export type PlaceSummaryLike = {
  _id: string;
  slug: string;
  names: readonly PlaceNameLike[];
  kind: PlaceKind;
  visibility: Visibility;
  ownerCount: number;
  isMock: boolean;
};
export type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  kind: PlaceKind;
  visibility: Visibility;
  ownerCount: number;
  isMock: boolean;
};
export function placeRows(
  places: readonly PlaceSummaryLike[],
  locale: Locale,
  region: Pick<RegionConfig, "nameFallback" | "defaultLocale">,
): PlaceRow[] {
  return places
    .map((place) => ({
      id: place._id,
      slug: place.slug,
      name: pickPlaceName(place.names, locale, region).primary?.value ?? place.slug,
      kind: place.kind,
      visibility: place.visibility,
      ownerCount: place.ownerCount,
      isMock: place.isMock,
    }))
    .sort((a, b) => Number(b.visibility === "draft") - Number(a.visibility === "draft"));
}
