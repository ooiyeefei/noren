import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PlaceContainer } from "@/components/public/place-container";
import { PublicLoading } from "@/components/public/home-view";
import { publicRegionProps } from "@/components/public/mapping";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function Page({ params }: PageProps<"/[lang]/places/[slug]">) {
  const locale = await getLocale();
  const region = publicRegionProps(getActiveRegion(), locale);
  return (
    <Suspense
      fallback={
        <PageContainer locale={locale}>
          <PublicLoading locale={locale} />
        </PageContainer>
      }
    >
      <PlaceContainer params={params} locale={locale} region={region} />
    </Suspense>
  );
}
