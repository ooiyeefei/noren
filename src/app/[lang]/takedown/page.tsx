import { Suspense } from "react";
import { FormContainer } from "@/components/takedown/form-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function Page() {
  const locale = await getLocale();
  return (
    <Suspense>
      <PublicQueryBoundary locale={locale}>
        <FormContainer locale={locale} decideDays={getActiveRegion().takedown.decideDays} />
      </PublicQueryBoundary>
    </Suspense>
  );
}
