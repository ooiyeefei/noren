import type { Triggers } from "convex-helpers/server/triggers";
import { quoteMatches, transcriptText } from "../../../src/lib/claims/transcript-text";
import type { DataModel } from "../../_generated/dataModel";
import { isBlank, violation } from "./shared";

const CONFIRMED_STATUSES = ["owner_confirmed", "published", "disputed"] as const;
type ConfirmedStatus = (typeof CONFIRMED_STATUSES)[number];
const isConfirmedStatus = (status: string): status is ConfirmedStatus =>
  (CONFIRMED_STATUSES as readonly string[]).includes(status);

/**
 * The rules that keep a claim honest: FR-009 to FR-012, FR-014 and constitution III (v1.2.0).
 * They guard and never rewrite; a violating write fails and the caller has to do the right thing
 * first.
 */
export function registerClaimRules(triggers: Triggers<DataModel>) {
  triggers.register("claim", async (ctx, change) => {
    const claim = change.newDoc;
    if (claim === null) return;

    if (isBlank(claim.textOriginal)) {
      throw violation("claim_text_not_blank", "a claim has text");
    }

    // FR-010: an interview claim carries a transcript, a span and a quote.
    if (claim.origin === "interview") {
      const { spanStart, spanEnd, quote, sourceTranscriptId } = claim;
      if (
        sourceTranscriptId === undefined ||
        spanStart === undefined ||
        spanEnd === undefined ||
        spanStart < 0 ||
        spanEnd <= spanStart ||
        quote === undefined ||
        isBlank(quote)
      ) {
        throw violation(
          "claim_interview_needs_quote",
          "an interview claim needs a transcript, a span (start >= 0, end > start) and a quote",
        );
      }
      // FR-009, principle III: and that transcript is person-corrected and about the same place.
      const transcript = await ctx.db.get("transcript", sourceTranscriptId);
      const interview = transcript ? await ctx.db.get("interview", transcript.interviewId) : null;
      if (
        transcript === null ||
        transcript.origin !== "human_corrected" ||
        interview === null ||
        interview.placeId !== claim.placeId
      ) {
        throw violation(
          "claim_needs_corrected_transcript",
          `claim ${change.id} must cite a human-corrected transcript of an interview about the same place`,
        );
      }
      if (!quoteMatches(transcriptText(transcript.segments), spanStart, spanEnd, quote)) {
        throw violation(
          "claim_interview_needs_quote",
          "an interview quote must equal its nonblank transcript slice at integer UTF-16 offsets",
        );
      }
    }

    if (claim.origin === "open_text" && claim.sourceOpenTextId === undefined) {
      throw violation("claim_open_text_needs_snippet", "an open-text claim cites its snippet");
    }

    // FR-012: a caution carries an author and a key from the region's vocabulary.
    if (
      claim.kind === "caution" &&
      (claim.cautionType === undefined || claim.authorId === undefined)
    ) {
      throw violation(
        "claim_caution_needs_key_and_author",
        "a caution needs a vocabulary key and an author",
      );
    }
    if (claim.kind !== "caution" && claim.cautionType !== undefined) {
      throw violation("claim_caution_type_only_for_cautions", "only a caution has a caution type");
    }

    // FR-011: confirmed, published and disputed claims were confirmed by the owner, or, for open
    // text, approved by a steward.
    if (isConfirmedStatus(claim.status)) {
      const ownerConfirmed = claim.confirmedAt !== undefined;
      const stewardApproved = claim.origin === "open_text" && claim.reviewerId !== undefined;
      if (!ownerConfirmed && !stewardApproved) {
        throw violation(
          "claim_publication_needs_confirmation",
          `claim ${change.id} cannot be ${claim.status} without a confirmation`,
        );
      }
      if (claim.kind === "caution" && !ownerConfirmed) {
        throw violation(
          "claim_caution_publication_needs_owner",
          "a caution needs the owner's confirmation",
        );
      }
    }

    // A claim is disputed exactly when it points at the claim it conflicts with (same place).
    if ((claim.status === "disputed") !== (claim.disputedWith !== undefined)) {
      throw violation(
        "claim_disputed_link",
        "a claim is disputed exactly when disputedWith is set",
      );
    }
    if (claim.disputedWith !== undefined) {
      const other = claim.disputedWith === change.id ? null : await ctx.db.get(claim.disputedWith);
      if (other === null || other.placeId !== claim.placeId) {
        throw violation(
          "claim_disputed_link",
          "a disputed claim points at a different claim about the same place",
        );
      }
    }

    // Constitution III: open text is publishable only about a place with no business owner. The
    // other direction, attaching an owner over published open text, is in places.ts.
    if (claim.origin === "open_text" && isConfirmedStatus(claim.status)) {
      const owner = await ctx.db
        .query("placeOwner")
        .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", claim.placeId))
        .first();
      if (owner) {
        throw violation(
          "claim_open_text_needs_no_owner",
          `open-text claim ${change.id} cannot be published on a place that has a business owner`,
        );
      }
    }
  });
}
