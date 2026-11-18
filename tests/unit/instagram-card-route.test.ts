import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery: query }));

import { GET } from "../../src/app/api/instagram-card/[postId]/route";

const ask = (search = "?t=secret") =>
  GET(new Request(`https://noren.yooi.me/api/instagram-card/p1${search}`), {
    params: Promise.resolve({ postId: "p1" }),
  });

beforeEach(() => query.mockReset());

describe("the picture Instagram fetches", () => {
  it("is a 1080 x 1350 JPEG (4:5, sRGB), uncached and hidden from search", async () => {
    query.mockResolvedValue({
      body: "The tram stop here is older than the street.",
      lang: "en",
      authorName: "Aiko",
      placeEnglish: "Fictional Cafe",
      placeJapanese: "架空のカフェ",
    });
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
    const meta = await sharp(bytes).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1080, height: 1350, space: "srgb" });
    expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
    expect(query.mock.calls[0]![1]).toEqual({ postId: "p1", token: "secret" });
  });

  it("is a 404 when the post has no picture to give", async () => {
    query.mockResolvedValue(null);
    expect((await ask()).status).toBe(404);
  });
});
