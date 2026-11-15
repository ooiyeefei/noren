"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messagesFor, type Locale } from "@/lib/i18n";
import { reportMessages } from "@/lib/i18n/messages/report";
import { characterCount, type ReportDraft, type ReportResult } from "./report-logic";

export type ReportProps = {
  locale: Locale;
  draft: ReportDraft;
  pagePath: string;
  device: string;
  result?: ReportResult;
  pending: boolean;
  error?: string;
  onChange: (draft: ReportDraft) => void;
  onSubmit: () => void | Promise<void>;
  onAnother: () => void;
};
export function ReportView(p: ReportProps) {
  const m = messagesFor(reportMessages, p.locale);
  return (
    <PageContainer locale={p.locale} title={m.title}>
      <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
        {p.error && <p role="alert">{p.error}</p>}
        {p.result ? (
          <section className="space-y-4" aria-live="polite">
            <p className="text-xl font-bold">{m.thanks}</p>
            <p>{m.thanksHelp}</p>
            <Button
              className="min-h-11 h-auto rounded-[10px] px-5 whitespace-normal"
              onClick={p.onAnother}
            >
              {m.another}
            </Button>
          </section>
        ) : (
          <form
            className="max-w-prose space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void p.onSubmit();
            }}
          >
            <p>{m.intro}</p>
            <fieldset disabled={p.pending} className="min-w-0 space-y-4">
              <div>
                <label htmlFor="report-details" className="block">
                  {m.details}
                </label>
                <Textarea
                  id="report-details"
                  className="min-h-32 rounded-[10px] border-line"
                  name="details"
                  required
                  aria-describedby="report-count"
                  value={p.draft.details}
                  onChange={(e) => p.onChange({ ...p.draft, details: e.target.value })}
                />
                <p id="report-count" aria-live="polite">
                  {characterCount(p.draft.details)} / 2000 · {m.length}
                </p>
              </div>
              <div>
                <label htmlFor="report-contact" className="block">
                  {m.contact}
                </label>
                <Input
                  id="report-contact"
                  className="min-h-11 rounded-[10px] border-line"
                  name="contact"
                  maxLength={200}
                  aria-describedby="report-contact-help"
                  value={p.draft.contact}
                  onChange={(e) => p.onChange({ ...p.draft, contact: e.target.value })}
                />
                <p id="report-contact-help">{m.contactHelp}</p>
              </div>
              <input
                className="sr-only"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={p.draft.website}
                onChange={(e) => p.onChange({ ...p.draft, website: e.target.value })}
              />
              <section
                aria-labelledby="report-sent-with"
                className="space-y-2 rounded-[10px] border border-line p-4"
              >
                <h2 id="report-sent-with" className="text-lg font-bold">
                  {m.sentWith}
                </h2>
                <p>{m.sentWithIntro}</p>
                <dl className="space-y-2">
                  <div>
                    <dt className="font-bold">{m.page}</dt>
                    <dd data-sent="page" className="break-all">
                      {p.pagePath || m.pageNone}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-bold">{m.device}</dt>
                    <dd data-sent="device" className="break-all">
                      {p.device}
                    </dd>
                  </div>
                </dl>
              </section>
              <Button
                className="min-h-11 h-auto rounded-[10px] px-5 whitespace-normal"
                type="submit"
              >
                {p.pending ? m.sending : m.send}
              </Button>
            </fieldset>
          </form>
        )}
      </div>
    </PageContainer>
  );
}
