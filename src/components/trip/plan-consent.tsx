import { useId } from "react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { buttonClass } from "./route-step";

// A click in the questions authorizes the first send on the plan page in this tab.
let pending: { tripId: string; expiresAt: number } | undefined;

export function approveFirstPlan(tripId: string): void {
  pending = { tripId, expiresAt: Date.now() + 60_000 };
}

export function takeFirstPlanApproval(tripId: string): boolean {
  if (pending?.tripId !== tripId) return false;
  const approved = pending.expiresAt > Date.now();
  pending = undefined;
  return approved;
}

export function PlanConsentButton({
  locale,
  label,
  onClick,
  disabled,
}: {
  locale: Locale;
  label: string;
  onClick(): void;
  disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  const m = messagesFor(tripMessages, locale);
  return (
    <div className="max-w-prose space-y-2">
      <p id={id} className="text-[15px] text-muted-foreground">
        {m.planSendConsent} {m.partyConsent}
      </p>
      <button
        type="button"
        className={buttonClass}
        aria-describedby={id}
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </button>
    </div>
  );
}
