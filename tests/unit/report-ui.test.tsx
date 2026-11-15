import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ReportView, type ReportProps } from "@/components/report/report-view";
import { ProblemsView, type ProblemsProps } from "@/components/steward/problems-view";
import { problemsMessages } from "@/lib/i18n/messages/problems";
import { reportMessages } from "@/lib/i18n/messages/report";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/map" }));
const noop = () => {};
const form = (): ReportProps => ({
  locale: "en",
  draft: { details: "", contact: "", website: "" },
  pagePath: "/en/map",
  device: "360×640 · UA",
  pending: false,
  onChange: noop,
  onSubmit: noop,
  onAnother: noop,
});
const list = (): ProblemsProps => ({
  locale: "en",
  rows: [
    {
      _id: "r1",
      details: "Map is blank",
      pagePath: "/en/map",
      device: "360×640 · UA",
      contact: "me@example.test",
      locale: "en",
      status: "open",
      receivedAt: 0,
    },
  ],
  status: "open",
  pending: false,
  loading: false,
  hasMore: false,
  onStatus: noop,
  onLoadMore: noop,
  onClose: noop,
});

it("the form ties labels to fields, hides the honeypot and shows what is sent", () => {
  for (const locale of ["en", "ja"] as const) {
    const m = reportMessages[locale];
    const html = render(<ReportView {...form()} locale={locale} />);
    expect(html).toContain('for="report-details"');
    expect(html).toContain('id="report-details"');
    expect(html).toContain('for="report-contact"');
    expect(html).toContain(m.contactHelp);
    expect(html).toContain(m.sentWith);
    expect(html).toContain("/en/map");
    expect(html).toContain("360×640 · UA");
    expect(html).toMatch(/class="sr-only"[^>]*aria-hidden="true"/);
    expect(html).toContain('name="website"');
  }
});

it("shows an announced error and the thank-you state with Send another", () => {
  expect(render(<ReportView {...form()} error="Oops" />)).toContain('role="alert">Oops');
  const html = render(<ReportView {...form()} result={{ receivedAt: 1 }} />);
  expect(html).toContain(reportMessages.en.thanks);
  expect(html).toContain(reportMessages.en.another);
  expect(html).not.toContain("<form");
});

it("the steward view lists a report with link, device, contact and Mark done", () => {
  const html = render(<ProblemsView {...list()} />);
  expect(html).toContain("Map is blank");
  expect(html).toContain('href="/en/map"');
  expect(html).toContain("me@example.test");
  expect(html).toContain(problemsMessages.en.markDone);
  expect(html).toContain(`href="/en/steward/problems"`);
  expect(html).toContain('aria-pressed="true"');
  const done = render(
    <ProblemsView {...list()} status="done" rows={[{ ...list().rows[0]!, status: "done" }]} />,
  );
  expect(done).not.toContain(problemsMessages.en.markDone);
});
