import { getFunctionName } from "convex/server";
import { renderToStaticMarkup as render } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionAdmin } from "@/components/steward/collection-admin";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { config } from "../fixtures/public-ui";

const backend = vi.hoisted(() => ({ sets: undefined as unknown }));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: { regionId: string }) => {
    expect(getFunctionName(ref)).toBe("collection:listForSteward");
    expect(args).toEqual({ regionId: config.id });
    return backend.sets;
  },
}));

const names = (value: string) => [{ lang: "en", script: "latin", value, isPrimary: true }];
const placeRow = (index: number, over: object = {}) => ({
  placeId: `place-${index}`,
  slug: `fictional-${index}`,
  names: names(`Fictional ${index}`),
  usable: true,
  pickedLineEn: null,
  pickedLineLive: false,
  sentences: [{ en: `A sentence ${index}.`, ja: `文${index}。` }],
  ...over,
});
const setRow = (over: object = {}) => ({
  id: "set-1",
  neighbourhoodId: "shinchi",
  names: { ja: "新地中華街", en: "Shinchi" },
  status: "draft",
  hasWholeArt: true,
  panels: [{ index: 0, hasArt: true, places: [placeRow(1)] }],
  tooClose: [],
  candidates: [{ placeId: "place-9", slug: "fictional-9", names: names("Fictional 9") }],
  ...over,
});
const admin = (locale: "ja" | "en" = "en") =>
  render(<CollectionAdmin locale={locale} region={config} />);
const m = collectionMessages.en;

beforeEach(() => {
  backend.sets = [setRow()];
});

describe("the steward's collection page", () => {
  it("waits for the list, then says when there are no sets", () => {
    backend.sets = undefined;
    expect(admin()).toContain('role="status"');
    backend.sets = [];
    expect(admin()).toContain(m.stewardEmpty);
  });

  it.each(["ja", "en"] as const)("%s nav marks this page as current", (locale) => {
    const nav = admin(locale).match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)![0];
    const current = nav.match(/<a\b[^>]*aria-current="page"[^>]*>/)![0];
    expect(current).toContain(`href="/${locale}/steward/collection"`);
  });

  it("offers to set a draft live and a live set back to draft", () => {
    expect(admin()).toContain(m.goLive);
    backend.sets = [setRow({ status: "live" })];
    const html = admin();
    expect(html).toContain(m.statusLive);
    expect(html).toContain(m.backToDraft);
  });

  it("warns about missing art, and two places one spot could reach", () => {
    backend.sets = [
      setRow({
        hasWholeArt: false,
        panels: [
          { index: 0, hasArt: false, places: [placeRow(1)] },
          { index: 1, hasArt: true, places: [placeRow(2)] },
        ],
        tooClose: [{ a: "place-1", b: "place-2", metres: 22 }],
      }),
    ];
    const html = admin();
    expect(html).toContain(m.wholeArtMissing);
    expect(html).toContain(m.artMissing);
    expect(html).toContain("Fictional 1 and Fictional 2 are only 22 m apart");
  });

  it("flags a place that can't be used and a picked line that has gone", () => {
    backend.sets = [
      setRow({
        panels: [
          {
            index: 0,
            hasArt: true,
            places: [placeRow(1, { usable: false, pickedLineEn: "Old.", pickedLineLive: false })],
          },
        ],
      }),
    ];
    const html = admin();
    expect(html).toContain(m.placeNotUsable);
    expect(html.replaceAll("&#x27;", "'")).toContain(m.pickedGone);
  });

  it("lets a line be picked only from the place's own sentences", () => {
    backend.sets = [
      setRow({
        panels: [
          {
            index: 0,
            hasArt: true,
            places: [
              placeRow(1, { pickedLineEn: "A sentence 1.", pickedLineLive: true }),
              placeRow(2, { sentences: [] }),
            ],
          },
        ],
      }),
    ];
    const html = admin();
    expect(html).toContain("A sentence 1.");
    expect(html).toContain(m.noSentences);
    expect(html.match(/<select\b/g)).toHaveLength(2);
  });

  it("offers the set's candidates to add, and every control is big enough to press", () => {
    const html = admin();
    expect(html).toContain("Fictional 9");
    for (const control of html.match(/<(?:button|select)\b[^>]*>/g) ?? [])
      expect(control).toContain("min-h-11");
  });
});
