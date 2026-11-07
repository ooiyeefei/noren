import { describe, expect, it, vi } from "vitest";
import { CARD_SIZES, cardLayout, cardPath, fitBody, fitPlace } from "@/lib/share/card";
import { buildCaption, captionLine, placeLabel } from "@/lib/share/caption";
import { copyCaption, downloadPicture, sharePicture } from "@/lib/share/picture";

const names = [
  { lang: "ja", script: "kanji" as const, value: "架空の坂カフェ", isPrimary: true },
  { lang: "en", script: "latin" as const, value: "Fictional Hill Cafe", isPrimary: true },
];
const region = {
  defaultLocale: "ja",
  nameFallback: {
    ja: ["kanji", "kana", "romaji", "latin"],
    en: ["latin", "romaji", "kanji", "kana"],
  },
} as never;

describe("the caption", () => {
  it("names the place in English with Japanese beside it", () => {
    expect(placeLabel(names, region).text).toBe("Fictional Hill Cafe 架空の坂カフェ");
    expect(placeLabel([names[1]!], region)).toMatchObject({
      japanese: null,
      text: "Fictional Hill Cafe",
    });
  });

  it("holds the line, the place, hashtags in both languages and the link", () => {
    const caption = buildCaption({
      body: "The baker gives the cats the crusts.",
      place: "Fictional Hill Cafe 架空の坂カフェ",
      slug: "hill-cafe",
      locale: "en",
    });
    expect(caption).toContain("“The baker gives the cats the crusts.”");
    expect(caption).toContain("Fictional Hill Cafe 架空の坂カフェ");
    expect(caption).toContain("#Nagasaki #長崎");
    expect(caption).toContain("https://noren.yooi.me/en/places/hill-cafe");
    expect(caption).not.toContain("A story by");
  });

  it("credits the writer when a steward posts it", () => {
    const caption = buildCaption({
      body: "Hello",
      place: "P",
      slug: "p",
      locale: "en",
      credit: { prefix: "A story by", name: "Test Person" },
    });
    expect(caption).toContain("A story by Test Person");
  });

  it("cuts a long story at a sentence end, or at the limit with an ellipsis", () => {
    const sentence = `${"word ".repeat(20)}ends here. ${"more ".repeat(40)}`;
    expect(captionLine(sentence)).toMatch(/ends here\.$/);
    expect(captionLine("あ".repeat(300))).toMatch(/…$/);
    expect(captionLine("  short   line ")).toBe("short line");
  });
});

describe("the picture's layout", () => {
  it("has the two sizes Instagram takes", () => {
    expect(CARD_SIZES).toEqual({
      story: { width: 1080, height: 1920 },
      feed: { width: 1080, height: 1350 },
    });
    expect(cardPath("abc", "feed", true)).toBe("/api/share/abc?size=feed&download=1");
  });

  it("gives short words big type and shrinks long ones, cutting only at the smallest", () => {
    const short = fitBody("Short.", "story", false);
    const middle = fitBody("あ".repeat(200), "story", true);
    const huge = fitBody("あ".repeat(1000), "feed", true);
    expect(short).toMatchObject({ fontSize: 72, cut: false });
    expect(middle.fontSize).toBeLessThan(72);
    expect(middle.cut).toBe(false);
    expect(huge).toMatchObject({ fontSize: 32, cut: true });
    expect(huge.text.endsWith("…")).toBe(true);
    expect(huge.text.length).toBeLessThan(1000);
    expect(cardLayout("feed", true).textHeight).toBeGreaterThan(0);
  });

  it("puts the Japanese name beside the English one, or under it when they do not fit", () => {
    expect(fitPlace("Cafe", "カフェ", 904).beside).toBe(true);
    expect(
      fitPlace("A Very Long Fictional Harbour Market Hall", "架空の港市場の大きな建物", 904).beside,
    ).toBe(false);
  });
});

const png = () => new Response(new Blob(["x"], { type: "image/png" }), { status: 200 });

describe("Share as a picture", () => {
  it("hands the file to the share sheet where the phone allows it", async () => {
    const share = vi.fn(async () => {});
    const download = vi.fn();
    const fetcher = vi.fn(async () => png());
    const outcome = await sharePicture(
      { storyId: "s1", size: "story", caption: "cap" },
      { fetcher, nav: { canShare: () => true, share }, download },
    );
    expect(outcome).toBe("shared");
    expect(fetcher).toHaveBeenCalledWith("/api/share/s1?size=story");
    const sent = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(sent.text).toBe("cap");
    expect(sent.files?.[0]?.name).toBe("noren-story-story.png");
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads where there is no share sheet, or it can't take a file", async () => {
    for (const nav of [undefined, {}, { canShare: () => false, share: vi.fn() }]) {
      const download = vi.fn();
      const outcome = await sharePicture(
        { storyId: "s1", size: "feed", caption: "c" },
        { fetcher: async () => png(), nav, download },
      );
      expect(outcome).toBe("downloaded");
      expect(download).toHaveBeenCalledTimes(1);
    }
  });

  it("treats closing the sheet as a choice, and saves the file if the sheet fails otherwise", async () => {
    const closed = Object.assign(new Error("closed"), { name: "AbortError" });
    const download = vi.fn();
    const base = { fetcher: async () => png(), download };
    const input = { storyId: "s", size: "story" as const, caption: "c" };
    expect(
      await sharePicture(input, {
        ...base,
        nav: {
          canShare: () => true,
          share: async () => {
            throw closed;
          },
        },
      }),
    ).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
    expect(
      await sharePicture(input, {
        ...base,
        nav: {
          canShare: () => true,
          share: async () => {
            throw new Error("no");
          },
        },
      }),
    ).toBe("downloaded");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when the picture can't be made", async () => {
    await expect(
      downloadPicture(
        { storyId: "gone", size: "story" },
        { fetcher: async () => new Response("no", { status: 404 }), download: vi.fn() },
      ),
    ).rejects.toThrow(/404/);
  });

  it("copies the caption, and says so when the browser refuses", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyCaption("hi", { clipboard: { writeText } as never })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
    expect(await copyCaption("hi", {})).toBe(false);
    expect(
      await copyCaption("hi", {
        clipboard: {
          writeText: async () => {
            throw new Error("x");
          },
        } as never,
      }),
    ).toBe(false);
  });
});
