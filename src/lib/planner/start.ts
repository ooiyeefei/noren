import { fold } from "../connector/text";
import type { StartChoice } from "./chat";

// Where a plan starts: a neighbourhood, a place, or the nearest neighbourhood to the phone. Only ever a
// neighbourhood's id or a place's slug goes to Noren (request.ts).

export const MAX_PLACE_MATCHES = 6;

export type PlaceOption = { slug: string; name: string; searchable: string[] };

/** Places whose name (in any script) contains what was typed, names that start with it first. */
export function matchPlaces(
  places: readonly PlaceOption[],
  query: string,
  limit = MAX_PLACE_MATCHES,
): PlaceOption[] {
  const wanted = fold(query);
  if (wanted === "") return [];
  const hits = places.flatMap((place) => {
    const forms = place.searchable.map(fold);
    if (!forms.some((form) => form.includes(wanted))) return [];
    return [{ place, starts: forms.some((form) => form.startsWith(wanted)) }];
  });
  return hits
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map(({ place }) => place);
}

/** The start as the request carries it: an id or a slug, never a name and never a position. */
export function startForRequest(
  start: StartChoice | null,
): { kind: "neighbourhood"; id: string } | { kind: "place"; slug: string } | undefined {
  if (start === null) return undefined;
  return start.kind === "neighbourhood"
    ? { kind: "neighbourhood", id: start.id }
    : { kind: "place", slug: start.slug };
}
