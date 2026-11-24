import { describe, expect, it } from "vitest";
import { townFor } from "@/lib/region/where";
import { mapAt, parseMapStart } from "@/lib/region/start";
import { getRegion } from "@/lib/region";

const nagasaki = getRegion("nagasaki")!;
const malaysia = getRegion("malaysia-west")!;
const props = (r: typeof nagasaki) => ({ towns: r.towns, regionNames: r.name });

describe("townFor", () => {
  it("names the Malaysian town whose circle holds the pin", () => {
    expect(townFor(props(malaysia), { lat: 4.5975, lng: 101.0901 }, "en")).toBe("Ipoh");
    expect(townFor(props(malaysia), { lat: 4.5975, lng: 101.0901 }, "ja")).toBe("イポー");
  });
  it("falls back to the region's name outside every town", () => {
    expect(townFor(props(malaysia), { lat: 3.2, lng: 101.0 }, "en")).toBe("West Coast Malaysia");
    expect(townFor(props(malaysia), { lat: 3.2, lng: 101.0 }, "ja")).toBe("マレーシア西海岸");
    expect(townFor(props(malaysia), null, "en")).toBe("West Coast Malaysia");
  });
  it("leaves a Nagasaki place as Nagasaki", () => {
    expect(townFor(props(nagasaki), { lat: 32.7503, lng: 129.8777 }, "en")).toBe("Nagasaki");
    expect(townFor(props(nagasaki), { lat: 32.7503, lng: 129.8777 }, "ja")).toBe("長崎");
  });
});

describe("parseMapStart", () => {
  const boxes = [nagasaki.bbox, malaysia.bbox] as const;
  it("accepts a point inside a region's bbox", () => {
    expect(parseMapStart("4.5975,101.0901", boxes)).toEqual({
      lat: 4.5975,
      lng: 101.0901,
      zoom: 14,
    });
  });
  it("ignores a point outside every bbox, or one that is malformed", () => {
    for (const bad of [
      "35.68,139.69",
      "4.5,abc",
      "4.5",
      "4.5,101,1",
      ",",
      "",
      "NaN,101",
      "Infinity,101",
    ])
      expect(parseMapStart(bad, boxes)).toBeNull();
    expect(parseMapStart(undefined, boxes)).toBeNull();
  });
  it("builds the back link", () => {
    expect(mapAt({ lat: 4.5, lng: 101.1 })).toBe("/map?at=4.5,101.1");
    expect(mapAt(null)).toBe("/map");
  });
});
