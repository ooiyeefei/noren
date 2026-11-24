import { beforeEach, expect, it, vi } from "vitest";

const fetchQuery = vi.fn();
vi.mock("convex/nextjs", () => ({ fetchQuery, fetchMutation: vi.fn() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

beforeEach(() => {
  fetchQuery.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

it("finds the place by its slug alone, and says nothing for a slug no region has", async () => {
  fetchQuery.mockResolvedValue(null);
  const { loadPlaceSeo } = await import("@/lib/seo/place-data");
  expect(await loadPlaceSeo("nowhere", "en")).toBeNull();
  expect(fetchQuery).toHaveBeenCalledTimes(1);
  expect(fetchQuery.mock.calls[0]![1]).toEqual({ slug: "nowhere" });
});

it("reads the rest of the page in the place's own region, not the one the server started in", async () => {
  fetchQuery.mockImplementation(async (_ref: unknown, args: Record<string, unknown>) =>
    "regionId" in args ? null : { _id: "p1", regionId: "malaysia-west", slug: "ipoh-cafe" },
  );
  const { loadPlaceSeo } = await import("@/lib/seo/place-data");
  expect(await loadPlaceSeo("ipoh-cafe-2", "en")).toBeNull();
  const second = fetchQuery.mock.calls[1]![1] as Record<string, unknown>;
  expect(second).toEqual({ regionId: "malaysia-west", slug: "ipoh-cafe-2" });
});

it("says nothing when the place's region is not one Noren knows", async () => {
  fetchQuery.mockResolvedValue({ _id: "p1", regionId: "atlantis", slug: "x" });
  const { loadPlaceSeo } = await import("@/lib/seo/place-data");
  expect(await loadPlaceSeo("x-3", "en")).toBeNull();
  expect(fetchQuery).toHaveBeenCalledTimes(1);
});
