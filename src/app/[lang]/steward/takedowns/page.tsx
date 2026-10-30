import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { TakedownsContainer } from "@/components/steward/takedowns-container";
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
          <TakedownsContainer locale={locale} windows={getActiveRegion().takedown} />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
