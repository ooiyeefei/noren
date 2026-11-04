import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import {
  readHasPeopleStories,
  readHasPublishedPage,
  readMapNames,
  readNeighbourhood,
  writeMapCopies,
} from "../mapCopies";

/**
 * Keeps the place row's copies of its names, pin, neighbourhood, published page and people's stories
 * in step with their tables.
 */
export function registerMapCopyRules(triggers: Triggers<DataModel>) {
  triggers.register("placeName", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(ctx.innerDb, placeId, { mapNames: await readMapNames(ctx, placeId) });
  });

  triggers.register("pin", async (ctx, change) => {
    const pin = change.newDoc;
    const placeId = (pin ?? change.oldDoc).placeId;
    const place = await ctx.innerDb.get("place", placeId);
    await writeMapCopies(ctx.innerDb, placeId, {
      mapPin: pin === null ? null : { lat: pin.lat, lng: pin.lng },
      neighbourhood: place === null ? undefined : readNeighbourhood(place.regionId, pin),
    });
  });

  triggers.register("pageVersion", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(ctx.innerDb, placeId, {
      hasPublishedPage: await readHasPublishedPage(ctx, placeId),
    });
  });

  for (const table of ["story", "source"] as const)
    triggers.register(table, async (ctx, change) => {
      const placeId = (change.newDoc ?? change.oldDoc).placeId;
      await writeMapCopies(ctx.innerDb, placeId, {
        hasPeopleStories: await readHasPeopleStories(ctx, placeId),
      });
    });
}
