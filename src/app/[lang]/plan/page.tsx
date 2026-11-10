import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PlanContainer } from "@/components/planner/plan-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { plannerMessages } from "@/lib/i18n/messages/planner";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

// Dark behind features.planner in the region file: while it is off there is no page, only a 404.

export async function generateMetadata({ params }: PageProps<"/[lang]/plan">): Promise<Metadata> {
  if (!getActiveRegion().features.planner) return {};
  const { lang } = await params;
  return {
    title: `${messagesFor(plannerMessages, isSupportedLocale(lang) ? lang : "en").metaTitle} | Noren`,
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
    <PageContainer locale={locale} title={messagesFor(plannerMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <PlanContainer
          locale={locale}
          regionId={region.id}
          neighbourhoods={region.neighbourhoods ?? []}
          nameRegion={{ nameFallback: region.nameFallback, defaultLocale: region.defaultLocale }}
        />
      </PublicQueryBoundary>
    </PageContainer>
  );
}
