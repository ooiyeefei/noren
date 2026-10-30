"use client";

import { useId, useRef } from "react";
import { Search, X } from "lucide-react";
import { categoryOptions } from "./category";
import { PlaceList } from "@/components/places/place-list";
import { PlaceMap } from "@/components/map/place-map";
import { SiteFooter } from "@/components/layout/site-footer";
import { ExploreGuide } from "@/components/explore/guide";
import { NorenTab } from "@/components/explore/noren-tab";
import { draggedSheet, type Position, type SheetHeight } from "@/components/explore/helpers";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import type { PublicRegionProps, toHomeModel } from "./mapping";

export function PublicLoading({ locale }: { locale: Locale }) {
  const m = messagesFor(publicMessages, locale);
  return (
    <div lang={locale} className="h-[calc(100dvh-56px)] bg-kamenozoki p-6">
      <h1 className="sr-only font-display lg:not-sr-only lg:text-4xl">{m.exploreTitle}</h1>
      <p role="status" className="mt-6">
        {m.loading}
      </p>
    </div>
  );
}

export function HomeView({
  locale,
  region,
  model,
  category = "",
  search = "",
  totalCount,
  hasDemo,
  position,
  locationOff = false,
  selectedId,
  sheet: requestedSheet = "peek",
  guideVisible = true,
  onCategoryChange,
  onSearchChange,
  onSelect,
  onLocate,
  onSheetChange,
  onDismissGuide,
}: {
  locale: Locale;
  region: PublicRegionProps;
  model: ReturnType<typeof toHomeModel>;
  category?: string;
  search?: string;
  totalCount?: number;
  hasDemo?: boolean;
  position?: Position | null;
  locationOff?: boolean;
  selectedId?: string | null;
  sheet?: SheetHeight;
  guideVisible?: boolean;
  onCategoryChange?(category: string): void;
  onSearchChange?(search: string): void;
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
  const categories = categoryOptions(region, locale);
  const chips = [
    { key: "", label: m.all },
    ...categories,
    ...((hasDemo ?? model.items.some((item) => item.isMock))
      ? [{ key: "demo", label: m.demoChip }]
      : []),
  ];
  const selectedChip = chips.find((chip) => chip.key === category)?.label ?? m.allPlaces;
  const emptyText =
    (totalCount ?? model.items.length) === 0
      ? m.noPlaces
      : category === "cafe"
        ? m.noCafeMatches
        : format(m.noMatches, {
            category: category ? selectedChip.toLocaleLowerCase(locale) : m.allPlaces,
          });
  const searchAndChips = (
    <>
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
      <div
        role="group"
        aria-label={m.category}
        className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible"
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
                ? "min-h-11 shrink-0 rounded-full border border-ai bg-ai px-4 text-[13px] font-bold text-white"
                : "min-h-11 shrink-0 rounded-full border border-input bg-white px-4 text-[13px] text-kon hover:bg-kamenozoki"
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
      className="relative isolate h-[calc(100dvh-56px)] overflow-hidden bg-kamenozoki text-kon lg:grid lg:grid-cols-[400px_minmax(0,1fr)]"
    >
      <section
        aria-label={m.places}
        className="pointer-events-none relative z-20 h-full min-w-0 lg:pointer-events-auto lg:flex lg:flex-col lg:bg-white"
      >
        <div
          ref={topOverlay}
          className="pointer-events-auto absolute inset-x-3 top-3 lg:static lg:p-5 lg:pb-3"
        >
          <h1 className="sr-only font-display text-4xl leading-tight lg:not-sr-only lg:mb-5">
            {m.exploreTitle}
          </h1>
          {searchAndChips}
        </div>
        <div
          data-sheet={sheet}
          className={
            sheet === "full"
              ? "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:relative lg:min-h-0 lg:h-auto lg:flex-1 lg:rounded-none lg:shadow-none"
              : sheet === "half"
                ? "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[55%] max-h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:relative lg:min-h-0 lg:h-auto lg:flex-1 lg:max-h-none lg:rounded-none lg:shadow-none"
                : "pointer-events-auto absolute inset-x-0 bottom-0 flex h-[264px] max-h-[calc(100%-132px)] flex-col rounded-t-[20px] bg-white shadow-[var(--shadow-float)] transition-[height] duration-200 lg:relative lg:min-h-0 lg:h-auto lg:flex-1 lg:max-h-none lg:rounded-none lg:shadow-none"
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
          <div id={`${id}-list`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {guideVisible && (
              <div className="mx-4 mb-3 lg:mt-4">
                <ExploreGuide locale={locale} onDismiss={onDismissGuide} />
              </div>
            )}
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4">
              <p role="status" className="text-[15px] font-bold">
                {format(model.items.length === 1 ? m.countOne : m.count, { n: model.items.length })}
              </p>
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
              items={model.items}
              emptyText={emptyText}
              selectedId={selectedId}
              onSelect={onSelect}
            />
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
          explore={{ selectedId, onSelect, position, onLocate, sheet, topOverlay }}
        />
      </div>
    </div>
  );
}
