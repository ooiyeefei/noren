import { Suspense, type ComponentProps } from "react";
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
  return (
    <main id="main" tabIndex={-1} data-full-bleed="">
      <Suspense fallback={<PublicLoading locale={locale} />}>
        <MapAtStart
          locale={locale}
          region={region}
          regions={regions}
          searchParams={searchParams}
        />
      </Suspense>
    </main>
  );
}

/**
 * A place page's "Map" link opens the map at that place (`?at=lat,lng`); a bad value is ignored.
 * The query is read inside the Suspense boundary, so the page's shell is still prerendered.
 */
async function MapAtStart({
  searchParams,
  ...props
}: Omit<ComponentProps<typeof HomeContainer>, "start"> & {
  searchParams: PageProps<"/[lang]/map">["searchParams"];
}) {
  const start =
    parseMapStart(
      (await searchParams).at,
      Object.values(props.regions ?? {}).map((entry) => entry.bounds),
    ) ?? undefined;
  return <HomeContainer {...props} start={start} />;
}
