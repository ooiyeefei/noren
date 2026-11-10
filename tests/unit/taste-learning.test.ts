import { describe, expect, it, vi } from "vitest";
import { emptyMemory, JAPAN_UTC_OFFSET_HOURS } from "@/lib/memory";

// Noticing tastes from what a visitor opens and saves writes to their own device. It must do nothing
// while the planner is off, so no page touches storage before the privacy notice names it.

const features = vi.hoisted(() => ({ planner: false }));
const update = vi.hoisted(() => vi.fn());
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (callback: () => void) => void callback(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("@/components/layout/features", () => ({
  useFeatureLinks: () => ({ planner: features.planner }),
}));
vi.mock("@/components/memory/use-memory", () => ({ memoryStore: () => ({ update }) }));

import { useTasteLearning } from "@/components/memory/taste-learning";

const clock = { now: Date.UTC(2026, 10, 10, 3), utcOffsetHours: JAPAN_UTC_OFFSET_HOURS };
type Change = (
  memory: ReturnType<typeof emptyMemory>,
  clock: unknown,
) => ReturnType<typeof emptyMemory>;

describe("noticing tastes on the device", () => {
  it("does nothing at all while the planner is off", () => {
    features.planner = false;
    useTasteLearning("cafe", "a-cafe")();
    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing for a place with no category", () => {
    features.planner = true;
    useTasteLearning(undefined, "somewhere")();
    expect(update).not.toHaveBeenCalled();
  });

  it("learns an open when a page opens and a save when asked", () => {
    features.planner = true;
    const save = useTasteLearning("cafe", "a-cafe");
    expect(update).toHaveBeenCalledTimes(1);
    save();
    expect(update).toHaveBeenCalledTimes(2);
    const [open, saved] = update.mock.calls.map(([change]) => change as Change);
    expect(open!(emptyMemory(clock), clock).tastes[0]).toMatchObject({
      key: "coffee",
      strength: 1,
    });
    expect(saved!(emptyMemory(clock), clock).tastes[0]).toMatchObject({
      key: "coffee",
      strength: 3,
    });
  });
});
