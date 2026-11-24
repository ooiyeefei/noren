import { fetchQuery } from "convex/nextjs";
import { connection } from "next/server";
import { cache } from "react";
import { api } from "../../../convex/_generated/api";
import { convexConnectorData } from "../connector/convex-data";
import { guarded } from "../connector/guarded";
import { buildPlace } from "../connector/place";
import { CONNECTOR_DEFAULTS } from "../connector/policy";
import { getRegion } from "../region";
import { placeSeo, type PlaceSeo, type SeoLocale } from "./place";
import { SITE_ORIGIN } from "./site";

/**
 * One place's summary for the page's `<head>` and its first HTML, read from Convex as a signed-out
 * visitor and never cached beyond the request, so a story its writer removed is gone from the next
 * response. `cache` shares the read between generateMetadata and the page. Null when there is no
 * such public place, or when Convex could not be reached: the page then loads as it always has.
 */
export const loadPlaceSeo = cache(
  async (slug: string, locale: string): Promise<PlaceSeo | null> => {
    const language: SeoLocale = locale === "ja" ? "ja" : "en";
    // Always read at request time: the Convex client may not run while a page is prerendered.
    // Outside the try, so the prerender's own stop signal reaches React instead of being logged.
    await connection();
    try {
      // The place is found by its slug alone; its own region then gives the area's settings.
      const place = await guarded(fetchQuery(api.places.bySlug, { slug }));
      if (place === null) return null;
      const region = getRegion(place.regionId);
      if (region === undefined) return null;
      const data = convexConnectorData(region.id);
      const bundle = await data.placeBundle(slug);
      if (bundle === null) return null;
      const result = buildPlace(
        bundle,
        { data, region, origin: SITE_ORIGIN, options: CONNECTOR_DEFAULTS, now: Date.now },
        language,
      );
      return placeSeo(result, language, bundle.place.pin, region.name[language] ?? region.id);
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn(`place summary for "${slug}" not built (${reason || "no message"})`);
      return null;
    }
  },
);
