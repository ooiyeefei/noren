import {
  isCitable,
  nextClaimStatus,
  type ClaimActor,
  type ClaimEvent,
} from "../../src/lib/claims/state";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isVerifiedOwner } from "./access";
import { writeAudit } from "./audit";
import { appError } from "./errors";

export type TransitionOptions = {
  actor: ClaimActor;
  /** Required for owner and steward actions; omission is a programming mistake. */
  by?: Id<"person">;
  now: number;
  /** The owner's new wording for an edit. */
  textOriginal?: string;
};

function requireActor(options: TransitionOptions) {
  if (options.actor !== "system" && options.by === undefined) {
    throw new Error(`Claim actor ${options.actor} requires by`);
  }
}

async function requireSteward(ctx: MutationCtx, by: Id<"person">) {
  const person = await ctx.db.get("person", by);
  if (person?.role !== "steward") throw appError("forbidden", "Claim actor must be a steward");
}

async function getClaim(ctx: MutationCtx, claimId: Id<"claim">): Promise<Doc<"claim">> {
  const claim = await ctx.db.get("claim", claimId);
  if (claim === null) throw appError("not_found", `Claim ${claimId} was not found`);
  return claim;
}

async function applyTransition(
  ctx: MutationCtx,
  claim: Doc<"claim">,
  event: Exclude<ClaimEvent, "dispute">,
  options: TransitionOptions & { deferHold?: boolean },
): Promise<{ claim: Doc<"claim">; sentencesHeld: number }> {
  requireActor(options);
  if (options.actor === "owner" && !(await isVerifiedOwner(ctx, options.by!, claim.placeId))) {
    throw appError("forbidden", "Claim actor must be this place's verified owner");
  }
  if (options.actor === "steward") await requireSteward(ctx, options.by!);
  const owner = await ctx.db
    .query("placeOwner")
    .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", claim.placeId))
    .first();
  const next = nextClaimStatus(claim.status, event, {
    origin: claim.origin,
    actor: options.actor,
    placeHasOwner: owner !== null,
  });
  if (!next.ok) throw appError("conflict", next.reason);
  // Open-text cautions cannot acquire the owner confirmation the write gate requires.
  if (event === "confirm" && claim.origin === "open_text" && claim.kind === "caution") {
    throw appError("conflict", `Cannot confirm ${claim.status} open_text caution without an owner`);
  }

  const patch: Partial<Doc<"claim">> = { status: next.status };
  const diff: Record<string, unknown> = { status: { from: claim.status, to: next.status } };
  switch (event) {
    case "confirm":
      patch.reviewerId = options.by;
      if (claim.origin !== "open_text") patch.confirmedAt = options.now;
      break;
    case "edit": {
      const text = options.textOriginal?.trim();
      if (!text || text.length > 1000) {
        throw appError(
          "invalid_input",
          "An edit requires nonblank text of at most 1000 characters",
        );
      }
      patch.textOriginal = text;
      patch.confirmedAt = options.now;
      patch.reviewerId = options.by;
      diff.textOriginal = { from: claim.textOriginal, to: text };
      break;
    }
    case "remove":
    case "hide":
    case "undispute":
      patch.disputedWith = undefined;
      break;
    case "reopen":
      patch.confirmedAt = undefined;
      patch.reviewerId = undefined;
      patch.disputedWith = undefined;
      break;
    case "publish":
      break;
  }
  if (claim.status === "disputed") patch.disputedWith = undefined;
  await ctx.db.patch("claim", claim._id, patch);

  // Patch this claim first: its former partner must never retain a one-sided dispute.
  if (claim.status === "disputed" && claim.disputedWith !== undefined) {
    const partner = await ctx.db.get("claim", claim.disputedWith);
    if (partner?.status === "disputed" && partner.disputedWith === claim._id) {
      await ctx.db.patch("claim", partner._id, { status: "published", disputedWith: undefined });
      await writeAudit(ctx, {
        action: "claim.undispute",
        targetType: "claim",
        targetId: partner._id,
        diff: { status: { from: "disputed", to: "published" } },
        ...(options.by === undefined
          ? { actorKind: "system" }
          : { actorKind: "person", actorPersonId: options.by }),
      });
    }
  }
  if (event === "edit") {
    const translations = await ctx.db
      .query("claimTranslation")
      .withIndex("by_claimId_and_lang", (q) => q.eq("claimId", claim._id))
      .take(20);
    for (const translation of translations) {
      await ctx.db.delete("claimTranslation", translation._id);
    }
  }
  const sentencesHeld =
    !options.deferHold && isCitable(claim.status) && !isCitable(next.status)
      ? await holdSentencesCiting(ctx, claim.placeId, [claim._id])
      : 0;
  await writeAudit(ctx, {
    action: `claim.${event}`,
    targetType: "claim",
    targetId: claim._id,
    diff,
    ...(options.by === undefined
      ? { actorKind: "system" }
      : { actorKind: "person", actorPersonId: options.by }),
  });
  return { claim: await getClaim(ctx, claim._id), sentencesHeld };
}

/** Apply cascades in the gated transaction; deferHold is reserved for hideClaims' bulk pass. */
export async function transitionClaim(
  ctx: MutationCtx,
  claimId: Id<"claim">,
  event: Exclude<ClaimEvent, "dispute">,
  options: TransitionOptions & { deferHold?: boolean },
): Promise<Doc<"claim">> {
  requireActor(options);
  return (await applyTransition(ctx, await getClaim(ctx, claimId), event, options)).claim;
}

export async function disputeClaims(
  ctx: MutationCtx,
  a: Id<"claim">,
  b: Id<"claim">,
  options: { by: Id<"person">; now: number },
): Promise<void> {
  requireActor({ ...options, actor: "steward" });
  await requireSteward(ctx, options.by);
  if (a === b) throw appError("conflict", "Cannot dispute a claim with itself");
  const first = await getClaim(ctx, a);
  const second = await getClaim(ctx, b);
  if (first.placeId !== second.placeId) {
    throw appError("conflict", "Cannot dispute claims about different places");
  }
  const owner = await ctx.db
    .query("placeOwner")
    .withIndex("by_placeId_and_personId", (q) => q.eq("placeId", first.placeId))
    .first();
  for (const claim of [first, second]) {
    const next = nextClaimStatus(claim.status, "dispute", {
      origin: claim.origin,
      actor: "steward",
      placeHasOwner: owner !== null,
    });
    if (!next.ok) throw appError("conflict", next.reason);
  }
  for (const [claim, partner] of [
    [first, second],
    [second, first],
  ] as const) {
    await ctx.db.patch("claim", claim._id, { status: "disputed", disputedWith: partner._id });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: options.by,
      action: "claim.dispute",
      targetType: "claim",
      targetId: claim._id,
      diff: { status: { from: claim.status, to: "disputed" } },
    });
  }
}

export async function hideClaims(
  ctx: MutationCtx,
  claimIds: readonly Id<"claim">[],
  options: { by?: Id<"person">; now: number },
): Promise<{ hidden: number; sentencesHeld: number }> {
  let hidden = 0;
  let sentencesHeld = 0;
  const by = options.by === undefined ? null : await ctx.db.get("person", options.by);
  const claimsByPlace = new Map<Id<"place">, Id<"claim">[]>();
  for (const claimId of new Set(claimIds)) {
    const claim = await getClaim(ctx, claimId);
    if (
      options.by !== undefined &&
      by?.role !== "steward" &&
      !(await isVerifiedOwner(ctx, options.by, claim.placeId))
    ) {
      throw appError("forbidden", "Only a steward or this place's verified owner may hide claims");
    }
    const ids = claimsByPlace.get(claim.placeId) ?? [];
    ids.push(claimId);
    claimsByPlace.set(claim.placeId, ids);
    if (claim.status === "hidden") continue;
    // Bulk withdrawal authorizes its person above; hide is a system event in the state table.
    await transitionClaim(ctx, claimId, "hide", {
      ...options,
      actor: "system",
      deferHold: true,
    });
    hidden += 1;
  }
  for (const [placeId, ids] of claimsByPlace) {
    sentencesHeld += await holdSentencesCiting(ctx, placeId, ids);
  }
  return { hidden, sentencesHeld };
}

// Count page versions and sentences together per place, including held and unrelated rows.
// Reserve headroom for claim rules, audits and writes; reaching the cap aborts the transaction.
export const MAX_CASCADE_DOCUMENTS_READ = 4000;

export async function holdSentencesCiting(
  ctx: MutationCtx,
  placeId: Id<"place">,
  claimIds: readonly Id<"claim">[],
): Promise<number> {
  if (claimIds.length === 0) return 0;
  const cited = new Set(claimIds);
  const versions = ctx.db
    .query("pageVersion")
    .withIndex("by_placeId_and_version", (q) => q.eq("placeId", placeId))
    .order("desc");
  let held = 0;
  let documentsRead = 0;
  const countRead = () => {
    if (++documentsRead >= MAX_CASCADE_DOCUMENTS_READ) {
      throw appError("conflict", "Citation cascade read cap reached; nothing was hidden");
    }
  };
  for await (const version of versions) {
    countRead();
    const sentences = ctx.db
      .query("pageSentence")
      .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) =>
        q.eq("pageVersionId", version._id),
      );
    for await (const sentence of sentences) {
      countRead();
      if (!sentence.held && sentence.claimIds.some((claimId) => cited.has(claimId))) {
        await ctx.db.patch("pageSentence", sentence._id, { held: true });
        held += 1;
      }
    }
  }
  return held;
}
