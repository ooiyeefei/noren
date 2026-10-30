import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { PlaceAdminContainer } from "@/components/steward/place-admin-container";
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
    <RequireRole locale={locale} roles={["steward"]}>
      <Suspense>
        <PlaceAdminContainer params={params} locale={locale} region={getActiveRegion()} />
      </Suspense>
    </RequireRole>
  );
}
