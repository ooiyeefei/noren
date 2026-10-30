import { expect, it } from "vitest";
import { ageFlags, orderQueue, type TakedownRequest } from "@/components/steward/takedowns-logic";
const windows = { acknowledgeHours: 24, decideDays: 7 };
it("queue orders received and appealed before decided and closed", () => {
  const rows = (["closed", "decided", "appealed", "received", "hidden"] as const).map(
    (status, i): TakedownRequest => ({
      _id: status,
      status,
      details: "Mock request",
      privacyOrMinor: false,
      receivedAt: i,
    }),
  );
  expect(orderQueue(rows).map((row) => row.status)).toEqual([
    "appealed",
    "received",
    "hidden",
    "decided",
    "closed",
  ]);
  expect(rows[0]!.status).toBe("closed");
});
it("age flags use 24 hours and 7 days", () => {
  const request = { receivedAt: 0, status: "received" as const };
  expect(ageFlags(request, 24 * 3600000, windows).acknowledgeLate).toBe(false);
  expect(ageFlags(request, 24 * 3600000 + 1, windows).acknowledgeLate).toBe(true);
  expect(ageFlags(request, 7 * 86400000, windows).decideLate).toBe(false);
  expect(ageFlags(request, 7 * 86400000 + 1, windows).decideLate).toBe(true);
  expect(ageFlags({ ...request, status: "closed" }, 9 * 86400000, windows).decideLate).toBe(false);
  expect(ageFlags(request, -100, windows).hours).toBe(0);
});
