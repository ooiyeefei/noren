import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StewardHomeView, type StewardHomeProps } from "@/components/steward/steward-home-view";
import {
  PlaceAdminView,
  ComposeResultView,
  type PlaceAdminProps,
} from "@/components/steward/place-admin-view";
import { PeopleView } from "@/components/steward/people-view";
import { OpenTextView, type OpenTextProps } from "@/components/steward/open-text-view";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { regionSchema } from "@/lib/region/schema";
import type { Locale } from "@/lib/i18n";
import type { Id } from "../../convex/_generated/dataModel";
import nagasaki from "../../regions/nagasaki.json";
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "ja" }),
  usePathname: () => "/ja/steward",
}));
const noop = () => {};
const region = regionSchema.parse(nagasaki);
const result = {
  pageVersionId: "mock-version",
  version: 3,
  sentenceCount: 8,
  heldCount: 2,
  publishedClaims: 4,
};
function home(locale: Locale): StewardHomeProps {
  return {
    locale,
    region,
    rows: [
      {
        id: "mock",
        slug: "mock",
        name: "Mock place",
        kind: "business",
        isMock: true,
        visibility: "draft",
        ownerCount: 1,
      },
      {
        id: "real",
        slug: "real",
        name: "Real business",
        kind: "business",
        isMock: false,
        visibility: "draft",
        ownerCount: 0,
      },
    ],
    drafts: {},
    onDraft: noop,
    onKind: noop,
    onVisibility: noop,
  };
}
function admin(locale: Locale): PlaceAdminProps {
  return {
    locale,
    region,
    place: { name: "Mock place", slug: "mock", ownerCount: 1, isMock: true },
    owners: [],
    ownerId: "",
    onOwnerId: noop,
    onAttachOwner: noop,
    sources: [
      {
        _id: "source" as Id<"source">,
        placeId: "place" as Id<"place">,
        adapter: "link_card",
        platform: "Web",
        url: "https://example.com",
        canonicalUrl: "https://example.com",
        embed: { kind: "link", url: "https://example.com" },
        authorHandle: "Creator-entered credit",
        status: "live",
        hasDemoConsent: false,
        isMock: true,
        addedByMe: false,
      },
    ],
    onSource: noop,
    claims: [
      {
        _id: "claim" as Id<"claim">,
        placeId: "place" as Id<"place">,
        textOriginal: "架空のインタビューです。",
        langOriginal: "ja",
        kind: "story",
        status: "published",
        origin: "interview",
        aiAssisted: false,
        isMock: true,
        translations: [],
      },
    ],
    selected: [],
    onSelect: noop,
    translations: {},
    onTranslation: noop,
    onSaveTranslation: noop,
    onDispute: noop,
    onTranslate: noop,
    onCompose: noop,
    composeResult: result,
  };
}
function openText(locale: Locale): OpenTextProps {
  const snippet = {
    _id: "snippet" as Id<"openTextSnippet">,
    lang: "ja",
    text: "架空の引用文です。",
    licence: "CC-BY-SA-4.0" as const,
    sourceUrl: "https://example.com",
    attribution: "Mock text credit",
    revisionRef: "mock-revision",
    retrievedAt: 0,
    approved: false,
  };
  return {
    locale,
    landmarks: [{ id: "place", name: "Mock landmark", canLink: true }],
    placeId: "place",
    onPlace: noop,
    unlinked: [snippet],
    linked: [
      { ...snippet, _id: "linked" as Id<"openTextSnippet">, placeId: "place" as Id<"place"> },
    ],
    linkedLoading: false,
    drafts: {
      linked: { start: 0, end: 2, placeId: "", excerpts: [{ start: 0, end: 2, kind: "fact" }] },
    },
    onDraft: noop,
    onLink: noop,
    onAdd: noop,
    onApprove: noop,
  };
}
function encoded(text: string) {
  return renderToStaticMarkup(<span>{text}</span>).slice(6, -7);
}
describe("steward views", () => {
  it.each(["ja", "en"] as const)(
    "%s publishes a real place without an owner checkbox and offers back to draft",
    (locale) => {
      const props = home(locale);
      props.region = { legal: { ...region.legal, launchPackComplete: true } };
      props.rows = props.rows.filter((row) => !row.isMock);
      props.drafts = {
        real: { visibility: "public", agreementRecorded: false, confirmFictional: false },
      };
      const html = renderToStaticMarkup(<StewardHomeView {...props} />);
      expect(html).not.toContain('type="checkbox"');
      expect(html).toContain(encoded(stewardMessages[locale].publishPlace));
      expect(html).toMatch(/<option value="public"(?![^>]*disabled)[^>]*>/);
      expect(html).toMatch(/<option value="draft"(?![^>]*disabled)[^>]*>/);
      expect(html).toMatch(/<option value="pilot"[^>]*disabled/);
      const publishButton = html
        .match(/<button\b[^>]*>[^<]*<\/button>/g)
        ?.find((button) =>
          button.endsWith(`>${encoded(stewardMessages[locale].publishPlace)}</button>`),
        );
      expect(publishButton).toBeDefined();
      expect(publishButton).not.toContain(' disabled="');
      props.drafts = {};
      expect(renderToStaticMarkup(<StewardHomeView {...props} />)).toContain(
        encoded(stewardMessages[locale].backToDraft),
      );
    },
  );
  it("a fictional landmark still offers confirmation and can change its legacy kind label", () => {
    const props = home("en");
    props.rows = [{ ...props.rows[0]!, kind: "landmark", visibility: "demo_public" }];
    props.drafts = {
      mock: { visibility: "demo_public", agreementRecorded: false, confirmFictional: true },
    };
    const html = renderToStaticMarkup(<StewardHomeView {...props} />);
    expect(html).toContain(encoded(stewardMessages.en.confirmFictional));
    expect(html).toContain(encoded(stewardMessages.en.confirmDemo));
    const kindButton = html.match(/<button\b[^>]*>Mark as business<\/button>/)?.[0];
    expect(kindButton).toBeDefined();
    expect(kindButton).not.toContain(' disabled="');
  });
  it("the places table shows the confirm-fictional checkbox for a mock place and the launch-pack reason for a real business", () => {
    const html = renderToStaticMarkup(<StewardHomeView {...home("en")} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(encoded(stewardMessages.en.confirmFictional));
    expect(html).toContain(encoded(stewardMessages.en.launch_pack));
    expect(html).toContain('href="/en/steward/places/mock"');
    expect(html).toContain('href="/en/places/mock"');
    expect(html).toContain('data-badge="demo"');
  });
  it.each(["ja", "en"] as const)(
    "%s disables public demo saving without fictional confirmation, regardless of label",
    (locale) => {
      for (const kind of ["business", "landmark"] as const) {
        const props = home(locale);
        props.rows = props.rows.map((row) => ({ ...row, kind }));
        props.drafts = Object.fromEntries(
          props.rows.map((row) => [
            row.id,
            { visibility: "demo_public", agreementRecorded: false, confirmFictional: false },
          ]),
        );
        const html = renderToStaticMarkup(<StewardHomeView {...props} />);
        expect(html.match(/type="checkbox"/g)).toHaveLength(1);
        expect(html).toContain(encoded(stewardMessages[locale].confirmFictional));
        expect(html).toContain(encoded(stewardMessages[locale].landmark_kind));
        const rows = html.match(/<tr class="border-t align-top">[\s\S]*?<\/tr>/g)!;
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatch(/<option value="demo_public"(?![^>]*disabled)[^>]*>/);
        expect(rows[1]).toMatch(/<option value="demo_public"[^>]*disabled/);
        for (const row of rows) expect(row).toMatch(/<button[^>]*disabled[^>]*>[^<]*<\/button>/);
      }
    },
  );
  it("the source list shows the demo-consent reminder and labels the credit as entered by the creator", () => {
    const html = renderToStaticMarkup(<PlaceAdminView {...admin("en")} />);
    expect(html).toContain(encoded(stewardMessages.en.consentReminder));
    expect(html).toContain(encoded(stewardMessages.en.credit));
    expect(html).toContain("Creator-entered credit");
    expect(html).toContain(encoded(stewardMessages.en.recordConsent));
    expect(html).toContain('lang="ja"');
    const props = admin("en");
    props.sources = props.sources.map((source) => ({ ...source, hasDemoConsent: true }));
    expect(renderToStaticMarkup(<PlaceAdminView {...props} />)).toContain(
      encoded(stewardMessages.en.revokeConsent),
    );
  });
  it("the compose result shows held sentences", () => {
    const html = renderToStaticMarkup(<ComposeResultView locale="en" result={result} />);
    expect(html).toContain("Held sentences</dt><dd>2</dd>");
    expect(html).toContain("Version</dt><dd>3</dd>");
    expect(html).toContain("Sentence count</dt><dd>8</dd>");
    expect(html).toContain("Newly published claims</dt><dd>4</dd>");
    expect(html).toContain(encoded(stewardMessages.en.heldReason));
  });
  it("the people view renders no role control for a steward", () => {
    const html = renderToStaticMarkup(
      <PeopleView
        locale="en"
        people={[{ _id: "s", displayName: "Mock steward", role: "steward", isMock: true }]}
        onRole={noop}
      />,
    );
    expect(html).not.toContain("<select");
    expect(html).toContain("Mock steward");
    expect(html).toContain(encoded(stewardMessages.en.invitations));
    const user = renderToStaticMarkup(
      <PeopleView
        locale="en"
        people={[{ _id: "u", displayName: "Mock user", role: "user", isMock: true }]}
        onRole={noop}
      />,
    );
    expect(user).toContain("<select");
    expect(user).not.toContain('value="steward"');
  });
  it.each(["ja", "en"] as const)("%s renders every label", (locale) => {
    const m = stewardMessages[locale];
    expect(Object.keys(m).sort()).toEqual(Object.keys(stewardMessages.ja).sort());
    for (const value of Object.values(m)) expect(value.trim()).not.toBe("");
    const homeHtml = renderToStaticMarkup(<StewardHomeView {...home(locale)} />);
    for (const key of [
      "home",
      "name",
      "kind",
      "visibility",
      "owners",
      "markLandmark",
      "backToDraft",
      "confirmFictional",
      "launch_pack",
      "kindRule",
      "visibilityRule",
      "openText",
      "people",
    ] as const)
      expect(homeHtml).toContain(encoded(m[key]));
    const adminHtml = renderToStaticMarkup(<PlaceAdminView {...admin(locale)} />);
    for (const key of [
      "owner",
      "ownerWarning",
      "linkOwner",
      "sources",
      "credit",
      "consentReminder",
      "recordConsent",
      "markGone",
      "remove",
      "claims",
      "translationRule",
      "human",
      "saveTranslation",
      "disputeRule",
      "dispute",
      "machineRequest",
      "compose",
      "composeRule",
      "held",
      "heldReason",
    ] as const)
      expect(adminHtml).toContain(encoded(m[key]));
    const openHtml = renderToStaticMarkup(<OpenTextView {...openText(locale)} />);
    for (const key of [
      "openText",
      "linkRule",
      "unlinked",
      "linked",
      "licence",
      "revision",
      "attribution",
      "link",
      "excerptRule",
      "start",
      "end",
      "addStory",
      "addFact",
      "chosen",
      "approve",
      "approveRule",
    ] as const)
      expect(openHtml).toContain(encoded(m[key]));
    expect(openHtml).toContain('lang="ja"');
    expect(openHtml).toContain('type="number"');
    const peopleHtml = renderToStaticMarkup(
      <PeopleView
        locale={locale}
        people={[{ _id: "u", displayName: "Mock user", role: "user", isMock: true }]}
        onRole={noop}
      />,
    );
    for (const key of [
      "people",
      "invitations",
      "roleRule",
      "role",
      "user",
      "creator",
      "business_owner",
    ] as const)
      expect(peopleHtml).toContain(encoded(m[key]));
    for (const html of [homeHtml, adminHtml, openHtml, peopleHtml])
      expect(html).not.toMatch(/undefined|\[object Object\]/);
  });
  it("pending actions disable controls and errors are visible", () => {
    const html = renderToStaticMarkup(
      <PlaceAdminView {...admin("en")} pending="compose" error="Coded server error" />,
    );
    expect(html).toContain('role="alert">Coded server error');
    expect(html).toContain(encoded(stewardMessages.en.pending));
    expect(html).not.toMatch(/<button(?![^>]*disabled)[^>]*>/);
  });
});
