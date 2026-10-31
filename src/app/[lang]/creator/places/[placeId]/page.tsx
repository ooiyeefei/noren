import { Suspense } from "react";
import { CreatorErrorBoundary } from "@/components/creator/creator-home-container";
import { PlaceEditorContainer } from "@/components/creator/place-editor-container";
import { RequireRole } from "@/components/layout/require-role";
import { ROLES } from "@/lib/domain/constants";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default function Page({ params }: { params: Promise<{ lang: string; placeId: string }> }) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}
async function Content({ params }: { params: Promise<{ lang: string; placeId: string }> }) {
  const locale = await getLocale();
  return (
    <CreatorErrorBoundary locale={locale}>
      {/* Any signed-in member may add a missing place and link posts to it (FR-032). */}
      <RequireRole locale={locale} roles={ROLES}>
        <PlaceEditorContainer params={params} locale={locale} region={getActiveRegion()} />
      </RequireRole>
    </CreatorErrorBoundary>
  );
}
