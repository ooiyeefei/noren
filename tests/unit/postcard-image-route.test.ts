import { beforeEach, describe, expect, it, vi } from "vitest";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";

const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));
const state = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/region", async () => {
  const config = regionSchema.parse(regionJson);
  return {
    getActiveRegion: () => ({ ...config, features: { ...config.features, postcard: state.on } }),
  };
});
const drawn = vi.hoisted(() => ({ content: undefined as unknown }));
vi.mock("@/lib/postcard/og", async (original) => {
  const actual = await original<typeof import("@/lib/postcard/og")>();
  return {
    ...actual,
    renderPostcardImage: (content: unknown, fonts: never) => {
      drawn.content = content;
      return actual.renderPostcardImage(content as never, fonts);
    },
  };
});

import { GET } from "@/app/api/postcard/[code]/image/route";

const CODE = "abcdefghjkmnpqrstuvwxyz2";
const call = (code: string, query = "") =>
  GET(new Request(`https://noren.test/api/postcard/${code}/image${query}`), {
    params: Promise.resolve({ code }),
  });
const view = {
  recipientName: "Mum",
  message: "SECRET-MESSAGE-WORDS",
  messageLang: "en",
  aiAssisted: true,
  fromName: "Hana",
  sentAt: Date.UTC(2026, 10, 17, 18, 0),
  regionId: "nagasaki",
  places: [
    {
      slug: "dejima",
      names: [
        { lang: "en", script: "latin", value: "Dejima", isPrimary: true },
        { lang: "ja", script: "kanji", value: "出島", isPrimary: true },
      ],
      excerpt: { text: "SECRET-STORY-WORDS", lang: "en" },
      photos: [{ key: "photos/secret.jpg", width: 10, height: 10 }],
    },
  ],
};

beforeEach(() => {
  fetchQuery.mockReset();
  state.on = true;
  drawn.content = undefined;
});

describe("the postcard's link-preview picture", () => {
  it("answers 404 for a wrong code without asking Convex", async () => {
    for (const code of ["nope", "A".repeat(24), "../etc"]) {
      expect((await call(code)).status).toBe(404);
    }
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("answers 404 while the switch is off, without asking Convex", async () => {
    state.on = false;
    expect((await call(CODE)).status).toBe(404);
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("answers 404 for a deleted card, or when Convex can't be read", async () => {
    fetchQuery.mockResolvedValue(null);
    expect((await call(CODE)).status).toBe(404);
    fetchQuery.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await call(CODE)).status).toBe(404);
  });

  it("draws a PNG that no shared cache keeps, from names alone", async () => {
    fetchQuery.mockResolvedValue(view);
    const response = await call(CODE, "?lang=ja");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const text = JSON.stringify(drawn.content);
    expect(text).toContain("Dejima");
    expect(text).toContain("Mum");
    expect(text).toContain("Hana");
    // Nothing the sender could later take back is drawn.
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("secret.jpg");
  });
});
