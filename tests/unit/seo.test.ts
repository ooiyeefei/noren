import { afterEach, expect, it, vi } from "vitest";
import { switchRegionsOff } from "../fixtures/region-off";
import { GET as sitemap } from "@/app/sitemap.xml/route";
import { GET as llms } from "@/app/llms.txt/route";
import { PRIVATE_SECTIONS } from "@/lib/seo/site";

vi.mock("next/server", () => ({ connection: async () => {} }));
const query = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery: query }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  query.mockReset();
});

it.each([
  ["on, as shipped", true],
  ["switched off", false],
])(
  "both crawler routes read only enabled regions (Malaysia %s)",
  async (_name, preview) => {
    if (!preview) switchRegionsOff("malaysia-west");
    vi.stubEnv("REGIONS_PREVIEW", "");
    query.mockImplementation(async (_ref, { regionId }) => {
      const place = {
        visibility: "public",
        hasStory: true,
        isMock: false,
        slug: regionId,
        names: [],
      };
      return [
        place,
        { ...place, isMock: true, slug: "demo" },
        { ...place, hasStory: false, slug: "empty" },
      ];
    });
    for (const get of [sitemap, llms]) {
      query.mockClear();
      const response = await get();
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("/places/nagasaki");
      expect(text.includes("/places/malaysia-west")).toBe(preview);
      expect(text).not.toMatch(/places\/(demo|empty)/);
      expect(query.mock.calls.map(([, args]) => args.regionId)).toEqual(
        preview ? ["nagasaki", "malaysia-west"] : ["nagasaki"],
      );
      if (get === llms) expect(text.includes("West Coast Malaysia")).toBe(preview);
    }
  },
);

it("keeps the shared trip page under a private section and out of search", async () => {
  expect(PRIVATE_SECTIONS).toContain("trip");
  const path = "/en/trip/shared/abcdefghjkmnpqrstuvwxyz2";
  expect(PRIVATE_SECTIONS.some((section) => path.startsWith(`/en/${section}/`))).toBe(true);
  vi.doMock("next/root-params", () => ({ lang: async () => "en" }));
  vi.doMock("next/server", () => ({ connection: async () => {} }));
  vi.doMock("server-only", () => ({}));
  vi.doMock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
  vi.doMock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
  const { generateMetadata } = await import("@/app/[lang]/trip/shared/[code]/page");
  const meta = await generateMetadata({
    params: Promise.resolve({ lang: "en", code: "abcdefghjkmnpqrstuvwxyz2" }),
  } as never);
  expect(meta.robots).toEqual({ index: false, follow: false });
  expect(meta.referrer).toBe("same-origin");
});
