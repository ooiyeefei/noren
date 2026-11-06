import { describe, expect, it } from "vitest";
import { nextPlaceTab, placeTabSearch, readPlaceTab } from "@/lib/place/tabs";

describe("readPlaceTab", () => {
  it("opens stories when there is no tab or an unknown one", () => {
    expect(readPlaceTab({})).toEqual({ tab: "stories", write: false });
    expect(readPlaceTab({ tab: "nonsense" })).toEqual({ tab: "stories", write: false });
    expect(readPlaceTab({ tab: ["visit", "about"] })).toEqual({ tab: "visit", write: false });
  });
  it("reads visit and about", () => {
    expect(readPlaceTab({ tab: "visit" }).tab).toBe("visit");
    expect(readPlaceTab({ tab: "about" }).tab).toBe("about");
  });
  it("sends a request to write to stories whatever tab was named", () => {
    expect(readPlaceTab({ tab: "about", write: "1" })).toEqual({ tab: "stories", write: true });
    expect(readPlaceTab({ write: "yes" }).write).toBe(false);
  });
});

describe("placeTabSearch", () => {
  it("writes the tab and leaves stories bare", () => {
    expect(placeTabSearch("", "visit")).toBe("?tab=visit");
    expect(placeTabSearch("?tab=about", "stories")).toBe("");
  });
  it("keeps other parameters and drops write", () => {
    expect(placeTabSearch("?ref=map&write=1", "visit")).toBe("?ref=map&tab=visit");
    expect(placeTabSearch("?write=1&tab=about", "stories")).toBe("");
  });
});

describe("nextPlaceTab", () => {
  it("wraps with the arrow keys and jumps with Home and End", () => {
    expect(nextPlaceTab("stories", "ArrowRight")).toBe("visit");
    expect(nextPlaceTab("about", "ArrowRight")).toBe("stories");
    expect(nextPlaceTab("stories", "ArrowLeft")).toBe("about");
    expect(nextPlaceTab("visit", "Home")).toBe("stories");
    expect(nextPlaceTab("visit", "End")).toBe("about");
    expect(nextPlaceTab("visit", "a")).toBeNull();
  });
});
