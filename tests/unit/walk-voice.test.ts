import { describe, expect, it } from "vitest";
import { walkMessages } from "@/lib/i18n/messages/walk";
import { narrate } from "@/lib/walk/narration";
import type { Snippet } from "@/lib/walk/types";
import { pickLocalVoice, planSpeech, type VoiceLike } from "@/lib/walk/voice";

const voice = (lang: string, over: Partial<VoiceLike> = {}): VoiceLike => ({
  voiceURI: `uri:${lang}:${over.name ?? "v"}`,
  name: over.name ?? `Voice ${lang}`,
  lang,
  localService: true,
  ...over,
});

describe("choosing a voice", () => {
  it("only ever picks a voice that runs on the phone", () => {
    const remote = voice("en-US", { name: "Cloud", localService: false });
    expect(pickLocalVoice([remote], "en")).toBeNull();
    const local = voice("en-GB", { name: "On-device" });
    expect(pickLocalVoice([remote, local], "en")).toBe(local);
  });

  it("matches the language, however the phone writes the tag", () => {
    const ja = voice("ja-JP");
    const jaUnderscore = voice("ja_JP", { name: "Android" });
    const en = voice("en-US");
    expect(pickLocalVoice([en, ja], "ja")).toBe(ja);
    expect(pickLocalVoice([en, jaUnderscore], "ja")).toBe(jaUnderscore);
    expect(pickLocalVoice([en], "ja")).toBeNull();
    expect(pickLocalVoice([ja, en], "EN")).toBe(en);
    expect(pickLocalVoice([ja], "")).toBeNull();
  });

  it("prefers the exact region, then the phone's default, then the first", () => {
    const us = voice("en-US", { name: "US" });
    const gb = voice("en-GB", { name: "GB" });
    const dflt = voice("en-AU", { name: "Default", default: true });
    expect(pickLocalVoice([us, gb], "en-GB")).toBe(gb);
    expect(pickLocalVoice([us, gb], "en-IE")).toBe(us);
    expect(pickLocalVoice([us, gb, dflt], "en")).toBe(dflt);
  });

  it("speaks only when every part has a local voice, otherwise shows the words and stays quiet", () => {
    const en = voice("en-US");
    const ja = voice("ja-JP");
    const parts = [
      { text: "Kenji wrote:", lang: "en" },
      { text: "ちゃんぽんは昔のままです。", lang: "ja" },
    ];
    const both = planSpeech(parts, [en, ja]);
    expect(both).toEqual({
      ok: true,
      items: [
        { text: "Kenji wrote:", lang: "en", voice: en },
        { text: "ちゃんぽんは昔のままです。", lang: "ja", voice: ja },
      ],
    });
    // No Japanese voice on the phone: not even the English half is spoken.
    expect(planSpeech(parts, [en])).toEqual({ ok: false, missing: ["ja"] });
    // A Japanese voice that is not local does not count.
    expect(planSpeech(parts, [en, voice("ja-JP", { localService: false })])).toEqual({
      ok: false,
      missing: ["ja"],
    });
    expect(planSpeech(parts, [])).toEqual({ ok: false, missing: ["en", "ja"] });
    expect(planSpeech([], [en])).toEqual({ ok: false, missing: [] });
  });
});

const en = walkMessages.en;
const ja = walkMessages.ja;

describe("what a card says before the words", () => {
  const member: Snippet = {
    kind: "member",
    writer: "Kenji",
    lang: "en",
    text: "The champon is just as it was.",
    more: false,
  };

  it("names the writer first and gives their words untouched", () => {
    const said = narrate(member, "en", en);
    expect(said.intro).toBe("Kenji wrote:");
    expect(said.body).toBe("The champon is just as it was.");
    expect(said.parts).toEqual([
      { text: "Kenji wrote:", lang: "en" },
      { text: "The champon is just as it was.", lang: "en" },
    ]);
    expect(said.machineTranslated).toBe(false);
  });

  it("introduces every writer the same plain way, and says so when it does not know the name", () => {
    expect(narrate(member, "en", en).intro).toBe("Kenji wrote:");
    expect(narrate({ ...member, writer: "Aiko" }, "en", en).intro).toBe("Aiko wrote:");
    expect(narrate({ ...member, writer: "  " }, "en", en).intro).toBe("Someone wrote:");
    expect(narrate(member, "ja", ja).intro).toBe("Kenji が書きました。");
  });

  it("says nothing about who runs the place: that is not on the place page, so it is not said here", () => {
    for (const messages of [en, ja]) {
      expect(Object.keys(messages).filter((key) => /owner/i.test(key))).toEqual([]);
    }
    expect(JSON.stringify(narrate(member, "en", en))).not.toMatch(/runs it|owner/i);
    // Even a snippet carrying a stray field from an older client cannot change the introduction.
    const stray = { ...member, writerRunsPlace: true } as unknown as Snippet;
    expect(narrate(stray, "en", en).intro).toBe("Kenji wrote:");
  });

  it("introduces in the reader's language and reads the words in the writer's", () => {
    const said = narrate({ ...member, lang: "ja", text: "ちゃんぽんは昔のままです。" }, "en", en);
    expect(said.parts).toEqual([
      { text: "Kenji wrote:", lang: "en" },
      { text: "ちゃんぽんは昔のままです。", lang: "ja" },
    ]);
    const inJapanese = narrate(member, "ja", ja);
    expect(inJapanese.intro).toBe("Kenji が書きました。");
    expect(inJapanese.parts[1]).toEqual({ text: "The champon is just as it was.", lang: "en" });
  });

  it("introduces Noren's AI stitching as AI, in the reader's language", () => {
    const stitched: Snippet = {
      kind: "stitched",
      postsRead: 3,
      platforms: ["x"],
      sentences: [
        {
          en: "One reviewer says the champon is unchanged.",
          ja: "ちゃんぽんは昔のままだそうです。",
        },
        { en: "It is small.", ja: "小さな店です。" },
      ],
    };
    const english = narrate(stitched, "en", en);
    expect(english.intro).toBe("Noren's AI stitched this from public posts:");
    expect(english.body).toBe("One reviewer says the champon is unchanged. It is small.");
    expect(english.parts.map((part) => part.lang)).toEqual(["en", "en"]);
    const japanese = narrate(stitched, "ja", ja);
    expect(japanese.intro).toContain("AI");
    expect(japanese.body).toBe("ちゃんぽんは昔のままだそうです。 小さな店です。");
    expect(japanese.parts.map((part) => part.lang)).toEqual(["ja", "ja"]);
  });

  it("introduces a machine translation as one, and says whose post it is", () => {
    const post: Snippet = {
      kind: "post",
      platform: "x",
      author: "@synthetic",
      lang: "ja",
      text: "ここのちゃんぽんは昔のまま。",
      more: false,
      translations: [{ lang: "en", text: "The champon is just as it was." }],
    };
    const translated = narrate(post, "en", en);
    expect(translated.machineTranslated).toBe(true);
    expect(translated.intro).toBe("A machine translation of a public post by @synthetic:");
    expect(translated.body).toBe("The champon is just as it was.");
    expect(translated.parts.map((part) => part.lang)).toEqual(["en", "en"]);
    // For a Japanese reader the post is already in their language: no translation is used.
    const original = narrate(post, "ja", ja);
    expect(original.machineTranslated).toBe(false);
    expect(original.body).toBe("ここのちゃんぽんは昔のまま。");
    // No translation to use: the original, in its own language, introduced as a public post.
    const untranslated = narrate({ ...post, translations: [] }, "en", en);
    expect(untranslated.machineTranslated).toBe(false);
    expect(untranslated.intro).toBe("A public post by @synthetic:");
    expect(untranslated.parts[1]).toEqual({ text: "ここのちゃんぽんは昔のまま。", lang: "ja" });
  });

  it("reads nothing when it cannot tell what language the words are in", () => {
    const unknown: Snippet = {
      kind: "post",
      lang: undefined,
      text: "???",
      more: false,
      translations: [],
    } as Snippet;
    expect(narrate(unknown, "en", en).parts).toEqual([]);
  });
});
