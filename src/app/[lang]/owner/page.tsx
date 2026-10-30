import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RequireRole } from "@/components/layout/require-role";
import { OwnerHomeContainer } from "@/components/owner/owner-home-container";
import { OwnerLoading } from "@/components/owner/owner-home-view";
import { toOwnerRegion } from "@/components/owner/review";
import { messagesFor } from "@/lib/i18n";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function Page() {
  const locale = await getLocale();
  return (
    <PageContainer locale={locale} title={messagesFor(ownerMessages, locale).homeTitle}>
      <RequireRole locale={locale} roles={["business_owner"]}>
        <Suspense fallback={<OwnerLoading locale={locale} />}>
          <OwnerHomeContainer locale={locale} region={toOwnerRegion(getActiveRegion())} />
        </Suspense>
      </RequireRole>
    </PageContainer>
  );
}
