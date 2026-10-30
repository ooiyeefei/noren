import { Suspense } from "react";
import { StatusContainer } from "@/components/takedown/status-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { getLocale } from "@/lib/i18n/server";

export default async function Page() {
  const locale = await getLocale();
  return (
    <Suspense>
      <PublicQueryBoundary locale={locale}>
        <StatusContainer locale={locale} />
      </PublicQueryBoundary>
    </Suspense>
  );
}
