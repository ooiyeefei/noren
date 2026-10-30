import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NorenHeader } from "@/components/place/noren-header";
import { PlaceActions } from "@/components/place/place-actions";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { place, region } from "../fixtures/public-ui";

const hooks = vi.hoisted(() => ({ active: false, index: 0, values: [] as unknown[] }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState(initial: unknown) {
      if (!hooks.active) return react.useState(initial);
      const i = hooks.index++;
      if (!(i in hooks.values)) hooks.values[i] = initial;
      return [
        hooks.values[i],
        (value: unknown) => {
          hooks.values[i] = value;
        },
      ];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return react.useRef(initial);
      const i = hooks.index++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
    useEffect(effect: () => void, deps: readonly unknown[]) {
      if (!hooks.active) return react.useEffect(effect, deps);
    },
  };
});

afterEach(() => {
  hooks.active = false;
  hooks.values = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

for (const locale of ["en", "ja"] as const) {
  const header = (patch: Partial<Parameters<typeof NorenHeader>[0]> = {}) =>
    render(
      <NorenHeader
        locale={locale}
        place={place}
        region={region}
        category="Cafe"
        hasStory
        {...patch}
      />,
    );
  it(`uses vertical Japanese and exactly one heading in the page language (${locale})`, () => {
    const html = header();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/lang="ja"[^>]*\[writing-mode:vertical-rl\][^>]*>デモ喫茶/);
    expect(html).toMatch(locale === "ja" ? /<h1 lang="ja"/ : /<h1 lang="en"/);
    expect(html).toMatch(locale === "ja" ? /<p lang="en"/ : /<p lang="ja"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toContain("420ms ease-out");
    expect(html).toContain("h-[240px]");
    expect(html).toContain("sm:h-[280px]");
    expect(html).not.toContain("min-h-[");
    const slits = html.match(/<span class="absolute bottom-0[^\"]*"/g)!;
    expect(slits).toHaveLength(2);
    expect(slits[0]).toContain("left-1/3");
    expect(slits[1]).toContain("left-2/3");
    for (const slit of slits) {
      expect(slit).toContain("h-[var(--slit-height)]");
      expect(slit).toContain("w-[6px]");
      expect(slit).toContain("bg-background");
      expect(slit).not.toContain("sm:");
    }
    // Both breakpoints reserve the same slit height plus a 12px lettering gap.
    expect(html).toContain("[--slit-height:72px]");
    expect(html).toContain("sm:[--slit-height:84px]");
    expect(72 / 240).toBe(0.3);
    expect(84 / 280).toBe(0.3);
    expect(html).toContain("pt-5 pb-[calc(var(--slit-height)+12px)]");
    expect(html).toContain(placePageMessages[locale].regionName);
    expect(html).not.toContain("·");
  });
  it(`clamps the horizontal fallback while preserving its full accessible name (${locale})`, () => {
    const html = header({
      place: {
        ...place,
        names: [{ lang: "en", script: "latin", value: "Demo ".repeat(80), isPrimary: true }],
      },
    });
    expect(html).not.toContain("writing-mode:vertical-rl");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("text-[32px]");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("text-center");
    expect(html).toContain(`aria-label="${"Demo ".repeat(80)}"`);
    expect(html).toContain("Demo ".repeat(80));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const longJapanese = "架空のお店".repeat(60);
    expect(
      header({
        place: {
          ...place,
          names: [{ lang: "ja", script: "kanji", value: longJapanese, isPrimary: true }],
        },
      }),
    ).toContain(longJapanese);
  });
  it(`wraps 12-, 20- and 30-code-point names within the fixed phone cloth (${locale})`, () => {
    for (const [name, phoneFont, desktopFont, vertical] of [
      ["デモ喫茶 のれん（架空）", 32, 40, true],
      ["店".repeat(20), 26, 34, true],
      ["店".repeat(30), 32, null, false],
    ] as const) {
      const html = header({
        place: { ...place, names: [{ lang: "ja", script: "kanji", value: name, isPrimary: true }] },
      });
      const classes = html.match(/<h1[^>]*class="([^\"]*)"/)![1]!;
      expect(classes.includes("[writing-mode:vertical-rl]")).toBe(vertical);
      expect(classes).toContain(`text-[${phoneFont}px]`);
      expect(classes).toContain("max-w-full");
      expect(classes).toContain("[overflow-wrap:anywhere]");
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(name);
      if (vertical) {
        expect(classes).toContain("h-full");
        expect(classes).toContain(`sm:text-[${desktopFont}px]`);
        // At 360px, page gutters and cloth padding leave 280px for columns.
        const charactersPerColumn = Math.floor((240 - 20 - 72 - 12) / phoneFont);
        const columnWidth = phoneFont * 1.2;
        expect(
          Math.ceil(Array.from(name).length / charactersPerColumn) * columnWidth,
        ).toBeLessThanOrEqual(280);
      } else {
        expect(classes).toContain("line-clamp-3");
        expect(classes).toContain("min-w-0");
      }
    }
  });
  it(`uses code points at the 14/15 and 28/29 tier boundaries (${locale})`, () => {
    for (const [length, size, vertical] of [
      [14, 32, true],
      [15, 26, true],
      [28, 26, true],
      [29, 32, false],
    ] as const) {
      const name = "𠮷".repeat(length);
      const html = header({
        place: { ...place, names: [{ lang: "ja", script: "kanji", value: name, isPrimary: true }] },
      });
      expect(html).toContain(`text-[${size}px]`);
      expect(html.includes("[writing-mode:vertical-rl]")).toBe(vertical);
      expect(html).toContain(`aria-label="${name}"`);
    }
  });
  it(`shows Story only with a page and Demo only for mock places (${locale})`, () => {
    for (const hasStory of [true, false])
      for (const isMock of [true, false]) {
        const html = header({ hasStory, place: { ...place, isMock } });
        expect(html.includes('data-badge="story"')).toBe(hasStory);
        expect(html.includes('data-badge="demo"')).toBe(isMock);
        expect(html).not.toMatch(
          /\b(?:ratings?|scores?|stars?|sentiment)\b|評価|点数|星評価|感情分析/i,
        );
      }
  });
  it(`builds directions from the pin only, with six decimals (${locale})`, () => {
    const html = render(
      <PlaceActions locale={locale} title="Demo" pin={{ lat: 32.7501239, lng: 129.88 }} />,
    );
    expect(html).toContain(
      'href="https://www.google.com/maps/dir/?api=1&amp;destination=32.750124,129.880000"',
    );
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("h-11");
    expect(render(<PlaceActions locale={locale} title="Demo" pin={null} />)).not.toContain(
      "google.com/maps",
    );
  });
}

function wireActions(locale: "en" | "ja" = "en") {
  hooks.active = true;
  hooks.index = 0;
  try {
    return PlaceActions({ locale, title: "Demo Cafe", pin: null });
  } finally {
    hooks.active = false;
  }
}
function clickShare(node: ReactNode): Promise<void> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findButton(child);
      if (result) return result();
    }
  }
  const button = findButton(node);
  if (!button) throw new Error("Share button missing");
  return button();
}
function findButton(node: ReactNode): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; onClick?: () => Promise<void> }>(node)) return;
  if (node.type === "button") return node.props.onClick;
  return findButton(node.props.children);
}
const url = "https://example.test/en/places/demo-cafe";
for (const locale of ["en", "ja"] as const) {
  it(`copies the page URL and clears the polite status after 3 seconds (${locale})`, async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", { location: { href: url } });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await clickShare(wireActions(locale));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(render(wireActions(locale))).toContain(placePageMessages[locale].copied);
    expect(render(wireActions(locale))).toContain('role="status" aria-live="polite"');
    vi.advanceTimersByTime(2999);
    expect(render(wireActions(locale))).toContain(placePageMessages[locale].copied);
    vi.advanceTimersByTime(1);
    expect(render(wireActions(locale))).not.toContain(placePageMessages[locale].copied);
  });
  it(`keeps a selectable URL visible if copying fails (${locale})`, async () => {
    vi.stubGlobal("window", { location: { href: url } });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    await clickShare(wireActions(locale));
    const html = render(wireActions(locale));
    expect(html).toContain(placePageMessages[locale].copyFailed);
    expect(html).toContain(`class="select-all break-all">${url}`);
  });
}
it("uses native sharing when available and treats cancellation quietly", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn();
  vi.stubGlobal("window", { location: { href: url } });
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  await clickShare(wireActions());
  expect(share).toHaveBeenCalledWith({ title: "Demo Cafe", url });
  expect(writeText).not.toHaveBeenCalled();
  share.mockRejectedValue(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
  await clickShare(wireActions());
  expect(render(wireActions())).not.toContain(placePageMessages.en.copyFailed);
});
it("both locales have every place-page message", () => {
  expect(Object.keys(placePageMessages.en).sort()).toEqual(
    Object.keys(placePageMessages.ja).sort(),
  );
  for (const messages of Object.values(placePageMessages))
    for (const text of Object.values(messages)) expect(text.trim()).not.toBe("");
});

it("shows the English name below the cloth when a Japanese reading also exists", () => {
  const html = render(
    <NorenHeader
      locale="ja"
      region={region}
      place={{
        ...place,
        names: [
          place.names[0]!,
          { lang: "ja", script: "kana", value: "でもきっさ", isPrimary: false },
          place.names[1]!,
        ],
      }}
      hasStory={false}
    />,
  );
  expect(html).toMatch(/<p lang="en"[^>]*>Demo Cafe<\/p>/);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
});
