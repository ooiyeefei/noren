// Shared builders for walk mode's tests: places a known number of metres from a point, and readings.
import type { Fix, Pin, Snippet, WalkPlace } from "@/lib/walk/types";

/** Shinchi's centre, from regions/nagasaki.json. */
export const ORIGIN: Pin = { lat: 32.7415, lng: 129.8755 };

/** Metres to degrees of latitude (a degree is about 111.2 km). */
const METRES_PER_DEGREE = 111_195;

/** The point this many metres due north of another. */
export const northOf = (pin: Pin, metres: number): Pin => ({
  lat: pin.lat + metres / METRES_PER_DEGREE,
  lng: pin.lng,
});

/** A reading at a point, with the phone's own error. */
export const fixAt = (pin: Pin, accuracy = 10): Fix => ({ ...pin, accuracy });

export const MEMBER_SNIPPET: Snippet = {
  kind: "member",
  writer: "Kenji",
  lang: "en",
  text: "The champon is just as it was.",
  more: false,
};

export function walkPlace(
  slug: string,
  pin: Pin,
  over: Partial<Omit<WalkPlace, "slug" | "pin">> & { story?: boolean } = {},
): WalkPlace {
  const { story, ...rest } = over;
  // `story` is a place with a story and the words to read; `hasStory` alone has none to read.
  const hasStory = story ?? rest.hasStory ?? false;
  return {
    slug,
    names: [
      { lang: "en", script: "latin", value: `Place ${slug}`, isPrimary: true },
      { lang: "ja", script: "kanji", value: `店${slug}`, isPrimary: true },
    ],
    category: "cafe",
    pin,
    confirmed: true,
    ...(story ? { snippet: MEMBER_SNIPPET } : {}),
    ...rest,
    hasStory,
  };
}

export const MINUTE = 60_000;
