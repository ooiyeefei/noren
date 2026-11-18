import type { MetadataRoute } from "next";
import { activeRegionConfig } from "@/lib/region/registry";
import { robotsFile } from "@/lib/seo/site";

// Hidden from every crawler until the region's launch pack is complete (FR-021). After that,
// public pages are open and the signed-in sections stay out.
export default function robots(): MetadataRoute.Robots {
  return robotsFile(activeRegionConfig());
}
