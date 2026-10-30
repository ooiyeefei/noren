import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RequireRole } from "@/components/layout/require-role";
import { OwnerLoading } from "@/components/owner/owner-home-view";
import { OwnerPlaceContainer } from "@/components/owner/owner-place-container";
import { toOwnerRegion } from "@/components/owner/review";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; placeId: string }>;
}) {
  const locale = await getLocale();
  return (
    <PageContainer locale={locale}>
      <RequireRole locale={locale} roles={["business_owner"]}>
        <Suspense fallback={<OwnerLoading locale={locale} />}>
          <OwnerPlaceContainer
            params={params}
            locale={locale}
            region={toOwnerRegion(getActiveRegion())}
          />
        </Suspense>
      </RequireRole>
    </PageContainer>
  );
}
