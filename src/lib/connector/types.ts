import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { OmikujiResult, WalkResult } from "../../../convex/connector";
import type { RegionConfig } from "../region/schema";
import type { ConnectorOptions } from "./policy";

// Types only, so this file adds nothing to a bundle. They come from the Convex functions the
// place page itself calls, so the connector cannot drift from what a signed-out visitor sees.

export type ListedPlace = FunctionReturnType<typeof api.places.listForMap>[number];
export type PlaceDetail = NonNullable<FunctionReturnType<typeof api.places.getBySlug>>;
export type StoryRow = FunctionReturnType<typeof api.stories.listForPlace>[number];
export type PlaceStoryRow = NonNullable<FunctionReturnType<typeof api.placeStories.forPlace>>;
export type PageRow = NonNullable<FunctionReturnType<typeof api.pages.getPublished>>;
export type SourceRow = FunctionReturnType<typeof api.sources.listForPlace>[number];
export type SetSummary = FunctionReturnType<typeof api.collection.book>["sets"][number];
export type SetDetail = NonNullable<FunctionReturnType<typeof api.collection.set>>;
export type PlaceSetRow = FunctionReturnType<typeof api.collection.forPlace>;

/** Everything the place page reads for one place, as a signed-out visitor. */
export type PlaceBundle = {
  place: PlaceDetail;
  stories: StoryRow[];
  placeStory: PlaceStoryRow | null;
  page: PageRow | null;
  sources: SourceRow[];
  set: PlaceSetRow;
};

export type WalkRequest = {
  start: { kind: "neighbourhood"; id: string } | { kind: "place"; slug: string };
  count: number;
  avoid: string[];
  interests: string[];
  adventurousness: "familiar" | "mixed" | "surprise";
  /** Slugs the draw must leave out, such as places the visitor has been to today. */
  exclude?: string[];
};
export type OmikujiRequest = { neighbourhoodId?: string };
export type { OmikujiResult, WalkResult };

/**
 * Where the tools get Noren's public data. The connector backs it with Convex; a test backs it with
 * fixtures; the in-app planner can back it the same way as the connector.
 */
export interface ConnectorData {
  /** The places on the public map, as the map reads them. */
  listPlaces(): Promise<ListedPlace[]>;
  /** One place as its page shows it to a signed-out visitor; null when it is not public. */
  placeBundle(slug: string): Promise<PlaceBundle | null>;
  /** The live stamp sets, each with its places. Nobody's progress is in here. */
  listSets(): Promise<{ set: SetSummary; detail: SetDetail | null }[]>;
  /** A draw that records its own exposure. */
  walk(request: WalkRequest): Promise<WalkResult>;
  omikuji(request: OmikujiRequest): Promise<OmikujiResult>;
}

export type ToolContext = {
  data: ConnectorData;
  region: RegionConfig;
  /** Noren's address, for links. */
  origin: string;
  options: ConnectorOptions;
  /** The time, so a test can fix the day of the omikuji's search rotation. */
  now: () => number;
};

/** A problem the assistant should hear about and can fix or relay, not a crash. */
export class ConnectorDataError extends Error {
  override name = "ConnectorDataError";
  constructor(
    readonly code: "rate_limited" | "invalid_input" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
