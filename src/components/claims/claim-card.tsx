"use client";

import { useId, useState } from "react";
import { AiAssistedBadge, DemoBadge } from "@/components/badges";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClaimKind, ClaimStatus } from "@/lib/domain/constants";
import { messagesFor, type Locale } from "@/lib/i18n";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";

export type ClaimCardData = {
  id: string;
  kind: ClaimKind;
  cautionType?: string;
  textOriginal: string;
  langOriginal: string;
  quote?: string;
  status: ClaimStatus;
  aiAssisted: boolean;
  isMock: boolean;
};

export function ClaimCard(props: {
  locale: Locale;
  claim: ClaimCardData;
  cautionLabel?: string;
  busy?: boolean;
  onConfirm(): Promise<void>;
  onEdit(text: string): Promise<void>;
  onRemove(): Promise<void>;
  error?: string;
}): React.JSX.Element {
  const m = messagesFor(interviewUiMessages, props.locale);
  const id = useId();
  const { claim } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(claim.textOriginal);
  const [removing, setRemoving] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = props.busy || pending;
  const actionable = claim.status === "proposed" || claim.status === "owner_confirmed";
  async function act(action: () => Promise<void>, done?: () => void) {
    if (busy || !actionable) return;
    setPending(true);
    setFailed(false);
    try {
      await action();
      done?.();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card lang={props.locale} className="rounded-[14px] border border-line py-0 shadow-none ring-0">
      <CardContent className="space-y-4 p-5 text-base leading-7 break-words sm:p-6">
        <p>
          {m[claim.kind]}
          {claim.kind === "caution" && props.cautionLabel ? ` · ${props.cautionLabel}` : ""}
        </p>
        <p lang={claim.langOriginal} className="whitespace-pre-wrap">
          {claim.textOriginal}
        </p>
        {claim.quote && (
          <div>
            <p>{m.whatYouSaid}</p>
            <blockquote
              lang={claim.langOriginal}
              className="border-l-2 border-line pl-3 whitespace-pre-wrap text-muted-foreground"
            >
              {claim.quote}
            </blockquote>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {claim.aiAssisted && <AiAssistedBadge locale={props.locale} />}
          {claim.isMock && <DemoBadge locale={props.locale} />}
        </div>
        <p role="status">{m[claim.status]}</p>
        {(props.error || failed) && (
          <Alert variant="destructive">{props.error || m.actionFailed}</Alert>
        )}
        {actionable && (
          <>
            {editing && (
              <div className="space-y-2">
                <Label htmlFor={id}>{m.edit}</Label>
                <Textarea
                  id={id}
                  lang={claim.langOriginal}
                  value={text}
                  disabled={busy}
                  onChange={(event) => setText(event.target.value)}
                />
                <Button
                  className="h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal"
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={() =>
                    void act(
                      () => props.onEdit(text),
                      () => setEditing(false),
                    )
                  }
                >
                  {m.save}
                </Button>
                <Button
                  className="h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal"
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  {m.cancel}
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">
              <Button
                className="h-auto min-h-11 rounded-[10px] bg-kon px-4 py-2 text-base text-white"
                type="button"
                disabled={busy}
                onClick={() => void act(props.onConfirm)}
              >
                {m.confirm}
              </Button>
              <Button
                className="order-last h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setText(claim.textOriginal);
                  setEditing(true);
                }}
              >
                {m.edit}
              </Button>
              <Button
                className="h-auto min-h-11 rounded-[10px] border-beni bg-white px-4 py-2 text-base whitespace-normal text-beni hover:bg-beni/5"
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                {m.remove}
              </Button>
            </div>
            <Dialog
              open={removing}
              onOpenChange={(open) => {
                if (!busy) setRemoving(open);
              }}
            >
              <DialogContent lang={props.locale} showCloseButton={false}>
                <DialogTitle>{m.remove}</DialogTitle>
                <DialogDescription>{m.removeConfirmation}</DialogDescription>
                {(props.error || failed) && (
                  <Alert variant="destructive">{props.error || m.actionFailed}</Alert>
                )}
                <Button
                  className="h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal"
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void act(props.onRemove, () => setRemoving(false))}
                >
                  {m.remove}
                </Button>
                <Button
                  className="h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal"
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRemoving(false)}
                >
                  {m.cancel}
                </Button>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
