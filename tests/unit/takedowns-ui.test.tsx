import { renderToStaticMarkup as render } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, it, vi } from "vitest";
import { TakedownsContainer } from "@/components/steward/takedowns-container";
import { TakedownsView, type TakedownsProps } from "@/components/steward/takedowns-view";
import { takedownsMessages } from "@/lib/i18n/messages/takedowns";
const hooks = vi.hoisted(() => ({ active: false, index: 0, values: [] as unknown[] }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useState(initial: unknown) {
      if (!hooks.active) return react.useState(initial);
      const i = hooks.index++;
      if (!(i in hooks.values))
        hooks.values[i] = typeof initial === "function" ? initial() : initial;
      return [
        hooks.values[i],
        (value: unknown) => {
          hooks.values[i] = typeof value === "function" ? value(hooks.values[i]) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      if (!hooks.active) return react.useRef(initial);
      const i = hooks.index++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
  };
});
const backend = vi.hoisted(() => ({
  decide: vi.fn(),
  calls: [] as unknown[],
  pages: new Map<string | null, unknown>(),
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    expect(getFunctionName(ref)).toBe("takedown:decide");
    return backend.decide;
  },
  useQuery: (
    ref: Parameters<typeof getFunctionName>[0],
    args: { paginationOpts: { cursor: string | null } },
  ) => {
    expect(getFunctionName(ref)).toBe("takedown:list");
    backend.calls.push(args);
    return backend.pages.get(args.paginationOpts.cursor);
  },
}));
const row = {
  _id: "mock-request",
  code: "MOCK-CODE",
  hiddenPlaceId: "mock-place",
  placeName: "Mock place",
  details: "Mock request details",
  privacyOrMinor: true,
  contact: "Mock private contact",
  status: "appealed" as const,
  appealNote: "Mock appeal note",
  receivedAt: 0,
};
const windows = { acknowledgeHours: 24, decideDays: 7 };
const noop = () => {};
const props = (): TakedownsProps => ({
  locale: "en",
  rows: [row],
  filter: "",
  windows,
  now: 8 * 86400000,
  drafts: {},
  pending: false,
  loading: false,
  hasMore: true,
  onFilter: noop,
  onLoadMore: noop,
  onDraft: noop,
  onDecide: noop,
});
function wire() {
  hooks.active = true;
  hooks.index = 0;
  try {
    return TakedownsContainer({ locale: "en", windows }).props as TakedownsProps;
  } finally {
    hooks.active = false;
  }
}
beforeEach(() => {
  hooks.values = [];
  backend.calls = [];
  backend.decide.mockReset().mockResolvedValue(null);
  backend.pages.clear();
  backend.pages.set(null, { page: [row], isDone: false, continueCursor: "next" });
});
it("the queue shows the private contact with a private label and the appeal note", () => {
  for (const locale of ["ja", "en"] as const) {
    const html = render(<TakedownsView {...props()} locale={locale} />);
    expect(html).toContain(takedownsMessages[locale].private);
    expect(html).toContain(row.contact);
    expect(html).toContain(row.appealNote);
    expect(html).toContain('href="/en/steward/places/mock-place"'.replace("/en/", `/${locale}/`));
    expect(html).toContain(takedownsMessages[locale].republish);
    expect(html).toContain(takedownsMessages[locale].decideLate);
  }
});
it("the decision warning is shown", () => {
  expect(render(<TakedownsView {...props()} />)).toContain(takedownsMessages.en.warning);
});
it("decide sends status and outcome", async () => {
  for (const status of ["decided", "closed"] as const) {
    wire().onDraft(row._id, " Mock reasoned outcome ");
    await wire().onDecide(row._id, status);
    expect(backend.decide).toHaveBeenLastCalledWith({
      requestId: row._id,
      status,
      outcome: "Mock reasoned outcome",
    });
  }
});
it("short outcomes are refused before a mutation", async () => {
  wire().onDraft(row._id, "short");
  await wire().onDecide(row._id, "closed");
  expect(backend.decide).not.toHaveBeenCalled();
  expect(wire().error).toContain("10 to 2000");
});
it("load more follows the cursor and filter resets it", () => {
  backend.pages.set("next", {
    page: [{ ...row, _id: "second", status: "received" }],
    isDone: true,
    continueCursor: "end",
  });
  wire().onLoadMore();
  expect(wire().rows).toHaveLength(2);
  expect(wire().hasMore).toBe(true);
  expect(backend.calls).toContainEqual({
    status: "received",
    paginationOpts: { cursor: "next", numItems: 25 },
  });
  wire().onLoadMore();
  wire();
  expect(backend.calls.at(-1)).toEqual({
    status: "appealed",
    paginationOpts: { cursor: null, numItems: 25 },
  });
  wire().onFilter("appealed");
  wire();
  expect(backend.calls.at(-1)).toEqual({
    status: "appealed",
    paginationOpts: { cursor: null, numItems: 25 },
  });
});

it("empty priority groups advance and the final closed page stops pagination", () => {
  backend.pages.set(null, { page: [], isDone: true, continueCursor: "end" });
  for (const status of ["received", "appealed", "hidden", "decided", "closed"]) {
    wire();
    expect(backend.calls.at(-1)).toEqual({
      status,
      paginationOpts: { cursor: null, numItems: 25 },
    });
  }
  expect(wire().hasMore).toBe(false);
});
it("decided cases can close and closed cases retain outcomes without a form", () => {
  for (const status of ["decided", "closed"] as const) {
    const html = render(
      <TakedownsView {...props()} rows={[{ ...row, status, outcome: "Mock reasoned outcome" }]} />,
    );
    expect(html).toContain("Mock reasoned outcome");
    if (status === "closed") expect(html).not.toContain("<textarea");
    else {
      expect(html).toContain("<textarea");
      expect(html).toContain(takedownsMessages.en.closeHelp);
      expect(html).toMatch(/disabled="" type="submit">Decide/);
    }
  }
});

it.each(["ja", "en"] as const)(
  "%s request phone cards label values and keep controls reachable",
  (locale) => {
    const html = render(<TakedownsView {...props()} locale={locale} />);
    expect(html).toContain('data-steward-card="request"');
    expect(html).toContain("min-w-0 space-y-3 rounded-[10px] border border-line");
    for (const key of ["filter", "details", "private", "outcome"] as const)
      expect(html).toContain(takedownsMessages[locale][key]);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const control of html.match(/<(?:button|select|textarea)\b[^>]*>/g) ?? [])
      expect(control).toContain("min-h-11");
  },
);
