"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as LibreMap, Marker } from "maplibre-gl";
import { attributionText, boundsFor, isWorkerFailure } from "@/components/map/map-helpers";
import { DEFAULT_IDEOGRAPH_FONT } from "@/lib/geo";
import { messagesFor, type Locale } from "@/lib/i18n";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { trailMessages } from "@/lib/i18n/messages/trail";

const LINES_SOURCE = "trail-lines";
const LINES_LAYER = "trail-lines-layer";
let workerUrlConfigured = false;

export type TrailSeal = {
  id: string;
  lat: number;
  lng: number;
  /** The place's name, for a screen reader. */
  label: string;
  /** The one character the seal carries. */
  glyph: string;
  lang: string;
};
/** One trip's footprints in order, as [lng, lat] points. */
export type TrailLine = { id: string; points: readonly (readonly [number, number])[] };

const SEAL =
  "flex size-11 items-center justify-center rounded-full border-2 font-display text-[18px] leading-none font-extrabold shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

/** A seal is beni ink on white; the one that is open turns solid. */
function paint(button: HTMLElement, selected: boolean): void {
  button.className = `${SEAL} border-beni ${selected ? "bg-beni text-white" : "bg-white text-beni"}`;
  button.setAttribute("aria-pressed", String(selected));
}

function linesToFeatures(lines: readonly TrailLine[]) {
  return {
    type: "FeatureCollection" as const,
    features: lines
      .filter((line) => line.points.length > 1)
      .map((line) => ({
        type: "Feature" as const,
        properties: { id: line.id },
        geometry: {
          type: "LineString" as const,
          coordinates: line.points.map(([lng, lat]) => [lng, lat]),
        },
      })),
  };
}

/**
 * A person's own places as small seals, joined by a line in the order they went. It draws what it is
 * given and carries no counts. Every pin is the person's own stamped place.
 */
export function TrailMap({
  locale,
  label,
  styleUrl,
  attribution,
  center,
  seals,
  lines,
  selectedId,
  onSelect,
}: {
  locale: Locale;
  label: string;
  styleUrl: string;
  attribution: readonly string[];
  center: { lat: number; lng: number; zoom: number };
  seals: readonly TrailSeal[];
  lines: readonly TrailLine[];
  selectedId: string | null;
  onSelect(id: string): void;
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(onSelect);
  useEffect(() => {
    callbacks.current = onSelect;
  }, [onSelect]);
  const lineData = useRef(linesToFeatures(lines));
  const buttons = useRef(new Map<string, HTMLElement>());
  const [runtime, setRuntime] = useState<{
    map: LibreMap;
    lib: typeof import("maplibre-gl");
    isActive(): boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const credit = attributionText(attribution);
  const { lat, lng, zoom } = center;

  useEffect(() => {
    let disposed = false;
    let map: LibreMap | undefined;
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([lib]) => {
        if (disposed || !container.current) return;
        if (!workerUrlConfigured) {
          lib.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
          workerUrlConfigured = true;
        }
        map = new lib.Map({
          container: container.current,
          style: styleUrl,
          center: [lng, lat],
          zoom,
          keyboard: true,
          localIdeographFontFamily: DEFAULT_IDEOGRAPH_FONT,
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
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        setRuntime({ map, lib, isActive: () => !disposed });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [styleUrl, lng, lat, zoom, credit]);

  // The line under the seals, drawn once the style is ready and refreshed as the trips shown change.
  useEffect(() => {
    lineData.current = linesToFeatures(lines);
    if (!runtime?.isActive()) return;
    const { map } = runtime;
    const source = map.getSource<GeoJSONSource>(LINES_SOURCE);
    if (source) void source.setData(lineData.current).catch(() => undefined);
  }, [runtime, lines]);
  useEffect(() => {
    if (!runtime?.isActive()) return;
    const { map } = runtime;
    const load = () => {
      if (!runtime.isActive() || map.getSource(LINES_SOURCE)) return;
      map.addSource(LINES_SOURCE, { type: "geojson", data: lineData.current });
      map.addLayer({
        id: LINES_LAYER,
        type: "line",
        source: LINES_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#b7282e",
          "line-width": 3,
          "line-opacity": 0.75,
          "line-dasharray": [2, 2],
        },
      });
    };
    map.on("load", load);
    if (map.isStyleLoaded()) load();
    return () => {
      map.off("load", load);
    };
  }, [runtime]);

  // The seals. Rebuilt when the places shown change; the open one is repainted below.
  const selected = useRef(selectedId);
  useEffect(() => {
    selected.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    if (!runtime?.isActive()) return;
    const { map, lib } = runtime;
    const placed: Marker[] = seals.map((seal) => {
      const button = document.createElement("button");
      button.type = "button";
      button.lang = seal.lang;
      button.textContent = seal.glyph;
      button.setAttribute("aria-label", seal.label);
      paint(button, seal.id === selected.current);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        callbacks.current(seal.id);
      });
      buttons.current.set(seal.id, button);
      // The library styles the element it is given, so the button sits inside a plain wrapper.
      const wrapper = document.createElement("div");
      wrapper.append(button);
      return new lib.Marker({ element: wrapper }).setLngLat([seal.lng, seal.lat]).addTo(map);
    });
    const mine = buttons.current;
    const [first] = seals;
    if (first && seals.length === 1) {
      map.jumpTo({ center: [first.lng, first.lat], zoom: 15 });
    } else if (first) {
      map.fitBounds(boundsFor(seals, [lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01]), {
        padding: 56,
        maxZoom: 15,
        duration: 0,
      });
    }
    return () => {
      placed.forEach((marker) => marker.remove());
      mine.clear();
    };
  }, [runtime, seals, lng, lat]);

  useEffect(() => {
    for (const [id, button] of buttons.current) paint(button, id === selectedId);
    const seal = seals.find(({ id }) => id === selectedId);
    if (!runtime?.isActive() || !seal) return;
    const phone = !window.matchMedia("(min-width: 1024px)").matches;
    const height = runtime.map.getCanvas().clientHeight;
    // The sheet covers the lower half on a phone and the right edge on a desktop, so the seal is
    // centred in what is left.
    runtime.map.easeTo({
      center: [seal.lng, seal.lat],
      zoom: Math.max(runtime.map.getZoom(), 14),
      padding: {
        top: 0,
        left: 0,
        right: phone ? 0 : 336,
        bottom: phone ? Math.round(height * 0.5) : 0,
      },
    });
  }, [runtime, seals, selectedId]);

  const m = messagesFor(trailMessages, locale);
  const ui = messagesFor(placeUiMessages, locale);
  return (
    <section lang={locale} aria-label={label} className="relative h-full w-full">
      <div ref={container} data-trail-map="" className="h-full w-full" />
      {failed && (
        <p
          role="status"
          className="absolute bottom-2 left-2 max-w-64 rounded-[10px] bg-white p-3 text-sm"
        >
          {m.mapFailed}
        </p>
      )}
      <p className="sr-only">
        <span className="font-medium">{ui.attribution}: </span>
        {credit}
      </p>
    </section>
  );
}
