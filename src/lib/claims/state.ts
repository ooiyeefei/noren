import type { ClaimOrigin, ClaimStatus } from "../domain/constants";

export const CLAIM_EVENTS = [
  "confirm",
  "edit",
  "remove",
  "publish",
  "dispute",
  "undispute",
  "hide",
  "reopen",
] as const;
export type ClaimEvent = (typeof CLAIM_EVENTS)[number];
export type ClaimActor = "owner" | "steward" | "system";
export const CITABLE_STATUSES = ["published", "disputed"] as const;

export function isCitable(status: ClaimStatus): boolean {
  return CITABLE_STATUSES.some((citable) => citable === status);
}

export type TransitionContext = {
  origin: ClaimOrigin;
  actor: ClaimActor;
  placeHasOwner: boolean;
};

type TransitionRule = {
  from: readonly ClaimStatus[];
  to: ClaimStatus;
  actors: readonly ClaimActor[];
  when?: (context: TransitionContext) => boolean;
};

const TRANSITIONS: Record<ClaimEvent, TransitionRule> = {
  confirm: {
    from: ["proposed"],
    to: "owner_confirmed",
    actors: ["owner", "steward"],
    when: ({ origin, actor, placeHasOwner }) =>
      origin === "open_text"
        ? actor === "steward" && !placeHasOwner
        : actor === "owner" && placeHasOwner,
  },
  edit: {
    from: ["proposed", "owner_confirmed", "published", "disputed"],
    to: "owner_confirmed",
    actors: ["owner"],
    when: ({ origin, placeHasOwner }) => origin !== "open_text" && placeHasOwner,
  },
  remove: {
    from: ["proposed", "owner_confirmed", "published", "disputed"],
    to: "hidden",
    actors: ["owner", "steward"],
    when: ({ actor, placeHasOwner }) => actor === "steward" || placeHasOwner,
  },
  publish: {
    from: ["owner_confirmed"],
    to: "published",
    actors: ["steward", "system"],
  },
  dispute: { from: ["published"], to: "disputed", actors: ["steward"] },
  undispute: { from: ["disputed"], to: "published", actors: ["steward", "system"] },
  hide: {
    from: ["proposed", "owner_confirmed", "published", "disputed"],
    to: "hidden",
    actors: ["steward", "system"],
  },
  reopen: {
    from: ["owner_confirmed", "published", "disputed"],
    to: "proposed",
    actors: ["steward", "system"],
    when: ({ origin }) => origin === "open_text",
  },
};

export function nextClaimStatus(
  current: ClaimStatus,
  event: ClaimEvent,
  context: TransitionContext,
): { ok: true; status: ClaimStatus } | { ok: false; reason: string } {
  const rule = TRANSITIONS[event];
  if (
    !rule.from.includes(current) ||
    !rule.actors.includes(context.actor) ||
    (rule.when && !rule.when(context))
  ) {
    return {
      ok: false,
      reason: `Cannot ${event} claim in status ${current} as ${context.actor} with origin ${context.origin} on a place ${context.placeHasOwner ? "with" : "without"} an owner`,
    };
  }
  return { ok: true, status: rule.to };
}
