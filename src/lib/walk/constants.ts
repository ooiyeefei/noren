// The numbers that set how walk mode behaves. Change them here and nowhere else.

/** A place comes into range at this many metres (before the accuracy allowance below). */
export const STORY_RADIUS_METRES = 60;

/**
 * A reading worse than this (the phone's own error, in metres) is shown as "rough" and triggers
 * nothing. The collection's allowance (region.collection.accuracyAllowanceMetres) then lets a good
 * reading count a little closer than it is, the same way "I'm here" does.
 */
export const MAX_USABLE_ACCURACY_METRES = 100;

/** A story or first-story card goes away on its own once the person is this far from the place. */
export const CARD_LEAVE_METRES = 150;

/** At most one card is read aloud in this time. The card still shows; "Read aloud" is always there. */
export const SPOKEN_CARD_GAP_MS = 2 * 60_000;

/** At most one "nobody has written about this place" nudge in this time. */
export const FIRST_STORY_NUDGE_GAP_MS = 20 * 60_000;

/** At most one detour suggestion in this time, and none until the walk is this old. */
export const DETOUR_GAP_MS = 20 * 60_000;
export const DETOUR_FIRST_AFTER_MS = 5 * 60_000;
/** A detour is drawn from places this far away in a straight line: about 2 to 6 minutes on foot. */
export const DETOUR_MIN_METRES = 120;
export const DETOUR_MAX_METRES = 400;
/** A detour card stays this long unless the person closes it first. */
export const DETOUR_CARD_MS = 10 * 60_000;

/** Cards kept in "Earlier on this walk". */
export const EARLIER_CARDS_KEPT = 10;

/** A slip's place this close to where you are (or to a neighbourhood's middle) is "right here". */
export const SLIP_HERE_METRES = 30;

/**
 * A slip's sealed question opens when a reading puts the phone this close to the place's pin (the
 * same accuracy rules as a story coming into range apply). The distance is worked out on the phone.
 */
export const SLIP_OPEN_METRES = 60;

/**
 * Three doors: a slip leads on to two more places. A drawn next door is at least this far from the
 * one before (so it is another door, not the same corner) and at most this far in a straight line:
 * about 6 minutes on foot. A question carried to a place leads there whatever the distance.
 */
export const THREAD_MIN_METRES = 60;
export const THREAD_MAX_METRES = 400;
