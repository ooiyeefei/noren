"use client";

import { useId, useRef } from "react";
import { Search, X } from "lucide-react";
import { categoryOptions } from "./category";
import { PlaceList } from "@/components/places/place-list";
import { PlaceMap } from "@/components/map/place-map";
import type { TownMarker } from "@/components/map/map-helpers";
import { SiteFooter } from "@/components/layout/site-footer";
import { ExploreGuide } from "@/components/explore/guide";
import { NorenTab } from "@/components/explore/noren-tab";
import {
  NeighbourhoodList,
  type NeighbourhoodProgress,
} from "@/components/explore/neighbourhood-list";
import {
  STORIES_FILTER,
  draggedSheet,
  normaliseSearch,
  type MapFit,
  type MapView,
  type Position,
  type SheetHeight,
} from "@/components/explore/helpers";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { LatestStories } from "./latest-stories";
import type { LatestStoryLike, PublicRegionProps, toHomeModel } from "./mapping";

/**
 * The page's heading: the name of the region the map is looking at, or no place name when it looks at
 * none that is on. Nagasaki reads exactly as `exploreTitle` does.
 */
export function exploreHeading(locale: Locale, regionName: string | null): string {
  const m = messagesFor(publicMessages, locale);
  return regionName === null
    ? m.exploreTitlePlain
    : format(m.exploreTitleIn, { region: regionName });
}

export function PublicLoading({ locale }: { locale: Locale }) {
  const m = messagesFor(publicMessages, locale);
  return (
    <div lang={locale} className="h-[calc(100dvh-56px)] bg-kamenozoki p-6 lg:p-5">
      <h1 className="sr-only font-display lg:not-sr-only lg:text-[28px]">{m.exploreTitle}</h1>
      <p role="status" className="mt-6">
        {m.loading}
      </p>
    </div>
  );
}

export function HomeView({
  locale,
  region,
  panel = region,
  model,
  category = "",
  search = "",
  view,
  rowLimit = 50,
  totalCount,
  hasDemo,
  hasStories,
  latest,
  neighbourhoods,
  onChooseNeighbourhood,
  position,
  locationOff = false,
  selectedId,
  sheet: requestedSheet = "peek",
  guideVisible = true,
  onCategoryChange,
  onSearchChange,
  onViewChange,
  fitTo,
  zoomedOut,
  towns,
  heading,
  onShowMore,
  onSelect,
  onLocate,
  onSheetChange,
  onDismissGuide,
}: {
  locale: Locale;
  region: PublicRegionProps;
  /**
   * The region whose categories the chips show and whose stories are listed: the one the map is
   * inside. The map itself stays on `region`. Defaults to `region`.
   */
  panel?: PublicRegionProps;
  model: ReturnType<typeof toHomeModel>;
  category?: string;
  search?: string;
  view?: MapView | null;
  rowLimit?: number;
  totalCount?: number;
  hasDemo?: boolean;
  /** Whether any place in the region has a story, wherever the map is. */
  hasStories?: boolean;
  /** The newest stories people shared in the region; undefined while loading. */
  latest?: readonly LatestStoryLike[];
  /** Each neighbourhood's shared progress; undefined while loading. */
  neighbourhoods?: readonly NeighbourhoodProgress[];
  onChooseNeighbourhood?(neighbourhood: NeighbourhoodProgress): void;
  position?: Position | null;
  locationOff?: boolean;
  selectedId?: string | null;
  sheet?: SheetHeight;
  guideVisible?: boolean;
  onCategoryChange?(category: string): void;
  onSearchChange?(search: string): void;
  onViewChange?(view: MapView): void;
  fitTo?: MapFit | null;
  /** The map is zoomed out too far to load places: it shows `towns` instead. */
  zoomedOut?: boolean;
  towns?: readonly TownMarker[];
  /** The page heading; the home region's while the map has not said where it looks. */
  heading?: string;
  onShowMore?(): void;
  onSelect?(id: string): void;
  onLocate?(): void;
  onSheetChange?(height: SheetHeight): void;
  onDismissGuide?(): void;
}) {
  const m = messagesFor(publicMessages, locale);
  const mapMessages = messagesFor(placeUiMessages, locale);
  const id = useId();
  const topOverlay = useRef<HTMLDivElement>(null);
  const sheet = guideVisible && requestedSheet === "peek" ? "half" : requestedSheet;
  const pointerStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const categories = categoryOptions(panel, locale);
  const chips = [
    { key: "", label: m.all },
    { key: STORIES_FILTER, label: m.storiesChip },
    ...categories,
    ...((hasDemo ?? model.items.some((item) => item.isMock))
      ? [{ key: "demo", label: m.demoChip }]
      : []),
  ];
  const selectedChip = chips.find((chip) => chip.key === category)?.label ?? m.allPlaces;
  const searching = normaliseSearch(search) !== "";
  const followingView = !searching && Boolean(view);
  const countText = searching
    ? model.items.length === 1
      ? m.matchCountOne
      : m.matchCount
    : followingView
      ? model.items.length === 1
        ? m.areaCountOne
        : m.areaCount
      : model.items.length === 1
        ? m.countOne
        : m.count;
  const zoomedFarOut = Boolean(zoomedOut) && !searching;
  const emptyText = zoomedFarOut
    ? m.zoomedOutEmpty
    : category === STORIES_FILTER && hasStories === false
      ? m.noStoriesYet
      : followingView
        ? m.noPlacesInArea
        : (totalCount ?? model.items.length) === 0
          ? m.noPlaces
          : category === "cafe"
            ? m.noCafeMatches
            : format(m.noMatches, {
                category: category ? selectedChip.toLocaleLowerCase(locale) : m.allPlaces,
              });
  const searchAndChips = (
    <>
      <div className="lg:sticky lg:top-0 lg:z-10 lg:bg-white lg:px-5 lg:py-2">
        <div className="relative rounded-[10px] bg-white shadow-[var(--shadow-float)] lg:shadow-none">
          <Search
            aria-hidden="true"
            size={20}
            className="pointer-events-none absolute left-3 top-3 text-ai"
          />
          <input
            type="search"
            aria-label={m.search}
            placeholder={m.search}
            value={search}
            onChange={(event) => onSearchChange?.(event.target.value)}
            className="h-11 w-full min-w-0 rounded-[10px] border border-input bg-white pl-10 pr-12 text-base"
          />
          {search && (
            <button
              type="button"
              aria-label={m.clearSearch}
              onClick={() => onSearchChange?.("")}
              className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-[10px]"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>
      <div
        role="group"
        aria-label={m.category}
        className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:mt-0 lg:flex-wrap lg:gap-1.5 lg:overflow-visible lg:px-5 lg:pb-3"
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            data-category={chip.key}
            aria-pressed={category === chip.key}
            onClick={() => onCategoryChange?.(chip.key)}
            className={
              category === chip.key
                ? "min-h-11 shrink-0 rounded-full border border-ai bg-ai px-4 text-[13px] font-bold text-white lg:min-h-9 lg:px-3"
                : "min-h-11 shrink-0 rounded-full border border-input bg-white px-4 text-[13px] text-kon hover:bg-kamenozoki lg:min-h-9 lg:px-3"
            }
          >
            {chip.label}
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div
      lang={locale}
      className="relative isolate h-[calc(100dvh-56px)] overflow-hidden bg-kamenozoki text-kon lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <section
        aria-label={m.places}
        className="pointer-events-none relative z-20 h-full min-w-0 lg:pointer-events-auto lg:overflow-y-auto lg:overscroll-contain lg:bg-white"
      >
        <div ref={topOverlay} className="pointer-events-auto absolute inset-x-3 top-3 lg:contents">
          <h1 className="sr-only font-display text-[28px] leading-tight lg:not-sr-only lg:mx-5 lg:mt-5 lg:mb-2">
            {heading ?? m.exploreTitle}
          </h1>
          {searchAndChips}
        </div>
        <div
          data-sheet={sheet}
          className={
            sheet === "full"
              ? "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:static lg:h-auto lg:rounded-none lg:shadow-none"
              : sheet === "half"
                ? "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[55%] max-h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:static lg:h-auto lg:max-h-none lg:rounded-none lg:shadow-none"
                : "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[264px] max-h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:static lg:h-auto lg:max-h-none lg:rounded-none lg:shadow-none"
          }
        >
          <button
            type="button"
            aria-label={sheet === "full" ? m.showMap : m.showList}
            aria-expanded={sheet !== "peek"}
            aria-controls={`${id}-list`}
            className="flex h-11 shrink-0 touch-none items-center justify-center rounded-t-[20px] lg:hidden"
            onClick={() => {
              if (!dragged.current) onSheetChange?.(sheet === "full" ? "peek" : "full");
              dragged.current = false;
            }}
            onPointerDown={(event) => {
              pointerStart.current = event.clientY;
              dragged.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              if (pointerStart.current !== null) {
                const next = draggedSheet(sheet, event.clientY - pointerStart.current);
                dragged.current = next !== sheet;
                if (dragged.current) onSheetChange?.(next);
                pointerStart.current = null;
              }
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
          >
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-kamenozoki" />
          </button>
          <div
            id={`${id}-list`}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:overflow-visible lg:px-1"
          >
            {guideVisible && (
              <div className="mx-4 mb-3 lg:mt-4">
                <ExploreGuide locale={locale} onDismiss={onDismissGuide} />
              </div>
            )}
            {!searching && latest && latest.length > 0 && (
              <LatestStories locale={locale} region={panel} entries={latest} />
            )}
            {!searching && latest && latest.length === 0 && (
              <section aria-labelledby="latest-stories" className="pb-3">
                <h2 id="latest-stories" className="px-4 pb-2 text-[15px] font-bold">
                  {m.latestStories}
                </h2>
                <p className="px-4 text-[13px]">{m.noLatestStories}</p>
              </section>
            )}
            {!searching && neighbourhoods && (
              <NeighbourhoodList
                locale={locale}
                neighbourhoods={neighbourhoods}
                onChoose={onChooseNeighbourhood}
              />
            )}
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4">
              {zoomedFarOut ? (
                <span />
              ) : (
                <p role="status" className="text-[15px] font-bold">
                  {format(countText, { n: model.items.length })}
                </p>
              )}
              <p className="text-[13px]">{position ? m.nearest : m.storiesFirst}</p>
            </div>
            {locationOff && (
              <p role="status" className="px-4 pb-3 text-[13px]">
                {mapMessages.locationOff}
              </p>
            )}
            <div
              data-explore-legend="true"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-[13px]"
            >
              <span className="inline-flex items-center gap-1">
                <NorenTab story />
                {m.legendStory}
              </span>
              <span className="inline-flex items-center gap-1">
                <NorenTab />
                {m.legendPlace}
              </span>
            </div>
            <PlaceList
              showUnreviewed={false}
              locale={locale}
              items={model.items.slice(0, rowLimit)}
              emptyText={emptyText}
              selectedId={selectedId}
              onSelect={onSelect}
            />
            {model.items.length > rowLimit && (
              <button
                type="button"
                onClick={onShowMore}
                className="mx-4 my-3 min-h-11 rounded-[10px] border border-input px-4 text-[15px] text-ai hover:bg-kamenozoki"
              >
                {m.showMorePlaces}
              </button>
            )}
            <p className="px-4 py-3 text-[13px] text-muted-foreground">
              {region.attribution.join(" | ")}
            </p>
            <SiteFooter locale={locale} compact />
          </div>
        </div>
      </section>
      <div className="absolute inset-0 min-w-0 lg:relative">
        <PlaceMap
          locale={locale}
          label={mapMessages.mapLabel}
          styleUrl={region.styleUrl}
          attribution={region.attribution}
          center={region.center}
          bounds={region.bounds}
          markers={model.markers}
          explore={{
            selectedId,
            onSelect,
            position,
            onLocate,
            sheet,
            topOverlay,
            onViewChange,
            fitTo,
            zoomedOut,
            towns,
          }}
        />
      </div>
    </div>
  );
}
