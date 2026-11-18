import type { PlaceResult } from "../connector/place";

// What a search engine or an AI crawler reads of one place page before the browser loads anything.
// It is built from the connector's own answer (buildPlace), so the same rules hold: a member's
// story is here only if its writer ticked "Let AI read this story", a found post is a short quote
// with its author and link, and the stitched story carries Noren's AI label.

export type SeoLocale = "en" | "ja";

export type PlaceSeo = {
  name: string;
  title: string;
  description: string;
  /** A page with no story is an open-data listing and nothing else: kept out of search results. */
  indexable: boolean;
  where: string | null;
  stitched: {
    label: string;
    text: string[];
    sources: { link: string; label: string }[];
  } | null;
  memberStories: { writer: string; text: string; language: string }[];
  /** Member stories the page shows that are not in this summary. */
  moreMemberStories: number;
  foundPosts: { quote: string; language: string | null; author: string | null; link: string }[];
  jsonLd: Record<string, unknown>;
};

const MAX_DESCRIPTION = 160;

function clip(text: string, max = MAX_DESCRIPTION): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function placeSeo(
  result: PlaceResult,
  locale: SeoLocale,
  pin: { lat: number; lng: number } | null,
  regionName: string,
): PlaceSeo {
  const { place } = result;
  const name = place.name;
  const neighbourhood = place.neighbourhood?.[locale] ?? null;
  const category = place.category?.[locale] ?? null;
  const where = [category, neighbourhood, regionName].filter(Boolean).join(" · ") || null;

  const stitched =
    result.stitchedStory === null
      ? null
      : {
          label: result.stitchedStory.label[locale],
          text: result.stitchedStory.sentences.map((sentence) => sentence[locale]).filter(Boolean),
          sources: result.stitchedStory.sources.map((source) => ({
            link: source.link,
            label: [source.author, source.platform].filter(Boolean).join(", ") || source.link,
          })),
        };
  const memberStories = result.memberStories.stories.map((story) => ({
    writer: story.writer,
    text: story.text,
    language: story.language,
  }));
  const foundPosts = result.foundPosts.flatMap((post) => {
    if (!("quote" in post) || post.quote === undefined) return [];
    const translated = post.translations?.find((t) => t.language === locale)?.text;
    return [
      {
        quote: translated ?? post.quote,
        language: translated ? locale : (post.quoteLanguage ?? null),
        author: post.author,
        link: post.link,
      },
    ];
  });

  const lead =
    stitched?.text.join(" ") ||
    memberStories.find((story) => story.language === locale)?.text ||
    memberStories[0]?.text ||
    foundPosts[0]?.quote ||
    "";
  const fallback =
    locale === "ja"
      ? `${name}（${[neighbourhood, regionName].filter(Boolean).join("、")}）。訪れた人が語るストーリーを Noren で。`
      : `${name} in ${[neighbourhood, regionName].filter(Boolean).join(", ")}: the stories people who went there have told, on Noren.`;
  const description = clip(lead || fallback);
  const suffix = [neighbourhood, regionName].filter(Boolean).join(", ");
  const title = `${name}${suffix ? ` — ${suffix}` : ""} | Noren`;

  const alternateNames = place.names.map((entry) => entry.value).filter((value) => value !== name);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name,
    ...(alternateNames.length > 0 ? { alternateName: alternateNames } : {}),
    url: place.url,
    description,
    ...(pin === null
      ? {}
      : { geo: { "@type": "GeoCoordinates", latitude: pin.lat, longitude: pin.lng } }),
    containedInPlace: { "@type": "Place", name: suffix || regionName },
    ...(stitched === null || stitched.text.length === 0
      ? {}
      : {
          subjectOf: {
            "@type": "Article",
            headline: name,
            inLanguage: locale,
            articleBody: stitched.text.join(" "),
            creditText: stitched.label,
            publisher: { "@type": "Organization", name: "Noren", url: "https://noren.yooi.me" },
            citation: stitched.sources.map((source) => source.link),
          },
        }),
  };

  return {
    name,
    title,
    description,
    indexable: place.hasStory && place.demo === undefined,
    where,
    stitched,
    memberStories,
    moreMemberStories: result.memberStories.total - memberStories.length,
    foundPosts,
    jsonLd,
  };
}

/** JSON for a `<script type="application/ld+json">`: `<` is escaped so no text can close the tag. */
export function jsonLdText(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
