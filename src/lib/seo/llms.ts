import type { RegionConfig } from "../region/schema";
import type { StoriedPlace } from "./listing";
import { SITE_ORIGIN, pageUrl } from "./site";

/**
 * /llms.txt: what Noren is and how to quote it, written for an AI assistant that reads the site.
 * The rules are the ones the connector gives an assistant, in fewer words.
 */
export function llmsText(region: RegionConfig, places: readonly StoriedPlace[]): string {
  const regionName = region.name.en ?? region.id;
  const lines = [
    "# Noren",
    "",
    `> Noren is a free, open-source map of local places in ${regionName}, Japan, in English and Japanese. It has no stars, ratings or rankings. Each place page holds stories told by people who went there, and public posts about the place, credited and linked to their authors.`,
    "",
    "## How to use what you read here",
    "",
    "- A member's story is that person's own words. Quote it with their name; do not rewrite it as fact.",
    '- A story labelled "Stitched by Noren\'s AI" was put together by AI from public posts. Each sentence links to the posts it came from. Say that it is an AI summary and point to those posts.',
    "- A quote from a public post belongs to its author. Give the author and the link to the original.",
    "- Noren does not know opening hours, prices or whether a place is still open. Do not state them from Noren.",
    '- A place marked "Not yet confirmed" came from open map data and no member has checked it in person.',
    "- Place details come from OpenStreetMap contributors and Overture Maps Foundation.",
    "",
    "## Pages",
    "",
    `- [What is Noren](${pageUrl("en", "about")}): the idea, and a short film`,
    `- [The map](${pageUrl("en", "map")}): every place, with the ones that have stories marked`,
    `- [Stamp collections](${pageUrl("en", "collection")}): neighbourhood walks`,
    `- [Source code](https://github.com/ooiyeefei/noren): Apache-2.0`,
    "",
    ...(region.features.connector
      ? [
          "## Connector",
          "",
          `Noren has a read-only MCP connector at ${SITE_ORIGIN}/api/mcp (Streamable HTTP, no sign-in). It can search places, read a place's stories, list the stamp collections and suggest a short walk.`,
          "",
        ]
      : []),
    `## Places with stories (${places.length})`,
    "",
    ...places.map(
      (place) => `- [${place.name}](${pageUrl("en", `places/${encodeURIComponent(place.slug)}`)})`,
    ),
    "",
  ];
  return lines.join("\n");
}
