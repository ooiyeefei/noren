// What Noren remembers about a visitor, kept on their own device. The numbers that shape it live
// here, named, so they can be read and changed in one place.

/** Where the memory lives in the browser. A new version of the shape gets a new key. */
export const MEMORY_STORAGE_KEY = "noren.memory.v1";
export const MEMORY_VERSION = 1;

/**
 * Tastes Noren notices fade: each one loses half of its strength every this many days. Three weeks
 * is long enough for a taste to outlast a quiet fortnight and short enough that a trip ten weeks
 * ago no longer steers today's walk.
 */
export const TASTE_HALF_LIFE_DAYS = 21;

/** What opening a place's page, and saving it, add to the taste that place's category points to. */
export const OPEN_WEIGHT = 1;
export const SAVE_WEIGHT = 3;

/** One taste cannot grow past this, so one afternoon of browsing fades like any other. */
export const TASTE_STRENGTH_CAP = 6;

/** A noticed taste counts once it is at least this strong: one save, or a couple of opens close together. */
export const TASTE_COUNTS_AT = 1.5;

/** A noticed taste weaker than this is forgotten altogether and leaves the device. */
export const TASTE_FORGOTTEN_BELOW = 0.2;

/** How many tastes go to the draw with a request. They only tilt the odds. */
export const TASTES_SENT = 3;

/** Convex takes ten tags a draw; this leaves room for rules the person says in the chat. */
export const MAX_RULES = 8;
export const MAX_TASTES = 12;
export const MAX_TRIP_ITEMS = 12;
/** The longest a rule, taste or trip entry may be. It is a short phrase, not a note. */
export const MAX_LABEL_LENGTH = 40;

/** Japan has no daylight saving, so a fixed offset gives the end of the day. */
export const JAPAN_UTC_OFFSET_HOURS = 9;

export const DAY_MS = 24 * 60 * 60 * 1000;
