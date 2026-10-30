import { z } from "zod";
import { geoUserAgent } from "../../src/lib/geo";

export type Snippet = {
  lang: string;
  text: string;
  licence: "CC-BY-SA-4.0";
  sourceUrl: string;
  attribution: string;
  revisionRef: string;
  retrievedAt: number;
};
function checkedLanguage(lang: string) {
  if (!/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(lang)) throw new Error("Invalid Wikipedia language");
  return lang;
}
export function leadUrl(lang: string, title: string): URL {
  const url = new URL(`https://${checkedLanguage(lang)}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extracts|revisions",
    exintro: "1",
    explaintext: "1",
    rvprop: "ids",
    redirects: "1",
    titles: title,
  }).toString();
  return url;
}
export function parseLead(lang: string, json: unknown, retrievedAt: number): Snippet {
  checkedLanguage(lang);
  const response = z
    .object({
      query: z.object({
        pages: z
          .array(
            z.object({
              title: z.string().min(1),
              missing: z.boolean().optional(),
              extract: z.string().optional(),
              revisions: z.array(z.object({ revid: z.number().int().positive() })).optional(),
            }),
          )
          .length(1),
      }),
    })
    .parse(json);
  const page = response.query.pages[0]!;
  if (page.missing || !page.extract?.trim() || !page.revisions?.[0])
    throw new Error("Wikipedia page missing, empty extract or no revision id");
  const text = page.extract.trim();
  if (text.length > 20000)
    throw new Error("Wikipedia lead exceeds importSnippets' 20000 character limit");
  if (!Number.isFinite(retrievedAt)) throw new Error("Invalid retrieval time");
  const revision = page.revisions[0].revid;
  return {
    lang,
    text,
    licence: "CC-BY-SA-4.0",
    sourceUrl: `https://${lang}.wikipedia.org/w/index.php?oldid=${revision}`,
    attribution: `Wikipedia contributors, "${page.title}", ${lang}.wikipedia.org, CC BY-SA 4.0`,
    revisionRef: `oldid:${revision}`,
    retrievedAt,
  };
}
export async function fetchLeads(
  items: readonly { lang: string; title: string }[],
  deps: { fetch: typeof fetch; userAgent: string; sleep(ms: number): Promise<void>; now(): number },
): Promise<Snippet[]> {
  const userAgent = geoUserAgent({ GEO_USER_AGENT: deps.userAgent });
  if (!userAgent)
    throw new Error("Set GEO_USER_AGENT to App/version (+https://public-project-url)");
  const snippets: Snippet[] = [];
  for (const [index, item] of items.entries()) {
    if (index > 0) await deps.sleep(1000);
    const response = await deps.fetch(leadUrl(item.lang, item.title), {
      headers: { "User-Agent": userAgent },
    });
    if (!response.ok) throw new Error(`Wikipedia request failed: HTTP ${response.status}`);
    snippets.push(parseLead(item.lang, await response.json(), deps.now()));
  }
  return snippets;
}
