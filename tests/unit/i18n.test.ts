import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineMessages,
  format,
  isSupportedLocale,
  localeFromPathname,
  localePath,
  messagesFor,
  negotiateLocale,
  SUPPORTED_LOCALES,
  swapLocale,
} from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/client";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { getActiveRegion, loadRegions } from "@/lib/region";

const mocks = vi.hoisted(() => ({
  lang: vi.fn(),
  useParams: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/root-params", () => ({ lang: mocks.lang }));
vi.mock("next/navigation", () => ({ useParams: mocks.useParams, notFound: mocks.notFound }));
vi.mock("@/lib/region", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/region")>();
  return { ...original, getActiveRegion: vi.fn(original.getActiveRegion) };
});

const messages = defineMessages({ ja: { hello: "こんにちは" }, en: { hello: "Hello" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveRegion).mockReset();
  vi.mocked(getActiveRegion).mockReturnValue([...loadRegions().values()][0]!);
  mocks.lang.mockResolvedValue("ja");
  mocks.useParams.mockReturnValue({ lang: "ja" });
});

it("every locale of every region file is a supported locale", () => {
  const regions = loadRegions();
  expect(regions.size).toBeGreaterThan(0);
  for (const region of regions.values()) {
    for (const locale of region.locales) expect(isSupportedLocale(locale)).toBe(true);
  }
});

it("isSupportedLocale accepts ja and en and rejects fr, JA, empty string, undefined and numbers", () => {
  for (const value of ["ja", "en"]) expect(isSupportedLocale(value)).toBe(true);
  for (const value of ["fr", "JA", "", undefined, 1]) expect(isSupportedLocale(value)).toBe(false);
});

it("defineMessages: a locale missing a key is a type error", () => {
  // @ts-expect-error English must also include goodbye.
  defineMessages({ ja: { hello: "こんにちは", goodbye: "さようなら" }, en: { hello: "Hello" } });
});

it("an extra key in one locale is a type error", () => {
  // @ts-expect-error An extra English key requires the same Japanese key.
  defineMessages({ ja: { hello: "こんにちは" }, en: { hello: "Hello", extra: "Extra" } });
});

it("defineMessages returns a frozen table", () => {
  const input = { ja: { hello: "こんにちは" }, en: { hello: "Hello" } };
  expect(defineMessages(input)).toBe(input);
  expect(Object.isFrozen(input)).toBe(true);
  for (const locale of SUPPORTED_LOCALES) expect(Object.isFrozen(input[locale])).toBe(true);
  expect(() => {
    input.ja.hello = "changed";
  }).toThrow(TypeError);
});

it("messagesFor returns the table of the locale", () => {
  for (const locale of SUPPORTED_LOCALES)
    expect(messagesFor(messages, locale)).toBe(messages[locale]);
});

it("format fills repeated and numeric placeholders", () => {
  expect(format("{name}: {count}, {name}", { name: "Noren", count: 0 })).toBe("Noren: 0, Noren");
});

it("format leaves an unknown placeholder visible", () => {
  expect(format("{known} {unknown} {toString}", { known: "yes" })).toBe("yes {unknown} {toString}");
});

it("localePath", () => {
  expect(localePath("ja")).toBe("/ja");
  expect(localePath("en", "/places/x")).toBe("/en/places/x");
  expect(localePath("ja", "/")).toBe("/ja/");
  expect(localePath("ja", "/japan")).toBe("/ja/japan");
  expect(() => localePath("en", "places/x")).toThrow("Path must start with /");
});

it("localeFromPathname", () => {
  expect(localeFromPathname("/ja/places/x", SUPPORTED_LOCALES)).toBe("ja");
  expect(localeFromPathname("/en", SUPPORTED_LOCALES)).toBe("en");
  for (const path of ["/japan", "/", "/fr", "ja/places"]) {
    expect(localeFromPathname(path, SUPPORTED_LOCALES)).toBeNull();
  }
  expect(localeFromPathname("/ja", ["en"])).toBeNull();
});

it("swapLocale", () => {
  for (const path of ["/ja/places/x", "/places/x"]) {
    expect(swapLocale(path, "en", SUPPORTED_LOCALES)).toBe("/en/places/x");
  }
  expect(swapLocale("/ja", "en", SUPPORTED_LOCALES)).toBe("/en");
  expect(swapLocale("/japan", "en", SUPPORTED_LOCALES)).toBe("/en/japan");
  expect(swapLocale("/", "en", SUPPORTED_LOCALES)).toBe("/en");
  expect(swapLocale("/ja/places/x?view=list#story", "en", SUPPORTED_LOCALES)).toBe(
    "/en/places/x?view=list#story",
  );
});

describe("negotiateLocale", () => {
  it.each([
    ["en-US,en;q=0.9,ja;q=0.8", "en"],
    ["ja;q=0.5,en;q=0.9", "en"],
    ["en-GB", "en"],
    ["en;q=0", "ja"],
    ["*", "ja"],
    [null, "ja"],
    [";;garbage", "ja"],
    ["JA", "ja"],
    ["en;q=0.8,ja;q=0.8", "en"],
    ["ja;q=0.8,en;q=0.8", "ja"],
    ["fr,en;q=0.8", "en"],
    ["fr", "ja"],
    ["en;q=1.1", "ja"],
    ["en;q=-1", "ja"],
    ["en;q=abc", "ja"],
    ["en;q=0,ja;q=0.5", "ja"],
    ["*;q=0,en;q=0.5", "en"],
  ])("%s gives %s", (header, expected) => {
    expect(negotiateLocale(header, SUPPORTED_LOCALES, "ja")).toBe(expected);
  });
  it("prefers exact tags before primary tags and preserves available casing", () => {
    expect(negotiateLocale("EN-gb", ["en", "en-GB"], "ja")).toBe("en-GB");
    expect(negotiateLocale("en-GB", ["EN"], "ja")).toBe("EN");
  });
});

it("getLocale returns the root param when the region serves it", async () => {
  for (const locale of SUPPORTED_LOCALES) {
    mocks.lang.mockResolvedValue(locale);
    expect(await getLocale()).toBe(locale);
  }
});

it("getLocale calls notFound for fr", async () => {
  mocks.lang.mockResolvedValue("fr");
  await expect(getLocale()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.notFound).toHaveBeenCalledOnce();
});

it("getLocale calls notFound for a supported locale not served by the region", async () => {
  vi.mocked(getActiveRegion).mockReturnValue({ ...getActiveRegion(), locales: ["ja"] });
  mocks.lang.mockResolvedValue("en");
  await expect(getLocale()).rejects.toThrow("NEXT_NOT_FOUND");
});

it("getMessages picks the table of the current locale", async () => {
  mocks.lang.mockResolvedValue("en");
  expect(await getMessages(messages)).toBe(messages.en);
});

it.each(SUPPORTED_LOCALES)("useLocale returns the lang param (%s)", (locale) => {
  mocks.useParams.mockReturnValue({ lang: locale });
  expect(useLocale()).toBe(locale);
});

it("useLocale throws for an unsupported param", () => {
  for (const value of ["fr", undefined, ["ja"]]) {
    mocks.useParams.mockReturnValue({ lang: value });
    expect(() => useLocale()).toThrow(`Unsupported locale: ${String(value)}`);
  }
});
