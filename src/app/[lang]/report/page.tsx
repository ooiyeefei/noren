import { Suspense } from "react";
import { ReportContainer } from "@/components/report/report-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { getLocale } from "@/lib/i18n/server";

export default async function Page() {
  const locale = await getLocale();
  return (
    <Suspense>
      <PublicQueryBoundary locale={locale}>
        <ReportContainer locale={locale} />
      </PublicQueryBoundary>
    </Suspense>
  );
}
