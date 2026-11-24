import { Suspense } from "react";
import { HomeContainer } from "@/components/public/home-container";
import { PublicLoading } from "@/components/public/home-view";
import { publicRegionProps } from "@/components/public/mapping";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";
import { enabledRegionConfigs } from "@/lib/region/registry";

export default async function Page() {
  const locale = await getLocale();
  const active = getActiveRegion();
  const region = publicRegionProps(active, locale);
  // Every region that is on: search covers them all, and each place is named by its own region.
  const regions = Object.fromEntries(
    [active, ...enabledRegionConfigs()].map((config) => [
      config.id,
      publicRegionProps(config, locale),
    ]),
  );
  return (
    <main id="main" tabIndex={-1} data-full-bleed="">
      <Suspense fallback={<PublicLoading locale={locale} />}>
        <HomeContainer locale={locale} region={region} regions={regions} />
      </Suspense>
    </main>
  );
}
