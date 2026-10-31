import { describe, expect, it } from "vitest";
import { markersToFeatures, visibleView, type MapMarker } from "@/components/map/map-helpers";

const markers: MapMarker[] = [
  { id: "story", label: "Mock story", lng: 129.8, lat: 32.7, hasStory: true, isMock: true },
  { id: "plain", label: "Mock plain", lng: 129.9, lat: 32.8, isMock: false },
];
const map = {
  getCanvas: () => ({ clientWidth: 400, clientHeight: 800 }),
  unproject: ([x, y]: [number, number]) => ({ lng: 129 + x / 400, lat: 34 - y / 800 }),
  getZoom: () => 13,
};

describe("explore map layer data", () => {
  it("carries coordinates and boolean story/mock properties", () => {
    expect(markersToFeatures(markers)).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [129.8, 32.7] },
          properties: { id: "story", hasStory: true, isMock: true },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [129.9, 32.8] },
          properties: { id: "plain", hasStory: false, isMock: false },
        },
      ],
    });
  });

  it("excludes only the selected place, leaving its DOM marker as the sole copy", () => {
    const features = markersToFeatures(markers, "story").features;
    expect(features.map((feature) => feature.properties.id)).toEqual(["plain"]);
    expect(markersToFeatures(markers, "plain").features[0]!.properties.id).toBe("story");
    expect(markersToFeatures(markers, "unknown").features).toHaveLength(2);
    expect(markersToFeatures(markers, null).features).toHaveLength(2);
    expect(markers).toHaveLength(2);
  });

  it("returns an empty collection for no markers or the only selected marker", () => {
    expect(markersToFeatures([], "story")).toEqual({ type: "FeatureCollection", features: [] });
    expect(markersToFeatures(markers.slice(0, 1), "story").features).toEqual([]);
  });
});

describe("visible map view", () => {
  it("reports the whole canvas without padding", () => {
    expect(visibleView(map, { top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
      west: 129,
      south: 33,
      east: 130,
      north: 34,
      center: { lat: 33.5, lng: 129.5 },
      zoom: 13,
    });
  });

  it("moves south up when a sheet covers the bottom half", () => {
    const full = visibleView(map, { top: 0, bottom: 0, left: 0, right: 0 });
    const half = visibleView(map, { top: 0, bottom: 400, left: 0, right: 0 });
    expect(half.south).toBe(33.5);
    expect(half.south).toBeGreaterThan(full.south);
    expect(half.north).toBe(full.north);
    expect(half.center).toEqual({ lat: 33.75, lng: 129.5 });
  });

  it("unprojects the rectangle inside all four padding edges, including its centre", () => {
    expect(visibleView(map, { top: 160, bottom: 400, left: 40, right: 80 })).toEqual({
      west: 129.1,
      south: 33.5,
      east: 129.8,
      north: 33.8,
      center: { lat: 33.65, lng: 129.45 },
      zoom: 13,
    });
  });

  it("uses every corner on a rotated map and collapses a fully covered window", () => {
    const rotated = {
      ...map,
      unproject: ([x, y]: [number, number]) => ({ lng: x - y, lat: -(x + y) || 0 }),
    };
    expect(visibleView(rotated, { top: 0, bottom: 0, left: 0, right: 0 })).toMatchObject({
      west: -800,
      east: 400,
      south: -1200,
      north: 0,
    });
    const covered = visibleView(map, { top: 200, bottom: 700, left: 0, right: 0 });
    expect(covered.north).toBe(covered.south);
  });
});
