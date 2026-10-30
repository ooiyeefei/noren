"use client";

import { useRef, useState } from "react";
import { errorText } from "@/components/layout/error-text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { messagesFor, type Locale } from "@/lib/i18n";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { ownerMayRemove, type OwnerClaim } from "./review";

export function RemoveClaim({
  locale,
  claim,
  onRemove,
}: {
  locale: Locale;
  claim: OwnerClaim;
  onRemove(claimId: string): Promise<void>;
}): React.JSX.Element | null {
  const m = messagesFor(ownerMessages, locale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  if (!ownerMayRemove(claim)) return null;

  async function confirm() {
    if (!open || running.current) return;
    running.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onRemove(claim._id);
      setOpen(false);
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return (
    <div lang={locale} className="space-y-2">
      {open ? (
        <>
          <p>{m.removeConfirmation}</p>
          <p>{m.removePageEffect}</p>
          {claim.status === "disputed" && <p>{m.removeDisputedEffect}</p>}
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? m.removing : m.removeConfirm}
            </Button>
            <Button
              className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {m.cancel}
            </Button>
          </div>
        </>
      ) : (
        <Button
          className="h-auto min-h-11 rounded-[10px] border-beni bg-white px-4 py-3 text-base whitespace-normal text-beni hover:bg-beni/5"
          type="button"
          variant="destructive"
          onClick={() => {
            setError(undefined);
            setOpen(true);
          }}
        >
          {m.remove}
        </Button>
      )}
    </div>
  );
}
