import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProposalPage, { generateMetadata } from "@/app/[lang]/for-local-teams/page";
import { MOCK_LABEL, PRIZE_RULES_URL, ProposalView } from "@/components/proposal/proposal-view";
import { proposalMessages } from "@/lib/i18n/messages/proposal";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";

const state = vi.hoisted(() => ({ locale: "en" as string }));
vi.mock("next/root-params", () => ({ lang: async () => state.locale }));

const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const region = regionSchema.parse(regionJson);

/** The six to seven places of the Shinchi set, read from the spec's table so the two can't drift apart. */
function shinchiPlaces(): string[] {
  const spec = readFileSync(
    path.join(process.cwd(), "specs/002-noren-collection/data-model.md"),
    "utf8",
  );
  const table = spec.split("## First set: Shinchi")[1]?.split("\n## ")[0] ?? "";
  return [...table.matchAll(/^\| \d+ \| ([^|]+?) \|/gm)].flatMap((row) =>
    row[1]!.split(" or ").map((name) => name.trim()),
  );
}

/** Every real name the proposal must leave out: the region, its neighbourhoods and the Shinchi set. */
function realNames(): string[] {
  const names = [
    ...Object.values(region.name),
    ...(region.neighbourhoods ?? []).flatMap((place) => Object.values(place.names)),
    ...shinchiPlaces(),
    // The parts of those names a sample could still borrow.
    "新地",
    "わたべ",
    "ワンワン",
    "福壽",
    "べっぴん",
    "三栄",
    "泰安",
    "京華",
    "Nagasaki",
    "長崎",
  ];
  return [...new Set(names)];
}

for (const locale of ["ja", "en"] as const) {
  const m = proposalMessages[locale];
  const html = text(render(<ProposalView locale={locale} />));

  describe(`the proposal for local teams (${locale})`, () => {
    it("has one heading, says it is a proposal and that nobody has agreed, and shows every line", () => {
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(`>${m.heroTitle}</h1>`);
      expect(html).toContain(`<main id="main" tabindex="-1" lang="${locale}"`);
      expect(html).toContain(m.statement);
      expect(m.statement).toMatch(locale === "ja" ? /同意していません/ : /No shop.*has agreed/);
      // The gift button's second and third wording only show after presses.
      const LATER = ["metaTitle", "giftMark", "giftGiven"];
      for (const key of Object.keys(m) as (keyof typeof m)[])
        if (!LATER.includes(key)) expect(html, key).toContain(m[key]);
    });

    it("carries the 見本 Mock label on the page and on every screen", () => {
      const screens = html
        .split("<article")
        .slice(1)
        .map((part) => part.split("</article>")[0]!);
      expect(screens).toHaveLength(4);
      for (const screen of screens) {
        expect(screen).toContain(`>${MOCK_LABEL.mark}</b>`);
        expect(screen).toContain(`>${MOCK_LABEL.word}</span>`);
      }
      // The page's own label sits beside the statement, outside any screen.
      const beforeScreens = html.split("<article")[0]!;
      expect(beforeScreens).toContain(`>${MOCK_LABEL.mark}</b>`);
      expect(beforeScreens).toContain(`>${MOCK_LABEL.word}</span>`);
      expect(html.match(new RegExp(`>${MOCK_LABEL.mark}</b>`, "g"))).toHaveLength(5);
    });

    it("says what is a mock: the pilot and later steps are tagged, and shops see totals only", () => {
      expect(html.match(new RegExp(m.pilotTag.replace(/[.()]/g, "\\$&"), "g"))).toHaveLength(2);
      expect(html).toContain(m.nowTag);
      expect(m.shopCaption).toMatch(
        locale === "ja" ? /誰が来たかは見えません/ : /never see who visited/,
      );
      expect(m.qrCaption).toMatch(locale === "ja" ? /読み取れません/ : /won't scan/);
    });

    it("uses sample names and no name from the region file or the Shinchi set", () => {
      const names = realNames();
      // The table reading must have found the set, or this check would pass on nothing.
      expect(shinchiPlaces().length).toBeGreaterThanOrEqual(6);
      expect(names.length).toBeGreaterThan(25);
      const everything = `${html}\n${JSON.stringify(proposalMessages)}`;
      for (const name of names) expect(everything, name).not.toContain(name);
      expect(html).toContain(m.shopA);
      expect(html).toContain(m.shrine);
      expect(html).toContain(m.teamName);
    });

    it("draws the picture and the code from shapes, with the code described as not working", () => {
      expect(html).toContain('id="proposal-art"');
      expect(html).toContain(`aria-label="${m.qrLabel}"`);
      expect(html).toContain(`aria-label="${m.giftNorenLabel}"`);
      expect(html).not.toMatch(/<img\b|<iframe|<script|<video/);
      // The only link out is the agency's page, in a new tab.
      const links = [...html.matchAll(/<a\b[^>]*href="(https?:[^"]+)"[^>]*>/g)];
      expect(links.map((link) => link[1])).toEqual([PRIZE_RULES_URL]);
      expect(links[0]![0]).toContain('target="_blank"');
      expect(links[0]![0]).toContain('rel="noopener noreferrer"');
    });

    it("gives every control a name", () => {
      const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map((input) => input[0]);
      expect(inputs).toHaveLength(3);
      expect(html.match(/<textarea\b/g)).toHaveLength(1);
      expect(html).toContain(`for="mock-set-name"`);
      expect(html.match(/<label\b/g)).toHaveLength(4);
      expect(html.match(/<fieldset\b/g)).toHaveLength(2);
      expect(html.match(/<legend\b/g)).toHaveLength(2);
      expect(html.match(/aria-pressed="/g)).toHaveLength(3);
    });
  });
}

describe("the proposal page", () => {
  it("renders in each language and reads no data", async () => {
    for (const locale of ["ja", "en"] as const) {
      state.locale = locale;
      expect(text(render(await ProposalPage()))).toContain(proposalMessages[locale].statement);
    }
  });

  it("is titled in each language and leaves noindex to the layout, which says it for every page", async () => {
    for (const locale of ["ja", "en"] as const) {
      const metadata = await generateMetadata({
        params: Promise.resolve({ lang: locale }),
      } as Parameters<typeof generateMetadata>[0]);
      expect(metadata.title).toBe(`${proposalMessages[locale].metaTitle} | Noren`);
      expect(metadata.robots).toBeUndefined();
    }
    const layout = readFileSync(path.join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    expect(layout).toContain("robots: { index: false, follow: false }");
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('"noindex, nofollow"');
  });

  it("imports nothing from Convex or Clerk", () => {
    for (const file of [
      "src/app/[lang]/for-local-teams/page.tsx",
      "src/components/proposal/proposal-view.tsx",
      "src/components/proposal/mock-controls.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/from "(?:convex|@clerk)|useQuery|useMutation|fetch\(/);
    }
  });

  it("is linked from nowhere else in the app", () => {
    const own = [
      path.join("src", "app", "[lang]", "for-local-teams"),
      path.join("src", "components", "proposal"),
      path.join("src", "lib", "i18n", "messages", "proposal.ts"),
    ];
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(file) : [file];
      });
    const mentions = walk("src").filter(
      (file) =>
        !own.some((prefix) => file.startsWith(prefix)) &&
        readFileSync(file, "utf8").includes("for-local-teams"),
    );
    expect(mentions).toEqual([]);
  });
});
