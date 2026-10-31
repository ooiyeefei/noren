import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { ReportsContainer } from "@/components/steward/reports-container";
import { StewardErrorBoundary } from "@/components/steward/steward-home-container";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
async function Content() {
  const locale = await getLocale();
  return (
    <RequireRole locale={locale} roles={["steward"]}>
      <StewardErrorBoundary locale={locale}>
        <Suspense>
          <ReportsContainer locale={locale} region={getActiveRegion()} />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
