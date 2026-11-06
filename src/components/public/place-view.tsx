import { removalHref } from "@/components/takedown/takedown-logic";
import { SiteFooter } from "@/components/layout/site-footer";
import { ChevronLeft } from "lucide-react";
import { NorenHeader } from "@/components/place/noren-header";
import { PlaceActions } from "@/components/place/place-actions";
import type { AddStoryActions } from "@/components/place/add-story";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import { PlaceCheck, type PlaceCheckActions } from "@/components/place/place-check";
import { PlaceStory, type PlaceStoryLike } from "@/components/place/place-story";
import { PlaceStamp } from "@/components/place/place-stamp";
import { PlaceTabs, StoryComposer } from "@/components/place/place-tabs";
import { checkDate } from "@/components/place/check-state";
import type { PlaceTab } from "@/lib/place/tabs";
import {
  CheckInCard,
  type CheckInActions,
  type CheckInSpot,
} from "@/components/collection/check-in-card";
import type { SetLike } from "@/components/collection/next-panel-card";
import { NeighbourhoodMission, type MissionLike } from "@/components/place/neighbourhood-mission";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { labelForCategory } from "./category";
import { EmbedNotice } from "@/components/embeds/embed-notice";
import { PlaceMap } from "@/components/map/place-map";
import { StoryView } from "@/components/story/story-view";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { checkMessages } from "@/lib/i18n/messages/checks";
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

/** What the person just did to earn this place's stamp, if anything. */
export type PressedFrom = "check" | "story" | "checkIn" | null;

/** The check-in result keeps its stamp for good, so a later press never opens a second one. */
export function pressedAfter(current: PressedFrom, from: PressedFrom): PressedFrom {
  return current === "checkIn" ? current : from;
}

export type PlaceCollection = {
  spot: CheckInSpot;
  set?: SetLike | null;
  displayName?: string;
  actions: CheckInActions;
};

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
  collection,
  stamp,
  initialTab = "stories",
  initialWrite = false,
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
  /** The panel this place gives, when it is in a live set. */
  collection?: PlaceCollection;
  /** The viewer's stamp for this place, and what they just did to earn it, if anything. */
  stamp?: { stampedAt: number; pressedFrom: PressedFrom } | null;
  /** The tab the address asked for, so the first paint is the right one (contract C1). */
  initialTab?: PlaceTab;
  /** The address asked for the written form (`&write=1`). */
  initialWrite?: boolean;
}) {
  const m = messagesFor(publicMessages, locale);
  const shell = messagesFor(shellMessages, locale);
  const ui = messagesFor(placePageMessages, locale);
  const checkText = messagesFor(checkMessages, locale);
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
  const stampHere = (from: NonNullable<PressedFrom>) =>
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
  const storiesPanel = (
    <>
      {/* The story composed from the owner's interview, when there is one (FR-012). */}
      {page && (
        <section className="space-y-3" aria-label={messagesFor(storyMessages, locale).storyHeading}>
          <p className="text-[15px] font-bold text-kon/80">{ui.ownersWords}</p>
          <StoryView
            story={toStoryViewModel(page, { locale, placeName: heading.primary.text, region })}
          />
        </section>
      )}
      {placeStory && <PlaceStory locale={locale} story={placeStory} />}
      {/* The fictional demo place takes no stories about it, so it shows the section only for its own. */}
      {(feed === undefined || feed.length > 0 || !place.isMock) && (
        <section className="space-y-6 border-t border-line pt-6" aria-labelledby="stories-heading">
          <h2 id="stories-heading" className="font-sans text-[22px] font-bold">
            {ui.stories}
          </h2>
          {feed === undefined ? (
            <p role="status">{m.loading}</p>
          ) : (
            <>
              {feed.length === 0 && <p className="text-[17px]">{ui.noStories}</p>}
              {!place.isMock && (
                <StoryComposer
                  locale={locale}
                  region={region}
                  actions={story}
                  draftName={`story:${place._id}`}
                />
              )}
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
                photoBaseUrl={region.photos?.baseUrl}
              />
            </>
          )}
        </section>
      )}
    </>
  );
  const visitPanel = (
    <>
      {collection && place.pin && (
        <CheckInCard
          locale={locale}
          region={region}
          slug={place.slug}
          pin={place.pin}
          spot={collection.spot}
          set={collection.set}
          stamp={<div aria-live="polite">{stampHere("checkIn")}</div>}
          displayName={collection.displayName}
          actions={collection.actions}
        />
      )}
      {/* The fictional demo place has nothing to check in person. */}
      {!place.isMock && (
        <PlaceCheck
          locale={locale}
          confirmedAt={place.confirmedAt}
          fromOpenData={place.dataSources.length > 0}
          actions={checks}
          draftName={`check:${place._id}`}
        />
      )}
      {/* It shows where the person acted: a story's stamp appears beside the story form. */}
      <div aria-live="polite">
        {stamp?.pressedFrom !== "story" && stamp?.pressedFrom !== "checkIn" && stampHere("check")}
      </div>
      {mission && <NeighbourhoodMission locale={locale} region={region} mission={mission} />}
    </>
  );
  const mapPanel = place.pin && (
    <section className="space-y-4" aria-labelledby="where-heading">
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
  );
  const aboutPanel = (
    <>
      <section className="space-y-3" aria-labelledby="about-heading">
        <h2 id="about-heading" className="font-sans text-[22px] font-bold">
          {ui.aboutHeading}
        </h2>
        <p>
          {place.category
            ? format(ui.categoryInRegion, {
                category: labelForCategory(region, place.category, locale),
                region: ui.regionName,
              })
            : format(ui.inRegion, { region: ui.regionName })}
        </p>
        <p>
          {place.dataSources.length > 0 && <>{checkText.fromOpenData} </>}
          {place.confirmedAt === undefined
            ? checkText.noOneYet
            : format(checkText.confirmedOn, { date: checkDate(place.confirmedAt, locale) })}
        </p>
        {place.dataSources.length > 0 && (
          <a
            className="inline-flex min-h-11 items-center text-ai underline"
            href={localePath(locale, "/notice")}
          >
            {checkText.aboutData}
          </a>
        )}
      </section>
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
      {/* The owner-kit stream adds its "Is this your place?" line here. */}
      <div>
        <a
          className="inline-flex min-h-11 items-center text-[15px] text-ai underline"
          href={removalHref(locale, place.slug)}
        >
          {ui.removal}
        </a>
      </div>
    </>
  );
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        lang={locale}
        className="mx-auto w-full max-w-[720px] min-w-0 space-y-3 px-4 py-3 font-sans text-kon sm:space-y-4 sm:py-6"
      >
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
        <PlaceTabs
          locale={locale}
          initialTab={initialTab}
          initialWrite={initialWrite}
          signedIn={story?.signedIn}
          canWrite={!place.isMock}
          visitDot={collection ? !collection.spot.visited : false}
          stories={storiesPanel}
          visit={visitPanel}
          visitLazy={mapPanel}
          about={aboutPanel}
        />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
