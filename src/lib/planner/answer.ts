import { applyProposal, type MemoryStore } from "../memory";
import type { ChatAction, ChatState } from "./chat";

/**
 * The visitor answered a "Remember: vegetarian?" suggestion. This is the only place a suggestion
 * reaches the memory, and only on Yes; No leaves the device exactly as it was. Returns what the chat
 * should record, or null when the suggestion is gone or was already answered, so a second tap on Yes
 * does nothing.
 */
export function answerProposal(
  chat: ChatState,
  store: Pick<MemoryStore, "update">,
  turnId: string,
  proposalId: string,
  choice: "yes" | "no",
): ChatAction | null {
  const turn = chat.turns.find((candidate) => candidate.id === turnId);
  if (turn?.role !== "assistant") return null;
  const entry = turn.proposals.find((candidate) => candidate.proposal.id === proposalId);
  if (entry === undefined || entry.status !== "open") return null;
  if (choice === "yes") {
    store.update((memory, clock) => applyProposal(memory, entry.proposal, clock));
  }
  return { type: "answer", turnId, proposalId, answer: choice };
}
