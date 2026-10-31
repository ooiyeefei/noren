import { createGeoSearchRoute } from "@/lib/geo/search-route";
import { requirePersonOnServer } from "@/lib/convex/server";
import { activeRegionConfig } from "@/lib/region/registry";

export const GET = createGeoSearchRoute({
  region: activeRegionConfig(),
  env: process.env,
  fetch: (input, init) => globalThis.fetch(input, init),
  // Any signed-in member may add a missing place, so any member may search for it (FR-032).
  authorize: () => requirePersonOnServer(),
});
