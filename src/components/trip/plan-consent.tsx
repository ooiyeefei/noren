import { useId } from "react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { TRIP_CONSENT_VERSION } from "@/lib/trip/consent";
import { buttonClass } from "./route-step";

// A click in the questions authorizes the first send on the plan page in this tab.
let pending: { tripId: string; expiresAt: number; consentVersion: string } | undefined;

export function approveFirstPlan(tripId: string, consentVersion: string): void {
  pending = { tripId, consentVersion, expiresAt: Date.now() + 60_000 };
}

export function takeFirstPlanApproval(tripId: string): string | undefined {
  if (pending?.tripId !== tripId) return undefined;
  const consentVersion = pending.expiresAt > Date.now() ? pending.consentVersion : undefined;
  pending = undefined;
  return consentVersion;
}

// The server uses the existing invalid-input code for missing or stale send consent.
export function tripSendRejected(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const { data } = error;
  return typeof data === "object" && data !== null && "code" in data && data.code === "invalid_input";
}

export function PlanConsentButton({
  locale,
  label,
  onClick,
  disabled,
}: {
  locale: Locale;
  label: string;
  onClick(consentVersion: string): void;
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
        onClick={() => onClick(TRIP_CONSENT_VERSION)}
      >
        {label}
      </button>
    </div>
  );
}
