import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { guarded } from "./guarded";
import type { ConnectorData } from "./types";

// The tools' data, read from Convex the way a signed-out visitor's browser reads it. No call here
// takes a token, so Convex sees no person: a draft, a private field or a steward's view cannot
// come back, however the tools are called. The only writes are the two draws in
// convex/connector.ts, which record their own exposure.

export function convexConnectorData(regionId: string): ConnectorData {
  return {
    listPlaces: () => guarded(fetchQuery(api.places.listForMap, { regionId })),

    async placeBundle(slug) {
      const place = await guarded(fetchQuery(api.places.getBySlug, { regionId, slug }));
      if (place === null) return null;
      const args = { placeId: place._id };
      const [stories, placeStory, page, sources, set] = await Promise.all([
        fetchQuery(api.stories.listForPlace, args),
        fetchQuery(api.placeStories.forPlace, args),
        fetchQuery(api.pages.getPublished, args),
        fetchQuery(api.sources.listForPlace, args),
        fetchQuery(api.collection.forPlace, args),
      ]);
      return { place, stories, placeStory, page, sources, set };
    },

    async listSets() {
      const book = await guarded(fetchQuery(api.collection.book, { regionId }));
      return await Promise.all(
        book.sets.map(async (set) => ({
          set,
          detail: await fetchQuery(api.collection.set, {
            regionId,
            neighbourhoodId: set.neighbourhoodId,
          }),
        })),
      );
    },

    walk: (request) => guarded(fetchMutation(api.connector.walk, { regionId, ...request })),

    omikuji: (request) => guarded(fetchMutation(api.connector.omikuji, { regionId, ...request })),
  };
}
