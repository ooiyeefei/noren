import { MAX_TURN_CHARS, MAX_TURNS } from "./request";
import type { PlannerProposal, PlannerReply } from "./reply";

// The planner chat as plain data, so what the page does is easy to test. It lives in the page's
// memory only: reload and it is gone, and nothing about it is kept on the device or the server.

export type StartChoice =
  | { kind: "neighbourhood"; id: string; name: string }
  | { kind: "place"; slug: string; name: string };

export type ProposalState = { proposal: PlannerProposal; status: "open" | "yes" | "no" };

export type ChatTurn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; reply: PlannerReply; proposals: ProposalState[] }
  | { id: string; role: "error"; code: "rate_limited" | "failed" };

export type ChatState = { turns: ChatTurn[]; pending: boolean; seq: number };

export const emptyChat: ChatState = { turns: [], pending: false, seq: 0 };

/** Turns kept on the page. The server is sent fewer (MAX_TURNS), and only the useful ones. */
export const MAX_KEPT_TURNS = 24;

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "reply"; reply: PlannerReply }
  | { type: "error"; code: "rate_limited" | "failed" }
  | { type: "answer"; turnId: string; proposalId: string; answer: "yes" | "no" }
  | { type: "clear" };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const next = (turn: ChatTurn, pending: boolean): ChatState => ({
    turns: [...state.turns, turn].slice(-MAX_KEPT_TURNS),
    pending,
    seq: state.seq + 1,
  });
  switch (action.type) {
    case "send":
      return state.pending || action.text.trim() === ""
        ? state
        : next({ id: `t${state.seq + 1}`, role: "user", text: action.text.trim() }, true);
    case "reply":
      return next(
        {
          id: `t${state.seq + 1}`,
          role: "assistant",
          reply: action.reply,
          proposals: action.reply.proposals.map((proposal) => ({ proposal, status: "open" })),
        },
        false,
      );
    case "error":
      return next({ id: `t${state.seq + 1}`, role: "error", code: action.code }, false);
    case "answer":
      return {
        ...state,
        turns: state.turns.map((turn) =>
          turn.role === "assistant" && turn.id === action.turnId
            ? {
                ...turn,
                proposals: turn.proposals.map((entry) =>
                  entry.proposal.id === action.proposalId && entry.status === "open"
                    ? { ...entry, status: action.answer }
                    : entry,
                ),
              }
            : turn,
        ),
      };
    case "clear":
      return emptyChat;
  }
}

/**
 * What the model is told an earlier answer was: the names of the stops, in the draw's order, and
 * nothing it could mistake for a slug or a quote. Built by code from the reply, so a model's earlier
 * words are never fed back to it as if they were the person's.
 */
export function replySummary(reply: PlannerReply): string {
  const parts: string[] = [];
  if (reply.walk !== null && reply.walk.stops.length > 0) {
    parts.push(
      `A walk was drawn: ${reply.walk.stops.map((stop, n) => `${n + 1}. ${stop.place.name}`).join(", ")}.`,
    );
  }
  if (reply.omikuji !== null) parts.push(`An omikuji named ${reply.omikuji.place.name}.`);
  if (reply.answers.length > 0) parts.push("Members' words were shown in answer.");
  return (parts.length > 0 ? parts.join(" ") : "Nothing was shown.").slice(0, MAX_TURN_CHARS);
}

/** The turns to send: the recent ones, starting and ending with the person. */
export function requestTurns(state: ChatState): { role: "user" | "assistant"; text: string }[] {
  const turns = state.turns.flatMap((turn): { role: "user" | "assistant"; text: string }[] => {
    if (turn.role === "user") return [{ role: "user", text: turn.text.slice(0, MAX_TURN_CHARS) }];
    if (turn.role === "assistant") return [{ role: "assistant", text: replySummary(turn.reply) }];
    return [];
  });
  const recent = turns.slice(-MAX_TURNS);
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}
