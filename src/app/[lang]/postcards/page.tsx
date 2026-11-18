import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RequireRole } from "@/components/layout/require-role";
import { PostcardsContainer } from "@/components/postcard/postcards-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { ROLES } from "@/lib/domain/constants";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

// Dark behind features.postcard in the region file: while it is off there is no page, only a 404.

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/postcards">): Promise<Metadata> {
  if (!getActiveRegion().features.postcard) return {};
  const { lang } = await params;
  return {
    title: `${messagesFor(postcardMessages, isSupportedLocale(lang) ? lang : "en").metaTitle} | Noren`,
  };
}

export default function Page() {
  // Before anything streams, so the response is a real 404 and not an empty 200.
  if (!getActiveRegion().features.postcard) notFound();
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const locale = await getLocale();
  const region = getActiveRegion();
  return (
    <PageContainer locale={locale} title={messagesFor(postcardMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <RequireRole locale={locale} roles={ROLES}>
          <PostcardsContainer
            locale={locale}
            region={{
              defaultLocale: region.defaultLocale,
              nameFallback: region.nameFallback,
              locales: region.locales,
              town: { en: region.name.en ?? region.id, ja: region.name.ja ?? "" },
              utcOffsetHours: region.collection.utcOffsetHours,
            }}
          />
        </RequireRole>
      </PublicQueryBoundary>
    </PageContainer>
  );
}
