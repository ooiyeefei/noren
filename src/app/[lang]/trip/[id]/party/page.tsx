import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { PartyContainer } from "@/components/trip/party-container";
import { requireTripDoor, tripPageRegion } from "@/lib/convex/trip-gate";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { getLocale } from "@/lib/i18n/server";

// The door is checked for each visitor before anything streams, so a visitor who may not open
// trips gets a real 404. That needs the request, so this page is not prerendered.
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/trip/[id]/party">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `${messagesFor(tripMessages, isSupportedLocale(lang) ? lang : "en").partyTitle} | Noren`,
  };
}

export default async function Page({ params }: PageProps<"/[lang]/trip/[id]/party">) {
  const [locale, { id }] = await Promise.all([getLocale(), params]);
  await requireTripDoor(locale, `/trip/${encodeURIComponent(id)}/party`);
  return (
    <PageContainer locale={locale} title={messagesFor(tripMessages, locale).partyTitle}>
      <PartyContainer locale={locale} region={tripPageRegion()} id={id} />
    </PageContainer>
  );
}
