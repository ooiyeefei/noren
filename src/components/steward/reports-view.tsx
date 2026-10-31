"use client";

import { DemoBadge } from "@/components/badges/demo-badge";
import { PageContainer } from "@/components/layout/page-container";
import { checkDate } from "@/components/place/check-state";
import { Button } from "@/components/ui/button";
import type { CheckProblem } from "@/lib/domain/constants";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { checkMessages } from "@/lib/i18n/messages/checks";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

export type ReportRow = {
  id: string;
  slug: string;
  name: string;
  problem: CheckProblem;
  note?: string;
  reportedAt: number;
  reporterName: string;
  isMock: boolean;
  confirmedAt?: number;
};
export type ReportsProps = ActionState & {
  locale: Locale;
  rows: readonly ReportRow[];
  onResolve: (id: string, outcome: "kept" | "hidden") => void;
};

/** FR-030: every open "Something's wrong" report in one list; nothing changes until a steward decides. */
export function ReportsView(props: ReportsProps) {
  const { locale, rows, pending, onResolve } = props;
  const m = messagesFor(checkMessages, locale);
  const button = "min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto";
  return (
    <PageContainer locale={locale} title={m.reportsTitle}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} current="reports" />
        <StewardFeedback {...props} />
        <p className="max-w-prose">{m.reportsIntro}</p>
        {!rows.length && <p>{m.reportsEmpty}</p>}
        {rows.map((row) => (
          <article
            key={row.id}
            data-steward-card="report"
            className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
          >
            <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-bold">
              <a
                className="text-ai underline"
                href={localePath(locale, `/places/${encodeURIComponent(row.slug)}`)}
              >
                {row.name}
              </a>
              {row.isMock && <DemoBadge locale={locale} />}
            </h2>
            <p className="font-bold">{m[row.problem]}</p>
            {row.note && <p className="whitespace-pre-wrap">{row.note}</p>}
            <p className="text-[15px] text-muted-foreground">
              {format(m.reportedBy, {
                name: row.reporterName || "—",
                date: checkDate(row.reportedAt, locale),
              })}
            </p>
            <p className="text-[15px] text-muted-foreground">
              {row.confirmedAt === undefined
                ? messagesFor(badgeMessages, locale).unconfirmed
                : format(m.lastConfirmed, { date: checkDate(row.confirmedAt, locale) })}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                className={button}
                disabled={!!pending}
                onClick={() => onResolve(row.id, "kept")}
              >
                {m.keep}
              </Button>
              <Button
                variant="outline"
                className={button}
                disabled={!!pending}
                onClick={() => onResolve(row.id, "hidden")}
              >
                {m.hide}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </PageContainer>
  );
}
