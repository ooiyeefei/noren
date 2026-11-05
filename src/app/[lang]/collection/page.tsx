import { Suspense } from "react";
import { BookContainer } from "@/components/collection/book-container";
import { PageContainer } from "@/components/layout/page-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { publicRegionProps } from "@/components/public/mapping";
import { messagesFor } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
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
  const region = getActiveRegion();
  return (
    <PageContainer locale={locale} title={messagesFor(collectionMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <BookContainer
          locale={locale}
          region={publicRegionProps(region, locale)}
          panelsPerSet={region.collection.panelsPerSet}
        />
      </PublicQueryBoundary>
    </PageContainer>
  );
}
