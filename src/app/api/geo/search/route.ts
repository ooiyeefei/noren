import { createGeoSearchRoute } from "@/lib/geo/search-route";
import { requireRoleOnServer } from "@/lib/convex/server";
import { activeRegionConfig } from "@/lib/region/registry";

export const GET = createGeoSearchRoute({
  region: activeRegionConfig(),
  env: process.env,
  fetch: (input, init) => globalThis.fetch(input, init),
  authorize: () => requireRoleOnServer(["creator"]),
});
