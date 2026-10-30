import { Suspense } from "react";
import {
  CreatorErrorBoundary,
  CreatorHomeContainer,
} from "@/components/creator/creator-home-container";
import { RequireRole } from "@/components/layout/require-role";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

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
    <CreatorErrorBoundary locale={locale}>
      <RequireRole locale={locale} roles={["creator"]}>
        <CreatorHomeContainer params={params} locale={locale} region={getActiveRegion()} />
      </RequireRole>
    </CreatorErrorBoundary>
  );
}
