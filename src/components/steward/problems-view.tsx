"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { messagesFor, type Locale } from "@/lib/i18n";
import { problemsMessages } from "@/lib/i18n/messages/problems";
import { displayDate } from "@/components/takedown/takedown-logic";
import { pageHref, type ProblemReport, type ProblemStatus } from "./problems-logic";
import { StewardNav } from "./steward-home-view";

export type ProblemsProps = {
  locale: Locale;
  rows: readonly ProblemReport[];
  status: ProblemStatus;
  pending: boolean;
  loading: boolean;
  hasMore: boolean;
  error?: string;
  success?: string;
  onStatus: (status: ProblemStatus) => void;
  onLoadMore: () => void;
  onClose: (id: string) => void | Promise<void>;
};
export function ProblemsView(p: ProblemsProps) {
  const m = messagesFor(problemsMessages, p.locale);
  return (
    <PageContainer locale={p.locale} title={m.title}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={p.locale} current="problems" />
        <div className="flex flex-wrap gap-2" role="group" aria-label={m.status}>
          {(["open", "done"] as const).map((status) => (
            <Button
              key={status}
              type="button"
              variant={p.status === status ? "default" : "outline"}
              aria-pressed={p.status === status}
              className="min-h-11 h-auto rounded-full px-4"
              onClick={() => p.onStatus(status)}
            >
              {m[status]}
            </Button>
          ))}
        </div>
        {p.error && <p role="alert">{p.error}</p>}
        {p.success && <p role="status">{p.success}</p>}
        {!p.loading && !p.rows.length && <p>{m.empty}</p>}
        <section className="space-y-4">
          {p.rows.map((row) => {
            const href = pageHref(row.pagePath);
            return (
              <article
                data-steward-card="problem"
                key={row._id}
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <p className="whitespace-pre-wrap break-words">{row.details}</p>
                <p>
                  <span className="mr-2 font-bold">{m.page}</span>
                  {href ? (
                    <a className="text-ai underline" href={href}>
                      {row.pagePath}
                    </a>
                  ) : (
                    m.noPage
                  )}
                </p>
                <p>
                  <span className="mr-2 font-bold">{m.device}</span>
                  {row.device}
                </p>
                {row.contact && (
                  <p>
                    <span className="mr-2 font-bold">{m.contact}</span>
                    {row.contact}
                  </p>
                )}
                <p>
                  {m.received}:{" "}
                  <time dateTime={new Date(row.receivedAt).toISOString()}>
                    {displayDate(row.receivedAt, p.locale)}
                  </time>
                </p>
                {row.status === "open" && (
                  <div className="space-y-2">
                    <Button
                      className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                      disabled={p.pending}
                      onClick={() => p.onClose(row._id)}
                    >
                      {m.markDone}
                    </Button>
                    <p>{m.closeHelp}</p>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        {p.loading && <p role="status">{m.loading}</p>}
        {p.hasMore && (
          <Button
            className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
            disabled={p.loading || p.pending}
            onClick={p.onLoadMore}
          >
            {m.more}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
