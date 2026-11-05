import { describe, expect, it } from "vitest";
import { nextPanel } from "@/lib/collection/next-panel";

const here = { lat: 32.7415, lng: 129.8755 };
const near = { name: "near", pin: { lat: 32.7418, lng: 129.8755 } };
const far = { name: "far", pin: { lat: 32.743, lng: 129.8755 } };
const noPin = { name: "no pin", pin: null };

describe("nextPanel", () => {
  it("picks the nearest place on a panel still undyed, with its distance", () => {
    const next = nextPanel(
      [
        { index: 0, dyed: false, places: [far] },
        { index: 1, dyed: false, places: [near] },
      ],
      here,
    );
    expect(next?.panelIndex).toBe(1);
    expect(next?.place.name).toBe("near");
    expect(next?.metres).toBe(33);
  });

  it("skips a dyed panel, however near", () => {
    const next = nextPanel(
      [
        { index: 0, dyed: true, places: [near] },
        { index: 1, dyed: false, places: [far] },
      ],
      here,
    );
    expect(next?.place.name).toBe("far");
  });

  it("looks at every place on a panel and skips one with no pin", () => {
    const next = nextPanel([{ index: 0, dyed: false, places: [noPin, far, near] }], here);
    expect(next?.place.name).toBe("near");
  });

  it("is null when nothing is left", () => {
    expect(nextPanel([{ index: 0, dyed: true, places: [near] }], here)).toBeNull();
    expect(nextPanel([{ index: 0, dyed: false, places: [noPin] }], here)).toBeNull();
    expect(nextPanel([], here)).toBeNull();
  });
});
