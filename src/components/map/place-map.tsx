"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type {
  GeoJSONSource,
  Map as LibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
} from "maplibre-gl";
import { LocateFixed, Minus, Plus } from "lucide-react";
import {
  explorePadding,
  type MapView,
  type Position,
  type SheetHeight,
} from "@/components/explore/helpers";
import { Button } from "@/components/ui/button";
import { DEFAULT_IDEOGRAPH_FONT } from "@/lib/geo";
import { messagesFor, type Locale } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import {
  attributionText,
  boundsFor,
  isWorkerFailure,
  MAPLIBRE_WORKER_PATH,
  normalisePoint,
  markerPresentation,
  markersToFeatures,
  visibleView,
  NOREN_PATH,
  type MapMarker,
} from "./map-helpers";

let workerUrlConfigured = false;
const PLACES_SOURCE = "explore-places";
const CLUSTERS_LAYER = "explore-clusters";
const COUNT_LAYER = "explore-cluster-count";
const PLACES_LAYER = "explore-single-places";
const STORY_ICON = "explore-noren-story";
const PLAIN_ICON = "explore-noren-plain";

function addNorenImages(map: LibreMap): void {
  for (const [id, hasStory] of [
    [STORY_ICON, true],
    [PLAIN_ICON, false],
  ] as const) {
    const canvas = document.createElement("canvas");
    canvas.width = 56;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot draw map icons");
    context.scale(2, 2);
    context.fillStyle = hasStory ? "#f2c14e" : "#23305c";
    context.strokeStyle = hasStory ? "#23305c" : "#ffffff";
    context.lineWidth = hasStory ? 2 : 1;
    const path = new Path2D(NOREN_PATH);
    context.fill(path);
    context.stroke(path);
    map.addImage(id, context.getImageData(0, 0, 56, 64), { pixelRatio: 2 });
  }
}

export type PlaceMapProps = {
  locale: Locale;
  label: string;
  styleUrl: string;
  attribution: readonly string[];
  center: { lat: number; lng: number; zoom: number };
  bounds?: readonly [number, number, number, number];
  markers: readonly MapMarker[];
  explore?: {
    selectedId?: string | null;
    sheet?: SheetHeight;
    topOverlay?: RefObject<HTMLDivElement | null>;
    onSelect?(id: string): void;
    position?: Position | null;
    onLocate?(): void;
    /** Called once the map has loaded and again each time it stops moving. */
    onViewChange?(view: MapView): void;
  };
  picker?: {
    value: { lat: number; lng: number } | null;
    onChange(point: { lat: number; lng: number }): void;
    /**
     * Shows a centre crosshair and a button with this label that places the pin there: the touch
     * equivalent of Enter on the map. The keyboard hint then moves to screen readers only, and so does
     * the map's own label, because a picker with this button sits in a form that has its own heading.
     */
    centreLabel?: string;
  };
  localIdeographFontFamily?: string;
};

export function PlaceMap({
  locale,
  label,
  styleUrl,
  attribution,
  center,
  bounds,
  markers,
  picker,
  explore,
  localIdeographFontFamily = DEFAULT_IDEOGRAPH_FONT,
}: PlaceMapProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const pickerHintId = useId();
  const locationNoteId = useId();
  const callbacks = useRef(explore);
  useEffect(() => {
    callbacks.current = explore;
  }, [explore]);
  const isExplore = Boolean(explore);
  const [runtime, setRuntime] = useState<{
    map: LibreMap;
    lib: typeof import("maplibre-gl");
    isActive(): boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const messages = messagesFor(placeUiMessages, locale);
  const credit = attributionText(attribution);
  const { lat, lng, zoom } = center;
  const selectedId = explore?.selectedId;
  const selectedMarker = markers.find((marker) => marker.id === selectedId);
  const layerData = useRef(markersToFeatures(markers, selectedId));
  useEffect(() => {
    let disposed = false;
    let map: LibreMap | undefined;
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([lib]) => {
        if (disposed || !container.current) return;
        // The shared worker pool initializes with the first Map (or prewarm).
        if (!workerUrlConfigured) {
          lib.setWorkerUrl(MAPLIBRE_WORKER_PATH);
          workerUrlConfigured = true;
        }
        map = new lib.Map({
          container: container.current,
          style: styleUrl,
          center: [lng, lat],
          zoom,
          keyboard: true,
          localIdeographFontFamily,
          // Non-explore maps render one linked credit below, instead of merging style credits.
          attributionControl: isExplore
            ? {
                compact: false,
                customAttribution: credit
                  .replaceAll("&", "&amp;")
                  .replaceAll("<", "&lt;")
                  .replaceAll(">", "&gt;")
                  .replaceAll('"', "&quot;"),
              }
            : false,
        });
        map.on("error", (event) => {
          // A single tile or sprite request can fail on a working map, so only a worker failure counts.
          if (!disposed && isWorkerFailure(event.error)) setFailed(true);
        });
        if (!isExplore) map.addControl(new lib.NavigationControl());
        setRuntime({ map, lib, isActive: () => !disposed });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [styleUrl, lng, lat, zoom, localIdeographFontFamily, credit, isExplore]);

  useEffect(() => {
    if (!runtime || !runtime.isActive()) return;
    const { map, lib } = runtime;
    const domMarkers = isExplore ? (selectedMarker ? [selectedMarker] : []) : markers;
    const placed = domMarkers.map((marker) => {
      const button = document.createElement("button");
      button.type = "button";
      const presentation = markerPresentation(
        marker,
        messagesFor(badgeMessages, locale).demo,
        isExplore,
      );
      button.className = presentation.className;
      button.setAttribute("aria-label", presentation.label);
      button.dataset.mock = String(marker.isMock);
      button.dataset.markerId = marker.id;
      if (isExplore) {
        button.setAttribute("aria-pressed", "true");
        button.style.zIndex = "1";
      }
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 28 32");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "32");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", NOREN_PATH);
      path.setAttribute("fill", presentation.fill);
      path.setAttribute("stroke", presentation.stroke);
      path.setAttribute("stroke-width", presentation.strokeWidth);
      svg.append(path);
      button.append(svg);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (callbacks.current) callbacks.current.onSelect?.(marker.id);
        else if (marker.href) window.location.assign(marker.href);
      });
      return new lib.Marker({
        element: button,
        ...(isExplore ? { anchor: "bottom" as const } : {}),
      })
        .setLngLat([marker.lng, marker.lat])
        .addTo(map);
    });
    const singleMarker = markers.length === 1 ? markers[0] : undefined;
    if (!isExplore && singleMarker && !bounds) {
      map.jumpTo({ center: [singleMarker.lng, singleMarker.lat], zoom });
    } else if (!isExplore && (markers.length || bounds)) {
      map.fitBounds(
        boundsFor(markers, bounds ?? [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01]),
        { padding: 40, maxZoom: zoom, duration: 0 },
      );
    }
    return () => {
      placed.forEach((marker) => marker.remove());
    };
  }, [runtime, markers, selectedMarker, bounds, locale, lng, lat, zoom, isExplore]);

  useEffect(() => {
    layerData.current = markersToFeatures(markers, selectedId);
    if (!runtime?.isActive() || !isExplore) return;
    const source = runtime.map.getSource<GeoJSONSource>(PLACES_SOURCE);
    // Source work can finish after a filter change or the map has been removed.
    if (source) void source.setData(layerData.current).catch(() => undefined);
  }, [runtime, markers, selectedId, isExplore]);

  useEffect(() => {
    if (!runtime?.isActive() || !isExplore) return;
    const { map } = runtime;
    let active = true;
    const select = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties.id;
      if (typeof id === "string") callbacks.current?.onSelect?.(id);
    };
    const expand = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (feature?.geometry.type !== "Point") return;
      const clusterId = feature.properties.cluster_id;
      if (typeof clusterId !== "number") return;
      const [lng, lat] = feature.geometry.coordinates;
      const source = map.getSource<GeoJSONSource>(PLACES_SOURCE);
      const data = layerData.current;
      void source
        ?.getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          if (active && runtime.isActive() && layerData.current === data) {
            map.easeTo({ center: [lng, lat], zoom });
          }
        })
        .catch(() => undefined);
    };
    const enter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
    };
    const load = () => {
      if (!active || !runtime.isActive() || map.getSource(PLACES_SOURCE)) return;
      addNorenImages(map);
      map.addSource(PLACES_SOURCE, {
        type: "geojson",
        data: layerData.current,
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 15,
      });
      map.addLayer({
        id: CLUSTERS_LAYER,
        type: "circle",
        source: PLACES_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#23305c",
          "circle-radius": ["step", ["get", "point_count"], 18, 20, 23, 100, 29],
        },
      });
      map.addLayer({
        id: COUNT_LAYER,
        type: "symbol",
        source: PLACES_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: PLACES_LAYER,
        type: "symbol",
        source: PLACES_SOURCE,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["case", ["get", "hasStory"], STORY_ICON, PLAIN_ICON],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
        },
      });
    };
    map.on("click", PLACES_LAYER, select);
    map.on("click", CLUSTERS_LAYER, expand);
    for (const layer of [PLACES_LAYER, CLUSTERS_LAYER]) {
      map.on("mouseenter", layer, enter);
      map.on("mouseleave", layer, leave);
    }
    map.on("load", load);
    if (map.isStyleLoaded()) load();
    return () => {
      active = false;
      map.off("load", load);
      map.off("click", PLACES_LAYER, select);
      map.off("click", CLUSTERS_LAYER, expand);
      for (const layer of [PLACES_LAYER, CLUSTERS_LAYER]) {
        map.off("mouseenter", layer, enter);
        map.off("mouseleave", layer, leave);
      }
    };
  }, [runtime, isExplore]);

  const sheet = explore?.sheet ?? "peek";
  const topOverlay = explore?.topOverlay;
  useEffect(() => {
    if (!runtime?.isActive() || !isExplore || !container.current) return;
    const { map } = runtime;
    const element = container.current;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (!runtime.isActive()) return;
      const rect = element.getBoundingClientRect();
      const overlayBottom = topOverlay?.current?.getBoundingClientRect().bottom;
      const padding = desktop.matches
        ? { top: 0, bottom: 0, left: 0, right: 0 }
        : explorePadding(
            sheet,
            rect.height,
            overlayBottom === undefined ? 132 : overlayBottom - rect.top,
          );
      map.stop();
      map.jumpTo({ center: map.getCenter(), padding });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (topOverlay?.current) observer.observe(topOverlay.current);
    desktop.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", update);
    };
  }, [runtime, isExplore, sheet, topOverlay]);

  useEffect(() => {
    if (!runtime?.isActive() || !isExplore) return;
    const { map } = runtime;
    let loaded = map.isStyleLoaded();
    const report = () => {
      if (loaded && runtime.isActive()) {
        callbacks.current?.onViewChange?.(visibleView(map, map.getPadding()));
      }
    };
    const load = () => {
      loaded = true;
      report();
    };
    map.on("load", load);
    map.on("moveend", report);
    report();
    return () => {
      map.off("load", load);
      map.off("moveend", report);
    };
  }, [runtime, isExplore]);

  const position = explore?.position;
  useEffect(() => {
    if (!runtime?.isActive() || !isExplore) return;
    if (!selectedMarker) return;
    const { map, lib } = runtime;
    const content = document.createElement("div");
    content.className = "max-w-56 break-words p-2 font-sans text-[15px] text-kon";
    const name = document.createElement("p");
    name.className = "font-bold";
    name.textContent = selectedMarker.isMock
      ? `${selectedMarker.label} (${messagesFor(badgeMessages, locale).demo})`
      : selectedMarker.label;
    content.append(name);
    const meta = document.createElement("p");
    meta.textContent = [selectedMarker.categoryLabel, selectedMarker.distanceLabel]
      .filter(Boolean)
      .join(", ");
    content.append(meta);
    if (selectedMarker.href) {
      const link = document.createElement("a");
      link.href = selectedMarker.href;
      link.textContent = messages.openPlace;
      link.className = "inline-flex min-h-11 items-center text-ai underline";
      content.append(link);
    }
    const popup = new lib.Popup({
      anchor: "bottom",
      offset: 24,
      closeButton: false,
      closeOnClick: false,
      maxWidth: "240px",
    })
      .setLngLat([selectedMarker.lng, selectedMarker.lat])
      .setDOMContent(content)
      .addTo(map);
    return () => {
      popup.remove();
    };
  }, [runtime, selectedId, selectedMarker, markers, isExplore, locale, messages.openPlace]);

  const selectedLat = selectedMarker?.lat;
  const selectedLng = selectedMarker?.lng;
  useEffect(() => {
    if (!runtime?.isActive() || selectedLat === undefined || selectedLng === undefined) return;
    runtime.map.flyTo({
      center: [selectedLng, selectedLat],
      zoom: Math.max(runtime.map.getZoom(), 15),
    });
  }, [runtime, selectedId, selectedLat, selectedLng]);

  useEffect(() => {
    if (!runtime?.isActive() || !position) return;
    const dot = document.createElement("div");
    dot.className = "size-4 rounded-full border-2 border-white bg-ai ring-2 ring-ai";
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", messages.yourLocation);
    const marker = new runtime.lib.Marker({ element: dot })
      .setLngLat([position.lng, position.lat])
      .addTo(runtime.map);
    runtime.map.flyTo({ center: [position.lng, position.lat], zoom: 15 });
    return () => {
      marker.remove();
    };
  }, [runtime, position, messages.yourLocation]);

  useEffect(() => {
    if (runtime?.isActive()) {
      runtime.map.getCanvas().setAttribute("aria-label", label || messages.mapLabel);
    }
  }, [runtime, label, messages.mapLabel]);

  useEffect(() => {
    if (!runtime || !runtime.isActive() || !picker) return;
    const { map, lib } = runtime;
    const pin = picker.value
      ? new lib.Marker({ draggable: true })
          .setLngLat([picker.value.lng, picker.value.lat])
          .addTo(map)
      : null;
    pin?.getElement().setAttribute("aria-label", label || messages.mapLabel);
    pin?.on("dragend", () => picker.onChange(normalisePoint(pin.getLngLat())));
    const move = (event: MapMouseEvent) => picker.onChange(normalisePoint(event.lngLat));
    const canvas = map.getCanvas();
    canvas.setAttribute("aria-describedby", pickerHintId);
    const placeAtCentre = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      picker.onChange(normalisePoint(map.getCenter()));
    };
    canvas.addEventListener("keydown", placeAtCentre);
    map.on("click", move);
    return () => {
      map.off("click", move);
      canvas.removeEventListener("keydown", placeAtCentre);
      canvas.removeAttribute("aria-describedby");
      pin?.remove();
    };
  }, [runtime, picker, label, messages.mapLabel, pickerHintId]);

  return (
    <section
      lang={locale}
      aria-label={label || messages.mapLabel}
      className={isExplore ? "relative h-full w-full" : "space-y-2"}
    >
      <p className={isExplore || picker?.centreLabel ? "sr-only" : "font-medium"}>
        {label || messages.mapLabel}
      </p>
      {picker && (
        <p id={pickerHintId} className={picker.centreLabel ? "sr-only" : "text-sm"}>
          {messages.pickerHint}
        </p>
      )}
      <div
        data-map-frame
        className={
          isExplore ? "h-full w-full" : "relative h-96 w-full overflow-hidden rounded-lg border"
        }
      >
        <div ref={container} className="h-full w-full" />
        {picker?.centreLabel && (
          <span
            aria-hidden="true"
            data-map-crosshair
            className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-4xl leading-none font-bold text-kon [text-shadow:0_0_3px_white,0_0_3px_white]"
          >
            +
          </span>
        )}
        {!isExplore && !failed && (
          <div
            data-map-credit
            className="absolute bottom-0 left-0 right-0 z-10 bg-white px-1 text-[13px] leading-5 text-kon"
          >
            <a href="https://www.openstreetmap.org/copyright" className="underline">
              © OpenStreetMap contributors
            </a>
            {" | "}
            <a href="https://openfreemap.org/" className="underline">
              OpenFreeMap
            </a>
            {" | "}
            <a href="https://openmaptiles.org/" className="underline">
              © OpenMapTiles
            </a>
          </div>
        )}
      </div>
      {picker?.centreLabel && (
        <Button
          type="button"
          disabled={!runtime || failed}
          onClick={() => runtime && picker.onChange(normalisePoint(runtime.map.getCenter()))}
          className="min-h-11 w-full rounded-[10px] px-4 whitespace-normal"
        >
          {picker.centreLabel}
        </Button>
      )}
      {isExplore && (
        <div className="absolute right-3 top-36 z-10 flex flex-col gap-2 lg:top-5">
          <p id={locationNoteId} className="sr-only">
            {messages.locateNote}
          </p>
          <button
            type="button"
            aria-label={messages.locate}
            aria-describedby={locationNoteId}
            onClick={() => explore?.onLocate?.()}
            className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-white text-ai shadow-[var(--shadow-float)]"
          >
            <LocateFixed aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            aria-label={messages.zoomIn}
            onClick={() => runtime?.map.zoomIn()}
            className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-white shadow-[var(--shadow-float)]"
          >
            <Plus aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            aria-label={messages.zoomOut}
            onClick={() => runtime?.map.zoomOut()}
            className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-white shadow-[var(--shadow-float)]"
          >
            <Minus aria-hidden="true" size={22} />
          </button>
        </div>
      )}
      {failed && (
        <p
          role="status"
          className={
            isExplore
              ? "absolute bottom-2 left-2 max-w-64 rounded-[10px] bg-white p-3 text-sm"
              : "text-sm"
          }
        >
          {messages.mapFailed}
        </p>
      )}
      <p className={isExplore || !failed ? "sr-only" : "text-sm text-muted-foreground"}>
        <span className="font-medium">{messages.attribution}: </span>
        {credit}
      </p>
    </section>
  );
}
