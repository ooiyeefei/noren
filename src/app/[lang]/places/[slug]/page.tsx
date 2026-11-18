import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PlaceContainer } from "@/components/public/place-container";
import { PublicLoading } from "@/components/public/home-view";
import { PlaceSummary } from "@/components/public/place-summary";
import { publicRegionProps } from "@/components/public/mapping";
import { getLocale } from "@/lib/i18n/server";
import { publicPhotoProps } from "@/lib/photos/settings";
import { getActiveRegion } from "@/lib/region";
import { loadPlaceSeo } from "@/lib/seo/place-data";
import { languageAlternates } from "@/lib/seo/site";

// The title, description and addresses a search engine reads. A place nobody has told a story about
// is an open-data listing only, so it asks not to be indexed.
export async function generateMetadata({
  params,
}: PageProps<"/[lang]/places/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  const seo = await loadPlaceSeo(slug, lang);
  if (seo === null) return { robots: { index: false, follow: true } };
  const alternates = languageAlternates(
    getActiveRegion(),
    lang,
    `places/${encodeURIComponent(slug)}`,
  );
  return {
    title: seo.title,
    description: seo.description,
    alternates,
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: alternates.canonical,
      siteName: "Noren",
      type: "article",
      locale: lang,
    },
    ...(seo.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function Page({ params, searchParams }: PageProps<"/[lang]/places/[slug]">) {
  const locale = await getLocale();
  const active = getActiveRegion();
  const region = {
    ...publicRegionProps(active, locale),
    photos: publicPhotoProps(active, process.env) ?? undefined,
  };
  return (
    <Suspense
      fallback={
        <PageContainer locale={locale}>
          <PublicLoading locale={locale} />
        </PageContainer>
      }
    >
      <PlaceContainer
        params={params}
        searchParams={searchParams}
        locale={locale}
        region={region}
        loading={
          <Suspense fallback={<PublicLoading locale={locale} />}>
            <PlaceSummary params={params} locale={locale} />
          </Suspense>
        }
      />
    </Suspense>
  );
}
