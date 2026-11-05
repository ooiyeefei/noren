import { expect, it } from "vitest";
import { pressedAfter } from "@/components/public/place-view";

it("keeps a stamp in the check-in result when another press follows", () => {
  expect(pressedAfter("checkIn", "check")).toBe("checkIn");
  expect(pressedAfter("checkIn", "story")).toBe("checkIn");
  expect(pressedAfter("checkIn", null)).toBe("checkIn");
});

it("moves the stamp to whatever was pressed otherwise", () => {
  expect(pressedAfter(null, "check")).toBe("check");
  expect(pressedAfter("check", "story")).toBe("story");
  expect(pressedAfter("story", "checkIn")).toBe("checkIn");
  expect(pressedAfter("story", null)).toBeNull();
});
