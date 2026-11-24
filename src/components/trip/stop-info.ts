import type { FunctionReturnType } from "convex/server";
import { categoryLabel, displayName } from "@/lib/connector/present";
import type { Locale } from "@/lib/i18n";
import type { PlannerQuote } from "@/lib/planner/reply";
import { getRegionConfig } from "@/lib/region/registry";
import type { api } from "../../../convex/_generated/api";
import { slugWords, type RestsOnDetail, type StopInfo } from "./stop-card";

/** One row of `api.trips.stops`, as the server reads it afresh each time a plan is opened. */
export type StopRow = NonNullable<FunctionReturnType<typeof api.trips.stops>[number]>;

/** The server's quote as the planner's quote view takes it: somebody's words, with their source. */
function quoteOf(quote: StopRow["quotes"][number], slug: string, placeName: string): PlannerQuote {
  const shared = {
    slug,
    placeName,
    text: quote.text,
    translations: [],
    sources: [],
    aiAssisted: false,
    demo: false,
  };
  if (quote.kind === "story") {
    return {
      ...shared,
      id: `story-${quote.storyId}`,
      kind: "story",
      language: quote.lang,
      by: quote.authorName,
    };
  }
  return {
    ...shared,
    id: `post-${quote.source._id}`,
    kind: "found",
    ...(quote.lang !== undefined && { language: quote.lang }),
    ...(quote.source.authorHandle !== undefined && { by: quote.source.authorHandle }),
    link: quote.source.url,
    platform: quote.source.platform,
  };
}

/** What a met check rests on, by fact id: the member who reported it, or the visitor's own words. */
export function restsOf(facts: StopRow["facts"]): Record<string, RestsOnDetail> {
  return Object.fromEntries(
    facts.map((fact): [string, RestsOnDetail] =>
      fact.basis === "member"
        ? [fact.factId, { kind: "member", name: fact.reporterName, day: fact.day }]
        : [
            fact.factId,
            {
              kind: "post",
              quote: fact.quote,
              platform: fact.source.platform,
              link: fact.source.url,
              day: fact.day,
            },
          ],
    ),
  );
}

/** The present public details of one stop's place. Nothing here is written to the device. */
export function stopInfoFrom(row: StopRow, regionId: string, locale: Locale): StopInfo {
  const region = getRegionConfig(regionId);
  const name =
    (region
      ? displayName({ names: row.names } as Parameters<typeof displayName>[0], region)
      : row.names[0]?.value) || slugWords(row.slug);
  return {
    name,
    category: region ? categoryLabel(region, row.category)?.[locale] : undefined,
    slug: row.slug,
    pin: row.pin,
    confirmed: row.confirmed,
    quotes: row.quotes.map((quote) => quoteOf(quote, row.slug, name)),
    rests: restsOf(row.facts),
  };
}
