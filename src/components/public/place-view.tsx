import { removalHref } from "@/components/takedown/takedown-logic";
import { SiteFooter } from "@/components/layout/site-footer";
import { ChevronLeft } from "lucide-react";
import { NorenHeader } from "@/components/place/noren-header";
import { PlaceActions } from "@/components/place/place-actions";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import { PlaceCheck, type PlaceCheckActions } from "@/components/place/place-check";
import { PlaceStory, type PlaceStoryLike } from "@/components/place/place-story";
import { PlaceStamp } from "@/components/place/place-stamp";
import { NeighbourhoodMission, type MissionLike } from "@/components/place/neighbourhood-mission";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { labelForCategory } from "./category";
import { EmbedNotice } from "@/components/embeds/embed-notice";
import { PlaceMap } from "@/components/map/place-map";
import { StoryView } from "@/components/story/story-view";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { storyMessages } from "@/lib/i18n/messages/story";
import {
  placeHeading,
  toHomeModel,
  toStoryFeed,
  toStoryViewModel,
  type PlaceDetailLike,
  type PublicRegionProps,
  type PageViewLike,
  type SourceViewLike,
  type WrittenStoryLike,
} from "./mapping";

export function PlaceView({
  locale,
  region,
  place,
  page,
  sources,
  stories,
  placeStory,
  checks,
  story,
  mission,
  stamp,
}: {
  locale: Locale;
  region: PublicRegionProps;
  place: PlaceDetailLike | null;
  page?: PageViewLike | null;
  sources?: readonly SourceViewLike[];
  /** Stories members wrote here; undefined while loading. */
  stories?: readonly WrittenStoryLike[];
  /** What the story agent wrote from the posts about this place, when it has. */
  placeStory?: PlaceStoryLike;
  checks?: PlaceCheckActions;
  story?: AddStoryActions & StoryFeedActions;
  /** What the place's neighbourhood still needs, when it is in one. */
  mission?: MissionLike | null;
  /** The viewer's stamp for this place, and what they just did to earn it, if anything. */
  stamp?: { stampedAt: number; pressedFrom: "check" | "story" | null } | null;
}) {
  const m = messagesFor(publicMessages, locale);
  const shell = messagesFor(shellMessages, locale);
  const ui = messagesFor(placePageMessages, locale);
  if (place === null)
    return (
      <>
        <main
          id="main"
          tabIndex={-1}
          lang={locale}
          className="mx-auto w-full max-w-[720px] space-y-4 px-4 py-8 text-kon"
        >
          <h1 className="text-[28px] font-bold">{shell.notFoundTitle}</h1>
          <p>{shell.notFoundBody}</p>
          <a
            className="inline-flex min-h-11 items-center gap-1 text-ai underline"
            href={localePath(locale, "/map")}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {ui.backToMap}
          </a>
        </main>
        <SiteFooter locale={locale} />
      </>
    );
  const heading = placeHeading(place.names, locale, region);
  const stampHere = (from: "check" | "story") =>
    stamp && (
      <PlaceStamp
        locale={locale}
        region={region}
        slug={place.slug}
        names={place.names}
        stampedAt={stamp.stampedAt}
        pressed={stamp.pressedFrom === from}
      />
    );
  const markers = toHomeModel([place], locale, region).markers;
  const feed =
    sources === undefined || stories === undefined
      ? undefined
      : toStoryFeed(sources, stories, place.canEdit);
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        lang={locale}
        className="mx-auto w-full max-w-[720px] min-w-0 space-y-10 px-4 py-6 font-sans text-kon"
      >
        <div className="space-y-6">
          <a
            className="inline-flex min-h-11 items-center gap-1 text-ai underline"
            href={localePath(locale, "/map")}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {ui.backToMap}
          </a>
          <NorenHeader
            locale={locale}
            place={place}
            region={region}
            category={place.category ? labelForCategory(region, place.category, locale) : undefined}
            hasStory={page != null}
          />
          <PlaceActions locale={locale} title={heading.primary.text} pin={place.pin} />
          {/* The fictional demo place has nothing to check in person. */}
          {!place.isMock && (
            <PlaceCheck
              locale={locale}
              confirmedAt={place.confirmedAt}
              fromOpenData={place.dataSources.length > 0}
              actions={checks}
            />
          )}
          {/* It shows where the person acted: a story's stamp appears beside the story form. */}
          <div aria-live="polite">{stamp?.pressedFrom !== "story" && stampHere("check")}</div>
          {mission && <NeighbourhoodMission locale={locale} region={region} mission={mission} />}
          {place.visibility === "draft" && <p role="note">{m.draft}</p>}
          {(place.canEdit || place.isOwner) && (
            <nav aria-label={ui.manage} className="flex flex-wrap items-center gap-x-4 text-[15px]">
              <span className="font-bold">{ui.manage}</span>
              {place.canEdit && (
                <a
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={localePath(locale, `/creator/places/${place._id}`)}
                >
                  {m.edit}
                </a>
              )}
              {place.isOwner && (
                <a
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={localePath(locale, `/owner/${place._id}`)}
                >
                  {m.owner}
                </a>
              )}
            </nav>
          )}
        </div>
        {/* The story composed from the owner's interview, when there is one (FR-012). */}
        {page && (
          <section
            className="space-y-4 border-t border-line pt-10"
            aria-label={messagesFor(storyMessages, locale).storyHeading}
          >
            <StoryView
              story={toStoryViewModel(page, { locale, placeName: heading.primary.text, region })}
            />
          </section>
        )}
        {placeStory && <PlaceStory locale={locale} story={placeStory} />}
        {/* The fictional demo place takes no stories about it, so it shows the section only for its own. */}
        {(feed === undefined || feed.length > 0 || !place.isMock) && (
          <section
            className="space-y-6 border-t border-line pt-10"
            aria-labelledby="stories-heading"
          >
            <h2 id="stories-heading" className="font-sans text-[22px] font-bold">
              {ui.stories}
            </h2>
            {feed === undefined ? (
              <p role="status">{m.loading}</p>
            ) : (
              <>
                {feed.length === 0 && <p className="text-[17px]">{ui.noStories}</p>}
                {!place.isMock && <AddStory locale={locale} region={region} actions={story} />}
                <div aria-live="polite">{stamp?.pressedFrom === "story" && stampHere("story")}</div>
                {feed.some(
                  (entry) => entry.kind === "post" && entry.source.embed.kind !== "link",
                ) && <EmbedNotice locale={locale} />}
                <StoryFeed
                  locale={locale}
                  entries={feed}
                  scriptOrigins={region.scriptOrigins}
                  frameOrigins={region.frameOrigins}
                  actions={story}
                />
              </>
            )}
          </section>
        )}
        {place.pin && (
          <section className="space-y-4 border-t border-line pt-10" aria-labelledby="where-heading">
            <h2 id="where-heading" className="font-sans text-[22px] font-bold">
              {ui.where}
            </h2>
            <div className="[&_[data-map-frame]]:h-[240px] [&_[data-map-frame]]:rounded-none">
              <PlaceMap
                locale={locale}
                label={heading.primary.text}
                styleUrl={region.styleUrl}
                attribution={region.attribution}
                center={{ ...place.pin, zoom: 16 }}
                markers={markers}
              />
            </div>
          </section>
        )}
        <div className="border-t border-line pt-10 pb-4">
          <a
            className="inline-flex min-h-11 items-center text-[15px] text-ai underline"
            href={removalHref(locale, place.slug)}
          >
            {ui.removal}
          </a>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
