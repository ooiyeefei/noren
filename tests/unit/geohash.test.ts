import { describe, expect, it } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { cellOf, cellsAround, cellsForView } from "../../src/lib/geo/geohash";

function openingBounds(width: number, height: number) {
  const { lat, lng } = nagasaki.defaultCenter;
  const worldSize = 512 * 2 ** nagasaki.defaultCenter.zoom;
  const centerX = ((lng + 180) / 360) * worldSize;
  const centerY = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * worldSize;
  const longitude = (x: number) => (x / worldSize) * 360 - 180;
  const latitude = (y: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI;
  return {
    west: longitude(centerX - width / 2),
    east: longitude(centerX + width / 2),
    south: latitude(centerY + height / 2),
    north: latitude(centerY - height / 2),
  };
}

describe("geohash", () => {
  it("encodes known pins at precision five", () => {
    expect(cellOf({ lat: 42.6, lng: -5.6 })).toBe("ezs42");
    expect(cellOf({ lat: 57.64911, lng: 10.40744 })).toBe("u4pru");
    expect(cellOf({ lat: -33.86, lng: 151.21 })).toBe("r3gx2");
  });

  it.each([
    [1440, 900, 5],
    [390, 844, 5],
  ])("covers the %i by %i Nagasaki opening view", (width, height, precision) => {
    expect(nagasaki.defaultCenter.zoom).toBe(12);
    const bounds = openingBounds(width, height);
    const result = cellsForView(bounds);
    expect(result?.precision).toBe(precision);
    expect(result!.cells.length).toBeLessThanOrEqual(precision === 5 ? 32 : 16);
    for (let x = 0; x <= 20; x++) {
      for (let y = 0; y <= 20; y++) {
        const lng = bounds.west + (x / 20) * (bounds.east - bounds.west);
        const lat = bounds.south + (y / 20) * (bounds.north - bounds.south);
        expect(result!.cells).toContain(cellOf({ lat, lng }).slice(0, precision));
      }
    }
  });

  it("covers wrapped bounds on both sides of the antimeridian", () => {
    const bounds = { west: 179.98, east: -179.98, south: 0.01, north: 0.02 };
    const result = cellsForView(bounds);
    expect(result).toEqual({
      precision: 5,
      cells: [cellOf({ lat: 0.01, lng: 179.99 }), cellOf({ lat: 0.01, lng: -179.99 })],
    });
    expect(cellsForView({ ...bounds, east: 180.02 })).toEqual(result);
  });

  it("uses town coverage for a view spanning more than 16 four-character cells", () => {
    expect(cellsForView({ west: 120, east: 145, south: 20, north: 45 })).toBeNull();
    expect(cellsForView({ west: -180, east: 180, south: -90, north: 90 })).toBeNull();
  });

  it("uses four-character cells for a view too wide for five-character cells", () => {
    const result = cellsForView({ west: 129.65, east: 130.05, south: 32.6, north: 32.9 });
    expect(result?.precision).toBe(4);
    expect(result?.cells).toContain(cellOf({ lat: 32.74, lng: 129.87 }).slice(0, 4));
  });

  it("includes cells touched by a circle and excludes corners outside it", () => {
    const pin = { lat: 0.023, lng: 0.023 };
    const cells = cellsAround(pin, 2800);
    expect(cells).toHaveLength(5);
    for (const [lat, lng] of [
      [0.023, 0.023],
      [0.023, 0.045],
      [0.045, 0.023],
      [0.023, -0.001],
      [-0.001, 0.023],
    ] as const) {
      expect(cells).toContain(cellOf({ lat, lng }));
    }
    expect(cells).not.toContain(cellOf({ lat: 0.045, lng: 0.045 }));
    expect(cellsAround({ lat: 4, lng: 179.99 }, 2400)).toContain(cellOf({ lat: 4, lng: -179.99 }));
  });
});
