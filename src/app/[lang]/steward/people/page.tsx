import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { PeopleContainer } from "@/components/steward/people-container";
import { StewardErrorBoundary } from "@/components/steward/steward-home-container";
import { getLocale } from "@/lib/i18n/server";
export default function Page({ params }: { params: Promise<{ lang: string }> }) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
async function Content({ params }: { params: Promise<{ lang: string }> }) {
  const locale = await getLocale();
  return (
    <RequireRole locale={locale} roles={["steward"]}>
      <StewardErrorBoundary locale={locale}>
        <Suspense>
          <PeopleContainer params={params} locale={locale} />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
