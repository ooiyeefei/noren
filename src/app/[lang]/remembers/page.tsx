import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RemembersContainer } from "@/components/memory/remembers-container";
import { PageContainer } from "@/components/layout/page-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { remembersMessages } from "@/lib/i18n/messages/remembers";
import { getLocale } from "@/lib/i18n/server";
import { checkableTags } from "@/lib/planner/checkable";
import { getActiveRegion } from "@/lib/region";

// Dark behind features.planner in the region file: while it is off there is no page, only a 404.

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/remembers">): Promise<Metadata> {
  if (!getActiveRegion().features.planner) return {};
  const { lang } = await params;
  return {
    title: `${messagesFor(remembersMessages, isSupportedLocale(lang) ? lang : "en").metaTitle} | Noren`,
  };
}

export default function Page() {
  // Before anything streams, so the response is a real 404 and not an empty 200.
  if (!getActiveRegion().features.planner) notFound();
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
    <PageContainer locale={locale} title={messagesFor(remembersMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <RemembersContainer locale={locale} checkable={checkableTags(region)} />
      </PublicQueryBoundary>
    </PageContainer>
  );
}
