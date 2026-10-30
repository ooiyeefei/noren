"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";

export type ConsentScope = {
  publish: boolean;
  aiProcessing: boolean;
  transferAbroad: boolean;
  voiceRetention: boolean;
};
export type ConsentSubmission = {
  scope: ConsentScope;
  textVersion: string;
  textLang: string;
  assisted: boolean;
};
export function consentReady(scope: ConsentScope): boolean {
  return scope.publish && scope.aiProcessing && scope.transferAbroad && scope.voiceRetention;
}

export function ConsentForm(props: {
  locale: Locale;
  consentText: string;
  textLang: string;
  textVersion: string;
  minimumAge: number;
  assistedAllowed: boolean;
  onSubmit(submission: ConsentSubmission): Promise<void>;
  error?: string;
}): React.JSX.Element {
  const m = messagesFor(interviewUiMessages, props.locale);
  const id = useId();
  const [scope, setScope] = useState<ConsentScope>({
    publish: false,
    aiProcessing: false,
    transferAbroad: false,
    voiceRetention: false,
  });
  const [assisted, setAssisted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(false);
  return (
    <form
      lang={props.locale}
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!consentReady(scope) || pending) return;
        setPending(true);
        setFailure(false);
        try {
          await props.onSubmit({
            scope: { ...scope },
            textVersion: props.textVersion,
            textLang: props.textLang,
            assisted: props.assistedAllowed && assisted,
          });
        } catch {
          setFailure(true);
        } finally {
          setPending(false);
        }
      }}
    >
      <p lang={props.textLang} className="whitespace-pre-wrap">
        {props.consentText}
      </p>
      <p>{format(m.minimumAge, { age: props.minimumAge })}</p>
      {(["publish", "aiProcessing", "transferAbroad", "voiceRetention"] as const).map((key) => (
        <div key={key} className="flex items-start gap-3">
          <Checkbox
            id={`${id}-${key}`}
            checked={scope[key]}
            disabled={pending}
            onCheckedChange={(checked) =>
              setScope((current) => ({ ...current, [key]: checked === true }))
            }
          />
          <Label htmlFor={`${id}-${key}`}>{m[key]}</Label>
        </div>
      ))}
      {props.assistedAllowed && (
        <div className="flex items-start gap-3">
          <Checkbox
            id={`${id}-assisted`}
            checked={assisted}
            disabled={pending}
            onCheckedChange={(checked) => setAssisted(checked === true)}
          />
          <Label htmlFor={`${id}-assisted`}>{m.assisted}</Label>
        </div>
      )}
      {(props.error || failure) && (
        <Alert variant="destructive">{props.error || m.actionFailed}</Alert>
      )}
      <Button type="submit" disabled={!consentReady(scope) || pending}>
        {pending ? m.saving : m.submit}
      </Button>
    </form>
  );
}
