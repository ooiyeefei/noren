"use client";

import { use } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/page-container";
import type { AddStoryActions } from "@/components/place/add-story";
import type { PlaceCheckActions } from "@/components/place/place-check";
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
  const { isLoading, isAuthenticated } = useConvexAuth();
  const confirm = useMutation(api.checks.confirm);
  const report = useMutation(api.checks.report);
  const addSource = useMutation(api.sources.add);
  if (place === undefined)
    return (
      <PageContainer locale={locale}>
        <PublicLoading locale={locale} />
      </PageContainer>
    );
  const checks: PlaceCheckActions | undefined = place
    ? {
        signedIn: isLoading ? undefined : isAuthenticated,
        confirm: () => confirm({ placeId: place._id }),
        report: (problem, note) => report({ placeId: place._id, problem, note: note || undefined }),
      }
    : undefined;
  const story: AddStoryActions | undefined = place
    ? {
        signedIn: isLoading ? undefined : isAuthenticated,
        add: (args) => addSource({ ...args, placeId: place._id }),
      }
    : undefined;
  return (
    <PlaceView
      locale={locale}
      region={region}
      place={place}
      sources={sources}
      page={page}
      checks={checks}
      story={story}
    />
  );
}
