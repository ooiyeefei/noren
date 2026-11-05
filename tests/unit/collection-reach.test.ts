import { describe, expect, it } from "vitest";
import { dayAt, dayToTime, withinReach } from "@/lib/collection/reach";

const reach = { checkInMetres: 50, accuracyAllowanceMetres: 30 };

describe("withinReach", () => {
  it("lets the phone's reported error help, up to the allowance", () => {
    expect(withinReach(80, 30, reach)).toBe(true);
    expect(withinReach(81, 30, reach)).toBe(false);
    expect(withinReach(55, 5, reach)).toBe(true);
    expect(withinReach(56, 5, reach)).toBe(false);
  });

  it("counts a wild reading as the allowance", () => {
    expect(withinReach(80, 40, reach)).toBe(true);
    expect(withinReach(81, 2000, reach)).toBe(false);
  });

  it("passes standing at the pin with a perfect reading", () => {
    expect(withinReach(0, 0, reach)).toBe(true);
  });
});

describe("dayAt", () => {
  it("gives the date in the region's offset", () => {
    expect(dayAt(Date.UTC(2026, 10, 5, 14, 59), 9)).toBe("2026-11-05");
    expect(dayAt(Date.UTC(2026, 10, 5, 15, 0), 9)).toBe("2026-11-06");
  });

  it("keeps no time of day", () => {
    expect(dayAt(Date.UTC(2026, 10, 5, 3, 7), 9)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dayToTime", () => {
  it("is the UTC midnight of the date, so the app's UTC formatting shows that date", () => {
    expect(new Date(dayToTime("2026-11-06")).toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});
