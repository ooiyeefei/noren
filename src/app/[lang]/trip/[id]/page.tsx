import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { PlanContainer } from "@/components/trip/plan-container";
import { requireTripDoor, tripPageRegion } from "@/lib/convex/trip-gate";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { getLocale } from "@/lib/i18n/server";

// The page awaits the gate outside Suspense; the production build refuses that unless this is false.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/trip/[id]">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `${messagesFor(tripMessages, isSupportedLocale(lang) ? lang : "en").planTitle} | Noren`,
  };
}

export default async function Page({ params }: PageProps<"/[lang]/trip/[id]">) {
  const [locale, { id }] = await Promise.all([getLocale(), params]);
  await requireTripDoor(locale, `/trip/${encodeURIComponent(id)}`);
  return (
    <PageContainer locale={locale} title={messagesFor(tripMessages, locale).planTitle}>
      <PlanContainer locale={locale} region={tripPageRegion()} id={id} />
    </PageContainer>
  );
}
