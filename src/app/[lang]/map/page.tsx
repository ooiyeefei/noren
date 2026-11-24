import { Suspense } from "react";
import { HomeContainer } from "@/components/public/home-container";
import { PublicLoading } from "@/components/public/home-view";
import { publicRegionProps } from "@/components/public/mapping";
import { parseMapStart } from "@/lib/region/start";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";
import { enabledRegionConfigs } from "@/lib/region/registry";

export default async function Page({ searchParams }: PageProps<"/[lang]/map">) {
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
  // A place page's "Map" link opens the map at that place; a bad value is ignored.
  const start =
    parseMapStart(
      (await searchParams).at,
      Object.values(regions).map((entry) => entry.bounds),
    ) ?? undefined;
  return (
    <main id="main" tabIndex={-1} data-full-bleed="">
      <Suspense fallback={<PublicLoading locale={locale} />}>
        <HomeContainer locale={locale} region={region} regions={regions} start={start} />
      </Suspense>
    </main>
  );
}
