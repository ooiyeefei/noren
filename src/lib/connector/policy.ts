// What the Noren connector may hand to an AI assistant that a visitor has connected.
//
// Noren's terms let a writer's story be shown ON NOREN. They do not let it be handed to a
// third-party AI assistant. So through the connector a member's story (its words, their name and
// their photo credit) goes out only when the writer allowed it. Everything below is the one place
// that rule lives; the tools ask this module and never look at the flag themselves.

/**
 * "opted-in": the connector (Claude, ChatGPT and other assistants). A member story's text and writer
 * are returned only if the writer allowed it.
 * "all-shown": Noren's own in-app planner. It shows stories on Noren itself, so it may use every
 * story the public page shows.
 */
export type ConnectorOptions = {
  memberStories: "opted-in" | "all-shown";
};

export const CONNECTOR_DEFAULTS: ConnectorOptions = { memberStories: "opted-in" };

/** Whether this member-written story's text and writer's name may go out. */
export function connectorMayShareStory(
  story: { connectorAllowed: boolean },
  options: ConnectorOptions = CONNECTOR_DEFAULTS,
): boolean {
  return options.memberStories === "all-shown" || story.connectorAllowed;
}

/**
 * Whether a member's note on a post they shared (and their name) may go out. A writer has no
 * tick for this yet, so only the in-app planner gets it. When a tick exists, change this one
 * function. The post's own link and public author name are not the member's words and are not held.
 */
export function connectorMayShareMemberPost(
  options: ConnectorOptions = CONNECTOR_DEFAULTS,
): boolean {
  return options.memberStories === "all-shown";
}
