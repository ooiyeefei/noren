import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { isBlank, mustBeUnique, violation } from "./shared";

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Rules for notes, phrase cards, link counts, takedowns and the audit log. */
export function registerCommunityRules(triggers: Triggers<DataModel>) {
  triggers.register("note", async (_ctx, change) => {
    if (change.newDoc !== null && isBlank(change.newDoc.body)) {
      throw violation("note_body_not_blank", "a note has a body");
    }
  });

  mustBeUnique(
    triggers,
    "noteTranslation",
    "note_translation_unique",
    "note and language",
    (ctx, t) =>
      ctx.db
        .query("noteTranslation")
        .withIndex("by_noteId_and_lang", (q) => q.eq("noteId", t.noteId).eq("lang", t.lang))
        .take(2),
  );

  mustBeUnique(
    triggers,
    "phraseCard",
    "phrase_card_region_key_unique",
    "region and key",
    (ctx, card) =>
      ctx.db
        .query("phraseCard")
        .withIndex("by_regionId_and_key", (q) =>
          q.eq("regionId", card.regionId).eq("key", card.key),
        )
        .take(2),
  );

  mustBeUnique(triggers, "linkCountDaily", "link_count_unique", "source and day", (ctx, row) =>
    ctx.db
      .query("linkCountDaily")
      .withIndex("by_sourceId_and_day", (q) => q.eq("sourceId", row.sourceId).eq("day", row.day))
      .take(2),
  );

  triggers.register("linkCountDaily", async (_ctx, change) => {
    const row = change.newDoc;
    if (row === null) return;
    if (!CALENDAR_DAY.test(row.day)) {
      throw violation("link_count_day_format", `day "${row.day}" is not YYYY-MM-DD`);
    }
    if (!Number.isInteger(row.count) || row.count < 0) {
      throw violation("link_count_not_negative", "a link count is a whole number from 0");
    }
  });

  triggers.register("takedownRequest", async (_ctx, change) => {
    const request = change.newDoc;
    if (request === null) return;
    if (
      (request.status === "decided" || request.status === "closed") &&
      request.outcome === undefined
    ) {
      throw violation("takedown_decided_has_outcome", "a decided takedown records its outcome");
    }
  });

  // FR-026: a person's entry names the person, and an AI entry names the model.
  triggers.register("auditLog", async (_ctx, change) => {
    const entry = change.newDoc;
    if (entry === null) return;
    if (
      (entry.actorKind === "person" && entry.actorPersonId === undefined) ||
      (entry.actorKind === "ai" && entry.modelVersion === undefined)
    ) {
      throw violation(
        "audit_log_actor_fields",
        "an audit entry by a person names the person, and one by an AI names the model",
      );
    }
  });
}
