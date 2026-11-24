import { Suspense } from "react";
import { FormContainer } from "@/components/takedown/form-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";
import { enabledRegionConfigs } from "@/lib/region/registry";

export default async function Page() {
  const locale = await getLocale();
  const factLabels = Object.fromEntries(
    enabledRegionConfigs().map((region) => [
      region.id,
      Object.fromEntries(
        (region.factVocabulary ?? []).map(({ key, labels }) => [
          key,
          labels[locale] ?? labels.en ?? key,
        ]),
      ),
    ]),
  );
  return (
    <Suspense>
      <PublicQueryBoundary locale={locale}>
        <FormContainer
          locale={locale}
          factLabels={factLabels}
          decideDays={getActiveRegion().takedown.decideDays}
        />
      </PublicQueryBoundary>
    </Suspense>
  );
}
