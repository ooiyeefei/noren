"use client";

import { use } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import { PageContainer } from "@/components/layout/page-container";
import { PublicQueryBoundary } from "@/components/public/home-container";
import { PublicLoading } from "@/components/public/home-view";
import type { PublicRegionProps } from "@/components/public/mapping";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { SetView } from "./set-view";

type Props = {
  params: Promise<{ lang: string; neighbourhood: string }>;
  locale: Locale;
  region: PublicRegionProps;
};

export function SetContainer({ params, locale, region }: Props) {
  const { neighbourhood } = use(params);
  return (
    <PublicQueryBoundary key={`${locale}/${neighbourhood}`} locale={locale}>
      <SetQuery neighbourhood={neighbourhood} locale={locale} region={region} />
    </PublicQueryBoundary>
  );
}

function SetQuery({
  neighbourhood,
  locale,
  region,
}: Omit<Props, "params"> & { neighbourhood: string }) {
  const m = messagesFor(collectionMessages, locale);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const set = useQuery(api.collection.set, {
    regionId: region.regionId,
    neighbourhoodId: neighbourhood,
  });
  if (set === undefined)
    return (
      <PageContainer locale={locale}>
        <PublicLoading locale={locale} />
      </PageContainer>
    );
  if (set === null)
    return (
      <PageContainer locale={locale} title={m.notFoundTitle}>
        <p>{m.notFoundBody}</p>
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/collection")}
        >
          {m.backToBook}
        </a>
      </PageContainer>
    );
  return (
    <PageContainer locale={locale} title={neighbourhoodName(set.names, locale)}>
      <SetView
        locale={locale}
        region={region}
        set={set}
        signedIn={isLoading ? undefined : isAuthenticated}
      />
    </PageContainer>
  );
}
