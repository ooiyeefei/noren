import { v, type VLiteral, type VUnion } from "convex/values";
import {
  ACTOR_KINDS,
  CLAIM_KINDS,
  CLAIM_ORIGINS,
  CLAIM_STATUSES,
  EXTERNAL_PROVIDERS,
  INTERVIEW_STATUSES,
  LICENCES,
  NOTE_STATUSES,
  PAGE_VERSION_STATUSES,
  PLACE_KINDS,
  ROLES,
  SCRIPTS,
  SOURCE_STATUSES,
  TAKEDOWN_STATUSES,
  TAKEDOWN_TARGET_TYPES,
  TRANSCRIPT_ORIGINS,
  TRANSLATION_ORIGINS,
  VISIBILITIES,
} from "../../src/lib/domain/constants";

/** A union of string literals built from one of the shared value lists in constants.ts. */
export function literals<const T extends readonly [string, string, ...string[]]>(values: T) {
  return v.union(...values.map((value) => v.literal(value))) as unknown as VUnion<
    T[number],
    VLiteral<T[number], "required">[],
    "required"
  >;
}

export const roleValidator = literals(ROLES);
export const visibilityValidator = literals(VISIBILITIES);
export const placeKindValidator = literals(PLACE_KINDS);
export const scriptValidator = literals(SCRIPTS);
export const sourceStatusValidator = literals(SOURCE_STATUSES);
export const claimKindValidator = literals(CLAIM_KINDS);
export const claimOriginValidator = literals(CLAIM_ORIGINS);
export const claimStatusValidator = literals(CLAIM_STATUSES);
export const translationOriginValidator = literals(TRANSLATION_ORIGINS);
export const interviewStatusValidator = literals(INTERVIEW_STATUSES);
export const transcriptOriginValidator = literals(TRANSCRIPT_ORIGINS);
export const licenceValidator = literals(LICENCES);
export const externalProviderValidator = literals(EXTERNAL_PROVIDERS);
export const pageVersionStatusValidator = literals(PAGE_VERSION_STATUSES);
export const noteStatusValidator = literals(NOTE_STATUSES);
export const takedownStatusValidator = literals(TAKEDOWN_STATUSES);
export const takedownTargetTypeValidator = literals(TAKEDOWN_TARGET_TYPES);
export const actorKindValidator = literals(ACTOR_KINDS);
