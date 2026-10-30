"use client";

import { PageContainer } from "@/components/layout/page-container";
import { UnreviewedBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { characterCount, type FormDraft, type SubmitResult } from "./takedown-logic";

export type FormProps = {
  locale: Locale;
  draft: FormDraft;
  result?: SubmitResult;
  decideDays: number;
  pending: boolean;
  error?: string;
  copied: boolean;
  onChange: (draft: FormDraft) => void;
  onSubmit: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
};
export function FormView(p: FormProps) {
  const m = messagesFor(takedownMessages, p.locale);
  return (
    <PageContainer locale={p.locale} title={m.title}>
      {p.locale === "ja" && <UnreviewedBadge locale={p.locale} />}
      <p>{m.intro}</p>
      {p.error && <p role="alert">{p.error}</p>}
      {p.result ? (
        <section className="space-y-4" aria-live="polite">
          <h2>{m.code}</h2>
          <p className="break-all font-mono text-4xl font-bold">{p.result.code}</p>
          <Button className="min-h-11 rounded-[10px] px-5 whitespace-normal" onClick={p.onCopy}>
            {m.copy}
          </Button>
          {p.copied && <p role="status">{m.copied}</p>}
          <p>{p.result.hidden ? m.hiddenYes : m.hiddenNo}</p>
          <p>{format(m.review, { days: p.decideDays })}</p>
          <p>{m.keepCode}</p>
          <a
            className="underline"
            href={`/${p.locale}/takedown/status?code=${encodeURIComponent(p.result.code)}`}
          >
            {m.statusLink}
          </a>
        </section>
      ) : (
        <form
          className="max-w-prose space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void p.onSubmit();
          }}
        >
          <fieldset disabled={p.pending} className="space-y-4">
            <label className="block">
              {m.pageUrl}
              <Input
                className="min-h-11 rounded-[10px] border-line"
                name="pageUrl"
                required
                value={p.draft.pageUrl}
                onChange={(e) => p.onChange({ ...p.draft, pageUrl: e.target.value })}
              />
            </label>
            <label className="block">
              {m.details}
              <Textarea
                className="min-h-11 rounded-[10px] border-line"
                name="details"
                required
                aria-describedby="details-count"
                value={p.draft.details}
                onChange={(e) => p.onChange({ ...p.draft, details: e.target.value })}
              />
            </label>
            <p id="details-count" aria-live="polite">
              {characterCount(p.draft.details)} / 2000 · {m.length}
            </p>
            <label className="flex min-h-11 cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                name="privacyOrMinor"
                checked={p.draft.privacyOrMinor}
                aria-describedby="privacy-help"
                onChange={(e) => p.onChange({ ...p.draft, privacyOrMinor: e.target.checked })}
              />
              {m.privacy}
            </label>
            <p id="privacy-help">{m.privacyHelp}</p>
            <label className="block">
              {m.contact}
              <Input
                className="min-h-11 rounded-[10px] border-line"
                name="contact"
                aria-describedby="contact-help"
                value={p.draft.contact}
                onChange={(e) => p.onChange({ ...p.draft, contact: e.target.value })}
              />
            </label>
            <p id="contact-help">{m.contactHelp}</p>
            <input
              className="sr-only"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={p.draft.website}
              onChange={(e) => p.onChange({ ...p.draft, website: e.target.value })}
            />
            <Button className="min-h-11 rounded-[10px] px-5 whitespace-normal" type="submit">
              {p.pending ? m.sending : m.send}
            </Button>
          </fieldset>
        </form>
      )}
    </PageContainer>
  );
}
