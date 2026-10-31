"use client";

import {
  Component,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ErrorMessage } from "@/components/layout/error-message";
import { ErrorPage } from "@/components/layout/error-page";
import {
  dismissGuide,
  distanceLabel,
  locateInBrowser,
  exploreItems,
  guideIsVisible,
  type MapView,
  type Position,
  type SheetHeight,
} from "@/components/explore/helpers";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { HomeView, PublicLoading } from "./home-view";
import { toHomeModel, type PublicRegionProps } from "./mapping";

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

export function HomeContainer(props: { locale: Locale; region: PublicRegionProps }) {
  return (
    <PublicQueryBoundary locale={props.locale} insideMain>
      <HomeQuery {...props} />
    </PublicQueryBoundary>
  );
}

function HomeQuery({ locale, region }: { locale: Locale; region: PublicRegionProps }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<MapView | null>(null);
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
  const places = useQuery(api.places.listForMap, { regionId: region.regionId });
  const all = useMemo(() => toHomeModel(places ?? [], locale, region), [places, locale, region]);
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
  if (places === undefined) return <PublicLoading locale={locale} />;
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
      region={region}
      model={model}
      category={category}
      onCategoryChange={(next) => {
        setCategory(next);
        setRowLimit(50);
      }}
      search={search}
      onSearchChange={(next) => {
        setSearch(next);
        setRowLimit(50);
      }}
      view={view}
      onViewChange={onViewChange}
      rowLimit={rowLimit}
      onShowMore={() => setRowLimit((limit) => limit + 50)}
      totalCount={all.items.length}
      hasDemo={all.items.some((item) => item.isMock)}
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
