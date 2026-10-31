import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaceMap, type PlaceMapProps } from "@/components/map/place-map";
import {
  attributionText,
  boundsFor,
  markerPresentation,
  normalisePoint,
  setMarkerSelection,
} from "@/components/map/map-helpers";
import { NorenTab } from "@/components/explore/noren-tab";
import { PlaceList } from "@/components/places/place-list";
import { EmbedView, type EmbedSourceView } from "@/components/embeds/embed-view";
import { EmbedNotice } from "@/components/embeds/embed-notice";
import { embedPlan, isAllowedOrigin, loadEmbedScript } from "@/components/embeds/embed-scripts";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import type { EmbedDescriptor } from "@/lib/ports";

const mapState = vi.hoisted(() => ({
  failed: false,
  capture: false,
  effects: [] as Array<() => void | (() => void)>,
  options: null as Record<string, unknown> | null,
  runtime: null as unknown,
  element: null as unknown,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      if (mapState.capture) mapState.effects.push(effect);
      actual.useEffect(effect, deps);
    },
    useRef: (initial: unknown) => {
      if (mapState.runtime) {
        const index = mapState.refIndex++;
        return (mapState.refs[index] ??= { current: initial ?? mapState.element });
      }
      return actual.useRef(mapState.capture && initial === null ? {} : initial);
    },
    useState: (initial: unknown) =>
      actual.useState(
        initial === false ? mapState.failed : initial === null ? mapState.runtime : initial,
      ),
  };
});

vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    constructor(options: Record<string, unknown>) {
      mapState.options = options;
    }
    on() {}
    addControl() {}
    remove() {}
  },
  NavigationControl: class {},
}));

const source: EmbedSourceView = {
  id: "mock-post",
  platform: "instagram",
  canonicalUrl: "https://www.instagram.com/p/mock/",
  embed: {
    kind: "blockquote",
    url: "https://www.instagram.com/p/mock/",
    scriptUrl: "https://www.instagram.com/embed.js",
  },
  authorHandle: "@mock_creator",
  authorUrl: "https://www.instagram.com/mock_creator/",
  isMock: true,
  postedAt: Date.UTC(2026, 9, 29),
  creatorNote: "A mock note",
  noteLang: "en",
};
const renderEmbed = (embed: EmbedDescriptor = source.embed, title?: string) =>
  renderToStaticMarkup(
    <EmbedView
      locale="en"
      source={{ ...source, embed, title }}
      scriptOrigins={["https://www.instagram.com"]}
      frameOrigins={["https://www.youtube-nocookie.com"]}
    />,
  );

describe("place UI", () => {
  it("explore loads one clustered layer set, updates data, selects, expands, reports and unmounts safely", async () => {
    type Listener = (event?: unknown) => void;
    const listeners = new Map<string, Set<Listener>>();
    const emit = (key: string, event?: unknown) => {
      for (const listener of listeners.get(key) ?? []) listener(event);
    };
    const node = () => ({
      type: "",
      className: "",
      dataset: {},
      style: {},
      setAttribute: vi.fn(),
      append: vi.fn(),
      addEventListener: vi.fn(),
    });
    const canvas = { ...node(), clientWidth: 400, clientHeight: 800, style: { cursor: "" } };
    const context = {
      scale: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      getImageData: vi.fn(() => ({
        width: 56,
        height: 64,
        data: new Uint8ClampedArray(56 * 64 * 4),
      })),
    };
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        tag === "canvas" ? { ...node(), getContext: () => context } : node(),
      createElementNS: node,
    });
    vi.stubGlobal(
      "Path2D",
      class {
        constructor(readonly path: string) {}
      },
    );
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    let loaded = false;
    let active = true;
    let installed = false;
    let padding = { top: 0, bottom: 0, left: 0, right: 0 };
    let expansion: ((zoom: number) => void) | undefined;
    const source = {
      setData: vi.fn().mockResolvedValue(undefined),
      getClusterExpansionZoom: vi.fn(
        () =>
          new Promise<number>((resolve) => {
            expansion = resolve;
          }),
      ),
    };
    const map = {
      getSource: vi.fn(() => (installed ? source : undefined)),
      addSource: vi.fn(() => {
        installed = true;
      }),
      addImage: vi.fn(),
      addLayer: vi.fn(),
      on: (
        event: string,
        layer: string | ((event?: unknown) => void),
        callback?: (event?: unknown) => void,
      ) => {
        const key = `${event}:${typeof layer === "string" ? layer : ""}`;
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key)!.add(typeof layer === "string" ? callback! : layer);
      },
      off: (event: string, layer: string | Listener, callback?: Listener) => {
        const key = `${event}:${typeof layer === "string" ? layer : ""}`;
        const handlers = listeners.get(key);
        handlers?.delete(typeof layer === "string" ? callback! : layer);
        if (!handlers?.size) listeners.delete(key);
      },
      isStyleLoaded: () => loaded,
      getCanvas: () => canvas,
      getPadding: () => padding,
      unproject: ([x, y]: [number, number]) => ({ lng: 129 + x / 400, lat: 34 - y / 800 }),
      getCenter: () => ({ lng: 129, lat: 32 }),
      getZoom: () => 12,
      stop: vi.fn(),
      fitBounds: vi.fn(),
      flyTo: vi.fn(),
      easeTo: vi.fn(),
      jumpTo: vi.fn((options: { padding: typeof padding }) => {
        padding = options.padding;
      }),
    };
    const domMarkers: Array<{
      options: { element: ReturnType<typeof node>; anchor?: string };
      remove: ReturnType<typeof vi.fn>;
    }> = [];
    class Marker {
      remove = vi.fn();
      constructor(readonly options: { element: ReturnType<typeof node>; anchor?: string }) {
        domMarkers.push(this);
      }
      setLngLat() {
        return this;
      }
      addTo() {
        return this;
      }
    }
    class Popup {
      setLngLat() {
        return this;
      }
      setDOMContent() {
        return this;
      }
      addTo() {
        return this;
      }
      remove() {}
    }
    const select = vi.fn();
    const view = vi.fn();
    const props: PlaceMapProps = {
      locale: "en",
      label: "Mock map",
      styleUrl: "mock.json",
      attribution: ["Mock credit"],
      center: { lng: 129, lat: 32, zoom: 12 },
      markers: [
        {
          id: "selected",
          label: "Mock selected",
          isMock: true,
          hasStory: true,
          lng: 129.8,
          lat: 32.7,
        },
        { id: "plain", label: "Mock plain", isMock: false, lng: 129.9, lat: 32.8 },
      ],
      explore: { selectedId: "selected", sheet: "half", onSelect: select, onViewChange: view },
    };
    const render = (props: PlaceMapProps) => {
      mapState.effects = [];
      mapState.refIndex = 0;
      renderToStaticMarkup(<PlaceMap {...props} />);
      return mapState.effects;
    };
    mapState.capture = true;
    mapState.element = { getBoundingClientRect: () => ({ height: 800, top: 0 }) };
    mapState.runtime = { map, lib: { Marker, Popup }, isActive: () => active };
    mapState.refs = [];
    const cleanups: Array<() => void> = [];
    try {
      const effects = render(props);
      for (const [index, effect] of effects.entries()) {
        if (index === 1) continue; // The map constructor is covered separately.
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
      expect(map.addSource).not.toHaveBeenCalled();
      expect(map.addImage).not.toHaveBeenCalled();
      expect(map.fitBounds).not.toHaveBeenCalled();
      expect(view).not.toHaveBeenCalled();
      expect(domMarkers).toHaveLength(1);
      expect(domMarkers[0]!.options.anchor).toBe("bottom");
      expect(domMarkers[0]!.options.element.setAttribute).toHaveBeenCalledWith(
        "aria-label",
        "Mock selected (Demo)",
      );
      expect(domMarkers[0]!.options.element.className).toContain("ring-ai");
      expect(map.flyTo).toHaveBeenCalledWith({ center: [129.8, 32.7], zoom: 15 });

      loaded = true;
      emit("load:");
      expect(map.addSource).toHaveBeenCalledExactlyOnceWith(
        "explore-places",
        expect.objectContaining({
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 15,
          data: expect.objectContaining({
            features: [
              expect.objectContaining({
                properties: { id: "plain", hasStory: false, isMock: false },
              }),
            ],
          }),
        }),
      );
      expect(map.addImage).toHaveBeenCalledTimes(2);
      expect(map.addImage.mock.calls[0]).toEqual([
        "explore-noren-story",
        expect.objectContaining({ width: 56, height: 64 }),
        { pixelRatio: 2 },
      ]);
      expect(map.addLayer).toHaveBeenCalledTimes(3);
      expect(map.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "explore-cluster-count",
          layout: expect.objectContaining({ "text-font": ["Noto Sans Bold"] }),
        }),
      );
      expect(view).toHaveBeenCalledWith(
        expect.objectContaining({
          south: 33.55,
          north: 33.835,
          center: { lng: 129.5, lat: 33.6925 },
          zoom: 12,
        }),
      );
      emit("moveend:");
      expect(view).toHaveBeenCalledTimes(2);
      emit("click:explore-single-places", {
        features: [{ properties: { id: "plain" } }],
      });
      expect(select).toHaveBeenCalledExactlyOnceWith("plain");
      emit("mouseenter:explore-clusters");
      expect(canvas.style.cursor).toBe("pointer");
      emit("mouseleave:explore-clusters");
      expect(canvas.style.cursor).toBe("");
      const cluster = {
        features: [
          {
            geometry: { type: "Point", coordinates: [129.85, 32.75] },
            properties: { cluster_id: 7 },
          },
        ],
      };
      emit("click:explore-clusters", cluster);
      expect(source.getClusterExpansionZoom).toHaveBeenCalledWith(7);
      expansion!(14);
      await Promise.resolve();
      expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({ center: [129.85, 32.75], zoom: 14 });

      const updated = render({
        ...props,
        markers: props.markers.slice(1),
        explore: { ...props.explore, selectedId: null },
      });
      updated[0]!();
      updated[3]!();
      expect(source.setData).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          features: [
            expect.objectContaining({ properties: expect.objectContaining({ id: "plain" }) }),
          ],
        }),
      );
      expect(map.addSource).toHaveBeenCalledTimes(1);
      expect(map.addLayer).toHaveBeenCalledTimes(3);
      emit("click:explore-clusters", cluster);
      active = false;
      expansion!(16);
      await Promise.resolve();
      expect(map.easeTo).toHaveBeenCalledTimes(1);
    } finally {
      for (const cleanup of cleanups.reverse()) cleanup();
      mapState.runtime = null;
      mapState.capture = false;
      mapState.refs = [];
      vi.unstubAllGlobals();
    }
    expect(listeners.size).toBe(0);
    expect(domMarkers[0]!.remove).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("selecting a tab preserves MapLibre positioning classes and updates pressed state", () => {
    const classes = new Set(["maplibregl-marker", "maplibregl-marker-covered", "h-8", "w-7"]);
    const setAttribute = vi.fn();
    const element = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
          return classes.has(name);
        },
      } as DOMTokenList,
      setAttribute,
    };
    setMarkerSelection(element, true);
    expect(classes.has("maplibregl-marker")).toBe(true);
    expect(classes.has("maplibregl-marker-covered")).toBe(true);
    expect(classes.has("scale-[1.2]")).toBe(true);
    expect(classes.has("ring-ai")).toBe(true);
    expect(setAttribute).toHaveBeenLastCalledWith("aria-pressed", "true");
    setMarkerSelection(element, false);
    expect([...classes]).toEqual(["maplibregl-marker", "maplibregl-marker-covered", "h-8", "w-7"]);
    expect(setAttribute).toHaveBeenLastCalledWith("aria-pressed", "false");
  });

  it("noren markers use the place name, Demo label, story colour and selected ring", () => {
    const marker = { id: "mock", lat: 32, lng: 129, label: "A mock place", isMock: false };
    expect(markerPresentation(marker, "Demo")).toMatchObject({
      label: "A mock place",
      fill: "#23305c",
      stroke: "#ffffff",
      strokeWidth: "1",
    });
    expect(
      markerPresentation({ ...marker, isMock: true, hasStory: true }, "Demo", true),
    ).toMatchObject({
      label: "A mock place (Demo)",
      fill: "#f2c14e",
      stroke: "#23305c",
      strokeWidth: "2",
      className: expect.stringContaining("scale-[1.2]"),
    });
    expect(markerPresentation(marker, "Demo", true).className).toContain("ring-ai");
    expect(markerPresentation(marker, "Demo").className).not.toContain("ring-ai");
    expect(renderToStaticMarkup(<NorenTab story />)).toContain('fill="#f2c14e"');
    expect(renderToStaticMarkup(<NorenTab />)).toContain('fill="#23305c"');
  });
  it("flat rows link across all content, highlight selection, and show story and distance", () => {
    const html = renderToStaticMarkup(
      <PlaceList
        locale="en"
        selectedId="story"
        items={[
          {
            id: "story",
            href: "/en/places/mock",
            name: "Mock story",
            secondaryName: "架空の店",
            secondaryNameLang: "ja",
            categoryLabel: "Café",
            isMock: true,
            hasStory: true,
            distance: 320,
          },
          {
            id: "plain",
            href: "/en/places/plain",
            name: "Mock plain",
            isMock: false,
            distance: 1200,
          },
        ]}
      />,
    );
    expect(html).toContain('id="explore-place-story" data-story="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("border-b border-line");
    expect(html).toContain("min-h-16");
    expect(html).toContain("320 m");
    expect(html).toContain("1.2 km");
    expect(html.indexOf("</a>")).toBeGreaterThan(html.indexOf("320 m"));
    expect(html.match(/data-badge="demo"/g)).toHaveLength(1);
  });
  it("explore adds named controls while the shared picker, font, label and attribution props still render", () => {
    const base = {
      locale: "en" as const,
      label: "Mock map",
      styleUrl: "mock.json",
      attribution: ["Mock credit"],
      center: { lat: 32, lng: 129, zoom: 12 },
      bounds: [129, 32, 130, 33] as const,
      markers: [],
      localIdeographFontFamily: "sans-serif",
    };
    const picker = renderToStaticMarkup(
      <PlaceMap {...base} picker={{ value: null, onChange: () => {} }} />,
    );
    expect(picker).toContain(placeUiMessages.en.pickerHint);
    expect(picker).toContain("Mock credit");
    expect(picker).not.toContain('aria-label="Show my location"');
    expect(picker).not.toContain("data-map-crosshair");
    expect(picker).not.toContain("Put the pin here");
    // With a centre label: a crosshair and a button that waits for the map, with the
    // keyboard hint and the map's own label kept for screen readers.
    const centre = renderToStaticMarkup(
      <PlaceMap
        {...base}
        picker={{ value: null, onChange: () => {}, centreLabel: "Put the pin here" }}
      />,
    );
    expect(centre).toContain('data-map-crosshair="true"');
    expect(centre).toMatch(/<button[^>]*disabled=""[^>]*>Put the pin here<\/button>/);
    expect(centre).toContain(`class="sr-only">${placeUiMessages.en.pickerHint}`);
    expect(centre).toContain('class="sr-only">Mock map');
    const explore = renderToStaticMarkup(<PlaceMap {...base} explore={{}} />);
    for (const label of ["Show my location", "Zoom in", "Zoom out"])
      expect(explore).toContain(`aria-label="${label}"`);
    expect(explore).toContain("Noren does not save your location.");
    expect(explore).toContain("aria-describedby=");
    expect(explore).not.toMatch(/<canvas|<script/);
  });

  it("keeps worker configuration out of server-rendered map markup", () => {
    const html = renderToStaticMarkup(
      <PlaceMap
        locale="en"
        label="Mock places"
        styleUrl="https://example.com/mock-style.json"
        attribution={["Mock attribution"]}
        center={{ lat: 32, lng: 129, zoom: 12 }}
        markers={[]}
      />,
    );
    expect(html).toContain("Mock places");
    expect(html).not.toContain("/maplibre/");
    expect(html).not.toContain("maplibre-gl-worker.mjs");
  });
  it("the map renders its label and every attribution line without loading MapLibre", () => {
    const html = renderToStaticMarkup(
      <PlaceMap
        locale="en"
        label="Places around the harbour"
        styleUrl="https://tiles.openfreemap.org/styles/liberty"
        attribution={["© OpenStreetMap contributors", "OpenFreeMap © OpenMapTiles"]}
        center={{ lat: 32, lng: 129, zoom: 12 }}
        markers={[]}
      />,
    );
    expect(html).toContain("Places around the harbour");
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).toContain("OpenFreeMap © OpenMapTiles");
    expect(html).not.toMatch(/<canvas|<script/);
  });
  it("non-explore maps have one in-map credit and hide the fallback until failure", () => {
    for (const locale of ["en", "ja"] as const) {
      const props = {
        locale,
        label: "Mock map",
        styleUrl: "mock.json",
        attribution: ["© OpenStreetMap contributors", "OpenFreeMap © OpenMapTiles"],
        center: { lat: 32, lng: 129, zoom: 16 },
        markers: [],
      };
      try {
        const html = renderToStaticMarkup(<PlaceMap {...props} />);
        const credit = html.match(/<div data-map-credit[\s\S]*?<\/div>/)?.[0] ?? "";
        for (const provider of ["OpenStreetMap contributors", "OpenFreeMap", "OpenMapTiles"])
          expect(credit.split(provider)).toHaveLength(2);
        expect(credit).toContain('href="https://www.openstreetmap.org/copyright"');
        expect(credit).toContain("bg-white");
        expect(html).toMatch(/<p class="sr-only"><span class="font-medium">/);
        mapState.failed = true;
        const failed = renderToStaticMarkup(<PlaceMap {...props} />);
        expect(failed).toContain('role="status"');
        expect(failed).not.toContain("data-map-credit");
        expect(failed).toMatch(
          /<p class="text-sm text-muted-foreground"><span class="font-medium">/,
        );
        expect(failed).toContain("OpenFreeMap © OpenMapTiles");
        const explore = renderToStaticMarkup(<PlaceMap {...props} explore={{}} />);
        expect(explore).not.toContain("data-map-credit");
        expect(explore).toMatch(/<p class="sr-only"><span class="font-medium">/);
      } finally {
        mapState.failed = false;
      }
    }
  });
  it("disables source attribution only for non-explore maps", async () => {
    for (const explore of [undefined, {}]) {
      mapState.capture = true;
      mapState.options = null;
      mapState.effects = [];
      let cleanup: void | (() => void) = undefined;
      try {
        renderToStaticMarkup(
          <PlaceMap
            locale="en"
            label="Mock map"
            styleUrl="mock.json"
            attribution={["Mock credit"]}
            center={{ lat: 32, lng: 129, zoom: 16 }}
            markers={[]}
            explore={explore}
          />,
        );
        cleanup = mapState.effects[1]!();
        await vi.waitFor(() => expect(mapState.options).not.toBeNull());
        expect(mapState.options!.center).toEqual([129, 32]);
        expect(mapState.options!.zoom).toBe(16);
        expect(mapState.options!.attributionControl).toEqual(
          explore ? { compact: false, customAttribution: "Mock credit" } : false,
        );
      } finally {
        if (typeof cleanup === "function") cleanup();
        mapState.capture = false;
      }
    }
  });
  it("boundsFor pads the markers' box and falls back to the region bbox", () => {
    expect(boundsFor([], [1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const markers = [
      { id: "a", lat: 10, lng: 20, label: "A", isMock: true },
      { id: "b", lat: 20, lng: 30, label: "B", isMock: true },
    ];
    expect(boundsFor(markers, [0, 0, 1, 1])).toEqual([
      [19, 9],
      [31, 21],
    ]);
    const single = boundsFor(markers.slice(0, 1), [0, 0, 1, 1]);
    expect(single[0][0]).toBeLessThan(20);
    expect(single[1][1]).toBeGreaterThan(10);
  });
  it("attributionText refuses an empty list", () => {
    expect(() => attributionText([])).toThrow();
    expect(() => attributionText([" "])).toThrow();
    expect(attributionText(["a", "b"])).toBe("a | b");
  });
  it("normalisePoint clamps and rounds", () => {
    expect(normalisePoint({ lat: 100, lng: -200 })).toEqual({ lat: 90, lng: -180 });
    expect(normalisePoint({ lat: -100, lng: 200 })).toEqual({ lat: -90, lng: 180 });
    expect(normalisePoint({ lat: 32.12345678, lng: 129.98765432 })).toEqual({
      lat: 32.123457,
      lng: 129.987654,
    });
  });
  it("the Demo badge shows only for mock places in the list", () => {
    const html = renderToStaticMarkup(
      <PlaceList
        locale="en"
        items={[
          { id: "z", name: "Zulu", href: "/z", isMock: true },
          {
            id: "a",
            name: "Alpha",
            href: "/a",
            isMock: false,
            categoryLabel: "Café",
            categoryUnreviewed: true,
          },
        ]}
      />,
    );
    expect(html).toContain("<ul");
    expect(html.indexOf("Zulu")).toBeLessThan(html.indexOf("Alpha"));
    expect(html.match(/data-badge="demo"/g)).toHaveLength(1);
    expect(html).toContain("Café");
    expect(html).toContain('data-badge="unreviewed"');
  });
  it("secondary names carry their lang", () => {
    expect(
      renderToStaticMarkup(
        <PlaceList
          locale="en"
          items={[
            {
              id: "a",
              name: "Mock",
              secondaryName: "デモ",
              secondaryNameLang: "ja",
              href: "/a",
              isMock: true,
            },
          ]}
        />,
      ),
    ).toMatch(/<span lang="ja"[^>]*>デモ<\/span>/);
  });
  it.each<EmbedDescriptor>([
    { kind: "iframe", url: "https://www.youtube-nocookie.com/embed/mock" },
    source.embed,
  ])("an iframe or blockquote embed renders only a facade before the click: $kind", (embed) => {
    const html = renderEmbed(embed);
    expect(html).not.toMatch(/<script|<iframe|<blockquote/);
    expect(html).toContain("Load this post from instagram");
  });
  it("the facade shows the platform, the author credit next to the post, the original link and the notice link", () => {
    const html = renderEmbed();
    expect(html).toContain("Posted by @mock_creator (as entered by the creator)");
    expect(html).toContain(`href="${source.authorUrl}"`);
    expect(html).toContain(`href="${source.canonicalUrl}"`);
    expect(html).toContain('href="/en/notice"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Posted on Oct 29, 2026");
    expect(html).toContain('<p lang="en"');
    expect(html).toContain("may set cookies");
  });
  it("a link card renders the creator's title and the original link with no button", () => {
    const html = renderEmbed({ kind: "link", url: "https://example.com/mock" }, "My mock story");
    expect(html).toContain("My mock story");
    expect(html).toContain("View the original");
    expect(html).not.toContain("<button");
    expect(renderEmbed({ kind: "link", url: "https://example.com/mock" })).toContain("example.com");
  });
  it("embedPlan: link stays link; iframe and blockquote are facade until loaded, then their plan", () => {
    const link = { kind: "link", url: "https://example.com" } as const;
    expect(embedPlan(link, false)).toEqual(link);
    expect(embedPlan(link, true)).toEqual(link);
    const iframe = { kind: "iframe", url: "https://example.com/embed" } as const;
    expect(embedPlan(iframe, false)).toEqual({ kind: "facade" });
    expect(embedPlan(iframe, true)).toEqual({ kind: "iframe", src: iframe.url });
    expect(embedPlan(source.embed, false)).toEqual({ kind: "facade" });
    expect(embedPlan(source.embed, true)).toEqual(source.embed);
  });
  it("isAllowedOrigin rejects http, other origins and lookalike hosts", () => {
    const allowed = ["https://platform.twitter.com"];
    for (const url of [
      "http://platform.twitter.com/a",
      "https://example.com",
      "https://platform.twitter.com.evil.example/a",
      "https://platform.twitter.com:444/a",
      "https://platform.twitter.com@evil.example/a",
      "invalid",
    ])
      expect(isAllowedOrigin(url, allowed)).toBe(false);
    expect(isAllowedOrigin("https://platform.twitter.com/widgets.js", allowed)).toBe(true);
  });
  it("loadEmbedScript appends one script for an allowed origin and none twice, and rejects a disallowed origin", async () => {
    const appended: unknown[] = [];
    const process = vi.fn();
    const load = vi.fn();
    let onLoad: (() => void) | undefined;
    const script = {
      dataset: {},
      addEventListener: (event: string, callback: () => void) => {
        if (event === "load") onLoad = callback;
      },
      remove: vi.fn(),
      async: false,
      src: "",
    };
    const doc = {
      createElement: vi.fn(() => script),
      querySelector: vi.fn(() => null),
      head: { appendChild: (value: unknown) => appended.push(value) },
      defaultView: { instgrm: { Embeds: { process } }, twttr: { widgets: { load } } },
    } as unknown as Document;
    const url = "https://www.instagram.com/embed.js";
    await expect(
      loadEmbedScript("https://evil.example/a.js", ["https://www.instagram.com"], doc),
    ).rejects.toThrow();
    expect(appended).toHaveLength(0);
    const first = loadEmbedScript(url, ["https://www.instagram.com"], doc);
    const second = loadEmbedScript(url, ["https://www.instagram.com"], doc);
    expect(appended).toHaveLength(1);
    expect(script.async).toBe(true);
    expect(script.src).toBe(url);
    onLoad!();
    await Promise.all([first, second]);
    await loadEmbedScript(url, ["https://www.instagram.com"], doc);
    expect(appended).toHaveLength(1);
    expect(process).toHaveBeenCalledTimes(3);
    expect(load).toHaveBeenCalledTimes(3);
    await expect(loadEmbedScript(url, [], doc)).rejects.toThrow();
    expect(appended).toHaveLength(1);
  });
  it("the embed notice links to /<locale>/notice in ja and en", () => {
    for (const locale of ["ja", "en"] as const)
      expect(renderToStaticMarkup(<EmbedNotice locale={locale} />)).toContain(
        `href="/${locale}/notice"`,
      );
  });
  it("place-ui messages have the same keys in both locales", () => {
    expect(Object.keys(placeUiMessages.ja).sort()).toEqual(Object.keys(placeUiMessages.en).sort());
  });
});
