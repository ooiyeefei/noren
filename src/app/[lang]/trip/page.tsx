import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { TripsContainer } from "@/components/trip/trips-view";
import { requireTripDoor, tripPageRegion } from "@/lib/convex/trip-gate";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { getLocale } from "@/lib/i18n/server";

// Dark behind features.trip in the region file: "off" is a 404 for everyone, "trial" a 404 for
// anyone not on the trial. The trips themselves are on the phone, so nothing here reads them.

// The door is checked for each visitor before anything streams, so a visitor who may not open
// trips gets a real 404. That needs the request, so this page is not prerendered.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[lang]/trip">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `${messagesFor(tripMessages, isSupportedLocale(lang) ? lang : "en").metaTitle} | Noren`,
  };
}

export default async function Page() {
  const locale = await getLocale();
  // Before anything streams, so the response is a real 404 and not an empty 200.
  await requireTripDoor(locale, "/trip");
  return (
    <PageContainer locale={locale} title={messagesFor(tripMessages, locale).listTitle}>
      <TripsContainer locale={locale} region={tripPageRegion()} />
    </PageContainer>
  );
}
