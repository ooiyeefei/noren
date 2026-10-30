"use client";

import { PageContainer } from "@/components/layout/page-container";
import { UnreviewedBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { takedownsMessages } from "@/lib/i18n/messages/takedowns";
import {
  characterCount,
  displayDate,
  statuses,
  type TakedownStatus,
} from "@/components/takedown/takedown-logic";
import { ageFlags, type TakedownRequest, type Windows } from "./takedowns-logic";
import { StewardNav } from "./steward-home-view";

export type TakedownsProps = {
  locale: Locale;
  rows: readonly TakedownRequest[];
  filter: TakedownStatus | "";
  windows: Windows;
  now: number;
  drafts: Record<string, string>;
  pending: boolean;
  loading: boolean;
  hasMore: boolean;
  error?: string;
  success?: string;
  onFilter: (status: TakedownStatus | "") => void;
  onLoadMore: () => void;
  onDraft: (id: string, value: string) => void;
  onDecide: (id: string, status: "decided" | "closed") => void | Promise<void>;
};
export function TakedownsView(p: TakedownsProps) {
  const m = messagesFor(takedownsMessages, p.locale);
  const t = messagesFor(takedownMessages, p.locale);
  return (
    <PageContainer locale={p.locale} title={m.title}>
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={p.locale} />
        {p.locale === "ja" && <UnreviewedBadge locale={p.locale} />}
        <p>{format(m.automatic, { hours: p.windows.acknowledgeHours })}</p>
        <label>
          {m.filter}
          <select
            className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
            disabled={p.pending}
            value={p.filter}
            onChange={(e) => p.onFilter(e.target.value as TakedownStatus | "")}
          >
            <option value="">{m.all}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {t[status]}
              </option>
            ))}
          </select>
        </label>
        {p.error && <p role="alert">{p.error}</p>}
        {p.success && <p role="status">{p.success}</p>}
        {!p.loading && !p.rows.length && <p>{m.empty}</p>}
        <section className="space-y-4">
          {p.rows.map((row) => {
            const age = ageFlags(row, p.now, p.windows);
            const placeId = row.placeId ?? row.hiddenPlaceId;
            const hidden = !!row.hiddenPlaceId;
            return (
              <article
                data-steward-card="request"
                key={row._id}
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <h2 className="break-all min-w-0 text-[22px] font-bold break-words">
                  {row.code ?? m.noCode}
                </h2>
                <p>
                  <span className="mr-2 font-bold">{m.filter}</span>
                  {t[row.status]}
                </p>
                {placeId ? (
                  <a
                    className="inline-flex min-h-11 w-full min-w-0 items-center text-ai underline sm:w-auto"
                    href={`/${p.locale}/steward/places/${encodeURIComponent(placeId)}`}
                  >
                    {m.place}: {row.placeName ?? row.placeSlug ?? placeId}
                  </a>
                ) : (
                  <p>{m.unmatched}</p>
                )}
                <p>{hidden ? t.hiddenYes : t.hiddenNo}</p>
                {hidden && <p>{m.republish}</p>}
                <h3>{m.details}</h3>
                <p className="whitespace-pre-wrap break-words">{row.details}</p>
                {row.contact && (
                  <div>
                    <h3>{m.private}</h3>
                    <p className="break-words">{row.contact}</p>
                  </div>
                )}
                {row.appealNote && (
                  <div>
                    <h3>{m.appealNote}</h3>
                    <p className="whitespace-pre-wrap">{row.appealNote}</p>
                  </div>
                )}
                <p>
                  {t.receivedAt}:{" "}
                  <time dateTime={new Date(row.receivedAt).toISOString()}>
                    {displayDate(row.receivedAt, p.locale)}
                  </time>
                </p>
                {row.decidedAt !== undefined && (
                  <p>
                    {t.decidedAt}:{" "}
                    <time dateTime={new Date(row.decidedAt).toISOString()}>
                      {displayDate(row.decidedAt, p.locale)}
                    </time>
                  </p>
                )}
                <p>{format(m.waited, { hours: age.hours })}</p>
                {age.acknowledgeLate && <p>{m.acknowledgeLate}</p>}
                {age.decideLate && <p role="status">{m.decideLate}</p>}
                {row.outcome && (
                  <p className="whitespace-pre-wrap">
                    {t.outcome}: {row.outcome}
                  </p>
                )}
                {row.status !== "closed" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void p.onDecide(row._id, "decided");
                    }}
                  >
                    <fieldset className="min-w-0 space-y-3" disabled={p.pending}>
                      <label>
                        {m.outcome}
                        <Textarea
                          className="min-h-11 min-w-0 rounded-[10px]"
                          required
                          value={p.drafts[row._id] ?? ""}
                          aria-describedby={`warning-${row._id}`}
                          onChange={(e) => p.onDraft(row._id, e.target.value)}
                        />
                      </label>
                      <p id={`warning-${row._id}`}>{m.warning}</p>
                      <p aria-live="polite">
                        {characterCount(p.drafts[row._id] ?? "")} / 2000, {t.length}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          disabled={row.status === "decided"}
                          type="submit"
                        >
                          {m.decide}
                        </Button>
                        <Button
                          className="min-h-11 h-auto w-full rounded-[10px] px-5 py-2 whitespace-normal sm:w-auto"
                          type="button"
                          variant="outline"
                          onClick={() => p.onDecide(row._id, "closed")}
                        >
                          {m.close}
                        </Button>
                      </div>
                      <p>{m.closeHelp}</p>
                    </fieldset>
                  </form>
                )}
              </article>
            );
          })}
        </section>
        {p.loading && <p role="status">{t.loading}</p>}
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
