"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Map as LibreMap, MapMouseEvent } from "maplibre-gl";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { explorePadding, type Position, type SheetHeight } from "@/components/explore/helpers";
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
  setMarkerSelection,
  NOREN_PATH,
  type MapMarker,
} from "./map-helpers";

let workerUrlConfigured = false;

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
  };
  picker?: {
    value: { lat: number; lng: number } | null;
    onChange(point: { lat: number; lng: number }): void;
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
  const initiallyFitted = useRef<LibreMap | null>(null);
  const [runtime, setRuntime] = useState<{
    map: LibreMap;
    lib: typeof import("maplibre-gl");
    isActive(): boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const messages = messagesFor(placeUiMessages, locale);
  const credit = attributionText(attribution);
  const { lat, lng, zoom } = center;
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
          attributionControl: {
            compact: false,
            customAttribution: credit
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;"),
          },
        });
        map.on("error", (event) => {
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
    const placed = markers.map((marker) => {
      const button = document.createElement("button");
      button.type = "button";
      const presentation = markerPresentation(marker, messagesFor(badgeMessages, locale).demo);
      button.className = presentation.className;
      button.setAttribute("aria-label", presentation.label);
      button.dataset.mock = String(marker.isMock);
      button.dataset.markerId = marker.id;
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
      return new lib.Marker({ element: button }).setLngLat([marker.lng, marker.lat]).addTo(map);
    });
    if (!isExplore && (markers.length || bounds)) {
      map.fitBounds(
        boundsFor(markers, bounds ?? [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01]),
        { padding: 40, maxZoom: zoom, duration: 0 },
      );
    }
    return () => {
      placed.forEach((marker) => marker.remove());
    };
  }, [runtime, markers, bounds, locale, lng, lat, zoom, isExplore]);

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
      // The full sheet can cover the entire usable map. Fit once a window is available again.
      if (
        markers.length &&
        initiallyFitted.current !== map &&
        rect.height > padding.top + padding.bottom
      ) {
        map.fitBounds(boundsFor(markers, [lng, lat, lng, lat]), {
          padding,
          absolutePadding: true,
          maxZoom: 14,
          duration: 0,
        });
        initiallyFitted.current = map;
      }
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
  }, [runtime, isExplore, sheet, topOverlay, markers, lng, lat]);

  const selectedId = explore?.selectedId;
  const position = explore?.position;
  const selectedMarker = markers.find((marker) => marker.id === selectedId);
  useEffect(() => {
    if (!runtime?.isActive() || !isExplore) return;
    for (const element of container.current?.querySelectorAll<HTMLButtonElement>(
      "[data-marker-id]",
    ) ?? []) {
      const selected = element.dataset.markerId === selectedId;
      setMarkerSelection(element, selected);
    }
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
      <p className={isExplore ? "sr-only" : "font-medium"}>{label || messages.mapLabel}</p>
      {picker && (
        <p id={pickerHintId} className="text-sm">
          {messages.pickerHint}
        </p>
      )}
      <div
        ref={container}
        className={isExplore ? "h-full w-full" : "h-96 w-full rounded-lg border"}
      />
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
      <p className={isExplore ? "sr-only" : "text-sm text-muted-foreground"}>
        <span className="font-medium">{messages.attribution}: </span>
        {credit}
      </p>
    </section>
  );
}
