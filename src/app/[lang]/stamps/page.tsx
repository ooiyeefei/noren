import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RequireRole } from "@/components/layout/require-role";
import { publicRegionProps } from "@/components/public/mapping";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { StampsContainer } from "@/components/stamps/stamps-container";
import { ROLES } from "@/lib/domain/constants";
import { messagesFor } from "@/lib/i18n";
import { stampMessages } from "@/lib/i18n/messages/stamps";
import { getLocale } from "@/lib/i18n/server";
import { publicPhotoProps } from "@/lib/photos/settings";
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
  const active = getActiveRegion();
  const { defaultLocale, nameFallback, styleUrl, attribution, center } = publicRegionProps(
    active,
    locale,
  );
  return (
    <PageContainer locale={locale} title={messagesFor(stampMessages, locale).title}>
      <PublicQueryBoundary locale={locale} insideMain>
        <RequireRole locale={locale} roles={ROLES}>
          <StampsContainer
            locale={locale}
            region={{
              defaultLocale,
              nameFallback,
              names: active.name,
              styleUrl,
              attribution,
              center,
              photoBaseUrl: publicPhotoProps(active, process.env)?.baseUrl,
            }}
          />
        </RequireRole>
      </PublicQueryBoundary>
    </PageContainer>
  );
}
