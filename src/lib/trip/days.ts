import { quickestPath } from "./roads";
import type { Drive, Plan, RegionTripSettings, TripRequest } from "./types";

export const ROUTE_CHOICES = ["drop_town", "add_day", "raise_limit"] as const;
export const STRETCH_REST_MINUTES = 15;
export type RouteDay = {
  index: number;
  night?: string;
  points: { id: string; elapsed: number; rest: boolean }[];
  drives: Drive[];
  driveMinutes: number;
};

type Path = ReturnType<typeof quickestPath>;
type PathBetween = (from: string, to: string) => Path;

// Keep both lists in order. A via town that is also a night is visited once at that boundary.
function explicitWaypoints(request: TripRequest, path: PathBetween) {
  const waypoints = [request.start, ...request.nights!, request.end].map((id) => ({
    id,
    boundary: true,
  }));
  let cursor = 0;
  for (const id of request.via ?? []) {
    const match = waypoints.findIndex((point, index) => index >= cursor && point.id === id);
    if (match !== -1) {
      cursor = match + 1;
      continue;
    }
    let best = Infinity;
    let insertion = Math.min(waypoints.length - 1, Math.max(1, cursor));
    for (let index = insertion; index < waypoints.length; index++) {
      const from = waypoints[index - 1]!.id;
      const to = waypoints[index]!.id;
      const minutes = sumDrive(path(from, id)) + sumDrive(path(id, to)) - sumDrive(path(from, to));
      if (minutes < best) {
        best = minutes;
        insertion = index;
      }
    }
    waypoints.splice(insertion, 0, { id, boundary: false });
    cursor = insertion + 1;
  }
  return waypoints;
}

function sumDrive(drives: Path): number {
  return drives?.reduce((sum, drive) => sum + drive.minutes, 0) ?? Infinity;
}

// Choose the split with the shortest longest day, with a second pass for balanced days.
function chooseNights(elapsed: number[], eligible: number[], days: number): number[] {
  const end = elapsed.length - 1;
  const last = new Map([[end, { cost: 0, nights: [] as number[] }]]);
  const solve = (limit?: number) => {
    let tails = last;
    for (let day = days; day >= 1; day--) {
      const next = new Map<number, { cost: number; nights: number[] }>();
      for (const start of day === 1 ? [0] : eligible) {
        for (const [finish, tail] of tails) {
          if (finish < start) continue;
          const drive = elapsed[finish]! - elapsed[start]!;
          if (limit !== undefined && drive > limit) continue;
          const cost = limit === undefined ? Math.max(drive, tail.cost) : drive ** 2 + tail.cost;
          if (cost < (next.get(start)?.cost ?? Infinity)) {
            next.set(start, { cost, nights: [finish, ...tail.nights] });
          }
        }
      }
      tails = next;
    }
    return tails.get(0)!;
  };
  return solve(solve().cost).nights;
}

function splitStretches(day: RouteDay, limit: number) {
  let stretch = 0;
  for (const [index, drive] of day.drives.entries()) {
    if (stretch > 0 && stretch + drive.minutes > limit) {
      day.points[index]!.rest = true;
      stretch = 0;
    }
    stretch += drive.minutes;
  }
}

export function layOutDays(
  request: TripRequest,
  region: RegionTripSettings,
): { route: RouteDay[]; unmet: Plan["unmet"] } {
  if (!region.trip || !region.roads) {
    return { route: [], unmet: [{ what: "route", detail: "region_has_no_trip", choices: [] }] };
  }
  const { roads } = region;
  const path: PathBetween = (from, to) => quickestPath(roads, from, to);
  const waypoints = request.nights
    ? explicitWaypoints(request, path)
    : [request.start, ...(request.via ?? []), request.end].map((id) => ({ id, boundary: false }));
  const drives: Drive[] = [];
  const markers = [0];
  const explicit = [];
  for (let index = 1; index < waypoints.length; index++) {
    const leg = path(waypoints[index - 1]!.id, waypoints[index]!.id);
    if (!leg)
      return { route: [], unmet: [{ what: "route", detail: "unknown_road_point", choices: [] }] };
    drives.push(...leg);
    markers.push(drives.length);
    if (waypoints[index]!.boundary) explicit.push(drives.length);
  }

  const points = [{ id: request.start, elapsed: 0, rest: false }];
  for (const drive of drives) {
    points.push({ id: drive.to, elapsed: points.at(-1)!.elapsed + drive.minutes, rest: false });
  }
  const towns = new Set(region.towns?.map((town) => town.onRoad ?? town.id));
  const via = markers.slice(1, -1);
  const eligible = via.length
    ? via
    : points.flatMap((point, index) => (towns.has(point.id) ? [index] : []));
  const boundaries = request.nights
    ? explicit
    : chooseNights(
        points.map((point) => point.elapsed),
        eligible.length ? [...new Set(eligible)] : [0],
        request.days,
      );

  const route = boundaries.map((end, offset): RouteDay => {
    const start = boundaries[offset - 1] ?? 0;
    const day: RouteDay = {
      index: offset + 1,
      points: points.slice(start, end + 1).map((point) => ({
        ...point,
        elapsed: point.elapsed - points[start]!.elapsed,
      })),
      drives: drives.slice(start, end),
      driveMinutes: points[end]!.elapsed - points[start]!.elapsed,
    };
    if (offset + 1 < request.days) day.night = points[end]!.id;
    splitStretches(day, request.party.limits.stretchMinutes);
    return day;
  });

  const over = route.filter((day) => day.driveMinutes > request.party.limits.dayDriveMinutes);
  if (over.length && !request.party.guessed.includes("dayDrive")) {
    return {
      route: [],
      unmet: [{ what: "route", detail: "over_day_drive_limit", choices: [...ROUTE_CHOICES] }],
    };
  }
  return {
    route,
    unmet: over.map((day) => ({
      what: "dayDrive",
      day: day.index,
      detail: "over_day_drive_guess",
      choices: [...ROUTE_CHOICES],
    })),
  };
}
