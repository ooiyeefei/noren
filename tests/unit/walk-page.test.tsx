import { afterEach, describe, expect, it, vi } from "vitest";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";

const mocks = vi.hoisted(() => ({
  walk: false,
  planner: false,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => "/en/walk",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/region", async () => {
  const config = regionSchema.parse(regionJson);
  return {
    getActiveRegion: () => ({
      ...config,
      features: { ...config.features, walk: mocks.walk, planner: mocks.planner },
    }),
  };
});

afterEach(() => {
  mocks.walk = false;
  mocks.planner = false;
  mocks.notFound.mockClear();
});

describe("/[lang]/walk", () => {
  it("ships switched off in the region file", () => {
    expect(regionSchema.parse(regionJson).features.walk).toBe(false);
  });

  it("is a 404 while the region's walk switch is off, before anything renders", async () => {
    const { default: Page } = await import("@/app/[lang]/walk/page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("renders once the switch is on, passing the planner switch on to the cards", async () => {
    mocks.walk = true;
    mocks.planner = true;
    const { default: Page } = await import("@/app/[lang]/walk/page");
    const element = await Page();
    expect(mocks.notFound).not.toHaveBeenCalled();
    const container = (element.props as { children: { props: Record<string, unknown> } }).children;
    expect(container.props).toMatchObject({
      locale: "en",
      walk: {
        regionName: "Nagasaki",
        planner: true,
        accuracyAllowanceMetres: 30,
      },
    });
    const walk = container.props.walk as { neighbourhoods: { id: string }[] };
    expect(walk.neighbourhoods.map(({ id }) => id)).toContain("suwa");
  });

  it("titles itself in the page's language", async () => {
    const { generateMetadata } = await import("@/app/[lang]/walk/page");
    const params = (lang: string) => ({ params: Promise.resolve({ lang }) }) as never;
    expect(await generateMetadata(params("en"))).toEqual({ title: "Walk mode | Noren" });
    expect(await generateMetadata(params("ja"))).toEqual({ title: "歩きモード | Noren" });
  });
});
