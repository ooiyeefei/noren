import type { ClaimKind, ClaimStatus } from "../domain/constants";

export const DETERMINISTIC_COMPOSER = "deterministic-v1";

export type ComposeClaim = {
  id: string;
  kind: ClaimKind;
  status: ClaimStatus;
  textOriginal: string;
  langOriginal: string;
  /** The caller chooses the human translation when available, otherwise the machine one. */
  translations: Readonly<Record<string, string>>;
};

export type ComposedSentence = {
  lang: string;
  ordinal: number;
  text: string;
  textLang: string;
  claimIds: string[];
};

export function composeDeterministic(
  claims: readonly ComposeClaim[],
  locales: readonly string[],
): ComposedSentence[] {
  const citable = claims.filter(
    (claim) =>
      (claim.status === "published" || claim.status === "disputed") &&
      claim.textOriginal.trim().length > 0,
  );
  const ordered = [
    ...citable.filter((claim) => claim.kind === "story"),
    ...citable.filter((claim) => claim.kind === "fact"),
  ];

  return locales.flatMap((lang) =>
    ordered.map((claim, ordinal) => {
      const translation = lang === claim.langOriginal ? "" : claim.translations[lang]?.trim();
      return {
        lang,
        ordinal,
        text: translation || claim.textOriginal.trim(),
        textLang: translation ? lang : claim.langOriginal,
        claimIds: [claim.id],
      };
    }),
  );
}
