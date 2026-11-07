import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import {
  StewardErrorBoundary,
  StewardHomeContainer,
} from "@/components/steward/steward-home-container";
import { ShareQueueContainer } from "@/components/share/steward-share-queue";
import { WaitingPhotosContainer } from "@/components/steward/waiting-photos";
import { getLocale } from "@/lib/i18n/server";
import { publicPhotoProps } from "@/lib/photos/settings";
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
  const region = getActiveRegion();
  const photos = publicPhotoProps(region, process.env);
  return (
    <RequireRole locale={locale} roles={["steward"]}>
      <StewardErrorBoundary locale={locale}>
        <Suspense>
          <StewardHomeContainer
            params={params}
            locale={locale}
            region={region}
            shareQueue={<ShareQueueContainer locale={locale} regionId={region.id} />}
            waitingPhotos={
              photos && (
                <WaitingPhotosContainer locale={locale} region={region} baseUrl={photos.baseUrl} />
              )
            }
          />
        </Suspense>
      </StewardErrorBoundary>
    </RequireRole>
  );
}
