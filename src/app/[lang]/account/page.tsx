import { Suspense } from "react";
import { AccountContainer } from "@/components/account/account-container";
import { PageContainer } from "@/components/layout/page-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { messagesFor } from "@/lib/i18n";
import { accountMessages } from "@/lib/i18n/messages/account";
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
    <PageContainer locale={locale} title={messagesFor(accountMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <AccountContainer locale={locale} />
      </PublicQueryBoundary>
    </PageContainer>
  );
}
