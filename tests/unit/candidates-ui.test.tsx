import { renderToStaticMarkup } from "react-dom/server";
import { Children, isValidElement, type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatesContainer } from "@/components/steward/candidates-container";
import { CandidatesView, type CandidatesProps } from "@/components/steward/candidates-view";
import { candidateDraft, type Candidate } from "@/components/steward/candidates-logic";
import { StewardHomeView } from "@/components/steward/steward-home-view";
import { candidateMessages } from "@/lib/i18n/messages/candidates";
import { getRegionConfig } from "@/lib/region/registry";

const hooks = vi.hoisted(() => ({ active: false, index: 0, values: [] as unknown[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    use: (value: Parameters<typeof react.use>[0]) =>
      hooks.active ? { lang: "en" } : react.use(value),
    useState(initial: unknown) {
      if (!hooks.active) return react.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [
        hooks.values[index],
        (value: unknown) => {
          hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return react.useRef(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
  };
});
const backend = vi.hoisted(() => ({
  pages: new Map<string | null, unknown>(),
  queries: [] as { name: string; args: unknown }[],
  confirm: vi.fn(),
  publish: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: (
    ref: Parameters<typeof getFunctionName>[0],
    args: { paginationOpts: { cursor: string | null } },
  ) => {
    backend.queries.push({ name: getFunctionName(ref), args });
    return backend.pages.get(args.paginationOpts.cursor);
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    ({
      "osmSeed:confirmCandidate": backend.confirm,
      "osmSeed:dismissCandidate": backend.dismiss,
      "places:setVisibility": backend.publish,
    })[getFunctionName(ref)],
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en" }),
  usePathname: () => "/en/steward/candidates",
}));

const region = getRegionConfig("nagasaki")!;
// Clearly mock names and OSM ID; nothing is fetched from the network.
const candidate: Candidate = {
  _id: "mock-candidate",
  osmType: "node",
  osmId: 123,
  names: { ja: "架空の喫茶店", en: "Mock Cafe", primary: "架空の喫茶店" },
  category: "cafe",
  lat: 32.75,
  lng: 129.87,
  attribution: "© OpenStreetMap contributors",
};
const noop = () => {};
function props(): CandidatesProps {
  return {
    locale: "en",
    region,
    candidates: [candidate],
    category: "",
    focusOnly: true,
    localOnly: true,
    loading: false,
    hasMore: true,
    activeId: null,
    dismissId: null,
    drafts: {},
    saved: [],
    onFilter: noop,
    onLoadMore: noop,
    onReview: noop,
    onDraft: noop,
    onConfirm: noop,
    onDismissAsk: noop,
    onDismiss: noop,
  };
}
function wire(): CandidatesProps {
  hooks.active = true;
  hooks.index = 0;
  try {
    return CandidatesContainer({ params: Promise.resolve({ lang: "en" }), locale: "en", region })
      .props;
  } finally {
    hooks.active = false;
  }
}
function switches(node: ReactNode): {
  checked: boolean;
  onChange: (event: { target: { checked: boolean } }) => void;
}[] {
  return Children.toArray(node).flatMap((child) => {
    if (
      !isValidElement<{
        role?: string;
        checked: boolean;
        onChange: (event: { target: { checked: boolean } }) => void;
        children?: ReactNode;
      }>(child)
    )
      return [];
    return child.props.role === "switch" ? [child.props] : switches(child.props.children);
  });
}
function edit() {
  wire().onReview(candidate);
  const p = wire();
  p.onDraft(candidate._id, {
    names: [
      { lang: "ja", value: "  修正した架空名  ", isPrimary: true },
      { lang: "en", value: " Edited Mock Cafe ", isPrimary: true },
    ],
    lat: "32.76",
    lng: "129.88",
    category: "restaurant",
  });
  return wire();
}

beforeEach(() => {
  hooks.values = [];
  hooks.index = 0;
  backend.pages.clear();
  backend.queries = [];
  backend.pages.set(null, { page: [candidate], isDone: false, continueCursor: "next" });
  backend.confirm.mockReset().mockResolvedValue({ placeId: "mock-place", slug: "mock-cafe" });
  backend.publish.mockReset().mockResolvedValue(null);
  backend.dismiss.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  hooks.active = false;
});

describe("candidate views", () => {
  it("a chain row shows the badge only when chains are included", () => {
    for (const locale of ["ja", "en"] as const) {
      for (const localOnly of [true, false]) {
        for (const isChain of [true, false, undefined]) {
          const html = renderToStaticMarkup(
            <CandidatesView
              {...props()}
              locale={locale}
              localOnly={localOnly}
              candidates={[{ ...candidate, isChain }]}
            />,
          );
          expect(html.includes(`>${candidateMessages[locale].chain}</span>`)).toBe(
            !localOnly && isChain === true,
          );
          expect(html).toContain(candidateMessages[locale].localOnly);
        }
      }
    }
  });

  it.each(["ja", "en"] as const)(
    "a candidate row shows names, category, coordinates and the OSM credit with a link (%s)",
    (locale) => {
      const html = renderToStaticMarkup(<CandidatesView {...props()} locale={locale} />);
      expect(html).toContain('lang="ja">架空の喫茶店');
      expect(html).toContain('lang="en">Mock Cafe');
      expect(html).toContain(
        region.categories!.find((category) => category.key === "cafe")!.labels[locale],
      );
      expect(html).toContain("32.75");
      expect(html).toContain("129.87");
      expect(html).toContain('href="https://www.openstreetmap.org/node/123"');
      expect(html).toContain("© OpenStreetMap contributors");
      expect(html).toContain('role="switch" checked=""');
      expect(html).not.toMatch(/undefined|\[object Object\]/);
    },
  );

  it.each(["ja", "en"] as const)(
    "confirm shows two actions and dismiss asks for confirmation (%s)",
    (locale) => {
      const p = {
        ...props(),
        locale,
        activeId: candidate._id,
        drafts: { [candidate._id]: candidateDraft(candidate) },
      };
      const html = renderToStaticMarkup(<CandidatesView {...p} />);
      const m = candidateMessages[locale];
      expect(html).toContain(`>${m.confirmDraft}</button>`);
      expect(html).toContain(`>${m.confirmPublish}</button>`);
      expect(html).toContain('value="架空の喫茶店"');
      expect(html).toContain('value="32.75"');
      expect(html).toContain('value="129.87"');
      expect(html).not.toContain(m.dismissQuestion);
      const asking = renderToStaticMarkup(<CandidatesView {...p} dismissId={candidate._id} />);
      expect(asking).toContain(m.dismissQuestion);
      expect(asking).toContain(`>${m.dismissYes}</button>`);
    },
  );

  it("a refused publish keeps the draft message visible", () => {
    const html = renderToStaticMarkup(
      <CandidatesView
        {...props()}
        candidates={[]}
        saved={[
          {
            placeId: "mock-place",
            slug: "mock-cafe",
            visibility: "draft",
            publishError: "Complete the launch pack",
          },
        ]}
      />,
    );
    expect(html).toContain(candidateMessages.en.savedDraft);
    expect(html).toContain('role="alert">Complete the launch pack');
    expect(html).toContain('href="/en/steward/places/mock-place"');
  });

  it.each(["ja", "en"] as const)("the steward home links to the screen (%s)", (locale) => {
    const html = renderToStaticMarkup(
      <StewardHomeView
        locale={locale}
        region={region}
        rows={[]}
        drafts={{}}
        onDraft={noop}
        onKind={noop}
        onVisibility={noop}
      />,
    );
    expect(html).toContain(`href="/${locale}/steward/candidates"`);
    expect(html).toContain(candidateMessages[locale].title);
  });

  it("messages exist in both languages", () => {
    expect(candidateMessages.en.localOnly).toBe("Local places only");
    expect(candidateMessages.ja.localOnly).toBe("ローカルのお店のみ");
    expect(candidateMessages.en.chain).toBe("Chain");
    expect(candidateMessages.ja.chain).toBe("チェーン店");
    expect(Object.keys(candidateMessages.ja).sort()).toEqual(
      Object.keys(candidateMessages.en).sort(),
    );
    for (const m of Object.values(candidateMessages))
      for (const text of Object.values(m)) expect(text.trim()).not.toBe("");
  });
});

describe("candidate container wiring", () => {
  it("confirm sends the steward's names and pin, not the candidate's raw tags", async () => {
    await edit().onConfirm(candidate._id, false);
    expect(backend.confirm).toHaveBeenCalledExactlyOnceWith({
      candidateId: candidate._id,
      names: [
        { lang: "ja", value: "修正した架空名", script: "kanji", isPrimary: true },
        { lang: "en", value: "Edited Mock Cafe", script: "latin", isPrimary: true },
      ],
      pin: { lat: 32.76, lng: 129.88 },
      category: "restaurant",
    });
    expect(backend.publish).not.toHaveBeenCalled();
    expect(wire().candidates).toEqual([]);
    expect(wire().saved[0]?.visibility).toBe("draft");
  });

  it("confirm-and-publish calls confirm then setVisibility in that order and stops if confirm fails", async () => {
    const order: string[] = [];
    let complete!: (value: { placeId: string; slug: string }) => void;
    backend.confirm.mockImplementation(() => {
      order.push("confirm");
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    backend.publish.mockImplementation(async () => {
      order.push("publish");
      return null;
    });
    const pending = edit().onConfirm(candidate._id, true);
    expect(order).toEqual(["confirm"]);
    expect(backend.publish).not.toHaveBeenCalled();
    complete({ placeId: "mock-place", slug: "mock-cafe" });
    await pending;
    expect(order).toEqual(["confirm", "publish"]);
    expect(backend.publish).toHaveBeenCalledExactlyOnceWith({
      placeId: "mock-place",
      visibility: "public",
    });
    expect(wire().saved[0]?.visibility).toBe("public");
    backend.confirm.mockRejectedValueOnce({
      data: { code: "conflict", message: "already confirmed" },
    });
    backend.publish.mockClear();
    await edit().onConfirm(candidate._id, true);
    expect(backend.publish).not.toHaveBeenCalled();
    expect(wire().error).toContain("already confirmed");
  });

  it("a publish refusal preserves the committed draft and server reason after the row is removed", async () => {
    backend.publish.mockRejectedValueOnce({
      data: {
        code: "conflict",
        message: "complete the launch pack (operator and takedown contact)",
      },
    });
    await edit().onConfirm(candidate._id, true);
    const p = wire();
    expect(p.candidates).toEqual([]);
    expect(p.saved[0]?.visibility).toBe("draft");
    expect(p.saved[0]?.publishError).toContain("complete the launch pack");
    expect(renderToStaticMarkup(<CandidatesView {...p} />)).toContain(
      candidateMessages.en.savedDraft,
    );
    p.onFilter("shop", false, p.localOnly);
    expect(wire().saved[0]?.publishError).toContain("complete the launch pack");
  });

  it("load more follows empty pages, accumulates rows and resets on filter changes", () => {
    backend.pages.set(null, { page: [], isDone: false, continueCursor: "next" });
    backend.pages.set("next", { page: [candidate], isDone: false, continueCursor: "last" });
    backend.pages.set("last", { page: [], isDone: true, continueCursor: "ignored" });
    expect(wire().hasMore).toBe(true);
    wire().onLoadMore();
    expect(wire().candidates).toEqual([candidate]);
    wire().onLoadMore();
    expect(wire().candidates).toEqual([candidate]);
    expect(wire().hasMore).toBe(false);
    wire().onFilter("gallery", false, true);
    const p = wire();
    expect(p.candidates).toEqual([]);
    expect(p.focusOnly).toBe(false);
    expect(backend.queries.at(-1)).toEqual({
      name: "osmSeed:listCandidates",
      args: {
        regionId: region.id,
        category: "gallery",
        focusOnly: false,
        includeChains: false,
        paginationOpts: { numItems: 25, cursor: null },
      },
    });
  });

  it("toggling the switch resets the cursor", () => {
    backend.pages.set("next", {
      page: [{ ...candidate, _id: "mock-next" }],
      isDone: false,
      continueCursor: "last",
    });
    expect(wire().localOnly).toBe(true);
    for (const localOnly of [false, true]) {
      wire().onLoadMore();
      expect(wire().candidates).toHaveLength(2);
      wire().onReview(candidate);
      wire().onDismissAsk(candidate._id);
      const p = wire();
      const inputs = switches(CandidatesView(p));
      expect(inputs).toHaveLength(2);
      expect(inputs[1]!.checked).toBe(!localOnly);
      inputs[1]!.onChange({ target: { checked: localOnly } });
      const updated = wire();
      expect(updated.localOnly).toBe(localOnly);
      expect(updated.focusOnly).toBe(true);
      expect(updated.candidates).toEqual([candidate]);
      expect(updated.activeId).toBeNull();
      expect(updated.dismissId).toBeNull();
      expect(backend.queries.at(-1)).toEqual({
        name: "osmSeed:listCandidates",
        args: {
          regionId: region.id,
          category: undefined,
          focusOnly: true,
          includeChains: !localOnly,
          paginationOpts: { numItems: 25, cursor: null },
        },
      });
    }
  });

  it("invalid edited names, pin and category are refused before any mutation", async () => {
    for (const patch of [{ names: [] }, { lat: "0" }, { category: "unknown" }]) {
      const p = edit();
      p.onDraft(candidate._id, { ...p.drafts[candidate._id]!, ...patch });
      await wire().onConfirm(candidate._id, true);
      expect(wire().error?.trim().length).toBeGreaterThan(0);
    }
    expect(backend.confirm).not.toHaveBeenCalled();
    expect(backend.publish).not.toHaveBeenCalled();
  });

  it("dismiss requires inline confirmation and only removes the row after success", async () => {
    await wire().onDismiss(candidate._id);
    expect(backend.dismiss).not.toHaveBeenCalled();
    wire().onDismissAsk(candidate._id);
    await wire().onDismiss(candidate._id);
    expect(backend.dismiss).toHaveBeenCalledExactlyOnceWith({ candidateId: candidate._id });
    expect(wire().candidates).toEqual([]);
  });
});

it.each(["ja", "en"] as const)(
  "%s candidate phone cards label their values and wrap controls",
  (locale) => {
    const html = renderToStaticMarkup(
      <CandidatesView
        {...props()}
        locale={locale}
        activeId={candidate._id}
        drafts={{ [candidate._id]: candidateDraft(candidate) }}
      />,
    );
    expect(html).toContain('data-steward-card="candidate"');
    expect(html).toContain("min-w-0 space-y-3 rounded-[10px] border border-line");
    for (const key of ["name", "category", "latitude", "longitude"] as const)
      expect(html).toContain(candidateMessages[locale][key]);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const control of html.match(/<(?:button|select|input)\b[^>]*>/g) ?? []) {
      if (control.includes('type="checkbox"')) continue;
      expect(control).toContain("min-h-11");
    }
  },
);

it.each(["ja", "en"] as const)(
  "%s candidates nav marks its current destination and preserves read-only place status",
  (locale) => {
    const html = renderToStaticMarkup(
      <CandidatesView
        {...props()}
        locale={locale}
        saved={[
          { placeId: "draft-place", slug: "draft-place", visibility: "draft" },
          { placeId: "public-place", slug: "public-place", visibility: "public" },
        ]}
      />,
    );
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)![0];
    expect(nav.match(/<a\b/g)).toHaveLength(5);
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    const current = nav.match(/<a\b[^>]*aria-current="page"[^>]*>/)![0];
    expect(current).toContain(`href="/${locale}/steward/candidates"`);
    for (const [slug, value] of [
      ["draft-place", candidateMessages[locale].savedDraft],
      ["public-place", candidateMessages[locale].published],
    ]) {
      const card = html.match(
        new RegExp(
          `<article[^>]*>(?:(?!</article>)[\\s\\S])*href="/${locale}/steward/places/${slug}"[\\s\\S]*?</article>`,
        ),
      )![0];
      expect(card).not.toContain("<select");
      expect(card).toContain(`role="status">${value}</p>`);
    }
  },
);
