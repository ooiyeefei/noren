import { describe, expect, it } from "vitest";
import {
  CLAIM_EVENTS,
  CITABLE_STATUSES,
  isCitable,
  nextClaimStatus,
  type ClaimActor,
  type ClaimEvent,
  type TransitionContext,
} from "../../src/lib/claims/state";
import { CLAIM_ORIGINS, CLAIM_STATUSES, type ClaimStatus } from "../../src/lib/domain/constants";

// Product predicates, independent of the implementation's from/to/actors table.
const EXPECTED: Record<ClaimEvent, (status: ClaimStatus, ctx: TransitionContext) => boolean> = {
  confirm: (status, ctx) =>
    status === "proposed" &&
    ((ctx.actor === "owner" && ctx.placeHasOwner && ctx.origin !== "open_text") ||
      (ctx.actor === "steward" && !ctx.placeHasOwner && ctx.origin === "open_text")),
  edit: (status, ctx) =>
    status !== "hidden" && ctx.actor === "owner" && ctx.placeHasOwner && ctx.origin !== "open_text",
  remove: (status, ctx) =>
    status !== "hidden" &&
    (ctx.actor === "steward" || (ctx.actor === "owner" && ctx.placeHasOwner)),
  publish: (status, ctx) => status === "owner_confirmed" && ctx.actor !== "owner",
  dispute: (status, ctx) => status === "published" && ctx.actor === "steward",
  undispute: (status, ctx) => status === "disputed" && ctx.actor !== "owner",
  hide: (status, ctx) => status !== "hidden" && ctx.actor !== "owner",
  reopen: (status, ctx) =>
    status !== "proposed" &&
    status !== "hidden" &&
    ctx.origin === "open_text" &&
    ctx.actor !== "owner",
};

function expectedStatus(event: ClaimEvent): ClaimStatus {
  switch (event) {
    case "confirm":
    case "edit":
      return "owner_confirmed";
    case "remove":
    case "hide":
      return "hidden";
    case "publish":
    case "undispute":
      return "published";
    case "dispute":
      return "disputed";
    case "reopen":
      return "proposed";
  }
}

const ACTORS: readonly ClaimActor[] = ["owner", "steward", "system"];
const context = (overrides: Partial<TransitionContext> = {}): TransitionContext => ({
  actor: "owner",
  origin: "interview",
  placeHasOwner: true,
  ...overrides,
});

describe("claim state", () => {
  it("matches the full transition table", () => {
    let combinations = 0;
    for (const status of CLAIM_STATUSES) {
      for (const event of CLAIM_EVENTS) {
        for (const actor of ACTORS) {
          for (const origin of CLAIM_ORIGINS) {
            for (const placeHasOwner of [false, true]) {
              const expected = EXPECTED[event](status, { actor, origin, placeHasOwner });
              const result = nextClaimStatus(status, event, { actor, origin, placeHasOwner });
              const label = JSON.stringify({ status, event, actor, origin, placeHasOwner });
              if (expected) {
                expect(result, label).toEqual({ ok: true, status: expectedStatus(event) });
              } else {
                expect(result.ok, label).toBe(false);
                if (!result.ok) {
                  for (const detail of [event, status, actor, origin]) {
                    expect(result.reason, label).toContain(detail);
                  }
                }
              }
              combinations += 1;
            }
          }
        }
      }
    }
    expect(combinations).toBe(720);
  });

  it("an owner cannot confirm open text", () => {
    for (const placeHasOwner of [false, true]) {
      expect(
        nextClaimStatus("proposed", "confirm", context({ origin: "open_text", placeHasOwner })).ok,
      ).toBe(false);
    }
  });

  it("an owner without place ownership cannot confirm, edit or remove", () => {
    for (const event of ["confirm", "edit", "remove"] as const) {
      expect(nextClaimStatus("proposed", event, context({ placeHasOwner: false })).ok).toBe(false);
    }
  });

  it("a steward cannot confirm an interview claim", () => {
    expect(nextClaimStatus("proposed", "confirm", context({ actor: "steward" })).ok).toBe(false);
  });

  it("a steward confirms open text only on a place without an owner", () => {
    const openText = context({ actor: "steward", origin: "open_text", placeHasOwner: false });
    expect(nextClaimStatus("proposed", "confirm", openText)).toEqual({
      ok: true,
      status: "owner_confirmed",
    });
    expect(nextClaimStatus("proposed", "confirm", { ...openText, placeHasOwner: true }).ok).toBe(
      false,
    );
  });

  it("nothing leaves hidden", () => {
    for (const event of CLAIM_EVENTS) {
      for (const actor of ACTORS) {
        for (const origin of CLAIM_ORIGINS) {
          expect(nextClaimStatus("hidden", event, context({ actor, origin })).ok).toBe(false);
        }
      }
    }
  });

  it("only open-text claims reopen", () => {
    for (const origin of CLAIM_ORIGINS) {
      expect(nextClaimStatus("published", "reopen", context({ actor: "system", origin })).ok).toBe(
        origin === "open_text",
      );
    }
  });

  it("publish needs owner_confirmed", () => {
    for (const status of CLAIM_STATUSES) {
      expect(nextClaimStatus(status, "publish", context({ actor: "system" })).ok).toBe(
        status === "owner_confirmed",
      );
    }
  });

  it("isCitable is true only for published and disputed", () => {
    expect(CITABLE_STATUSES).toEqual(["published", "disputed"]);
    expect(CLAIM_STATUSES.filter(isCitable)).toEqual(["published", "disputed"]);
  });
});
