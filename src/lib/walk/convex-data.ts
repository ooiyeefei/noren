import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { WalkData } from "./types";

/**
 * The only two requests walk mode makes to Noren, and what each carries: the region's id. Nothing
 * else is passed in, so there is nowhere for a position, a neighbourhood worked out from one, or
 * the id of a place near the person to travel from the phone. Tests assert it.
 *
 * `query` and `mutation` on the Convex client are one-shot calls: no subscription stays open on
 * the places, so nothing changes on the server as the person moves.
 */
export function convexWalkData(
  client: Pick<ConvexReactClient, "query" | "mutation">,
  regionId: string,
): WalkData {
  return {
    loadPlaces: () => client.query(api.walk.forRegion, { regionId }),
    drawToday: () => client.mutation(api.connector.omikujiToday, { regionId }),
  };
}
