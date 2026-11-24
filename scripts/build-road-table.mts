/**
 * One-off build of the Malaysian driving-time table (T009, research R6).
 *
 * Needs a local OSRM engine (car profile) already running over the Geofabrik
 * Malaysia, Singapore and Brunei extract, bound to 127.0.0.1. Nothing here
 * starts it, installs it or serves anything. To make one, with the extract in
 * .scratch/roads/ (osrm-backend image, car profile, MLD):
 *   docker run --rm -v "$PWD/.scratch/roads:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/<extract>.osm.pbf
 *   (then osrm-partition and osrm-customize on /data/<extract>.osrm)
 *   docker run -d --name osrm-roads -p 127.0.0.1:5077:5000 -v "$PWD/.scratch/roads:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/<extract>.osrm
 * and `docker rm -f osrm-roads` afterwards. Run it once, commit the output
 * with its source, and stop the engine.
 *
 *   node scripts/build-road-table.mts [--engine http://127.0.0.1:5077] \
 *        [--out .scratch/roads/roads-built.json]
 *
 * Output: the `roads` object of the region file plus a `townOnRoad` map
 * (town id to point id). Both go to --out; a comparison with the four legs
 * of research/12 section 6.1 goes to stderr.
 *
 * Road data © OpenStreetMap contributors, ODbL 1.0. Times are the engine's
 * free-flow times: no traffic, no tolls priced (R6, "Known limit").
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface RoadPoint {
  id: string;
  /** For my own reading only; never written to the region file. */
  name: string;
  kind: "start" | "junction" | "rest" | "town";
  /** Where to look for the road: an interchange or rest area node from OpenStreetMap. */
  at: { lat: number; lng: number };
  /** Rest areas only: every rest area way for this place (one per carriageway), if there is more than one. */
  spots?: { lat: number; lng: number }[];
  /** Towns only: the centre of the town, and the junctions it may hang off (the quickest wins). */
  town?: { centre: { lat: number; lng: number }; junctions: { name: string; lat: number; lng: number }[] };
}

/**
 * Coordinates below are OpenStreetMap interchange (`highway=motorway_junction`)
 * and rest area (`highway=rest_area|services`) nodes read from Overpass on
 * 2026-11-24. The engine snaps each one to the nearest drivable road; the
 * snapped location is what is written as the pin.
 */
const POINTS: RoadPoint[] = [
  { id: "kuala-lumpur", name: "Kuala Lumpur (city centre)", kind: "start", at: { lat: 3.1478, lng: 101.6953 } },
  { id: "sungai-buloh", name: "Sungai Buloh interchange, exit 113 (NKVE meets E1)", kind: "junction", at: { lat: 3.2067, lng: 101.5829 } },
  { id: "rawang", name: "Rawang interchange, exit 116", kind: "junction", at: { lat: 3.2927, lng: 101.5481 } },
  {
    id: "tanjung-malim", name: "Tanjung Malim interchange, exit 121", kind: "town", at: { lat: 3.6464, lng: 101.5298 },
    town: { centre: { lat: 3.6806, lng: 101.5189 }, junctions: [{ name: "Tanjung Malim, exit 121", lat: 3.6464, lng: 101.5298 }] },
  },
  { id: "ulu-bernam-rest-area", name: "Kawasan Rehat Ulu Bernam", kind: "rest", at: { lat: 3.6635, lng: 101.5193 }, spots: [{ lat: 3.6635, lng: 101.5193 }, { lat: 3.6769, lng: 101.5004 }] },
  { id: "slim-river", name: "Slim River interchange, exit 126", kind: "junction", at: { lat: 3.8471, lng: 101.3993 } },
  { id: "tapah-rest-area", name: "Kawasan Rehat Tapah", kind: "rest", at: { lat: 4.1788, lng: 101.29 }, spots: [{ lat: 4.1788, lng: 101.29 }, { lat: 4.1804, lng: 101.2899 }] },
  { id: "tapah", name: "Tapah interchange, exit 132", kind: "junction", at: { lat: 4.2161, lng: 101.2703 } },
  {
    id: "kampar", name: "Kampar (nearest interchange)", kind: "town", at: { lat: 4.2161, lng: 101.2703 },
    town: {
      centre: { lat: 4.3076, lng: 101.153 },
      junctions: [
        { name: "Tapah, exit 132", lat: 4.2161, lng: 101.2703 },
        { name: "Gopeng, exit 135", lat: 4.4507, lng: 101.1711 },
        { name: "E1 abeam Kampar (no named interchange in OpenStreetMap)", lat: 4.337, lng: 101.2352 },
      ],
    },
  },
  {
    id: "gopeng", name: "Gopeng interchange, exit 135", kind: "town", at: { lat: 4.4507, lng: 101.1711 },
    town: { centre: { lat: 4.4707, lng: 101.1585 }, junctions: [{ name: "Gopeng, exit 135", lat: 4.4507, lng: 101.1711 }] },
  },
  {
    id: "ipoh", name: "Ipoh (nearest interchange)", kind: "town", at: { lat: 4.5796, lng: 101.1438 },
    town: {
      centre: { lat: 4.5975, lng: 101.0901 },
      junctions: [
        { name: "Ipoh Selatan, exit 138", lat: 4.5796, lng: 101.1438 },
        { name: "Ipoh Utara, exit 141", lat: 4.6671, lng: 101.0746 },
      ],
    },
  },
  { id: "sungai-perak-rest-area", name: "Kawasan Rehat Sungai Perak", kind: "rest", at: { lat: 4.7137, lng: 100.9447 }, spots: [{ lat: 4.7137, lng: 100.9447 }, { lat: 4.7149, lng: 100.9455 }] },
  {
    id: "kuala-kangsar", name: "Kuala Kangsar interchange, exit 143", kind: "town", at: { lat: 4.7644, lng: 100.9022 },
    town: { centre: { lat: 4.7626, lng: 100.9306 }, junctions: [{ name: "Kuala Kangsar, exit 143", lat: 4.7644, lng: 100.9022 }] },
  },
  {
    id: "taiping", name: "Taiping (nearest interchange)", kind: "town", at: { lat: 4.8942, lng: 100.6658 },
    town: {
      centre: { lat: 4.85, lng: 100.74 },
      junctions: [{ name: "Taiping Utara, exit 148", lat: 4.8942, lng: 100.6658 }],
    },
  },
  {
    id: "kuala-sepetang", name: "Kuala Sepetang (nearest interchange)", kind: "town", at: { lat: 4.7808, lng: 100.7165 },
    town: {
      centre: { lat: 4.8333, lng: 100.6167 },
      junctions: [{ name: "Changkat Jering, exit 146", lat: 4.7808, lng: 100.7165 }],
    },
  },
  { id: "gunung-semanggol-rest-area", name: "Kawasan Rehat Gunung Semanggol", kind: "rest", at: { lat: 4.9829, lng: 100.666 }, spots: [{ lat: 4.9829, lng: 100.666 }, { lat: 4.9891, lng: 100.6643 }] },
  { id: "bandar-baharu", name: "Bandar Baharu interchange, exit 153", kind: "junction", at: { lat: 5.1059, lng: 100.5608 } },
  { id: "jawi", name: "Jawi interchange, exit 156", kind: "junction", at: { lat: 5.1851, lng: 100.498 } },
  { id: "sungai-bakap-layby", name: "Hentian Sebelah Sungai Bakap", kind: "rest", at: { lat: 5.2231, lng: 100.4862 }, spots: [{ lat: 5.2231, lng: 100.4862 }, { lat: 5.2258, lng: 100.4862 }] },
  { id: "juru", name: "Juru interchange, exit 160 (E1 meets Penang Bridge E36)", kind: "junction", at: { lat: 5.3356, lng: 100.4341 } },
  {
    id: "seberang-perai", name: "Seberang Perai (nearest interchange)", kind: "town", at: { lat: 5.3951, lng: 100.406 },
    town: {
      centre: { lat: 5.3992, lng: 100.3639 },
      junctions: [
        { name: "Perai, exit 162", lat: 5.3732, lng: 100.4014 },
        { name: "Seberang Jaya, exit 163", lat: 5.3951, lng: 100.406 },
      ],
    },
  },
  { id: "george-town", name: "George Town (city centre, Penang island)", kind: "start", at: { lat: 5.4141, lng: 100.3288 } },
  { id: "sungai-dua", name: "Sungai Dua interchange, exit 165", kind: "junction", at: { lat: 5.4433, lng: 100.4192 } },
  { id: "tikam-batu-layby", name: "Hentian Sebelah Tikam Batu", kind: "rest", at: { lat: 5.5739, lng: 100.4534 } },
  {
    id: "sungai-petani", name: "Sungai Petani (nearest interchange)", kind: "town", at: { lat: 5.6081, lng: 100.4911 },
    town: {
      centre: { lat: 5.647, lng: 100.488 },
      junctions: [
        { name: "Sungai Petani Selatan, exit 168", lat: 5.6081, lng: 100.4911 },
        { name: "Sungai Petani Utara, exit 170", lat: 5.6718, lng: 100.5147 },
      ],
    },
  },
  { id: "gurun-rest-area", name: "Kawasan Rehat Gurun", kind: "rest", at: { lat: 5.8329, lng: 100.4871 }, spots: [{ lat: 5.8329, lng: 100.4871 }, { lat: 5.8306, lng: 100.489 }] },
  {
    id: "alor-setar", name: "Alor Setar (nearest interchange)", kind: "town", at: { lat: 6.0794, lng: 100.3821 },
    town: {
      centre: { lat: 6.1248, lng: 100.3678 },
      junctions: [
        { name: "Alor Setar Selatan, exit 177", lat: 6.0794, lng: 100.3821 },
        { name: "Alor Setar Utara, exit 178", lat: 6.1328, lng: 100.3977 },
      ],
    },
  },
];

/**
 * The points along the North-South Expressway E1, in the order a family drives them going north.
 * Neighbours in this list are routed to each other; the headings used to pick a carriageway
 * come from it too. Where a town hangs off the expressway at an interchange, the interchange is its point.
 */
const MAIN_ROAD = [
  "kuala-lumpur",
  "sungai-buloh",
  "rawang",
  "tanjung-malim",
  "ulu-bernam-rest-area",
  "slim-river",
  "tapah-rest-area",
  "tapah",
  "kampar",
  "gopeng",
  "ipoh",
  "sungai-perak-rest-area",
  "kuala-kangsar",
  "kuala-sepetang",
  "taiping",
  "gunung-semanggol-rest-area",
  "bandar-baharu",
  "jawi",
  "sungai-bakap-layby",
  "juru",
  "seberang-perai",
  "sungai-dua",
  "tikam-batu-layby",
  "sungai-petani",
  "gurun-rest-area",
  "alor-setar",
];

/** Neighbours along the roads a driver heading north would take: each step of the main road, and the Penang Bridge. */
const NEIGHBOURS: [string, string][] = [
  ...MAIN_ROAD.slice(1).map((id, i): [string, string] => [MAIN_ROAD[i] ?? id, id]),
  ["juru", "george-town"],
];

/** A drive of more than this many minutes needs somewhere to rest inside it (a town or a rest area). */
const MAX_BETWEEN_RESTS = 120;

/** The four legs of research/12 section 6.1, centre to centre, as measured on the OSRM demo server. */
const LEGS: { from: string; to: string; minutes: number; kilometres: number }[] = [
  { from: "kuala-lumpur", to: "alor-setar", minutes: 315, kilometres: 433.3 },
  { from: "alor-setar", to: "george-town", minutes: 91, kilometres: 114.6 },
  { from: "george-town", to: "ipoh", minutes: 123, kilometres: 156.9 },
  { from: "ipoh", to: "kuala-lumpur", minutes: 148, kilometres: 197.3 },
];

const { values } = parseArgs({
  options: {
    engine: { type: "string", default: "http://127.0.0.1:5077" },
    out: { type: "string", default: ".scratch/roads/roads-built.json" },
  },
});
const engine = values.engine as string;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(engine)) {
  throw new Error(`The engine must be on this machine (127.0.0.1); got ${engine}`);
}

const lngLat = (p: { lat: number; lng: number }) => `${p.lng},${p.lat}`;

/** The parts of an OSRM answer this script reads. */
interface EngineAnswer {
  code?: string;
  message?: string;
  waypoints: { location: [number, number]; distance: number; name?: string }[];
  routes: { duration: number; distance: number; legs: { steps: { ref?: string; name?: string; distance: number }[] }[] }[];
}

async function getJson(path: string): Promise<EngineAnswer> {
  const res = await fetch(`${engine}${path}`);
  const body = (await res.json().catch(() => ({}))) as EngineAnswer;
  if (!res.ok || body.code !== "Ok") {
    throw new Error(`Engine said ${res.status} ${body.code ?? ""} ${body.message ?? ""} for ${path}`);
  }
  return body;
}

/**
 * Snap to the nearest road. A motorway is two carriageways, and a pin on the
 * wrong one makes the engine route through an exit and back; so a point is
 * snapped to the carriageway heading the way a driver heading north goes (bearing, in
 * degrees clockwise from north, with 60 degrees either side).
 */
async function snap(
  p: { lat: number; lng: number },
  bearing?: number,
  mainline = false,
): Promise<{ lat: number; lng: number; metres: number; name: string }> {
  const b = bearing === undefined ? "" : `&bearings=${Math.round(bearing)},60`;
  const body = await getJson(`/nearest/v1/driving/${lngLat(p)}?number=${mainline ? 30 : 1}${b}`);
  const all = body.waypoints.map((w) => ({ lat: w.location[1], lng: w.location[0], metres: w.distance as number, name: String(w.name ?? "") }));
  // On the mainline: the nearest piece of the expressway itself, not a slip road or a service road beside it.
  if (mainline) {
    const main = all.find((w: { name: string; metres: number }) => /Utara.?Selatan/i.test(w.name) && w.metres <= 600);
    if (main) return main;
  }
  const first = all[0];
  if (!first) throw new Error(`No road near ${lngLat(p)}`);
  return first;
}

interface Route { minutes: number; kilometres: number; road: string; roads: Record<string, number> }

async function route(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<Route> {
  const body = await getJson(`/route/v1/driving/${lngLat(a)};${lngLat(b)}?overview=false&steps=true`);
  const r = body.routes[0];
  const leg = r?.legs[0];
  if (!r || !leg) throw new Error(`No route from ${lngLat(a)} to ${lngLat(b)}`);
  const roads: Record<string, number> = {};
  for (const step of leg.steps) {
    const key = String(step.ref || step.name || "").trim();
    if (key) roads[key] = (roads[key] ?? 0) + step.distance;
  }
  const road = Object.entries(roads).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
  return { minutes: r.duration / 60, kilometres: r.distance / 1000, road, roads };
}

/** OSRM names the expressway in Malay; the table says E1, E36 and so on where a ref exists. */
function roadLabel(name: string): string {
  if (/Utara.?Selatan/i.test(name)) return "E1";
  if (/Penang Bridge|Pulau Pinang|Jambatan Pulau/i.test(name)) return "E36";
  return name;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function main() {
  const byId = new Map(POINTS.map((p) => [p.id, p]));
  const pins = new Map<string, { lat: number; lng: number }>();
  const offRoad = new Map<string, number>();
  const chosen = new Map<string, string>();
  const warnings: string[] = [];

  // Heading of travel (going north) at each point on the main road: from the point before it to the point after it.
  const headingOf = new Map<string, number>();
  MAIN_ROAD.forEach((id, i) => {
    const a = byId.get(MAIN_ROAD[Math.max(0, i - 1)] ?? id)!.at;
    const b = byId.get(MAIN_ROAD[Math.min(MAIN_ROAD.length - 1, i + 1)] ?? id)!.at;
    const deg = (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
    headingOf.set(id, (deg + 360) % 360);
  });

  for (const p of POINTS) {
    let at = p.at;
    if (p.town) {
      let best: { j: { name: string; lat: number; lng: number }; minutes: number } | null = null;
      for (const j of p.town.junctions) {
        const r = await route(p.town.centre, await snap(j, headingOf.get(p.id), true));
        if (!best || r.minutes < best.minutes) best = { j, minutes: r.minutes };
      }
      at = best!.j;
      chosen.set(p.id, best!.j.name);
    }
    // A pin is a place on the carriageway itself (the road a driver heading north takes), except the two
    // city centres, which are snapped to whatever street is there.
    const s = await snap(at, p.kind === "start" ? undefined : headingOf.get(p.id), p.kind !== "start");
    if (s.metres > 150) warnings.push(`${p.id}: nearest road is ${Math.round(s.metres)} m from the given spot (${s.name || "unnamed"})`);
    if (p.kind !== "start" && !/Utara.?Selatan/i.test(s.name)) warnings.push(`${p.id}: pin is not on the North-South Expressway (${s.name || "unnamed"})`);
    const pin = { lat: s.lat, lng: s.lng };
    pins.set(p.id, { lat: Math.round(s.lat * 1e5) / 1e5, lng: Math.round(s.lng * 1e5) / 1e5 });
    if (p.town) {
      const there = await route(p.town.centre, pin);
      const back = await route(pin, p.town.centre);
      offRoad.set(p.id, Math.round(Math.min(there.minutes, back.minutes)));
    } else if (p.kind === "rest") {
      // The slip road in from the mainline to the rest area itself (the pin stays on the mainline).
      let least = Infinity;
      for (const spot of p.spots ?? [p.at]) {
        const sp = await snap(spot);
        const there = await route(pin, sp);
        const back = await route(sp, pin);
        least = Math.min(least, there.minutes, back.minutes);
      }
      offRoad.set(p.id, Math.max(1, Math.round(least)));
    } else {
      offRoad.set(p.id, 0);
    }
  }

  const segments: { from: string; to: string; minutes: number; kilometres: number; road: string }[] = [];
  for (const [from, to] of NEIGHBOURS) {
    if (!byId.has(from) || !byId.has(to)) throw new Error(`Unknown point in ${from} to ${to}`);
    const fwd = await route(pins.get(from)!, pins.get(to)!);
    const back = await route(pins.get(to)!, pins.get(from)!);
    // Pins sit on the carriageway heading from the first point to the second, so the direction
    // against it pays for an exit and a turn the road does not need. The shorter of the two is the road.
    const shorter = fwd.minutes <= back.minutes ? fwd : back;
    segments.push({
      from,
      to,
      minutes: Math.max(1, Math.round(shorter.minutes)),
      kilometres: round1(shorter.kilometres),
      road: roadLabel(fwd.road),
    });
  }

  // Connected, and no stretch longer than MAX_BETWEEN_RESTS between places to rest.
  const adjacency = new Map<string, { to: string; minutes: number; kilometres: number }[]>();
  for (const s of segments) {
    adjacency.set(s.from, [...(adjacency.get(s.from) ?? []), { to: s.to, minutes: s.minutes, kilometres: s.kilometres }]);
    adjacency.set(s.to, [...(adjacency.get(s.to) ?? []), { to: s.from, minutes: s.minutes, kilometres: s.kilometres }]);
  }
  const first = MAIN_ROAD[0] ?? "";
  const reach = new Set<string>([first]);
  for (const queue = [first]; queue.length; ) {
    for (const n of adjacency.get(queue.pop()!) ?? []) if (!reach.has(n.to)) { reach.add(n.to); queue.push(n.to); }
  }
  const unreached = POINTS.filter((p) => !reach.has(p.id)).map((p) => p.id);
  if (unreached.length) throw new Error(`Not connected: ${unreached.join(", ")}`);

  const canRest = (id: string) => byId.get(id)!.kind !== "junction";
  for (const start of POINTS.filter((p) => canRest(p.id))) {
    // Walk outward through junctions only; the first rest-capable point ends that stretch.
    const best = new Map<string, number>([[start.id, 0]]);
    for (const queue = [start.id]; queue.length; ) {
      const here = queue.shift()!;
      for (const n of adjacency.get(here) ?? []) {
        const t = best.get(here)! + n.minutes;
        if (t < (best.get(n.to) ?? Infinity)) {
          best.set(n.to, t);
          if (!canRest(n.to)) queue.push(n.to);
        }
      }
    }
    for (const [id, t] of best) {
      if (id !== start.id && canRest(id) && t > MAX_BETWEEN_RESTS) {
        warnings.push(`${start.id} to ${id} is ${Math.round(t)} min with no place to rest inside it`);
      }
    }
  }

  // Quickest path over the table, for the comparison with research/12 6.1.
  function quickest(from: string, to: string) {
    const dist = new Map<string, { minutes: number; kilometres: number }>([[from, { minutes: 0, kilometres: 0 }]]);
    const done = new Set<string>();
    for (;;) {
      let here: string | null = null;
      for (const [id, d] of dist) if (!done.has(id) && (here === null || d.minutes < dist.get(here)!.minutes)) here = id;
      if (here === null) break;
      done.add(here);
      for (const n of adjacency.get(here) ?? []) {
        const d = dist.get(here)!;
        const t = d.minutes + n.minutes;
        if (t < (dist.get(n.to)?.minutes ?? Infinity)) dist.set(n.to, { minutes: t, kilometres: d.kilometres + n.kilometres });
      }
    }
    return dist.get(to)!;
  }

  const comparison = [];
  for (const leg of LEGS) {
    const q = quickest(leg.from, leg.to);
    const direct = await route(await snapToCentre(leg.from), await snapToCentre(leg.to));
    comparison.push({
      leg: `${leg.from} to ${leg.to}`,
      researchMinutes: leg.minutes,
      researchKilometres: leg.kilometres,
      tableMinutes: q.minutes,
      tableKilometres: round1(q.kilometres),
      engineDirectMinutes: Math.round(direct.minutes),
      engineDirectKilometres: round1(direct.kilometres),
    });
  }

  function snapToCentre(id: string) {
    const p = byId.get(id)!;
    return Promise.resolve(p.town ? p.town.centre : p.at);
  }

  const roads = {
    points: POINTS.map((p) => ({ id: p.id, pin: pins.get(p.id)!, offRoadMinutes: offRoad.get(p.id)! })),
    segments,
    source: {
      text:
        "Built once from OpenStreetMap road data (Geofabrik extract for Malaysia, Singapore and Brunei, downloaded 24 November 2026) with the open OSRM routing engine, car profile, run on the build machine. Free-flow times: no traffic, no toll prices.",
      builtOn: new Date().toISOString().slice(0, 10),
      licence: "ODbL-1.0",
    },
  };
  const townOnRoad = Object.fromEntries(POINTS.filter((p) => p.town).map((p) => [p.id, p.id]));
  const reading = POINTS.map((p) => ({ id: p.id, name: p.name, kind: p.kind, junctionChosen: chosen.get(p.id) ?? null }));

  writeFileSync(values.out as string, JSON.stringify({ roads, townOnRoad, reading, comparison, warnings }, null, 2) + "\n");
  console.error(JSON.stringify({ comparison, warnings, chosen: Object.fromEntries(chosen) }, null, 2));
  console.error(`Wrote ${values.out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : `Unexpected throw: ${String(e)}`);
  process.exit(1);
});
