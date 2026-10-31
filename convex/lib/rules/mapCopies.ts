import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { readHasPublishedPage, readMapNames, writeMapCopies } from "../mapCopies";

/** Keeps the place row's copies of its names, pin and published page in step with their tables. */
export function registerMapCopyRules(triggers: Triggers<DataModel>) {
  triggers.register("placeName", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(ctx.innerDb, placeId, { mapNames: await readMapNames(ctx, placeId) });
  });

  triggers.register("pin", async (ctx, change) => {
    const pin = change.newDoc;
    await writeMapCopies(ctx.innerDb, (pin ?? change.oldDoc).placeId, {
      mapPin: pin === null ? null : { lat: pin.lat, lng: pin.lng },
    });
  });

  triggers.register("pageVersion", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(ctx.innerDb, placeId, {
      hasPublishedPage: await readHasPublishedPage(ctx, placeId),
    });
  });
}
