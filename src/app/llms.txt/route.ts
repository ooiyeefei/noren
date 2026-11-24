import { connection } from "next/server";
import { enabledRegionConfigs, homeRegionConfig } from "@/lib/region/registry";
import { storiedPlaces, type StoriedPlace } from "@/lib/seo/listing";
import { llmsText } from "@/lib/seo/llms";
import { searchOpen } from "@/lib/seo/site";

// A plain-text guide for AI assistants. A 404 until the region's launch pack is complete.
export async function GET(): Promise<Response> {
  await connection();
  const region = homeRegionConfig();
  const regions = enabledRegionConfigs();
  if (!searchOpen(region)) return new Response("Not found", { status: 404 });
  let places: StoriedPlace[] = [];
  try {
    places = await storiedPlaces(regions);
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn(`llms.txt: places not read (${reason || "no message"})`);
  }
  return new Response(llmsText(region, places, regions), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
