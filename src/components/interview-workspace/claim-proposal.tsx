"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { interviewPageMessages } from "@/lib/i18n/messages/interview-page";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import { validateProposal, type ProposalDraft, type WorkspaceRegion } from "./workspace";

export function ClaimProposal(props: {
  locale: Locale;
  lang: string;
  initial: ProposalDraft;
  vocabulary: WorkspaceRegion["cautionVocabulary"];
  busy?: boolean;
  onSubmit(draft: ProposalDraft): Promise<void>;
  onCancel(): void;
}) {
  const m = messagesFor(interviewPageMessages, props.locale);
  const ui = messagesFor(interviewUiMessages, props.locale);
  const id = useId();
  const [draft, setDraft] = useState(props.initial);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const busy = props.busy || pending;
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const result = validateProposal(draft, props.vocabulary);
        if (result !== "ok") {
          setError(errorText(m[result], props.locale));
          return;
        }
        setPending(true);
        setError(undefined);
        try {
          await props.onSubmit(draft);
        } catch (cause) {
          setError(errorText(cause, props.locale));
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>{m.proposalTitle}</h2>
      <p>{ui.whatYouSaid}</p>
      <blockquote lang={props.lang} className="whitespace-pre-wrap border-l-2 pl-3">
        {props.initial.quote}
      </blockquote>
      <Label htmlFor={`${id}-kind`}>{m.kind}</Label>
      <select
        id={`${id}-kind`}
        value={draft.kind}
        disabled={busy}
        onChange={(event) =>
          setDraft({ ...draft, kind: event.target.value as ProposalDraft["kind"] })
        }
      >
        {(["story", "fact", "caution"] as const).map((kind) => (
          <option key={kind} value={kind}>
            {ui[kind]}
          </option>
        ))}
      </select>
      {draft.kind === "caution" && (
        <>
          <Label htmlFor={`${id}-caution`}>{m.cautionKey}</Label>
          <select
            id={`${id}-caution`}
            disabled={busy}
            value={draft.cautionType}
            onChange={(event) => setDraft({ ...draft, cautionType: event.target.value })}
          >
            <option value="">{m.chooseCaution}</option>
            {props.vocabulary.map((item) => (
              <option key={item.key} value={item.key}>
                {item.labels[props.locale]}
              </option>
            ))}
          </select>
        </>
      )}
      <Label htmlFor={`${id}-text`}>{m.claimText}</Label>
      <Textarea
        id={`${id}-text`}
        lang={props.lang}
        value={draft.textOriginal}
        disabled={busy}
        onChange={(event) => setDraft({ ...draft, textOriginal: event.target.value })}
      />
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} type="submit">
          {m.submitProposal}
        </Button>
        <Button disabled={busy} type="button" variant="outline" onClick={props.onCancel}>
          {ui.cancel}
        </Button>
      </div>
    </form>
  );
}
