import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { publicRegionProps } from "@/components/public/mapping";
import { WalkContainer } from "@/components/walk/walk-container";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { walkMessages } from "@/lib/i18n/messages/walk";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export async function generateMetadata({ params }: PageProps<"/[lang]/walk">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `${messagesFor(walkMessages, isSupportedLocale(lang) ? lang : "en").metaTitle} | Noren`,
  };
}

// Walk mode is dark until the region file switches `features.walk` on: off, the page is a 404 and
// no link to it shows. The check sits before any Suspense boundary so the answer is a real 404.
export default async function Page() {
  const locale = await getLocale();
  const config = getActiveRegion();
  if (!config.features.walk) notFound();
  return (
    <PublicQueryBoundary locale={locale}>
      <WalkContainer
        locale={locale}
        region={publicRegionProps(config, locale)}
        walk={{
          regionName: config.name[locale] ?? config.id,
          neighbourhoods: (config.neighbourhoods ?? []).map(
            ({ id, names, center, radiusMetres }) => ({ id, names, center, radiusMetres }),
          ),
          accuracyAllowanceMetres: config.collection.accuracyAllowanceMetres,
          planner: config.features.planner,
        }}
      />
    </PublicQueryBoundary>
  );
}
