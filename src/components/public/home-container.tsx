"use client";

import {
  Component,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueries, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ErrorMessage } from "@/components/layout/error-message";
import { ErrorPage } from "@/components/layout/error-page";
import {
  normaliseSearch,
  dismissGuide,
  distanceLabel,
  locateInBrowser,
  exploreItems,
  fitForFilter,
  fitForNeighbourhood,
  STORIES_FILTER,
  guideIsVisible,
  type MapFit,
  type MapView,
  type Position,
  type SheetHeight,
} from "@/components/explore/helpers";
import { cellsForView } from "@/lib/geo/geohash";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import {
  mergeLoaded,
  openingBounds,
  regionAtCentre,
  townMarkers,
} from "@/components/map/map-helpers";
import type { MapStart } from "@/lib/region/start";
import { useReportRegionName } from "@/components/layout/region-name";
import { HomeView, PublicLoading, exploreHeading } from "./home-view";
import { toHomeModel, type PlaceSummaryLike, type PublicRegionProps } from "./mapping";
import { useToday } from "./use-today";

/** A chip the panel offers: all, with stories, demo, or one of the panel region's categories. */
function chipExists(panel: PublicRegionProps, key: string): boolean {
  return (
    key === "" ||
    key === STORIES_FILTER ||
    key === "demo" ||
    Boolean(panel.categories?.some((entry) => entry.key === key))
  );
}

/**
 * The same object for as long as the value is deeply equal. Convex may hand back an equal query
 * result as a new object on a render; anything keyed on its identity would then run again.
 */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value) ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the value's content
  return useMemo(() => value, [key]);
}

function subscribeGuide(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("noren:guide", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("noren:guide", onChange);
  };
}

export class PublicQueryBoundary extends Component<
  { locale: Locale; insideMain?: boolean; children: ReactNode },
  { failed: boolean; error?: unknown }
> {
  override state: { failed: boolean; error?: unknown } = { failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.insideMain)
      return (
        <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
          <h1 className="text-[28px] font-bold lg:text-4xl">
            {messagesFor(shellMessages, this.props.locale).errorTitle}
          </h1>
          <ErrorMessage error={this.state.error} locale={this.props.locale} />
        </div>
      );
    return <ErrorPage error={this.state.error} locale={this.props.locale} />;
  }
}

export function HomeContainer(props: {
  locale: Locale;
  region: PublicRegionProps;
  /** Every region that is on, by id; each place is named by its own region's rules. */
  regions?: Readonly<Record<string, PublicRegionProps>>;
  /** What the search box holds when the page opens. */
  initialSearch?: string;
  /** Where the map opens, from the address (`?at=`); the home region's centre when absent. */
  start?: MapStart;
}) {
  return (
    <PublicQueryBoundary locale={props.locale} insideMain>
      <HomeQuery {...props} />
    </PublicQueryBoundary>
  );
}

function HomeQuery({
  locale,
  region,
  regions,
  initialSearch = "",
  start,
}: {
  locale: Locale;
  region: PublicRegionProps;
  regions?: Readonly<Record<string, PublicRegionProps>>;
  initialSearch?: string;
  start?: MapStart;
}) {
  const [rawCategory, setCategory] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [view, setView] = useState<MapView | null>(null);
  const [fitTo, setFitTo] = useState<MapFit | null>(null);
  const [rowLimit, setRowLimit] = useState(50);
  const onViewChange = useCallback((next: MapView) => {
    setView(next);
    setRowLimit(50);
  }, []);
  const [position, setPosition] = useState<Position | null>(null);
  const [locationOff, setLocationOff] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetHeight>("peek");
  const guideVisible = useSyncExternalStore(
    subscribeGuide,
    () => guideIsVisible(() => window.localStorage),
    () => true,
  );
  // The map loads what is in view: the cells of the view, asked for after each move. Places already
  // loaded stay while the next answer arrives (mergeLoaded), so dragging never empties the map.
  const startCentre = start ?? region.center;
  const opening = useMemo(() => openingBounds(startCentre), [startCentre]);
  const mapRegion = useMemo(() => ({ ...region, center: startCentre }), [region, startCentre]);
  const bounds = view ?? opening;
  const cells = useMemo(() => (bounds ? cellsForView(bounds) : null), [bounds]);
  const searching = normaliseSearch(search) !== "";
  // While the box holds text, search covers every place of every region that is on, not only what is
  // in view. The queries are not made at all while it is empty.
  const regionIds = useMemo(
    () => Object.keys(regions ?? { [region.regionId]: region }),
    [regions, region],
  );
  // useQueries resubscribes, and sets state while rendering, whenever the object it is given is a new
  // one: a fresh object on every render is an endless loop. Keep it the same until its content changes.
  const searchQueries = useMemo(
    () =>
      searching
        ? Object.fromEntries(
            regionIds.map((id) => [id, { query: api.places.listForMap, args: { regionId: id } }]),
          )
        : {},
    [searching, regionIds],
  );
  const searched = useStable(useQueries(searchQueries));
  const zoomedOut = view !== null && cells === null && !searching;
  const allRegions = useMemo(() => regions ?? { [region.regionId]: region }, [regions, region]);
  // The heading and the header follow the map: the region its centre is inside, or no place name.
  // Until the map reports a view it is looking where it opened.
  const looking = regionAtCentre(view === null ? startCentre : view.center, allRegions);
  const lookingName = looking === null ? null : looking.regionName;
  useReportRegionName(lookingName);
  // The panel (chips, latest stories, neighbourhoods) follows the region in view. Over no region, or
  // zoomed out to towns, it stays on the home region as before. One query each, keyed by region id.
  const panel = zoomedOut || looking === null ? region : looking;
  const category = chipExists(panel, rawCategory) ? rawCategory : "";
  const latest = useQuery(api.stories.latest, { regionId: panel.regionId });
  const categoryKey = panel.categories?.some((entry) => entry.key === category) ? category : "";
  const answer = useStable(
    useQuery(
      api.places.inCells,
      cells ? { cells: cells.cells, ...(categoryKey ? { category: categoryKey } : {}) } : "skip",
    ),
  );
  const coverage = useQuery(api.places.coverage, {});
  const [held, setHeld] = useState<ReadonlyMap<string, PlaceSummaryLike> | null>(null);
  // An answer is taken in once: `answer` is the same object until its content changes (useStable),
  // and the guard compares it with the last one taken in, so this settles after one extra render.
  const [absorbed, setAbsorbed] = useState<typeof answer>(undefined);
  if (answer !== undefined && answer !== absorbed && cells && bounds) {
    setAbsorbed(answer);
    setHeld(mergeLoaded(held, answer, cells, bounds));
  }
  // Zoomed out, there are towns and no places; before the first answer the page is still loading.
  const places = useMemo(() => {
    if (held === null && !searching) return zoomedOut ? [] : undefined;
    const rows = new Map(zoomedOut ? [] : (held ?? []));
    if (searching)
      for (const result of Object.values(searched))
        if (Array.isArray(result)) for (const row of result) rows.set(row._id, row);
    return [...rows.values()];
  }, [zoomedOut, held, searching, searched]);
  const towns = useMemo(
    () => (zoomedOut && coverage ? townMarkers(coverage, locale, region.defaultLocale) : []),
    [zoomedOut, coverage, locale, region.defaultLocale],
  );
  const today = useToday();
  const neighbourhoods = useQuery(
    api.missions.forRegion,
    today === null ? "skip" : { regionId: panel.regionId, now: today },
  );
  const all = useMemo(
    () => toHomeModel(places ?? [], locale, region, regions),
    [places, locale, region, regions],
  );
  const items = useMemo(
    () => exploreItems(all.items, { category, search, locale, position, view }),
    [all.items, category, search, locale, position, view],
  );
  const mapItems = useMemo(
    () => exploreItems(all.items, { category, search, locale, position }),
    [all.items, category, search, locale, position],
  );
  const model = useMemo(() => {
    const visible = new Map(mapItems.map((item) => [item.id, item]));
    return {
      ...all,
      items,
      markers: all.markers
        .filter((marker) => visible.has(marker.id))
        .map((marker) => {
          const distance = visible.get(marker.id)?.distance;
          return {
            ...marker,
            distanceLabel: distance === undefined ? undefined : distanceLabel(distance),
          };
        }),
    };
  }, [all, items, mapItems]);
  if (places === undefined && cells !== null) return <PublicLoading locale={locale} />;
  const select = (id: string) => {
    setSelectedId(id);
    document
      .getElementById(`explore-place-${id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "auto" });
  };
  const locate = () =>
    locateInBrowser(
      () => navigator.geolocation,
      (point) => {
        setPosition(point);
        setLocationOff(false);
      },
      () => setLocationOff(true),
    );
  return (
    <HomeView
      locale={locale}
      region={mapRegion}
      panel={panel}
      model={model}
      category={category}
      onCategoryChange={(next) => {
        setCategory(next);
        setRowLimit(50);
        setFitTo(fitForFilter(all.items, { category: next, search, locale, position, view }));
      }}
      search={search}
      onSearchChange={(next) => {
        setSearch(next);
        setRowLimit(50);
      }}
      view={view}
      onViewChange={onViewChange}
      zoomedOut={zoomedOut}
      towns={towns}
      heading={lookingName === undefined ? undefined : exploreHeading(locale, lookingName)}
      fitTo={fitTo}
      rowLimit={rowLimit}
      onShowMore={() => setRowLimit((limit) => limit + 50)}
      totalCount={all.items.length}
      hasDemo={all.items.some((item) => item.isMock)}
      hasStories={all.items.some((item) => item.hasStory)}
      latest={latest}
      neighbourhoods={neighbourhoods}
      onChooseNeighbourhood={(neighbourhood) => {
        setFitTo(fitForNeighbourhood(neighbourhood));
        setSheet("peek");
      }}
      position={position}
      locationOff={locationOff}
      selectedId={selectedId}
      onSelect={select}
      onLocate={locate}
      sheet={sheet}
      onSheetChange={setSheet}
      guideVisible={guideVisible}
      onDismissGuide={() => {
        dismissGuide(() => window.localStorage);
        setSheet("peek");
        window.dispatchEvent(new Event("noren:guide"));
      }}
    />
  );
}
