"use client";

import { use, useState } from "react";
import { useAction, useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageContainer } from "@/components/layout/page-container";
import { useTasteLearning } from "@/components/memory/taste-learning";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answering, AddStoryActions } from "@/components/place/add-story";
import type { CarryTargetView } from "@/components/place/carry-picker";
import type { WrittenStoryArgs } from "@/components/place/add-story-form";
import { uploadStoryPhoto } from "@/components/place/photo-upload";
import type { StoryFeedActions } from "@/components/place/story-feed";
import type { PlaceCheckActions } from "@/components/place/place-check";
import type { Locale } from "@/lib/i18n";
import { PublicQueryBoundary } from "./home-container";
import { PublicLoading } from "./home-view";
import { readLocation } from "@/lib/collection/location";
import { PlaceView, pressedAfter, type PlaceCollection, type PressedFrom } from "./place-view";
import { useShownAs } from "@/components/place/use-shown-as";
import { useToday } from "./use-today";
import { placeHeading, type PublicRegionProps } from "./mapping";
import { readPlaceTab, type PlaceTabState } from "@/lib/place/tabs";
import { parseAnswers, starterText } from "@/lib/slip/question";

const HOUR_MS = 60 * 60 * 1000;

/**
 * What the form shows above the textarea for `?answers=`. A story's question must be one of this
 * place's own stories with its question still on it; the server checks again when the story is sent.
 */
function answeringFrom(
  ref: ReturnType<typeof parseAnswers>,
  stories:
    readonly { _id: string; nextQuestion?: string; lang: string; authorName: string }[] | undefined,
  carried: readonly { storyId: string; text: string; lang: string; askedBy: string }[] | undefined,
  locale: Locale,
): Answering | undefined {
  if (ref === null) return undefined;
  if (ref.kind === "starter") {
    const text = starterText(ref.key, locale);
    return text === undefined ? undefined : { ref, text, lang: locale };
  }
  const brought = carried?.find((row) => row.storyId === ref.storyId);
  if (brought !== undefined)
    return {
      ref,
      text: brought.text,
      lang: brought.lang,
      ...(brought.askedBy ? { askedBy: brought.askedBy } : {}),
    };
  const asked = stories?.find((story) => story._id === ref.storyId);
  if (asked === undefined || !asked.nextQuestion) return undefined;
  return {
    ref,
    text: asked.nextQuestion,
    lang: asked.lang,
    ...(asked.authorName ? { askedBy: asked.authorName } : {}),
  };
}

/** The form's photo ids came from Convex a moment ago, and stories.add checks each one again. */
const writtenStory = (
  { photoIds, nextQuestionFor, ...args }: WrittenStoryArgs,
  placeId: Id<"place">,
) => ({
  ...args,
  placeId,
  ...(nextQuestionFor ? { nextQuestionFor: nextQuestionFor as Id<"place"> } : {}),
  ...(photoIds ? { photoIds: photoIds as Id<"storyPhoto">[] } : {}),
});

type Props = {
  params: Promise<{ lang: string; slug: string }>;
  /** `?tab=` and `&write=1` (contract C1). */
  searchParams: Promise<{
    tab?: string | string[];
    write?: string | string[];
    /** `story:<id>` or `starter:<key>`: the question a story is being written to answer. */
    answers?: string | string[];
  }>;
  locale: Locale;
  region: PublicRegionProps;
};
export function PlaceContainer({ params, searchParams, locale, region }: Props) {
  const { slug } = use(params);
  const query = use(searchParams);
  const address = readPlaceTab(query);
  const answers = Array.isArray(query.answers) ? query.answers[0] : query.answers;
  return (
    <PublicQueryBoundary key={`${locale}/${region.regionId}/${slug}`} locale={locale}>
      <PlaceQuery slug={slug} locale={locale} region={region} address={address} answers={answers} />
    </PublicQueryBoundary>
  );
}
function PlaceQuery({
  slug,
  locale,
  region,
  address,
  answers,
}: Omit<Props, "params" | "searchParams"> & {
  slug: string;
  address: PlaceTabState;
  answers?: string;
}) {
  const place = useQuery(api.places.getBySlug, { regionId: region.regionId, slug });
  const args = place ? { placeId: place._id } : "skip";
  const sources = useQuery(api.sources.listForPlace, args);
  const stories = useQuery(api.stories.listForPlace, args);
  // Questions carried here from other places; asked only where "three doors" is on.
  const carried = useQuery(
    api.stories.carriedTo,
    region.thread && place ? { placeId: place._id } : "skip",
  );
  const convex = useConvex();
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
  const shownAs = useShownAs(person);
  const photoLimits = region.photos;
  const canAddPhotos = useQuery(
    api.storyPhotos.forPlace,
    photoLimits && place && isAuthenticated ? { placeId: place._id } : "skip",
  );
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
  const clearQuestion = useMutation(api.stories.clearQuestion);
  const removePhoto = useMutation(api.storyPhotos.remove);
  const previewLink = useAction(api.linkRead.previewLink);
  const draftNote = useAction(api.linkRead.draftNote);
  // Opening a place counts toward a taste on the visitor's own device (only while the planner is on).
  const learnFromSave = useTasteLearning(place?.category, place?.slug);
  const saved = async <T,>(work: Promise<T>) => {
    const result = await work;
    learnFromSave();
    return result;
  };
  if (place === undefined)
    return (
      <PageContainer locale={locale}>
        <PublicLoading locale={locale} />
      </PageContainer>
    );
  // The question the link asks the writer to answer: a starter, or a story's question at this place.
  const answering = region.relay
    ? answeringFrom(parseAnswers(answers), stories, carried, locale)
    : undefined;
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
        sharedHere: [...(stories ?? []), ...(sources ?? [])].some((entry) => entry.addedByMe),
        add: (args) => pressing("story", () => saved(addSource({ ...args, placeId: place._id }))),
        write: (args) => pressing("story", () => saved(writeStory(writtenStory(args, place._id)))),
        shownAs,
        ...(answering ? { answering } : {}),
        ...(region.thread
          ? {
              carryTargets: async (): Promise<CarryTargetView[]> =>
                (await convex.query(api.stories.carryTargets, { placeId: place._id })).map(
                  (target) => {
                    const name = placeHeading(target.names, locale, region).primary;
                    return {
                      placeId: target.placeId,
                      name: name.text,
                      lang: name.lang,
                      metres: target.metres,
                      search: target.names.map(({ value }) => value).join(" "),
                    };
                  },
                ),
            }
          : {}),
        photos:
          photoLimits && canAddPhotos?.allowed
            ? {
                maxPerStory: canAddPhotos.maxPerStory,
                waitsUntil: canAddPhotos.waitsUntil,
                // Two hours short of the hourly sweep, so a kept upload is never attached as it goes.
                keepUploadsForMs: Math.max(0, photoLimits.unattachedHours - 2) * HOUR_MS,
                upload: (file) =>
                  uploadStoryPhoto(file, { placeId: place._id, limits: photoLimits }),
                remove: (photoId) => removePhoto({ photoId: photoId as Id<"storyPhoto"> }),
              }
            : undefined,
        removePhoto: (photoId) => removePhoto({ photoId: photoId as Id<"storyPhoto"> }),
        clearQuestion: (storyId) => clearQuestion({ storyId: storyId as Id<"story"> }),
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
            checkIn: () => pressing("checkIn", () => saved(checkIn({ placeId: place._id }))),
            writeLine: (args) => writeStory(writtenStory(args, place._id)),
            shownAs,
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
      carried={carried}
      placeStory={placeStory ?? undefined}
      page={page}
      checks={checks}
      story={story}
      mission={mission}
      collection={collection}
      stamp={stamp && { stampedAt: stamp.stampedAt, pressedFrom }}
      initialTab={address.tab}
      initialWrite={address.write}
    />
  );
}
