import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup as render } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MalayPrivacyPage from "@/app/[lang]/privacy/ms/page";
import PrivacyPage from "@/app/[lang]/privacy/page";
import TermsPage from "@/app/[lang]/terms/page";
import { DocumentLinksProvider } from "@/components/layout/document-links";
import { SiteFooter } from "@/components/layout/site-footer";
import { documentsPublished, documentValues } from "@/components/legal/documents";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { cspDirectives } from "@/lib/security/csp";
import type { AiModelConfig, CompatibleTranscriptionConfig } from "@/lib/ai/config";
import {
  legalDocuments,
  lineText,
  malayPrivacy,
  type LegalDocument,
  type LegalLine,
  type LegalSection,
} from "@/lib/i18n/messages/legal-documents";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import type { RegionConfig } from "@/lib/region/schema";
import { config } from "../fixtures/public-ui";

const state = vi.hoisted(() => ({
  region: undefined as unknown,
  locale: "en" as string,
  /** The ids of the regions that are on, as the registry's enabledRegionConfigs would give them. */
  enabled: [] as string[],
}));
vi.mock("@/lib/region/registry", async (original) => {
  const actual = await original<typeof import("@/lib/region/registry")>();
  return {
    ...actual,
    activeRegionConfig: () => state.region,
    enabledRegionConfigs: () => state.enabled.map((id) => ({ id })),
  };
});
vi.mock("next/root-params", () => ({ lang: async () => state.locale }));
vi.mock("next/navigation", () => ({
  usePathname: () => null,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const FICTIONAL = {
  operatorName: "Hana Tanaka's map club",
  contact: "https://map-club.mock.example/removal",
  version: "2030-01-31",
};

/** The shipped region with its documents switched on, under fictional facts. */
function published(over: (region: RegionConfig) => void = () => {}): RegionConfig {
  const region = structuredClone(config);
  region.legal.documentsVersion = FICTIONAL.version;
  region.legal.operatorName = FICTIONAL.operatorName;
  region.takedown.contact = FICTIONAL.contact;
  over(region);
  return region;
}

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** Every word of a section, switched lines included, so the house-style checks read them all. */
function sectionText(section: LegalSection): string {
  return [
    section.heading,
    ...(section.paragraphs ?? []).map(lineText),
    ...(section.items ?? []).map(lineText),
    ...(section.services ?? []).flatMap((s) => [
      s.name,
      s.country,
      s.does,
      ...(s.more ?? []).map(lineText),
    ]),
    ...(section.closing ?? []).map(lineText),
  ].join("\n");
}
const documentText = (document: LegalDocument) =>
  [document.title, document.lead, ...document.sections.map(sectionText)].join("\n");
const section = (locale: Locale, kind: "terms" | "privacy", id: string) => {
  const found = legalDocuments[locale][kind].sections.find((s) => s.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
};
const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

beforeEach(() => {
  state.region = config;
  state.locale = "en";
  state.enabled = [];
});

describe("the documents' text (T057)", () => {
  it.each(["terms", "privacy"] as const)("%s has the same shape in both languages", (kind) => {
    const shape = (locale: Locale) =>
      legalDocuments[locale][kind].sections.map((s) => ({
        id: s.id,
        placeholders: [...new Set(placeholders(sectionText(s)))].sort(),
        paragraphs: s.paragraphs?.length,
        items: s.items?.length,
        services: s.services?.map((service) => service.name),
        closing: s.closing?.length,
      }));
    expect(shape("ja")).toEqual(shape("en"));
  });

  it("keeps the region's facts out of the text, so they are never repeated by hand", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/i18n/messages/legal-documents.ts"),
      "utf8",
    );
    expect(config.legal.operatorName).toBeTruthy();
    expect(source).not.toContain(config.legal.operatorName!);
    expect(source).not.toContain("Yee Fei");
    expect(source).not.toContain(config.takedown.contact!);
    for (const locale of SUPPORTED_LOCALES)
      for (const kind of ["terms", "privacy"] as const)
        expect(documentText(legalDocuments[locale][kind])).not.toMatch(/\b16\b/);
  });

  it("follows the house style: no long dashes, no 'x, not y', no address that could be a person's", () => {
    for (const locale of SUPPORTED_LOCALES)
      for (const kind of ["terms", "privacy"] as const) {
        const words = documentText(legalDocuments[locale][kind]);
        expect(words).not.toMatch(/[—–]/);
        expect(words).not.toMatch(/, not /);
        expect(words).not.toMatch(/\S+@\S+/);
      }
  });

  it("uses one contact placeholder at most in each paragraph, which is what the page can link", () => {
    for (const locale of SUPPORTED_LOCALES)
      for (const kind of ["terms", "privacy"] as const)
        for (const s of legalDocuments[locale][kind].sections)
          for (const line of [...(s.paragraphs ?? []), ...(s.items ?? []), ...(s.closing ?? [])])
            expect(placeholders(lineText(line)).filter((p) => p === "contact").length).toBeLessThan(
              2,
            );
  });

  it("labels AI text the way the site does", () => {
    expect(section("en", "terms", "accuracy").paragraphs?.[0]).toContain("Stitched by Noren's AI");
    expect(section("ja", "terms", "accuracy").paragraphs?.[0]).toContain(
      "Noren の AI が仕立てました",
    );
  });

  describe("the services it names", () => {
    const repo = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    const dependencies = JSON.parse(repo("package.json")).dependencies as Record<string, string>;
    const vercel = JSON.parse(repo("vercel.json")) as { regions: string[] };
    const csp = cspDirectives({
      mode: "production",
      clerkFrontendApi: "https://clerk.mock.example",
      convexUrl: "https://mock-1.convex.cloud",
      mapStyleUrl: config.geo.mapStyle.url,
      adapterIds: config.enabledSourceAdapters,
    });
    // A new provider in the AI settings is a type error here until the notice has an answer for it.
    const aiServices = {
      anthropic: "Anthropic",
      gateway: "Vercel",
      meta: "Meta Platforms",
      modal: "Modal",
      "openai-compatible": "OpenAI",
    } satisfies Record<
      AiModelConfig["provider"] | CompatibleTranscriptionConfig["provider"],
      string
    >;

    const usedByTheCode: [string, boolean][] = [
      ["Clerk", "@clerk/nextjs" in dependencies],
      ["Convex", "convex" in dependencies],
      ["Vercel", vercel.regions.includes("hnd1")],
      ["Cloudflare", csp["script-src"].includes("https://challenges.cloudflare.com")],
      ["OpenStreetMap Foundation", config.geo.search.includes("nominatim")],
      ["OpenFreeMap", config.geo.mapStyle.adapter === "openfreemap"],
      ...Object.values(aiServices).map((name): [string, boolean] => [name, true]),
    ];

    it.each(usedByTheCode)("names %s with its country, in both languages", (name, used) => {
      expect(used).toBe(true);
      for (const locale of SUPPORTED_LOCALES) {
        const service = section(locale, "privacy", "services").services?.find(
          (s) => s.name === name,
        );
        expect(service, `${name} in ${locale}`).toBeDefined();
        expect(service!.country.length).toBeGreaterThan(0);
        expect(service!.does.length).toBeGreaterThan(0);
      }
    });

    it("gives the countries the code and its records show", () => {
      const country = (locale: Locale, name: string) =>
        section(locale, "privacy", "services").services?.find((s) => s.name === name)?.country;
      expect(country("en", "Convex")).toContain("Australia (Sydney)");
      expect(country("ja", "Convex")).toContain("オーストラリア（シドニー）");
      expect(country("en", "Vercel")).toContain("Tokyo, Japan");
      expect(country("ja", "Vercel")).toContain("東京");
      expect(country("en", "Clerk")).toBe("United States");
      expect(country("ja", "Clerk")).toBe("米国");
    });

    it("names only services it can tie to the code", () => {
      const named = section("en", "privacy", "services").services?.map((s) => s.name) ?? [];
      const traced = new Set(usedByTheCode.map(([name]) => name));
      expect(named.filter((name) => !traced.has(name))).toEqual([]);
    });
  });

  it("states every row of the deletion table in data-model.md", () => {
    const model = readFileSync(
      path.join(process.cwd(), "specs/002-noren-collection/data-model.md"),
      "utf8",
    );
    const table = model.slice(model.indexOf("## Account deletion"), model.indexOf("## First set"));
    const rows = [...table.matchAll(/^\| (?!Record|---)(.+?) \|/gm)].map((m) => m[1]!);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    const said: Record<string, string> = {
      "`personCollection`": "your check-ins, panels, badges and stamps",
      "`person`": "“Former member”",
      "`story` by them": "the stories you wrote",
      "`source` added by them": "the links you shared come off every page",
      "`placeCheck` by them": "“Still here” presses",
      "`note` by them": "visitor notes",
      "`place`, `pin`, `placeName` they made": "places you added",
      "`auditLog`": "no longer identifies you",
      "`rateLimit`": "hold only an account ID",
      "`mentionCandidate.hiddenBy`": "no longer identifies you",
      "Clerk user": "your sign-in at Clerk",
    };
    const deletion = sectionText(section("en", "privacy", "deletion"));
    for (const row of rows) {
      // Deletion never reaches these: it refuses first, or only a steward's action fills them.
      if (/^`interview`|^Fields only/.test(row)) continue;
      if (/photo/i.test(row)) {
        expect(sectionText(section("en", "privacy", "photos"))).toContain("deletes your photos");
        continue;
      }
      expect(said[row], `the deletion table's row ${row}`).toBeDefined();
      expect(deletion).toContain(said[row]!);
    }
  });

  it("says places stay without the person's name, in both languages and in both documents", () => {
    expect(sectionText(section("en", "privacy", "deletion"))).toContain(
      "places you added, with their pins and names, stay as facts about a place, and your name does not show",
    );
    expect(sectionText(section("ja", "privacy", "deletion"))).toContain(
      "追加した場所とそのピン、名前は、場所についての事実として残り、あなたの名前は出ません",
    );
    expect(sectionText(section("en", "terms", "rights"))).toContain("without your name");
    expect(sectionText(section("ja", "terms", "rights"))).toContain("あなたの名前を外して");
  });

  it("gives photos their own short section with everything the owner asked it to say", () => {
    const en = sectionText(section("en", "privacy", "photos"));
    for (const fact of [
      "public, with your name",
      "Amazon Web Services in Tokyo, Japan",
      "Amazon CloudFront",
      "removes location data",
      "Deleting your account deletes your photos",
    ])
      expect(en).toContain(fact);
    const ja = sectionText(section("ja", "privacy", "photos"));
    for (const fact of [
      "あなたの名前とともに公開",
      "日本の東京にある Amazon Web Services",
      "Amazon CloudFront",
      "位置情報を取り除きます",
      "写真も削除します",
    ])
      expect(ja).toContain(fact);
    expect(section("en", "privacy", "photos").paragraphs).toHaveLength(1);
    // Only that section speaks of Amazon, so hiding it leaves nothing behind.
    for (const s of legalDocuments.en.privacy.sections)
      if (s.id !== "photos") expect(sectionText(s)).not.toContain("Amazon");
  });
});

describe("the pages (T058)", () => {
  const pages = [
    ["terms", TermsPage],
    ["privacy", PrivacyPage],
  ] as const;

  describe.each(pages)("/%s", (kind, Page) => {
    describe.each(SUPPORTED_LOCALES)("in %s", (locale) => {
      beforeEach(() => {
        state.locale = locale;
      });

      it("answers 404 while documentsVersion is null", async () => {
        state.region = published((r) => (r.legal.documentsVersion = null));
        await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
      });

      it("answers 404 with a version but no operator or contact", async () => {
        state.region = published((r) => (r.legal.operatorName = null));
        await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
        state.region = published((r) => (r.takedown.contact = null));
        await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
      });

      it("shows the document with its version date once published, filling every placeholder", async () => {
        state.region = published();
        const html = render(await Page());
        const shown = text(html);
        expect(html).toContain(`>${legalDocuments[locale][kind].title}</h1>`);
        expect(shown).toContain(FICTIONAL.version);
        expect(shown).toContain(FICTIONAL.operatorName);
        expect(html).toContain(`href="${FICTIONAL.contact}"`);
        expect(shown).not.toMatch(/\{\w+\}/);
        expect(html).toContain(`lang="${locale}"`);
        expect(html.match(/<h1\b/g)).toHaveLength(1);
      });

      it("takes the minimum age and the takedown times from the region", async () => {
        state.region = published((r) => {
          r.minimumAge = 19;
          r.takedown.acknowledgeHours = 77;
          r.takedown.decideDays = 88;
        });
        const shown = text(render(await Page()));
        expect(shown).not.toMatch(/\b16\b/);
        if (kind === "terms") {
          expect(shown).toContain("19");
          expect(shown).toContain("77");
          expect(shown).toContain("88");
        } else {
          expect(shown).toContain("19");
        }
      });
    });
  });

  it("names the platforms whose posts load inside a page, from the region", async () => {
    state.region = published();
    const shown = text(render(await PrivacyPage()));
    expect(shown).toContain(
      "load only when you press a post's load button: Instagram, Facebook, Threads, YouTube, X, TikTok.",
    );
    expect(shown).not.toContain("Google Maps");
  });

  it("names every service with its country on the page", async () => {
    state.region = published();
    const shown = text(render(await PrivacyPage()));
    for (const service of section("en", "privacy", "services").services ?? [])
      expect(shown).toContain(`${service.name} (${service.country})`);
  });

  it("shows a contact that is not a web address as plain text", () => {
    const values = documentValues(
      published((r) => (r.takedown.contact = "the Noren desk")),
      "en",
    )!;
    const html = render(<LegalDocumentView locale="en" kind="privacy" values={values} />);
    expect(text(html)).toContain("the Noren desk");
    expect(html).not.toContain('href="the Noren desk"');
  });

  it("names the photo storage in the privacy notice only while photos are on (FR-126)", () => {
    const notice = (enabled: boolean) => {
      const values = documentValues(
        published((r) => (r.photos.enabled = enabled)),
        "en",
      )!;
      return text(render(<LegalDocumentView locale="en" kind="privacy" values={values} />));
    };
    expect(notice(false)).not.toContain("Amazon");
    expect(notice(true)).toContain("Amazon Web Services in Tokyo, Japan");
  });

  describe("the switched features (FR-126)", () => {
    type Features = { connector?: boolean; planner?: boolean; walk?: boolean };
    const page = (locale: Locale, kind: "terms" | "privacy", features: Features = {}) => {
      const region = published((r) => {
        r.features = {
          connector: false,
          planner: false,
          walk: false,
          thread: false,
          postcard: false,
          trip: "off",
          facts: false,
          ...features,
        };
      });
      const html = render(
        <LegalDocumentView locale={locale} kind={kind} values={documentValues(region, locale)!} />,
      );
      return { html, words: text(html) };
    };
    const ids = (html: string) => [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1] ?? "");
    const NEW_PRIVACY = ["ai-reading", "planner", "walk", "connector"];

    it.each(SUPPORTED_LOCALES)(
      "says nothing about them while every switch is off (%s)",
      (locale) => {
        for (const kind of ["terms", "privacy"] as const) {
          const { html, words } = page(locale, kind);
          for (const id of NEW_PRIVACY) expect(ids(html)).not.toContain(id);
          for (const word of [
            "Plan my day",
            "Walk mode",
            "connector",
            "一日のプラン",
            "歩きモード",
            "コネクタ",
          ])
            expect(words).not.toContain(word);
        }
        // The line about AI keeps its words from before the features existed.
        expect(page("en", "privacy").words).toContain(
          "Noren does not send stories you type, your display name or your email address to an AI service.",
        );
      },
    );

    it.each([
      ["connector", { connector: true }, ["ai-reading", "connector"]],
      ["planner", { planner: true }, ["ai-reading", "planner"]],
      ["walk", { walk: true }, ["walk"]],
    ] as const)("adds the %s sections only while it is on", (_name, features, expected) => {
      for (const locale of SUPPORTED_LOCALES) {
        const privacy = ids(page(locale, "privacy", features).html);
        expect(privacy.filter((id) => NEW_PRIVACY.includes(id))).toEqual(expected);
        const terms = ids(page(locale, "terms", features).html);
        for (const id of ["planner", "walk", "connector"])
          expect(terms.includes(id)).toBe(id in features);
      }
    });

    it("lets AI read a story only on the writer's tick, and says so in place of the old line", () => {
      const { words } = page("en", "privacy", { planner: true });
      expect(words).not.toContain("Noren does not send stories you type, your display name");
      expect(words).toContain("only if you allow it for that story");
      expect(words).toContain("Plan my day may send the story's words");
      expect(words).not.toContain("through Noren's connector");
      expect(page("en", "privacy", { connector: true }).words).toContain(
        "through Noren's connector",
      );
    });

    it("tells the planner's AI provider rows apart only while the planner is on", () => {
      expect(page("en", "privacy").words).not.toContain("what the planner sends");
      const on = page("en", "privacy", { planner: true }).words;
      expect(on.match(/what the planner sends/g)).toHaveLength(2);
    });

    it("keeps location, rules and likes on the device, in both languages", () => {
      const en = page("en", "privacy", { planner: true, walk: true }).words;
      expect(en).toContain("Only that neighbourhood goes to Noren.");
      expect(en).toContain("Your location is not sent to Noren and is not kept.");
      expect(en).toContain("Noren does not keep them and does not send them to the AI.");
      expect(en).toContain("special care-required personal information");
      const ja = page("ja", "privacy", { planner: true, walk: true }).words;
      expect(ja).toContain("Noren に送るのはその地区だけです。");
      expect(ja).toContain("現在地は Noren に送らず、保存もしません。");
      expect(ja).toContain("保存はせず、AI にも送りません。");
      expect(ja).toContain("要配慮個人情報");
    });

    it.each(SUPPORTED_LOCALES)(
      "quotes the writer's tick and its buttons as the screen says them (%s)",
      (locale) => {
        const m = addStoryMessages[locale];
        const tick = (m.connectorTick.split(/[:：（]/)[0] ?? "").replace(/[.。]$/, "");
        const [open, close] = locale === "ja" ? ["「", "」"] : ["“", "”"];
        const words = page(locale, "privacy", { connector: true }).words;
        expect(words).toContain(`${open}${tick}${close}`);
        expect(words).toContain(`${open}${m.connectorAllow}${close}`);
        expect(words).toContain(`${open}${m.connectorStop}${close}`);
      },
    );
  });

  it("publishes only with a version, an operator and a contact", () => {
    expect(documentsPublished(published((r) => (r.legal.documentsVersion = null)))).toBe(false);
    expect(documentsPublished(published())).toBe(true);
    expect(documentsPublished(published((r) => (r.legal.operatorName = null)))).toBe(false);
    expect(documentsPublished(published((r) => (r.takedown.contact = null)))).toBe(false);
  });
});

describe("the footer links (T058)", () => {
  const hrefs = (html: string) => Array.from(html.matchAll(/href="([^"]+)"/g), (m) => m[1]);

  it.each(SUPPORTED_LOCALES)("has no document links until published (%s)", (locale) => {
    const html = render(<SiteFooter locale={locale} />);
    expect(hrefs(html)).not.toContain(`/${locale}/terms`);
    expect(hrefs(html)).not.toContain(`/${locale}/privacy`);
    const closed = render(
      <DocumentLinksProvider published={false}>
        <SiteFooter locale={locale} />
      </DocumentLinksProvider>,
    );
    expect(hrefs(closed)).not.toContain(`/${locale}/terms`);
  });

  it.each(SUPPORTED_LOCALES)("adds both links once published (%s)", (locale) => {
    for (const compact of [false, true]) {
      const html = render(
        <DocumentLinksProvider published>
          <SiteFooter locale={locale} compact={compact} />
        </DocumentLinksProvider>,
      );
      expect(hrefs(html)).toEqual([
        `/${locale}/about`,
        `/${locale}/notice`,
        `/${locale}/takedown`,
        `/${locale}/report`,
        `/${locale}/terms`,
        `/${locale}/privacy`,
      ]);
    }
  });
});

describe("the trip agent's parts of the notice and the terms (T037, T038)", () => {
  /** The shipped features, then what a test changes. */
  const features = (over: Partial<RegionConfig["features"]> = {}): RegionConfig["features"] => ({
    connector: false,
    planner: false,
    walk: false,
    thread: false,
    postcard: false,
    trip: "off",
    facts: false,
    ...over,
  });
  const view = (
    locale: Locale,
    kind: "terms" | "privacy",
    options: { on?: boolean; features?: RegionConfig["features"]; malaysia?: boolean } = {},
  ) => {
    const region = published((r) => {
      r.photos.enabled = options.on ?? false;
      r.features = options.features ?? features();
    });
    const values = documentValues(region, locale, options.malaysia ? ["malaysia-west"] : [])!;
    return render(<LegalDocumentView locale={locale} kind={kind} values={values} />);
  };
  const ids = (html: string) => [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1] ?? "");

  it("reads the three switches from the region files", () => {
    const values = (over: Partial<RegionConfig["features"]>, regions: string[] = []) =>
      documentValues(
        published((r) => (r.features = features(over))),
        "en",
        regions,
      )!;
    expect(values({})).toMatchObject({ malaysia: "off", facts: "off", trip: "off" });
    expect(values({}, ["malaysia-west"]).malaysia).toBe("on");
    expect(values({}, ["nagasaki"]).malaysia).toBe("off");
    expect(values({ facts: true }).facts).toBe("on");
    expect(values({ trip: "trial" }).trip).toBe("off");
    expect(values({ trip: "open" }).trip).toBe("on");
  });

  it("is on in the shipped region files: Malaysia, practical facts and the trip agent", async () => {
    const { enabledRegionConfigs, activeRegionConfig } =
      await vi.importActual<typeof import("@/lib/region/registry")>("@/lib/region/registry");
    const values = documentValues(
      published((r) => {
        r.features = activeRegionConfig().features;
      }),
      "en",
      enabledRegionConfigs({ REGION_ID: "nagasaki" }).map((region) => region.id),
    )!;
    expect(values).toMatchObject({ malaysia: "on", facts: "on", trip: "on" });
  });

  // The hashes of the rendered terms and notice, taken from the commit before the three switches
  // existed, with every old switch off and then every old switch on. A change to the words a visitor
  // reads today fails here. To see what changed, render the page at the old commit and compare.
  const BEFORE: Record<string, string> = {
    "off en terms": "9747918d460396dc3ce19d058302b875248299843bf86707a741523e0de2af30",
    "off en privacy": "18f42d5e66aef583063e8f4f945f7d5adda17188b56d56218cb89294dae9000d",
    "off ja terms": "dec1fab2e97383e584625ae726a4f5e94c0dc445a1d2c7e22beee5af55d7c7a8",
    "off ja privacy": "0278d788d3ec247a7344cac53b0b283e5a943a07017f7c131959437492595223",
    "on en terms": "5313a6614f0c14a800d83b0b0f2f16364d066af166530b5066f5ec1a5f13847d",
    "on en privacy": "8a5397c07ce99e22daeca94968e278d42225e211e28d5e36184181f5e48c763f",
    "on ja terms": "38033eace38f3a70e763bb0e43e4b98902b3201c9f74fc9ec6b9d0fe866056ac",
    "on ja privacy": "736fccbe58c0a82717f31ee8aa508f0e799400f16de842458e534ac48d4302e5",
  };
  it.each(Object.entries(BEFORE))(
    "leaves the words a visitor reads today exactly as they were (%s)",
    (name, hash) => {
      const [state_, locale, kind] = name.split(" ") as ["on" | "off", Locale, "terms" | "privacy"];
      const on = state_ === "on";
      // The values the hashes were taken with, not the fictional ones above.
      const region = published((r) => {
        r.legal.operatorName = "Op";
        r.takedown.contact = "https://x.example/r";
        r.photos.enabled = on;
        r.features = features({ connector: on, planner: on, walk: on });
      });
      const html = render(
        <LegalDocumentView locale={locale} kind={kind} values={documentValues(region, locale)!} />,
      );
      expect(createHash("sha256").update(html).digest("hex")).toBe(hash);
    },
  );

  it.each(SUPPORTED_LOCALES)("adds each part only while its switch is on (%s)", (locale) => {
    const parts = (options: Parameters<typeof view>[2]) => ({
      privacy: ids(view(locale, "privacy", options)).filter((id) =>
        ["malaysia", "facts", "trip"].includes(id),
      ),
    });
    expect(parts({}).privacy).toEqual([]);
    expect(parts({ malaysia: true }).privacy).toEqual(["malaysia"]);
    expect(parts({ features: features({ facts: true }) }).privacy).toEqual(["facts"]);
    expect(parts({ features: features({ trip: "trial" }) }).privacy).toEqual([]);
    expect(parts({ features: features({ trip: "open" }) }).privacy).toEqual(["trip"]);
  });

  it("puts the terms lines in their sections while their switches are on", () => {
    const words = (options: Parameters<typeof view>[2]) => text(view("en", "terms", options));
    const planner = features({ planner: true, trip: "open", facts: true });
    expect(words({ features: features({ planner: true }) })).not.toContain("Malaysian law");
    expect(words({ malaysia: true })).toContain("Where Malaysian law applies to you");
    expect(words({ features: planner })).toContain(
      "A report of a fact must be what you saw yourself",
    );
    expect(words({ features: planner })).toContain("A plan is a suggestion drawn from places");
    expect(words({ features: features({ facts: true }) })).not.toContain("A plan is a suggestion");
    const ja = text(view("ja", "terms", { malaysia: true, features: planner }));
    for (const line of [
      "マレーシアの法律があなたに適用される場合",
      "事実の報告は、ご自身で見たこと",
      "プランは、会員が書いた場所から引いた提案",
    ])
      expect(ja).toContain(line);
  });

  it("fills the placeholders of every new part", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = view(locale, "privacy", {
        malaysia: true,
        features: features({ facts: true, trip: "open" }),
      });
      expect(text(html)).not.toMatch(/\{\w+\}/);
      expect(text(html)).toContain(FICTIONAL.operatorName);
    }
  });

  it("links the Malay notice from the privacy page only while Malaysia is on", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(view(locale, "privacy")).not.toContain("/privacy/ms");
      expect(view(locale, "terms", { malaysia: true })).not.toContain("/privacy/ms");
      expect(view(locale, "privacy", { malaysia: true })).toContain(`href="/${locale}/privacy/ms"`);
    }
  });

  it("explains consent, counter cleanup and report audit retention in each notice language", () => {
    const options = { malaysia: true, features: features({ facts: true, trip: "open" }) };
    const en = text(view("en", "privacy", options));
    const ja = text(view("ja", "privacy", options));
    const ms = documentText(malayPrivacy.document);

    expect(en).toContain("records the date you agreed and which wording you agreed to");
    expect(en).toContain("deletes these counts when you delete your account");
    expect(en).toContain("no longer names you after account deletion");
    expect(ja).toContain("同意した日と同意文の版を記録");
    expect(ja).toContain("回数の記録も削除します");
    expect(ja).toContain("アカウントを削除すると名前は残りません");
    expect(ms).toContain("tarikh anda bersetuju dan versi teks");
    expect(ms).toContain("memadamkan kiraan ini apabila anda memadamkan akaun");
    expect(ms).toContain("tidak lagi memaparkan nama anda selepas akaun dipadamkan");
  });

  it("ships legal text without editorial markers", () => {
    expect(JSON.stringify({ legalDocuments, malayPrivacy })).not.toMatch(/\[\[|OWNER/);
  });

  describe("the Malay notice", () => {
    const malayText = documentText(malayPrivacy.document);

    it("is its own document: the site's languages stay Japanese and English", () => {
      expect(SUPPORTED_LOCALES).toEqual(["ja", "en"]);
      expect(Object.keys(legalDocuments).sort()).toEqual(["en", "ja"]);
    });

    it("follows the house style and fills only placeholders the page knows", () => {
      expect(malayText).not.toMatch(/[—–]/);
      expect(malayText).not.toMatch(/\S+@\S+/);
      expect(malayText).not.toContain("[[");
      for (const name of new Set(placeholders(malayText)))
        expect(["region", "operator", "contact", "minimumAge", "platforms"]).toContain(name);
    });

    it("matches each English section, line, service, switch and placeholder in order", () => {
      const tokens = (value: string) => placeholders(value).sort();
      const lineShape = (line: LegalLine) => ({
        when: typeof line === "string" ? undefined : line.when,
        unless: typeof line === "string" ? undefined : line.unless,
        placeholders: tokens(lineText(line)),
      });
      const shape = (doc: LegalDocument) =>
        doc.sections.map((s) => ({
          id: s.id,
          when: s.when,
          heading: tokens(s.heading),
          paragraphs: s.paragraphs?.map(lineShape),
          items: s.items?.map(lineShape),
          services: s.services?.map((service) => ({
            name: service.name,
            country: tokens(service.country),
            does: tokens(service.does),
            more: service.more?.map(lineShape),
          })),
          closing: s.closing?.map(lineShape),
        }));
      expect(shape(malayPrivacy.document)).toEqual(shape(legalDocuments.en.privacy));
    });

    const page = async (options: { malaysia: boolean; locale?: Locale; facts?: boolean }) => {
      state.locale = options.locale ?? "en";
      state.enabled = options.malaysia ? ["malaysia-west"] : [];
      state.region = published((r) => (r.features = features({ facts: options.facts ?? false })));
      return render(await MalayPrivacyPage());
    };

    it("answers 404 while Malaysia is off or the documents are unpublished", async () => {
      await expect(page({ malaysia: false })).rejects.toThrow("NEXT_NOT_FOUND");
      state.enabled = ["malaysia-west"];
      state.region = published((r) => (r.legal.documentsVersion = null));
      await expect(MalayPrivacyPage()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it.each(SUPPORTED_LOCALES)(
      "says the Malay is unreviewed and is marked as Malay (%s)",
      async (locale) => {
        const html = await page({ malaysia: true, locale });
        const shown = text(html);
        expect(shown).toContain(malayPrivacy.unreviewed.ms);
        expect(shown).toContain(malayPrivacy.unreviewed.en);
        expect(html).toContain('lang="ms"');
        expect(html).toContain(`>${malayPrivacy.document.title}</h1>`);
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(shown).toContain(FICTIONAL.operatorName);
        expect(html).toContain(`href="${FICTIONAL.contact}"`);
        expect(shown).not.toMatch(/\{\w+\}/);
        expect(ids(html)).toEqual(ids(render(await PrivacyPage())));
      },
    );

    it("adds the facts part under its own switch", async () => {
      const shown = ids(await page({ malaysia: true, facts: true }));
      expect(shown).toContain("facts");
      expect(shown).toEqual(ids(render(await PrivacyPage())));
    });
  });
});
