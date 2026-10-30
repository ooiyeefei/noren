import { renderToStaticMarkup as render } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, it, vi } from "vitest";
import { FormView, type FormProps } from "@/components/takedown/form-view";
import { StatusView, type StatusProps } from "@/components/takedown/status-view";
import { FormContainer } from "@/components/takedown/form-container";
import { StatusContainer } from "@/components/takedown/status-container";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { statuses } from "@/components/takedown/takedown-logic";
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
  submit: vi.fn(),
  appeal: vi.fn(),
  status: undefined as unknown,
  query: new URLSearchParams({ page: " /en/places/mock " }),
  calls: [] as unknown[],
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => backend.query }));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "takedown:submit" ? backend.submit : backend.appeal,
  useQuery: (_ref: unknown, args: unknown) => {
    backend.calls.push(args);
    return backend.status;
  },
}));
const noop = () => {};
const form = (): FormProps => ({
  locale: "en",
  decideDays: 7,
  draft: {
    pageUrl: "/en/places/mock",
    details: "Mock removal request",
    privacyOrMinor: true,
    contact: "",
    website: "",
  },
  pending: false,
  copied: false,
  onChange: noop,
  onSubmit: noop,
  onCopy: noop,
});
const status = (): StatusProps => ({
  locale: "en",
  code: "MOCK-CODE",
  searched: true,
  result: null,
  note: "",
  pending: false,
  onCode: noop,
  onCheck: noop,
  onNote: noop,
  onAppeal: noop,
});
function wireForm() {
  hooks.active = true;
  hooks.index = 0;
  try {
    return FormContainer({ locale: "en", decideDays: 7 }).props as FormProps;
  } finally {
    hooks.active = false;
  }
}
function wireStatus() {
  hooks.active = true;
  hooks.index = 0;
  try {
    return StatusContainer({ locale: "en" }).props as StatusProps;
  } finally {
    hooks.active = false;
  }
}
beforeEach(() => {
  hooks.values = [];
  backend.submit
    .mockReset()
    .mockResolvedValue({ code: "MOCK-CODE", hidden: true, matchedPlace: true, receivedAt: 0 });
  backend.appeal.mockReset().mockResolvedValue(null);
  backend.status = undefined;
  backend.calls = [];
  backend.query = new URLSearchParams({ page: " /en/places/mock " });
});
it("the form shows the privacy checkbox explanation, the optional contact note and a visually hidden honeypot", () => {
  for (const locale of ["ja", "en"] as const) {
    const html = render(<FormView {...form()} locale={locale} />);
    expect(html).toContain(takedownMessages[locale].privacyHelp);
    expect(html).toContain(takedownMessages[locale].contactHelp);
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(
      /class="sr-only" tabindex="-1" autoComplete="off" aria-hidden="true" name="website"/,
    );
  }
});
it("success shows the code, whether it was hidden and the status link", () => {
  for (const hidden of [true, false]) {
    const html = render(
      <FormView
        {...form()}
        result={{ code: "MOCK-CODE", hidden, matchedPlace: hidden, receivedAt: 0 }}
      />,
    );
    expect(html).toContain("MOCK-CODE");
    expect(html).toContain(takedownMessages.en[hidden ? "hiddenYes" : "hiddenNo"]);
    expect(html).toContain('href="/en/takedown/status?code=MOCK-CODE"');
    expect(html).toContain("within 7 days");
  }
});
it("unknown code shows the neutral message", () => {
  expect(render(<StatusView {...status()} />)).toContain(takedownMessages.en.unknown);
});
it("appeal form appears only when decided", () => {
  for (const value of statuses) {
    const html = render(
      <StatusView
        {...status()}
        result={{ status: value, receivedAt: 0, appealed: value === "appealed" }}
      />,
    );
    expect(html.includes(takedownMessages.en.note)).toBe(value === "decided");
  }
});
it("submit sends exactly the documented arguments including locale and website", async () => {
  expect(wireForm().draft.pageUrl).toBe("/en/places/mock");
  for (const website of ["", " typed bot value "]) {
    wireForm().onChange({ ...form().draft, contact: "Mock review contact", website });
    await wireForm().onSubmit();
    expect(backend.submit).toHaveBeenLastCalledWith({
      pageUrl: "/en/places/mock",
      details: "Mock removal request",
      privacyOrMinor: true,
      contact: "Mock review contact",
      locale: "en",
      website,
    });
    expect(wireForm().result?.code).toBe("MOCK-CODE");
  }
});
it("rate_limited becomes the readable try-later message", async () => {
  wireForm().onChange(form().draft);
  backend.submit.mockRejectedValueOnce({ data: { code: "rate_limited", message: "slow down" } });
  await wireForm().onSubmit();
  expect(wireForm().error).toBe(takedownMessages.en.tryLater);
});
it("status reads the code query and appeal sends code and note; rate limits remain readable", async () => {
  backend.query = new URLSearchParams({ code: " MOCK-CODE " });
  backend.status = { status: "decided", receivedAt: 0, appealed: false };
  wireStatus().onNote("Mock appeal note");
  await wireStatus().onAppeal();
  expect(backend.calls[0]).toEqual({ code: "MOCK-CODE" });
  expect(backend.appeal).toHaveBeenCalledExactlyOnceWith({
    code: "MOCK-CODE",
    note: "Mock appeal note",
  });
  wireStatus().onNote("Mock appeal note");
  backend.appeal.mockRejectedValueOnce({ data: { code: "rate_limited" } });
  await wireStatus().onAppeal();
  expect(wireStatus().error).toBe(takedownMessages.en.tryLater);
});
