import { describe, expect, it } from "vitest";
import { getRegionConfig } from "../../src/lib/region/registry";
import { townOf } from "../../src/lib/region/neighbourhoods";
import {
  CAPTION_LIMIT,
  HASHTAG_LIMIT,
  buildCaption,
  captionHashtags,
  creditLine,
  hashtagFor,
  type CaptionInput,
} from "@/lib/share/caption";
import { canShareFiles } from "@/lib/share/share-file";

const nagasaki = { en: "Nagasaki", ja: "長崎" };
const base: CaptionInput = {
  body: "The tram stop here is older than the street.",
  lang: "en",
  authorName: "Mika",
  placeEnglish: "Fictional Hill Cafe",
  placeJapanese: "架空の坂カフェ",
  town: nagasaki,
};
const tags = (caption: string) => caption.match(/#[\p{L}\p{N}\p{M}_]+/gu) ?? [];

describe("the Instagram caption", () => {
  it("has the story, who wrote it, the place in both languages, the site as plain text and hashtags", () => {
    expect(buildCaption(base)).toBe(
      [
        "The tram stop here is older than the street.",
        "",
        "Story by Mika on Noren",
        "Fictional Hill Cafe 架空の坂カフェ",
        "noren.yooi.me",
        "",
        "#長崎 #Nagasaki #FictionalHillCafe #架空の坂カフェ #Noren",
      ].join("\n"),
    );
    // A link in a caption is not clickable, so the site is written as plain text.
    expect(buildCaption(base)).not.toMatch(/https?:/);
  });

  it("credits a Japanese story in Japanese, and any other language in English", () => {
    const ja = buildCaption({ ...base, body: "坂の上の路面電車の停留所。", lang: "ja" });
    expect(ja).toContain("Mika さんの物語（Noren より）");
    expect(ja).not.toContain("Story by");
    expect(creditLine("en", "Mika")).toBe("Story by Mika on Noren");
    expect(creditLine("ja", "Mika")).toBe("Mika さんの物語（Noren より）");
    expect(creditLine("ko", "Mika")).toBe("Story by Mika on Noren");
  });

  it("names Shimabara for a Shimabara place, and Nagasaki otherwise", () => {
    const shimabara = buildCaption({ ...base, town: { en: "Shimabara", ja: "島原" } });
    expect(shimabara).toContain("#島原 #Shimabara");
    expect(shimabara).not.toContain("#Nagasaki");
    expect(buildCaption(base)).toContain("#長崎 #Nagasaki");
  });

  it("puts the other language beside the story only when a checked translation was given", () => {
    const translated = buildCaption({
      ...base,
      body: "坂の上の路面電車の停留所。",
      lang: "ja",
      translation: { lang: "en", text: "The tram stop at the top of the hill." },
    });
    expect(translated).toContain("坂の上の路面電車の停留所。");
    expect(translated).toContain(
      "English (machine translation)\nThe tram stop at the top of the hill.",
    );
    // The story comes first, in its own language, then the translation, then the credit.
    expect(translated.indexOf("坂の上")).toBeLessThan(translated.indexOf("English (machine"));
    expect(translated.indexOf("English (machine")).toBeLessThan(translated.indexOf("さんの物語"));
    const alone = buildCaption({ ...base, body: "坂の上の路面電車の停留所。", lang: "ja" });
    expect(alone).not.toContain("machine translation");
    expect(buildCaption({ ...base, translation: { lang: "ja", text: "  " } })).not.toContain(
      "機械翻訳",
    );
    expect(
      buildCaption({ ...base, translation: { lang: "ja", text: "路面電車の停留所。" } }),
    ).toContain("日本語（機械翻訳）\n路面電車の停留所。");
  });

  it("stays under 2,200 characters and 30 hashtags, dropping the translation before the story", () => {
    const story = "あ".repeat(1000);
    const full = buildCaption({
      ...base,
      body: story,
      lang: "ja",
      // English runs longer than the Japanese it translates.
      translation: { lang: "en", text: "a".repeat(1500) },
    });
    expect(full.length).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(full).toContain(story);
    expect(full).not.toContain("machine translation");
    // Room for both: nothing is dropped.
    const roomy = buildCaption({
      ...base,
      body: "あ".repeat(600),
      lang: "ja",
      translation: { lang: "en", text: "a".repeat(600) },
    });
    expect(roomy).toContain("a".repeat(600));
    expect(roomy.length).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(tags(full).length).toBeLessThanOrEqual(HASHTAG_LIMIT);
    expect(full.endsWith("#Noren")).toBe(true);
  });

  it("keeps the credit and the hashtags even when the words around them are huge", () => {
    const caption = buildCaption({
      ...base,
      body: "x".repeat(1000),
      authorName: "N".repeat(900),
      placeEnglish: "P".repeat(900),
    });
    expect(caption.length).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(caption).toContain("Story by ");
    expect(caption.endsWith("#Noren")).toBe(true);
  });
});

describe("hashtags", () => {
  it("makes a name safe: letters and digits only, words capitalised", () => {
    expect(hashtagFor("Fictional Hill Cafe")).toBe("#FictionalHillCafe");
    expect(hashtagFor("Café Dejima & Bar")).toBe("#CaféDejimaBar");
    expect(hashtagFor("Mac's Bar")).toBe("#MacsBar");
    expect(hashtagFor("NHK Hall")).toBe("#NHKHall");
    expect(hashtagFor("大浦・南山手")).toBe("#大浦南山手");
    expect(hashtagFor("カフェ・ド・坂")).toBe("#カフェド坂");
    expect(hashtagFor("Ｃａｆｅ　Ｈｉｌｌ")).toBe("#CafeHill");
  });

  it("gives none for a name with no letter in it, or one far too long", () => {
    expect(hashtagFor("123")).toBeNull();
    expect(hashtagFor("!!! ???")).toBeNull();
    expect(hashtagFor("")).toBeNull();
    expect(hashtagFor("a".repeat(80))).toBeNull();
  });

  it("lists the town in both languages, the place, then #Noren, each once", () => {
    expect(
      captionHashtags({ town: nagasaki, placeEnglish: "Dejima Bar", placeJapanese: null }),
    ).toEqual(["#長崎", "#Nagasaki", "#DejimaBar", "#Noren"]);
    // A place named after its town, or after Noren, adds nothing twice.
    expect(
      captionHashtags({ town: nagasaki, placeEnglish: "nagasaki", placeJapanese: "長崎" }),
    ).toEqual(["#長崎", "#Nagasaki", "#Noren"]);
    expect(captionHashtags({ town: nagasaki, placeEnglish: "Noren", placeJapanese: null })).toEqual(
      ["#長崎", "#Nagasaki", "#Noren"],
    );
  });
});

describe("the town of a place", () => {
  const region = getRegionConfig("nagasaki")!;

  it("is Shimabara for a pin in Shimabara, Nagasaki for one in Nagasaki", () => {
    expect(townOf(region, { lat: 32.7875, lng: 130.3685 })).toEqual({
      en: "Shimabara",
      ja: "島原",
    });
    // Shimabara station is outside the castle-town circle, but still Shimabara.
    expect(townOf(region, { lat: 32.7897, lng: 130.3731 })).toEqual({
      en: "Shimabara",
      ja: "島原",
    });
    expect(townOf(region, { lat: 32.7437, lng: 129.8728 })).toEqual({ en: "Nagasaki", ja: "長崎" });
  });

  it("is the region's own name for a pin in no town, or no pin", () => {
    expect(townOf(region, { lat: 32.84, lng: 130.05 })).toEqual({ en: "Nagasaki", ja: "長崎" });
    expect(townOf(region, null)).toEqual({ en: "Nagasaki", ja: "長崎" });
    expect(townOf({ name: { en: "Only English" } }, { lat: 0, lng: 0 })).toEqual({
      en: "Only English",
      ja: "Only English",
    });
  });
});

describe("whether the phone's share sheet takes a picture", () => {
  it("asks the browser before any picture exists", () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({})).toBe(false);
    expect(canShareFiles({ share: async () => {} })).toBe(false);
    expect(canShareFiles({ share: async () => {}, canShare: () => false })).toBe(false);
    expect(
      canShareFiles({ share: async () => {}, canShare: (data) => !!data?.files?.length }),
    ).toBe(true);
  });
});
