import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * What an audit entry must say (FR-026). The union mirrors the `audit_log_actor_fields` rule, so a
 * person entry without its person, or an AI entry without its model, is a compile error as well as
 * a refused write.
 */
export type AuditEntry = {
  action: string;
  targetType: string;
  targetId?: string;
  diff?: Record<string, unknown>;
} & (
  | { actorKind: "person"; actorPersonId: Id<"person"> }
  | { actorKind: "ai"; modelVersion: string; actorPersonId?: Id<"person"> }
  | { actorKind: "system" }
);

/**
 * Writes the entry in the caller's own transaction, so the record and the change it describes
 * commit together or not at all. Call it with the ctx the mutation received, which is the gated one.
 */
export async function writeAudit(ctx: MutationCtx, entry: AuditEntry): Promise<Id<"auditLog">> {
  return await ctx.db.insert("auditLog", entry);
}
