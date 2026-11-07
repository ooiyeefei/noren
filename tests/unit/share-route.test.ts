import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));

import { GET } from "@/app/api/share/[storyId]/route";

const call = (id: string, query = "") =>
  GET(new Request(`https://noren.test/api/share/${id}${query}`), {
    params: Promise.resolve({ storyId: id }),
  });

beforeEach(() => {
  fetchQuery.mockReset();
});

describe("the picture route", () => {
  it("answers 404 for a story with no picture: hidden, removed, demo or on a private place", async () => {
    fetchQuery.mockResolvedValue(null);
    const response = await call("hidden1");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 404 for an address that isn't a story id", async () => {
    fetchQuery.mockImplementation(() => {
      throw new Error("ArgumentValidationError: not a valid story id");
    });
    expect((await call("nope")).status).toBe(404);
  });

  it("refuses an unknown size", async () => {
    expect((await call("s1", "?size=huge")).status).toBe(400);
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("draws a PNG for a live story, in the Japanese font, and offers it as a download on request", async () => {
    fetchQuery.mockResolvedValue({
      body: "猫が階段で昼寝していました。",
      lang: "ja",
      authorName: "Test Person",
      placeSlug: "hill-cafe",
      placeEnglish: "Fictional Hill Cafe",
      placeJapanese: "架空の坂カフェ",
      photoKey: null,
    });
    const response = await call("s1", "?size=feed&download=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("noren-story-feed.png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    expect(bytes.length).toBeGreaterThan(20_000);
  });
});
