import { dayOf } from "../connector/present";
import type { PlaceBundle } from "../connector/types";
import type { PlannerQuote } from "./reply";

// The stories members wrote at a drawn stop, for the person asking to read. Code attaches them from
// the place page's own data (the same stories, the same writer's name, newest first), whether or not
// the writer ticked the box that lets AI read their story. No model is involved at any point, and
// nothing here is added to the ledger of quotes a model may point to (ledger.ts), so a story that
// was not ticked can be shown to a person and still never reach a model.

/** The newest this many stories are shown under a stop; the rest are a click away on the place's page. */
export const STORIES_PER_STOP = 2;

export function memberStories(
  bundle: PlaceBundle | undefined,
  place: { slug: string; name: string },
  utcOffsetHours: number,
): PlannerQuote[] {
  if (bundle === undefined) return [];
  return bundle.stories.slice(0, STORIES_PER_STOP).map((story) => ({
    // Prefixed so it can never be mistaken for an id the model was given ("q1", "q2", ...).
    id: `story:${story._id}`,
    kind: "story" as const,
    slug: place.slug,
    placeName: place.name,
    text: story.body,
    language: story.lang,
    ...(story.authorName === "" ? {} : { by: story.authorName }),
    on: dayOf(story.addedAt, utcOffsetHours),
    translations: [],
    sources: [],
    aiAssisted: false,
    demo: story.isMock,
  }));
}
