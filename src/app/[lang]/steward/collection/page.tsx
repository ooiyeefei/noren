import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { CollectionAdmin } from "@/components/steward/collection-admin";
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
          <CollectionAdmin locale={locale} region={getActiveRegion()} />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
