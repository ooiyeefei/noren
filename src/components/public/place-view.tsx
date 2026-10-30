import { removalHref } from "@/components/takedown/takedown-logic";
import { ChevronLeft } from "lucide-react";
import { NorenHeader } from "@/components/place/noren-header";
import { PlaceActions } from "@/components/place/place-actions";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { labelForCategory } from "./category";
import { EmbedNotice } from "@/components/embeds/embed-notice";
import { EmbedView } from "@/components/embeds/embed-view";
import { PlaceMap } from "@/components/map/place-map";
import { StoryView } from "@/components/story/story-view";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { storyMessages } from "@/lib/i18n/messages/story";
import {
  placeHeading,
  toHomeModel,
  toStoryViewModel,
  toEmbedSource,
  type PlaceDetailLike,
  type PublicRegionProps,
  type PageViewLike,
  type SourceViewLike,
} from "./mapping";
import { PublicLoading } from "./home-view";

export function PlaceView({
  locale,
  region,
  place,
  page,
  sources,
}: {
  locale: Locale;
  region: PublicRegionProps;
  place: PlaceDetailLike | null;
  page?: PageViewLike | null;
  sources?: readonly SourceViewLike[];
}) {
  const m = messagesFor(publicMessages, locale);
  const shell = messagesFor(shellMessages, locale);
  const ui = messagesFor(placePageMessages, locale);
  if (place === null)
    return (
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
          href={localePath(locale)}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
          {ui.backToMap}
        </a>
      </main>
    );
  const heading = placeHeading(place.names, locale, region);
  const markers = toHomeModel([place], locale, region).markers;
  return (
    <main
      id="main"
      tabIndex={-1}
      lang={locale}
      className="mx-auto w-full max-w-[720px] min-w-0 space-y-10 px-4 py-6 font-sans text-kon"
    >
      <div className="space-y-6">
        <a
          className="inline-flex min-h-11 items-center gap-1 text-ai underline"
          href={localePath(locale)}
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
      <section
        className="space-y-4 border-t border-line pt-10"
        aria-label={messagesFor(storyMessages, locale).storyHeading}
      >
        {page === undefined ? (
          <>
            <h2 className="font-sans text-[22px] font-bold">
              {messagesFor(storyMessages, locale).storyHeading}
            </h2>
            <PublicLoading locale={locale} />
          </>
        ) : page === null ? (
          <>
            <h2 className="font-sans text-[22px] font-bold">
              {messagesFor(storyMessages, locale).storyHeading}
            </h2>
            <p className="text-[18px] leading-[1.8]">
              {messagesFor(storyMessages, locale).noStoryYet}
            </p>
          </>
        ) : (
          <StoryView
            story={toStoryViewModel(page, { locale, placeName: heading.primary.text, region })}
          />
        )}
      </section>
      {sources === undefined ? (
        <PublicLoading locale={locale} />
      ) : (
        sources.length > 0 && (
          <section className="space-y-4 border-t border-line pt-10" aria-labelledby="posts-heading">
            <h2 id="posts-heading" className="font-sans text-[22px] font-bold">
              {ui.posts}
            </h2>
            {sources.some((source) => source.embed.kind !== "link") && (
              <EmbedNotice locale={locale} />
            )}
            {sources.map((source) => (
              <EmbedView
                key={source._id}
                locale={locale}
                source={toEmbedSource(source)}
                scriptOrigins={region.scriptOrigins}
                frameOrigins={region.frameOrigins}
              />
            ))}
          </section>
        )
      )}
      {place.pin && (
        <section className="space-y-4 border-t border-line pt-10" aria-labelledby="where-heading">
          <h2 id="where-heading" className="font-sans text-[22px] font-bold">
            {ui.where}
          </h2>
          <div className="[&_section>div]:h-[240px] [&_section>div]:rounded-none">
            <PlaceMap
              locale={locale}
              label={heading.primary.text}
              styleUrl={region.styleUrl}
              attribution={region.attribution}
              center={{ ...place.pin, zoom: region.center.zoom }}
              markers={markers}
            />
          </div>
        </section>
      )}
      {place.dataSources.some((source) => source.provider === "osm" || source.attribution) && (
        <section
          aria-labelledby="place-data-heading"
          className="space-y-3 border-t border-line pt-10 text-[15px] text-muted-foreground"
        >
          <h2 id="place-data-heading" className="font-sans text-[22px] font-bold text-kon">
            {ui.placeInformation}
          </h2>
          {place.dataSources.map((source, index) =>
            source.provider === "osm" ? (
              <div key={index}>
                <a className="text-ai underline" href="https://www.openstreetmap.org/copyright">
                  © OpenStreetMap contributors
                </a>
                <p>{m.osmLicence}</p>
                <a
                  className="text-ai underline"
                  href={`https://www.openstreetmap.org/${source.ref}`}
                >
                  {m.osmObject}
                </a>
              </div>
            ) : source.attribution ? (
              <p key={index}>{source.attribution}</p>
            ) : null,
          )}
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
  );
}
