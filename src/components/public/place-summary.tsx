import { jsonLdText } from "@/lib/seo/place";
import { loadPlaceSeo } from "@/lib/seo/place-data";
import type { Locale } from "@/lib/i18n";
import { PublicLoading } from "./home-view";

const WORDS = {
  en: {
    sources: "Posts this story was stitched from",
    members: "Stories from people who went",
    found: "What people have posted",
    more: (count: number) =>
      `${count} more ${count === 1 ? "story" : "stories"} from members on this page.`,
  },
  ja: {
    sources: "このストーリーのもとになった投稿",
    members: "訪れた人のストーリー",
    found: "みんなの投稿から",
    more: (count: number) => `このページには、ほかに${count}件のメンバーのストーリーがあります。`,
  },
} as const;

/**
 * The place page as plain HTML, sent by the server and shown until the live page has loaded in the
 * browser. A search engine or an AI crawler that runs no JavaScript reads this; a visitor sees it
 * for a moment instead of "Loading". It shows nothing the live page does not show.
 */
export async function PlaceSummary({
  params,
  locale,
}: {
  params: Promise<{ slug: string }>;
  locale: Locale;
}) {
  const { slug } = await params;
  const seo = await loadPlaceSeo(slug, locale);
  if (seo === null) return <PublicLoading locale={locale} />;
  const words = WORDS[locale === "ja" ? "ja" : "en"];
  return (
    <article lang={locale} className="max-w-[720px] space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(seo.jsonLd) }}
      />
      <header className="space-y-2">
        <h1 className="font-display text-[28px] font-bold break-words lg:text-4xl">{seo.name}</h1>
        {seo.where && <p className="text-sm">{seo.where}</p>}
      </header>
      {seo.stitched && seo.stitched.text.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm font-bold">{seo.stitched.label}</p>
          <p className="leading-relaxed">{seo.stitched.text.join(" ")}</p>
          {seo.stitched.sources.length > 0 && (
            <>
              <h2 className="text-sm font-bold">{words.sources}</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {seo.stitched.sources.map((source, index) => (
                  <li key={`${source.link}-${index}`}>
                    <a href={source.link} rel="nofollow noopener" className="underline">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
      {seo.memberStories.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{words.members}</h2>
          {seo.memberStories.map((story, index) => (
            <blockquote key={index} lang={story.language} className="space-y-1 border-l-4 pl-4">
              <p className="leading-relaxed whitespace-pre-line">{story.text}</p>
              <footer className="text-sm">— {story.writer}</footer>
            </blockquote>
          ))}
        </section>
      )}
      {seo.moreMemberStories > 0 && <p className="text-sm">{words.more(seo.moreMemberStories)}</p>}
      {seo.foundPosts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{words.found}</h2>
          {seo.foundPosts.map((post, index) => (
            <blockquote
              key={`${post.link}-${index}`}
              lang={post.language ?? undefined}
              className="space-y-1 border-l-4 pl-4"
            >
              <p className="leading-relaxed">{post.quote}</p>
              <footer className="text-sm">
                <a href={post.link} rel="nofollow noopener" className="underline">
                  {post.author ?? post.link}
                </a>
              </footer>
            </blockquote>
          ))}
        </section>
      )}
    </article>
  );
}
