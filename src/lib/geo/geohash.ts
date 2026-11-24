const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
const radians = Math.PI / 180;
const earthRadiusMetres = 6_371_000;

export type GeoPin = { lat: number; lng: number };
export type ViewBounds = { west: number; south: number; east: number; north: number };
export type ViewCells = { precision: 5 | 4; cells: string[] };

function wrapLongitude(lng: number): number {
  if (lng >= -180 && lng < 180) return lng;
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function grid(precision: 4 | 5) {
  const columns = 2 ** Math.ceil((5 * precision) / 2);
  const rows = 2 ** Math.floor((5 * precision) / 2);
  return { columns, rows, width: 360 / columns, height: 180 / rows };
}

function gridIndex(value: number, min: number, step: number, size: number): number {
  return Math.max(0, Math.min(size - 1, Math.floor((value - min) / step)));
}

function encode(column: number, row: number, precision: 4 | 5): string {
  let code = "";
  let digit = 0;
  let lngBit = Math.ceil((5 * precision) / 2) - 1;
  let latBit = Math.floor((5 * precision) / 2) - 1;
  for (let bit = 0; bit < 5 * precision; bit++) {
    const next = bit % 2 === 0 ? (column >> lngBit--) & 1 : (row >> latBit--) & 1;
    digit = (digit << 1) | next;
    if (bit % 5 === 4) {
      code += alphabet[digit];
      digit = 0;
    }
  }
  return code;
}

export function cellOf({ lat, lng }: GeoPin): string {
  const { width, height, columns, rows } = grid(5);
  return encode(
    gridIndex(wrapLongitude(lng), -180, width, columns),
    gridIndex(lat, -90, height, rows),
    5,
  );
}

function viewGrid(bounds: ViewBounds, precision: 4 | 5) {
  const { columns, rows, width, height } = grid(precision);
  const west = wrapLongitude(bounds.west);
  const east = wrapLongitude(bounds.east);
  const left = gridIndex(west, -180, width, columns);
  const right = gridIndex(east, -180, width, columns) + (east < west ? columns : 0);
  return {
    columns,
    width,
    height,
    left,
    columnCount:
      Math.abs(bounds.east - bounds.west) >= 360 ? columns : Math.min(columns, right - left + 1),
    bottom: gridIndex(bounds.south, -90, height, rows),
    top: gridIndex(bounds.north, -90, height, rows),
  };
}

export function cellsForView(bounds: ViewBounds): ViewCells | null {
  if (
    ![bounds.west, bounds.east, bounds.south, bounds.north].every(Number.isFinite) ||
    bounds.south > bounds.north
  ) {
    return null;
  }
  for (const [precision, limit] of [
    [5, 32],
    [4, 16],
  ] as const) {
    const { columns, left, columnCount, bottom, top } = viewGrid(bounds, precision);
    if (columnCount * (top - bottom + 1) > limit) continue;
    const cells: string[] = [];
    for (let offset = 0; offset < columnCount; offset++) {
      const column = (left + offset) % columns;
      for (let row = bottom; row <= top; row++) cells.push(encode(column, row, precision));
    }
    return { precision, cells };
  }
  return null;
}

/** The five-character cells that intersect a circle on the sphere. */
export function cellsAround(pin: GeoPin, metres: number): string[] {
  if (![pin.lat, pin.lng, metres].every(Number.isFinite) || Math.abs(pin.lat) > 90 || metres < 0) {
    return [];
  }
  if (metres === 0) return [cellOf(pin)];
  const angle = Math.min(Math.PI, metres / earthRadiusMetres);
  const lat = pin.lat * radians;
  const lng = wrapLongitude(pin.lng);
  const reach = angle / radians;
  const south = Math.max(-90, pin.lat - reach);
  const north = Math.min(90, pin.lat + reach);
  const lngReach =
    south === -90 || north === 90
      ? 180
      : Math.asin(Math.min(1, Math.sin(angle) / Math.cos(lat))) / radians;
  // Include both cells if a circle is tangent to a shared edge.
  const margin = 1e-10;
  const { columns, width, height, left, columnCount, bottom, top } = viewGrid(
    {
      west: lng - lngReach - margin,
      east: lng + lngReach + margin,
      south: south - margin,
      north: north + margin,
    },
    5,
  );

  const cells: string[] = [];
  const distanceLimit = Math.sin(Math.min(Math.PI, angle + margin * radians) / 2) ** 2;
  for (let offset = 0; offset < columnCount; offset++) {
    const column = (left + offset) % columns;
    const centerLng = -180 + (column + 0.5) * width;
    const lngDistance = Math.max(0, Math.abs(wrapLongitude(lng - centerLng)) - width / 2) * radians;
    // At the closest longitude, the dot product is largest at this latitude or an edge.
    const nearestLat = Math.atan2(Math.sin(lat), Math.cos(lat) * Math.cos(lngDistance));
    for (let row = bottom; row <= top; row++) {
      const minLat = (-90 + row * height) * radians;
      const maxLat = minLat + height * radians;
      const closestLat = Math.max(minLat, Math.min(maxLat, nearestLat));
      const distance =
        Math.sin((closestLat - lat) / 2) ** 2 +
        Math.cos(lat) * Math.cos(closestLat) * Math.sin(lngDistance / 2) ** 2;
      if (distance <= distanceLimit) cells.push(encode(column, row, 5));
    }
  }
  return cells;
}
