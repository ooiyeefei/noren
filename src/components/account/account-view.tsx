"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AccountMenuView, type AccountState } from "@/components/layout/account-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/domain/constants";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { accountMessages } from "@/lib/i18n/messages/account";
import { shellMessages } from "@/lib/i18n/messages/shell";

/** What POST /api/account/delete answered, in the terms the page acts on. */
export type DeletionAnswer = "deleted" | "clerk_failed" | "refused" | "signed_out" | "failed";

export type AccountActions = {
  deleteAccount(): Promise<DeletionAnswer>;
  /** Signs out and leaves for the welcome page. */
  leave(): Promise<void>;
};

export type DeletionStep =
  | "idle"
  | "confirming"
  | "deleting"
  | "deleted"
  | "clerk_failed"
  | "failed"
  | "refused"
  | "signed_out";

const BUTTON = "h-auto min-h-11 rounded-[10px] px-4 py-2 text-base whitespace-normal";
const LINK = "inline-flex min-h-11 items-center text-ai underline";

/** For the log: never empty, whatever was thrown. */
export function errorDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name || "Error"}: ${error.message || "no message"}`;
  try {
    return String(error) || "empty throw";
  } catch {
    return "a throw that cannot be read";
  }
}

/** Asks the route to delete the account. Getting no answer at all counts as a failure to retry. */
export async function requestDeletion(send: typeof fetch = fetch): Promise<DeletionAnswer> {
  try {
    const response = await send("/api/account/delete", { method: "POST" });
    if (response.status === 401) return "signed_out";
    if (response.status === 403) return "refused";
    // Only the route's own answer counts, so a page some redirect ended at is never read as done.
    const body: unknown = await response.json().catch(() => null);
    if (typeof body !== "object" || body === null) return "failed";
    if (response.ok && "ok" in body && body.ok === true) return "deleted";
    const code = "error" in body ? (body.error as { code?: unknown } | null)?.code : undefined;
    return code === "clerk_failed" ? "clerk_failed" : "failed";
  } catch (error) {
    console.error(`account deletion request failed (${errorDetail(error)})`);
    return "failed";
  }
}

/** Who deletes an account that can't be deleted here. `refused` is a press the server turned down. */
function AskSomeone({
  locale,
  personRole,
  refused,
}: {
  locale: Locale;
  personRole?: Role;
  refused?: boolean;
}) {
  const m = messagesFor(accountMessages, locale);
  const page = encodeURIComponent(localePath(locale, "/account"));
  return (
    <div className="space-y-2" data-ask-steward="">
      <p role={refused ? "alert" : undefined}>
        {personRole === "steward" ? m.askOtherSteward : m.askSteward}
      </p>
      <p>{m.askThroughForm}</p>
      <Link className={LINK} href={`${localePath(locale, "/takedown")}?page=${page}`}>
        {m.openForm}
      </Link>
    </div>
  );
}

/** Everything the deletion section can show, for one step. It holds no state of its own. */
export function DeletionSection({
  locale,
  step,
  role,
  onStart,
  onConfirm,
  onKeep,
}: {
  locale: Locale;
  step: DeletionStep;
  role?: Role;
  onStart(): void;
  onConfirm(): void;
  onKeep(): void;
}): React.JSX.Element {
  const m = messagesFor(accountMessages, locale);
  const heading = (
    <h2 id="delete-account" className="text-[22px] font-bold">
      {m.deleteTitle}
    </h2>
  );
  const frame = (children: React.ReactNode) => (
    <section
      aria-labelledby="delete-account"
      className="space-y-4 rounded-[14px] border border-line p-4 sm:p-6"
    >
      {heading}
      {children}
    </section>
  );
  if (step === "refused") return frame(<AskSomeone locale={locale} personRole={role} refused />);
  if (role !== undefined && role !== "user" && step === "idle")
    return frame(<AskSomeone locale={locale} personRole={role} />);
  if (step === "deleting") return frame(<p role="status">{m.deleting}</p>);
  if (step === "deleted")
    return frame(
      <>
        <p role="status">{m.deleted}</p>
        <a className={LINK} href={localePath(locale, "/welcome")}>
          {m.goToWelcome}
        </a>
      </>,
    );
  if (step === "signed_out")
    return frame(
      <>
        <p role="alert">{m.signedOut}</p>
        <Link className={LINK} href={localePath(locale, "/sign-in")}>
          {messagesFor(shellMessages, locale).signIn}
        </Link>
      </>,
    );
  if (step === "clerk_failed" || step === "failed")
    return frame(
      <>
        <Alert variant="destructive" className="text-base">
          {step === "failed" ? m.failed : m.clerkFailed}
        </Alert>
        <Button
          className={BUTTON}
          type="button"
          variant="destructive"
          data-delete-again=""
          onClick={onConfirm}
        >
          {m.tryAgain}
        </Button>
      </>,
    );
  return frame(
    <>
      <p>{m.deleteIntro}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-bold">{m.goesTitle}</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>{m.goesName}</li>
            <li>{m.goesCollection}</li>
            <li>{m.goesStories}</li>
            <li>{m.goesChecks}</li>
            <li>{m.goesLinks}</li>
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="font-bold">{m.staysTitle}</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>{m.staysPlaces}</li>
            <li>{m.staysLinks}</li>
            <li>{m.staysLog}</li>
          </ul>
        </div>
      </div>
      {step === "idle" ? (
        <Button
          className={BUTTON}
          type="button"
          variant="destructive"
          data-delete-start=""
          onClick={onStart}
        >
          {m.deleteButton}
        </Button>
      ) : (
        <div className="space-y-3 rounded-[10px] bg-kamenozoki p-4">
          <p role="alert" className="font-bold">
            {m.confirmQuestion}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className={BUTTON}
              type="button"
              variant="destructive"
              data-delete-confirm=""
              onClick={onConfirm}
            >
              {m.confirmYes}
            </Button>
            {/* The safe choice takes the focus, because the button that opened this has gone. */}
            <Button
              autoFocus
              className={BUTTON}
              type="button"
              variant="outline"
              data-delete-keep=""
              onClick={onKeep}
            >
              {m.confirmNo}
            </Button>
          </div>
        </div>
      )}
    </>,
  );
}

/**
 * The account page: the person's name, then deleting the account. A plain member deletes it here
 * after a confirmation, and every other role sees who to ask (FR-130).
 *
 * The step lives here and goes on showing after `state` stops being signedIn, because the first thing
 * deletion does is empty the row that `people.current` reads. Without that, a failed Clerk step would
 * drop the person back to a loading state with no way to press again.
 */
export function AccountView({
  locale,
  state,
  actions,
  nameSection,
}: {
  locale: Locale;
  state: AccountState;
  actions: AccountActions;
  /** The control for the name shown beside what they share, above deletion. */
  nameSection?: React.ReactNode;
}): React.JSX.Element {
  const [step, setStep] = useState<DeletionStep>("idle");
  const busy = useRef(false);
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setStep("deleting");
    const answer = await actions.deleteAccount();
    setStep(answer);
    busy.current = false;
    if (answer === "deleted") await actions.leave();
  }
  const accountStands = step === "idle" || step === "confirming" || step === "refused";
  if (accountStands && state.kind !== "signedIn")
    return <AccountMenuView locale={locale} state={state} />;
  return (
    <div lang={locale} className="max-w-3xl space-y-8 text-[17px] text-kon" data-account="">
      {accountStands && nameSection}
      <DeletionSection
        locale={locale}
        step={step}
        role={state.kind === "signedIn" ? state.role : undefined}
        onStart={() => setStep("confirming")}
        onConfirm={() => void confirm()}
        onKeep={() => setStep("idle")}
      />
    </div>
  );
}
