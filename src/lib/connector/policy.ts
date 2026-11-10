// What an AI may read of a member's story.
//
// Noren's terms let a writer's story be shown ON NOREN, to the people who visit. They do not let it
// be handed to an AI service. Two things on Noren put words in front of a model: the connector (an
// assistant such as Claude or ChatGPT that a visitor has connected) and Noren's own in-app planner,
// whose model is a third-party AI service too. For both, a member's story (its words, their name
// and their photo credit) goes to the model only when the writer ticked the one box that covers both
// (story.connectorAllowedAt). Everything below is the one place that rule lives; the tools ask this
// module and never look at the flag themselves.
//
// The planner's page still shows every member story to the person asking, under the stop it belongs
// to, exactly as the place page shows it. That is code reading the page's own data with no model in
// between, so it does not go through this module.

/**
 * "opted-in": the default, and the only policy any caller uses: both the connector and the in-app
 * planner. A member story's text and writer are returned only if the writer allowed it.
 * "all-shown": every story the public page shows. No caller uses it; a model reading unticked stories
 * would break the promise that Noren does not send stories or names to an AI service.
 */
export type ConnectorOptions = {
  memberStories: "opted-in" | "all-shown";
};

export const CONNECTOR_DEFAULTS: ConnectorOptions = { memberStories: "opted-in" };

/** Whether this member-written story's text and writer's name may go to an AI. */
export function connectorMayShareStory(
  story: { connectorAllowed: boolean },
  options: ConnectorOptions = CONNECTOR_DEFAULTS,
): boolean {
  return options.memberStories === "all-shown" || story.connectorAllowed;
}

/**
 * Whether a member's note on a post they shared (and their name) may go to an AI. A writer has no
 * tick for this yet, so it goes to none: neither the connector nor the planner's model. When a tick
 * exists, change this one function. The post's own link and public author name are not the member's
 * words and are not held.
 */
export function connectorMayShareMemberPost(
  options: ConnectorOptions = CONNECTOR_DEFAULTS,
): boolean {
  return options.memberStories === "all-shown";
}

/**
 * Whether the region offers the writer's tick: the connector or the planner is switched on, either
 * of which can put a story in front of an AI. With both off nothing could use the tick, so it is not
 * shown and the server refuses to turn it on (turning it off is never refused).
 */
export function aiReadingOffered(features: { connector: boolean; planner: boolean }): boolean {
  return features.connector || features.planner;
}
