import { describe, expect, it } from "vitest";
import { buildQuery, parseOverpass } from "../../src/lib/osm/overpass";

// Synthetic OSM-shaped fixtures only.
describe("Overpass pure code", () => {
  it("the query matches on category keys only", () => {
    const query = buildQuery({ bbox: [129.7, 32.55, 130.12, 33], timeoutSeconds: 120 });
    expect(query).toContain("[out:json][timeout:120]");
    expect(query.match(/\(32.55,129.7,33,130.12\)/g)).toHaveLength(1);
    expect(query).toContain('nwr["name"]');
    const matchingKeys = query.match(/\[~"\^\(([^)]+)\)\$"~"\."\]/)?.[1]?.split("|");
    expect(matchingKeys).toEqual(["amenity", "shop", "craft", "tourism", "historic"]);
    for (const key of ["name:ja", "name:en", "cuisine", "name"])
      expect(matchingKeys).not.toContain(key);
    expect(query).toMatch(/out center meta tags;$/);
    expect(query).not.toMatch(/addr:|phone|website|operator|email|opening_hours/);
  });
  it("named railway/crossing/place/building features never become candidates", () => {
    const tags = [
      { railway: "station" },
      { railway: "level_crossing" },
      { place: "suburb" },
      { building: "yes" },
    ];
    const stats = { skipped: 0 };
    expect(
      parseOverpass(
        {
          elements: tags.map((tag, i) => ({
            type: "node",
            id: i + 1,
            lat: 32.7,
            lon: 129.8,
            tags: { ...tag, name: `Synthetic noise ${i}` },
          })),
        },
        stats,
      ),
    ).toEqual([]);
    expect(stats.skipped).toBe(4);
  });
  it("accepts every category key, including categories mapped to other", () => {
    for (const key of ["amenity", "shop", "craft", "tourism", "historic"]) {
      const parsed = parseOverpass({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 32.7,
            lon: 129.8,
            tags: { name: "Synthetic category", [key]: "unknown" },
          },
        ],
      });
      expect(parsed, key).toHaveLength(1);
      expect(parsed[0]?.isChain).toBe(false);
    }
  });
  it("derives chains from raw tags before stripping brand tags", () => {
    const [parsed] = parseOverpass({
      elements: [
        {
          type: "node",
          id: 1,
          lat: 32.7,
          lon: 129.8,
          tags: { name: "Synthetic chain", shop: "convenience", "brand:wikidata": "Q123" },
        },
      ],
    });
    expect(parsed).toMatchObject({
      isChain: true,
      tags: { name: "Synthetic chain", shop: "convenience" },
    });
    expect(parsed?.tags).not.toHaveProperty("brand:wikidata");
  });
  it("rejects unsafe query parameters", () => {
    for (const timeoutSeconds of [0, -1, 181, 1.5, NaN])
      expect(() => buildQuery({ bbox: [1, 2, 3, 4], timeoutSeconds })).toThrow();
    expect(() => buildQuery({ bbox: [4, 3, 2, 1], timeoutSeconds: 120 })).toThrow();
  });
  it("parseOverpass handles node, way and relation(center), skips nameless and coordinate-less elements, never throws on garbage", () => {
    const stats = { skipped: 0 };
    const parsed = parseOverpass(
      {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 32.7,
            lon: 129.8,
            tags: { name: "Synthetic Node", amenity: "cafe", phone: "mock" },
            version: 2,
            timestamp: "2026-10-30T00:00:00Z",
          },
          {
            type: "way",
            id: 2,
            center: { lat: 32.8, lon: 129.9 },
            tags: { name: "架空店", shop: "yes" },
          },
          {
            type: "relation",
            id: 3,
            center: { lat: 32.8, lon: 129.9 },
            tags: { name: "Synthetic Relation", tourism: "museum" },
          },
          { type: "node", id: 4, lat: 32.7, lon: 129.8, tags: {} },
          { type: "way", id: 5, tags: { name: "Synthetic Missing Coordinates" } },
          null,
          9,
          [],
          {},
          { type: "node", id: 6, lat: NaN, lon: 10, tags: { name: "Synthetic NaN" } },
          {
            type: "unknown",
            id: 7,
            center: { lat: 32, lon: 130 },
            tags: { name: "Synthetic Unknown" },
          },
        ],
      },
      stats,
    );
    expect(parsed.map((row) => row.osmType)).toEqual(["node", "way", "relation"]);
    expect(parsed[0]).toMatchObject({
      osmId: 1,
      lat: 32.7,
      lng: 129.8,
      tags: { name: "Synthetic Node" },
      osmVersion: 2,
      osmTimestamp: "2026-10-30T00:00:00Z",
    });
    expect(parsed[0]?.tags.phone).toBeUndefined();
    expect(parsed[1]?.lat).toBe(32.8);
    expect(stats.skipped).toBe(8);
    for (const garbage of [
      null,
      0,
      "text",
      [],
      {},
      { elements: null },
      { elements: [false, { tags: false }] },
    ])
      expect(() => parseOverpass(garbage)).not.toThrow();
  });
});
