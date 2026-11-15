import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { ProblemsContainer } from "@/components/steward/problems-container";
import { StewardErrorBoundary } from "@/components/steward/steward-home-container";
import { getLocale } from "@/lib/i18n/server";

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
          <ProblemsContainer locale={locale} />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
