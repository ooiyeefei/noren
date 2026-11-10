import { api } from "../../../convex/_generated/api";
import type { ActionCtx } from "../../../convex/_generated/server";
import { guarded } from "../connector/guarded";
import type { ConnectorData } from "../connector/types";

// The tools' data, read from inside a Convex action: the same public queries the place page calls and
// the same two draw mutations the connector calls, so a draw still records its anonymous exposure.
//
// An action carries the caller's sign-in into everything it runs, so these queries see what the
// signed-in member sees on Noren itself, which is what the in-app planner is for. The draws are the
// exception: they read the public map as a signed-out visitor, whoever asks (convex/connector.ts).

export function actionConnectorData(ctx: ActionCtx, regionId: string): ConnectorData {
  return {
    listPlaces: () => guarded(ctx.runQuery(api.places.listForMap, { regionId })),

    async placeBundle(slug) {
      const place = await guarded(ctx.runQuery(api.places.getBySlug, { regionId, slug }));
      if (place === null) return null;
      const args = { placeId: place._id };
      const [stories, placeStory, page, sources, set] = await Promise.all([
        ctx.runQuery(api.stories.listForPlace, args),
        ctx.runQuery(api.placeStories.forPlace, args),
        ctx.runQuery(api.pages.getPublished, args),
        ctx.runQuery(api.sources.listForPlace, args),
        ctx.runQuery(api.collection.forPlace, args),
      ]);
      return { place, stories, placeStory, page, sources, set };
    },

    async listSets() {
      const book = await guarded(ctx.runQuery(api.collection.book, { regionId }));
      return await Promise.all(
        book.sets.map(async (set) => ({
          set,
          detail: await ctx.runQuery(api.collection.set, {
            regionId,
            neighbourhoodId: set.neighbourhoodId,
          }),
        })),
      );
    },

    walk: (request) => guarded(ctx.runMutation(api.connector.walk, { regionId, ...request })),

    omikuji: (request) => guarded(ctx.runMutation(api.connector.omikuji, { regionId, ...request })),
  };
}
