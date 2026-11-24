import type { Triggers } from "convex-helpers/server/triggers";
import { cellOf } from "../../../src/lib/geo/geohash";
import type { DataModel, Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  readHasPeopleStories,
  readHasPublishedPage,
  readMapNames,
  readNeighbourhood,
  syncPlaceCopies,
  writeMapCopies,
} from "../mapCopies";

async function refreshPeopleStories(
  ctx: MutationCtx & { innerDb: MutationCtx["db"] },
  placeId: Id<"place">,
  previousPlaceId: Id<"place"> = placeId,
) {
  for (const id of new Set([placeId, previousPlaceId])) {
    await writeMapCopies(
      ctx.innerDb,
      id,
      {
        hasPeopleStories: await readHasPeopleStories(ctx, id),
      },
      true,
    );
  }
}

/**
 * Keeps the place row's copies of its names, pin, neighbourhood, published page and people's stories
 * in step with their tables.
 */
export function registerMapCopyRules(triggers: Triggers<DataModel>) {
  triggers.register("place", async ({ innerDb }, { oldDoc, newDoc }) => {
    await syncPlaceCopies(innerDb, oldDoc, newDoc);
  });

  triggers.register("placeName", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(ctx.innerDb, placeId, { mapNames: await readMapNames(ctx, placeId) });
  });

  triggers.register("pin", async (ctx, change) => {
    const pin = change.newDoc;
    const placeId = (pin ?? change.oldDoc).placeId;
    const place = await ctx.innerDb.get("place", placeId);
    const copies: Pick<Doc<"place">, "mapPin" | "mapCell" | "neighbourhood"> = {
      mapPin: pin === null ? null : { lat: pin.lat, lng: pin.lng },
      mapCell: pin === null ? undefined : cellOf(pin),
      neighbourhood: place === null ? undefined : readNeighbourhood(place.regionId, pin),
    };
    await writeMapCopies(ctx.innerDb, placeId, copies, true);
  });

  triggers.register("pageVersion", async (ctx, change) => {
    const placeId = (change.newDoc ?? change.oldDoc).placeId;
    await writeMapCopies(
      ctx.innerDb,
      placeId,
      {
        hasPublishedPage: await readHasPublishedPage(ctx, placeId),
      },
      true,
    );
  });

  triggers.register("story", async (ctx, { oldDoc, newDoc }) => {
    if (
      oldDoc &&
      newDoc &&
      oldDoc.placeId === newDoc.placeId &&
      oldDoc.status === newDoc.status &&
      oldDoc.isMock === newDoc.isMock
    )
      return;
    await refreshPeopleStories(ctx, (newDoc ?? oldDoc)!.placeId, oldDoc?.placeId);
  });

  triggers.register("source", async (ctx, { oldDoc, newDoc }) => {
    if (
      oldDoc &&
      newDoc &&
      oldDoc.placeId === newDoc.placeId &&
      oldDoc.status === newDoc.status &&
      oldDoc.isMock === newDoc.isMock &&
      oldDoc.sharedAt === newDoc.sharedAt &&
      oldDoc.demoConsentAt === newDoc.demoConsentAt
    )
      return;
    await refreshPeopleStories(ctx, (newDoc ?? oldDoc)!.placeId, oldDoc?.placeId);
  });
}
