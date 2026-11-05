"use client";

import { use, useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/page-container";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AddStoryActions } from "@/components/place/add-story";
import type { StoryFeedActions } from "@/components/place/story-feed";
import type { PlaceCheckActions } from "@/components/place/place-check";
import type { Locale } from "@/lib/i18n";
import { PublicQueryBoundary } from "./home-container";
import { PublicLoading } from "./home-view";
import { readLocation } from "@/lib/collection/location";
import { PlaceView, pressedAfter, type PlaceCollection, type PressedFrom } from "./place-view";
import { useToday } from "./use-today";
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
  const stories = useQuery(api.stories.listForPlace, args);
  const placeStory = useQuery(api.placeStories.forPlace, args);
  const page = useQuery(api.pages.getPublished, args);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const today = useToday();
  const mission = useQuery(
    api.missions.forPlace,
    place && today !== null ? { placeId: place._id, now: today } : "skip",
  );
  const stamp = useQuery(
    api.stampBook.forPlace,
    place && isAuthenticated ? { placeId: place._id } : "skip",
  );
  const spot = useQuery(api.collection.forPlace, args);
  const set = useQuery(
    api.collection.set,
    spot ? { regionId: region.regionId, neighbourhoodId: spot.neighbourhoodId } : "skip",
  );
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const [pressedFrom, setPressedFrom] = useState<PressedFrom>(null);
  // Said before the work is done, so the stamp arrives already pressing rather than flashing first.
  const pressing = async <T,>(from: NonNullable<PressedFrom>, work: () => Promise<T>) => {
    setPressedFrom((current) => pressedAfter(current, from));
    try {
      return await work();
    } catch (error) {
      setPressedFrom((current) => (from === "checkIn" ? null : pressedAfter(current, null)));
      throw error;
    }
  };
  const confirm = useMutation(api.checks.confirm);
  const report = useMutation(api.checks.report);
  const checkIn = useMutation(api.collection.checkIn);
  const addSource = useMutation(api.sources.add);
  const removeSource = useMutation(api.sources.remove);
  const writeStory = useMutation(api.stories.add);
  const removeStory = useMutation(api.stories.remove);
  const previewLink = useAction(api.linkRead.previewLink);
  const draftNote = useAction(api.linkRead.draftNote);
  if (place === undefined)
    return (
      <PageContainer locale={locale}>
        <PublicLoading locale={locale} />
      </PageContainer>
    );
  const checks: PlaceCheckActions | undefined = place
    ? {
        signedIn: isLoading ? undefined : isAuthenticated,
        confirm: () => pressing("check", () => confirm({ placeId: place._id })),
        report: (problem, note) => report({ placeId: place._id, problem, note: note || undefined }),
      }
    : undefined;
  const story: (AddStoryActions & StoryFeedActions) | undefined = place
    ? {
        signedIn: isLoading ? undefined : isAuthenticated,
        add: (args) => pressing("story", () => addSource({ ...args, placeId: place._id })),
        write: (args) => pressing("story", () => writeStory({ ...args, placeId: place._id })),
        preview: (url) => previewLink({ placeId: place._id, url }),
        draftNote: (args) => draftNote({ ...args, placeId: place._id, mine: true }),
        remove: ({ kind, id }) =>
          kind === "written"
            ? removeStory({ storyId: id as Id<"story"> })
            : removeSource({ sourceId: id as Id<"source"> }),
      }
    : undefined;
  const collection: PlaceCollection | undefined =
    place && spot
      ? {
          spot,
          set,
          displayName: person?.displayName,
          actions: {
            signedIn: isLoading ? undefined : isAuthenticated,
            locate: () => readLocation(navigator.geolocation),
            checkIn: () => pressing("checkIn", () => checkIn({ placeId: place._id })),
            writeLine: (args) => writeStory({ ...args, placeId: place._id }),
            stillHere: () => confirm({ placeId: place._id }),
          },
        }
      : undefined;
  return (
    <PlaceView
      locale={locale}
      region={region}
      place={place}
      sources={sources}
      stories={stories}
      placeStory={placeStory ?? undefined}
      page={page}
      checks={checks}
      story={story}
      mission={mission}
      collection={collection}
      stamp={stamp && { stampedAt: stamp.stampedAt, pressedFrom }}
    />
  );
}
