import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { mustBeUnique, violation } from "./shared";

/** Rules for composed pages: every sentence that is shown cites published claims (FR-014, SC-003). */
export function registerPageRules(triggers: Triggers<DataModel>) {
  mustBeUnique(
    triggers,
    "pageVersion",
    "page_version_place_version_unique",
    "place and version",
    (ctx, page) =>
      ctx.db
        .query("pageVersion")
        .withIndex("by_placeId_and_version", (q) =>
          q.eq("placeId", page.placeId).eq("version", page.version),
        )
        .take(2),
  );

  triggers.register("pageVersion", async (_ctx, change) => {
    const page = change.newDoc;
    if (page === null) return;
    if (!Number.isInteger(page.version) || page.version < 1) {
      throw violation("page_version_positive", "a page version starts at 1");
    }
  });

  mustBeUnique(
    triggers,
    "pageSentence",
    "page_sentence_order_unique",
    "page version, language and position",
    (ctx, sentence) =>
      ctx.db
        .query("pageSentence")
        .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) =>
          q
            .eq("pageVersionId", sentence.pageVersionId)
            .eq("lang", sentence.lang)
            .eq("ordinal", sentence.ordinal),
        )
        .take(2),
  );

  // A sentence that is not held cites at least one claim, every cited claim is about the same
  // place, and each is published or disputed. A held sentence may cite anything, because holding
  // is what keeps it off the page.
  triggers.register("pageSentence", async (ctx, change) => {
    const sentence = change.newDoc;
    if (sentence === null || sentence.held) return;
    if (sentence.claimIds.length === 0) {
      throw violation(
        "sentence_needs_claim",
        `page sentence ${change.id} is not held but cites no claim`,
      );
    }
    const page = await ctx.db.get(sentence.pageVersionId);
    for (const claimId of sentence.claimIds) {
      const claim = await ctx.db.get(claimId);
      if (claim === null || claim.placeId !== page?.placeId) {
        throw violation(
          "sentence_cites_same_place",
          `page sentence ${change.id} cites claim ${claimId}, which is not about this place`,
        );
      }
      if (claim.status !== "published" && claim.status !== "disputed") {
        throw violation(
          "sentence_cites_published_claims",
          `a sentence that is not held cannot cite claim ${claimId} because it is neither published nor disputed`,
        );
      }
    }
  });
}
