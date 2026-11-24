import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { SharedView } from "@/components/trip/shared-view";
import { requireSharedTripDoor, sharedTripRegion } from "@/lib/convex/trip-gate";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { tripSharedMessages } from "@/lib/i18n/messages/trip-shared";
import { getLocale } from "@/lib/i18n/server";
import { isPostcardCode } from "@/lib/postcard/rules";
import { api } from "../../../../../../convex/_generated/api";

// A private link: whoever holds the code may read the plan, with no account. Dark behind
// features.trip ("off" is a real 404). The address is the key, so nothing here is for a search engine
// (next.config.ts, PRIVATE_SECTIONS, and this tag), and the referrer is not sent to other sites.

// The production build refuses a page that awaits its gate outside Suspense without this line.
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/trip/shared/[code]">): Promise<Metadata> {
  const { lang } = await params;
  const locale = isSupportedLocale(lang) ? lang : "en";
  return {
    robots: { index: false, follow: false },
    referrer: "same-origin",
    title: `${messagesFor(tripSharedMessages, locale).metaTitle} | Noren`,
  };
}

export default function Page({ params }: PageProps<"/[lang]/trip/shared/[code]">) {
  // Before anything streams, so the response is a real 404 and not an empty 200.
  requireSharedTripDoor();
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/[lang]/trip/shared/[code]">["params"] }) {
  const locale = await getLocale();
  const { code } = await params;
  if (!isPostcardCode(code)) notFound();
  await connection();
  let trip = null;
  try {
    trip = await fetchQuery(api.tripShare.read, { code });
  } catch (error) {
    console.warn(`shared trip not read (${error instanceof Error ? error.name : typeof error})`);
  }
  if (trip === null) notFound();
  const m = messagesFor(tripSharedMessages, locale);
  return (
    <PageContainer locale={locale} title={trip.title.trim() || m.untitled}>
      <SharedView locale={locale} trip={trip} region={sharedTripRegion(trip.regionId)} />
    </PageContainer>
  );
}
