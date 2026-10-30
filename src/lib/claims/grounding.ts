import type {
  GroundingChecker,
  GroundingClaim,
  GroundingResult,
  GroundingSentence,
} from "../ports";

export const HOLD_REASONS = [
  "no_claims",
  "unknown_claim",
  "claim_not_citable",
  "missing_quote",
  "blank_text",
  "no_entailment_check",
  "not_entailed",
  "entailment_error",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

/** Claims must already be scoped to the page's place by the caller. */
export function checkVerbatim(
  sentences: readonly GroundingSentence[],
  claims: readonly GroundingClaim[],
): GroundingResult[] {
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  return sentences.map((sentence, sentenceIndex) => {
    const reasons: string[] = [];
    if (typeof sentence.text !== "string" || !sentence.text.trim()) reasons.push("blank_text");
    if (sentence.claimIds.length === 0) reasons.push("no_claims");
    for (const claimId of sentence.claimIds) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        reasons.push(`unknown_claim:${claimId}`);
        continue;
      }
      if (claim.status !== "published" && claim.status !== "disputed") {
        reasons.push(`claim_not_citable:${claimId}`);
      }
      if (!claim.quote.trim()) reasons.push(`missing_quote:${claimId}`);
    }
    return { sentenceIndex, verdict: reasons.length ? "hold" : "pass", reasons };
  });
}

export type EntailmentCheck = (
  sentence: GroundingSentence,
  cited: readonly GroundingClaim[],
) => Promise<{ entailed: boolean; detail?: string }>;

/** Only exact trimmed matches against a cited claim's known texts are entailed. */
export function verbatimEntailment(
  textsByClaim: ReadonlyMap<string, readonly string[]>,
): EntailmentCheck {
  return async (sentence, cited) => ({
    entailed: cited.some((claim) =>
      textsByClaim.get(claim.id)?.some((text) => text.trim() === sentence.text.trim()),
    ),
  });
}

/** Run both stages, holding unchecked sentences and isolating each entailment failure. */
export function createGroundingChecker(options: {
  entailment?: EntailmentCheck;
}): GroundingChecker {
  return {
    async check(sentences, claims) {
      const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
      return Promise.all(
        checkVerbatim(sentences, claims).map(async (result) => {
          if (result.verdict === "hold") return result;
          if (!options.entailment) {
            return { ...result, verdict: "hold" as const, reasons: ["no_entailment_check"] };
          }
          try {
            // Stage 1 established that this input index and every cited claim exist.
            const sentence = sentences[result.sentenceIndex]!;
            const cited = sentence.claimIds.map((id) => claimsById.get(id)!);
            const { entailed, detail } = await options.entailment(sentence, cited);
            if (entailed === true) return result;
            return {
              ...result,
              verdict: "hold" as const,
              reasons: [detail ? `not_entailed:${detail}` : "not_entailed"],
            };
          } catch (error) {
            const name = error instanceof Error ? error.name || "Error" : "NonErrorThrow";
            return {
              ...result,
              verdict: "hold" as const,
              reasons: [`entailment_error:${name}`],
            };
          }
        }),
      );
    },
  };
}
