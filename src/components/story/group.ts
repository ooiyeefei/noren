import type { StoryClaimView, StorySentenceView, StoryViewModel } from "./types";

export function sentencesFor(model: StoryViewModel): StorySentenceView[] {
  const ids = new Set(model.claims.map((claim) => claim.id));
  return model.sentences
    .filter(
      (sentence) =>
        sentence.lang === model.locale &&
        sentence.claimIds.length > 0 &&
        sentence.claimIds.every((id) => ids.has(id)),
    )
    .sort((a, b) => a.ordinal - b.ordinal);
}

export function cautions(claims: readonly StoryClaimView[]): StoryClaimView[] {
  return claims.filter((claim) => claim.kind === "caution");
}

export function disputedPairs(
  claims: readonly StoryClaimView[],
): [StoryClaimView, StoryClaimView][] {
  const pairs: [StoryClaimView, StoryClaimView][] = [];
  const positions = new Map(claims.map((claim, index) => [claim.id, index]));
  const seen = new Set<string>();
  for (const claim of claims) {
    if (claim.status !== "disputed" || !claim.disputedWith || claim.disputedWith === claim.id)
      continue;
    const other = claims.find((candidate) => candidate.id === claim.disputedWith);
    if (!other || other.status !== "disputed") continue;
    const ordered: [StoryClaimView, StoryClaimView] =
      (positions.get(claim.id) ?? 0) < (positions.get(other.id) ?? 0)
        ? [claim, other]
        : [other, claim];
    const key = JSON.stringify(ordered.map((item) => item.id));
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(ordered);
    }
  }
  return pairs;
}

export function footnoteOrder(model: StoryViewModel): { claimId: string; number: number }[] {
  const ids = new Set(sentencesFor(model).flatMap((sentence) => sentence.claimIds));
  for (const claim of cautions(model.claims)) ids.add(claim.id);
  // An account's uncited counterpart still needs its own source in the differing-accounts section.
  for (const pair of disputedPairs(model.claims)) for (const claim of pair) ids.add(claim.id);
  return [...ids].map((claimId, index) => ({ claimId, number: index + 1 }));
}
