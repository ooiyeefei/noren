import type { PlaceNameLike } from "../region/names";

// What walk mode downloads and passes around. These are plain structural types; the Convex query
// (convex/walk.ts) returns something assignable to them.

export type Pin = { lat: number; lng: number };

/** The few words walk mode may read aloud about a place, and where they came from. */
export type Snippet =
  | {
      /** The newest story a member wrote here, word for word. */
      kind: "member";
      /** The name the writer shows on Noren; empty when they show none. */
      writer: string;
      lang: string;
      text: string;
      more: boolean;
    }
  | {
      /** Noren's AI stitched this from public posts; both languages are the AI's. */
      kind: "stitched";
      postsRead: number;
      /** Where the cited posts are: platform ids, "web" for a plain web page. */
      platforms: string[];
      sentences: { en: string; ja: string }[];
    }
  | {
      /** A short word-for-word quote of a public post the story finder found. */
      kind: "post";
      platform?: string;
      /** The author as the platform shows them. */
      author?: string;
      lang?: string;
      text: string;
      more: boolean;
      /** Machine translations of the quote. */
      translations: { lang: string; text: string }[];
    };

export type WalkPlace = {
  slug: string;
  names: PlaceNameLike[];
  category?: string;
  pin: Pin;
  /** A person has said they have seen the place; false is "Not yet confirmed". */
  confirmed: boolean;
  hasStory: boolean;
  snippet?: Snippet;
};

/** One reading of the phone's position. It stays on the phone. */
export type Fix = { lat: number; lng: number; accuracy: number };

/** Today's omikuji slips, as the server draws them for every neighbourhood. */
export type TodaysSlips = {
  day: string;
  slips: {
    neighbourhoodId?: string;
    place: {
      slug: string;
      names: PlaceNameLike[];
      category?: string;
      confirmedAt?: number;
      hasStory: boolean;
      pin: Pin;
    };
  }[];
};

/** The only two things walk mode asks Noren for. Neither carries a position. */
export type WalkData = {
  /** Public places and story snippets for the region, once. */
  loadPlaces(): Promise<WalkPlace[]>;
  /** Today's slip for every neighbourhood, so the phone can pick the one it wants. */
  drawToday(): Promise<TodaysSlips>;
};
