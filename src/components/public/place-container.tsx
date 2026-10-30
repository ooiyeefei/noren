"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/page-container";
import type { Locale } from "@/lib/i18n";
import { PublicQueryBoundary } from "./home-container";
import { PublicLoading } from "./home-view";
import { PlaceView } from "./place-view";
import type { PublicRegionProps } from "./mapping";

type Props = {
  params: Promise<{ lang: string; slug: string }>;
  locale: Locale;
  region: PublicRegionProps;
};
export function PlaceContainer({ params, locale, region }: Props) {
  const { slug } = use(params);
  return (
    <PublicQueryBoundary key={`${locale}/${region.regionId}/${slug}`} locale={locale}>
      <PlaceQuery slug={slug} locale={locale} region={region} />
    </PublicQueryBoundary>
  );
}
function PlaceQuery({ slug, locale, region }: Omit<Props, "params"> & { slug: string }) {
  const place = useQuery(api.places.getBySlug, { regionId: region.regionId, slug });
  const args = place ? { placeId: place._id } : "skip";
  const sources = useQuery(api.sources.listForPlace, args);
  const page = useQuery(api.pages.getPublished, args);
  if (place === undefined)
    return (
      <PageContainer locale={locale}>
        <PublicLoading locale={locale} />
      </PageContainer>
    );
  return <PlaceView locale={locale} region={region} place={place} sources={sources} page={page} />;
}
