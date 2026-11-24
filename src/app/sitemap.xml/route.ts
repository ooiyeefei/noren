import { connection } from "next/server";
import { enabledRegionConfigs, homeRegionConfig } from "@/lib/region/registry";
import { storiedPlaces } from "@/lib/seo/listing";
import { PUBLIC_PAGES, searchOpen, sitemapXml } from "@/lib/seo/site";

// The pages a search engine should know about: the public pages and every place with a story, once
// per language. A 404 until the region's launch pack is complete, like the rest of the hiding.
export async function GET(): Promise<Response> {
  await connection();
  const region = homeRegionConfig();
  const regions = enabledRegionConfigs();
  if (!searchOpen(region)) return new Response("Not found", { status: 404 });
  let places: { slug: string }[] = [];
  try {
    places = await storiedPlaces(regions);
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`sitemap: places not read (${reason || "no message"})`);
    // Without the places the sitemap would tell crawlers they are gone. Ask them to come back.
    return new Response("Temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "600" },
    });
  }
  const paths = [
    ...PUBLIC_PAGES,
    ...places.map((place) => `places/${encodeURIComponent(place.slug)}`),
  ];
  return new Response(sitemapXml(region, paths), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
