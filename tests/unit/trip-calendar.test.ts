import { describe, expect, it } from "vitest";
import malaysia from "../../regions/malaysia-west.json";
import { areaRegionSchema } from "@/lib/region/schema";
import { calendarFor, datePlusDays, weekdayOf } from "@/lib/trip/calendar";

const { calendar } = areaRegionSchema.parse(malaysia);

describe("trip calendar", () => {
  it("uses the trip's calendar date across months and years", () => {
    expect(datePlusDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOf("2027-01-01")).toBe("fri");
  });

  it("includes only the matching state holidays and carries verification through", () => {
    expect(calendarFor(calendar, "2027-01-06", ["kedah"]).entries).toContainEqual({
      text: "Israk and Mikraj",
      verified: true,
    });
    expect(calendarFor(calendar, "2027-01-06", ["perak"]).entries).not.toContainEqual({
      text: "Israk and Mikraj",
      verified: true,
    });
    expect(calendarFor(calendar, "2026-12-25", ["kedah", "perak"]).entries).toEqual([
      { text: "Christmas", verified: true },
      { text: "School holidays", verified: true },
      { text: "Weekly rest day", verified: false },
    ]);
  });

  it("marks busy days and leaves the unverified fasting period labelled", () => {
    expect(calendarFor(calendar, "2026-12-24", ["perak"])).toEqual({
      busy: true,
      entries: [
        { text: "School holidays", verified: true },
        { text: "School holidays, the day before Christmas", verified: false },
      ],
    });
    expect(calendarFor(calendar, "2027-03-09", []).entries).toContainEqual({
      text: "Fasting month",
      verified: false,
    });
    expect(calendarFor(calendar, "2027-03-10", []).entries).toEqual([]);
  });
});
