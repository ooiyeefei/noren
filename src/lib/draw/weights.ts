// THE ONE PLACE WHERE THE ODDS ARE SET.
//
// Noren never ranks places (constitution, Principle I). A suggestion is a fair random draw, and this
// file decides only how the odds are tilted. A place's "weight" is its share of the draw: a place
// with weight 3 is three times as likely to be picked as a place with weight 1. Weights are an
// internal detail. They are never shown, returned to an assistant, or turned into a rank or a
// "match %".
//
// What the odds may use:
//   - what the traveller told us they like (a gentle tilt, never a filter),
//   - how often the place was suggested in the last 7 days (quiet places get their turn),
//   - for a wild card or an omikuji only: whether anybody has written a story about the place yet.
//
// What the odds must NEVER use: ratings, stars, reviews, sentiment, popularity, page views, or how
// many stories a place has. "Has no story yet" is a reason to go and write one, not a verdict.
//
// Change the numbers below to tune the draw. Nothing else needs to change.

/**
 * A place that fits one of the traveller's interests is this many times as likely to be drawn as
 * one that does not. 3 means "three times". 1 would switch the tilt off. A place that does not fit
 * can still be drawn: interests tilt the odds and never exclude anything.
 */
export const TASTE_TILT = 3;

/**
 * Equal turns. A place that was suggested rarely in the last 7 days gets up to this much EXTRA
 * weight on top of its normal 1. With 2, a place suggested zero times has weight 1 + 2 = 3, so it
 * is three times as likely as a place that has been suggested very often (which falls toward 1).
 */
export const QUIET_BOOST_MAX = 2;

/**
 * How fast the extra weight above fades as suggestions pile up. After this many suggestions in the
 * last 7 days, half of QUIET_BOOST_MAX is left. With 2: 0 suggestions gives 3, 2 give 2, 6 give 1.5.
 */
export const QUIET_HALF_POINT = 2;

/**
 * For a wild card (and the omikuji): a place nobody has written about yet is this many times as
 * likely as one that has a story. This is a nudge toward places that need their first story. It
 * does not mean a place with a story is worse.
 */
export const NO_STORY_BOOST = 3;

/** What the draw may know about a place. Nothing here says whether anyone liked it. */
export type DrawCandidate = {
  /** Suggestions in the last 7 days (see recentSuggestions in ./time.ts). 0 for a quiet place. */
  recentSuggestions: number;
  /** Whether anyone has written a story here or shared a post. Used for wild cards only. */
  hasStory: boolean;
  /** Whether the place fits one of the interests the traveller named. */
  matchesInterest: boolean;
};

export type DrawContext = {
  /** A wild card ignores the traveller's interests and leans toward places with no story yet. */
  wildCard: boolean;
  /** Set for the omikuji, so asking twice in a day cannot change the day's slip. */
  ignoreExposure?: boolean;
};

/** The place's share of the draw. Always above 0, so nobody who is allowed in is ever shut out. */
export function drawWeight(candidate: DrawCandidate, context: DrawContext): number {
  let weight = 1;

  // 1. Equal turns: fewer recent suggestions, more weight. It runs from 1 + QUIET_BOOST_MAX down to 1.
  if (!context.ignoreExposure) {
    const recent = Math.max(0, candidate.recentSuggestions);
    weight *= 1 + (QUIET_BOOST_MAX * QUIET_HALF_POINT) / (QUIET_HALF_POINT + recent);
  }

  if (context.wildCard) {
    // 2a. Wild card: interests are ignored. Lean toward places that still need a first story.
    if (!candidate.hasStory) weight *= NO_STORY_BOOST;
  } else if (candidate.matchesInterest) {
    // 2b. Regular pick: tilt toward the traveller's interests.
    weight *= TASTE_TILT;
  }

  return weight;
}
