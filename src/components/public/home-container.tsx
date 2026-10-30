"use client";

import { Component, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { errorText } from "@/components/layout/error-text";
import {
  dismissGuide,
  distanceLabel,
  locateInBrowser,
  exploreItems,
  guideIsVisible,
  type Position,
  type SheetHeight,
} from "@/components/explore/helpers";
import type { Locale } from "@/lib/i18n";
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
  { locale: Locale; children: ReactNode },
  { failed: boolean; error?: unknown }
> {
  override state: { failed: boolean; error?: unknown } = { failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }
  override render() {
    return this.state.failed ? (
      <p role="alert">{errorText(this.state.error, this.props.locale)}</p>
    ) : (
      this.props.children
    );
  }
}

export function HomeContainer(props: { locale: Locale; region: PublicRegionProps }) {
  return (
    <PublicQueryBoundary locale={props.locale}>
      <HomeQuery {...props} />
    </PublicQueryBoundary>
  );
}

function HomeQuery({ locale, region }: { locale: Locale; region: PublicRegionProps }) {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
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
    () => exploreItems(all.items, { category, search, locale, position }),
    [all.items, category, search, locale, position],
  );
  const model = useMemo(() => {
    const visible = new Map(items.map((item) => [item.id, item]));
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
  }, [all, items]);
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
      onCategoryChange={setCategory}
      search={search}
      onSearchChange={setSearch}
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
