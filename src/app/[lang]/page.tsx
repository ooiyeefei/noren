import { Suspense } from "react";
import { HomeContainer } from "@/components/public/home-container";
import { PublicLoading } from "@/components/public/home-view";
import { publicRegionProps } from "@/components/public/mapping";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function Page() {
  const locale = await getLocale();
  const region = publicRegionProps(getActiveRegion(), locale);
  return (
    <main id="main" tabIndex={-1}>
      <Suspense fallback={<PublicLoading locale={locale} />}>
        <HomeContainer locale={locale} region={region} />
      </Suspense>
    </main>
  );
}
