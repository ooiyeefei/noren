import { Suspense } from "react";
import {
  CreatorErrorBoundary,
  CreatorHomeContainer,
} from "@/components/creator/creator-home-container";
import { RequireRole } from "@/components/layout/require-role";
import { ROLES } from "@/lib/domain/constants";
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
      {/* Any signed-in member may add a missing place and link posts to it (FR-032). */}
      <RequireRole locale={locale} roles={ROLES}>
        <CreatorHomeContainer params={params} locale={locale} region={getActiveRegion()} />
      </RequireRole>
    </CreatorErrorBoundary>
  );
}
