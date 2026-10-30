import type { Triggers } from "convex-helpers/server/triggers";
import { ConvexError } from "convex/values";
import type { DataModel, Doc, TableNames } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export type RuleViolationData = { code: "rule_violation"; rule: string; message: string };

/** Every rule failure carries its rule name, so callers and tests can tell which rule fired. */
export function violation(rule: string, message: string): ConvexError<RuleViolationData> {
  return new ConvexError({ code: "rule_violation", rule, message });
}

export const isBlank = (text: string) => text.trim().length === 0;

/**
 * Convex has no unique indexes. `matching` reads the rows that share the key (through an index, so
 * the read is tracked and a concurrent insert of the same key makes one of the two transactions
 * retry) and the write is refused when another row already has it.
 */
export function mustBeUnique<T extends TableNames>(
  triggers: Triggers<DataModel>,
  table: T,
  rule: string,
  description: string,
  matching: (ctx: MutationCtx, doc: Doc<T>) => Promise<Doc<T>[]>,
) {
  triggers.register(table, async (ctx, change) => {
    if (change.newDoc === null) return;
    const matches = await matching(ctx, change.newDoc);
    if (matches.some((match) => match._id !== change.id)) {
      throw violation(rule, `${table} already has a row with the same ${description}`);
    }
  });
}
