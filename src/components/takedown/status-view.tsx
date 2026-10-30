"use client";

import { PageContainer } from "@/components/layout/page-container";
import { UnreviewedBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { characterCount, displayDate, type StatusResult } from "./takedown-logic";

export type StatusProps = {
  locale: Locale;
  code: string;
  searched: boolean;
  result?: StatusResult | null;
  note: string;
  pending: boolean;
  error?: string;
  success?: string;
  onCode: (value: string) => void;
  onCheck: () => void;
  onNote: (value: string) => void;
  onAppeal: () => void | Promise<void>;
};
export function StatusView(p: StatusProps) {
  const m = messagesFor(takedownMessages, p.locale);
  return (
    <PageContainer locale={p.locale} title={m.statusTitle}>
      {p.locale === "ja" && <UnreviewedBadge locale={p.locale} />}
      <form
        className="max-w-prose space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          p.onCheck();
        }}
      >
        <label>
          {m.codeLabel}
          <Input
            className="min-h-11 rounded-[10px] border-line"
            disabled={p.pending}
            value={p.code}
            required
            onChange={(e) => p.onCode(e.target.value)}
          />
        </label>
        <Button
          className="min-h-11 rounded-[10px] px-5 whitespace-normal"
          disabled={p.pending}
          type="submit"
        >
          {m.check}
        </Button>
      </form>
      {p.error && <p role="alert">{p.error}</p>}
      {p.success && <p role="status">{p.success}</p>}
      {p.searched &&
        (p.result === undefined ? (
          <p role="status">{m.loading}</p>
        ) : p.result === null ? (
          <p role="status">{m.unknown}</p>
        ) : (
          <section className="space-y-4" aria-live="polite">
            <h2 className="text-xl font-semibold">{m[p.result.status]}</h2>
            {(["receivedAt", "acknowledgedAt", "decidedAt"] as const).map(
              (key) =>
                p.result?.[key] !== undefined && (
                  <p key={key}>
                    {m[key]}:{" "}
                    <time dateTime={new Date(p.result[key]!).toISOString()}>
                      {displayDate(p.result[key]!, p.locale)}
                    </time>
                  </p>
                ),
            )}
            {p.result.outcome && (
              <div>
                <h3>{m.outcome}</h3>
                <p className="whitespace-pre-wrap">{p.result.outcome}</p>
              </div>
            )}
            {p.result.status === "decided" && (
              <form
                className="max-w-prose space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void p.onAppeal();
                }}
              >
                <fieldset disabled={p.pending} className="space-y-3">
                  <label>
                    {m.note}
                    <Textarea
                      className="min-h-11 rounded-[10px] border-line"
                      required
                      aria-describedby="appeal-count"
                      value={p.note}
                      onChange={(e) => p.onNote(e.target.value)}
                    />
                  </label>
                  <p id="appeal-count" aria-live="polite">
                    {characterCount(p.note)} / 2000 · {m.length}
                  </p>
                  <Button className="min-h-11 rounded-[10px] px-5 whitespace-normal" type="submit">
                    {p.pending ? m.sending : m.appeal}
                  </Button>
                </fieldset>
              </form>
            )}
          </section>
        ))}
    </PageContainer>
  );
}
