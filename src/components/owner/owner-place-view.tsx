"use client";

import { useId, useState } from "react";
import {
  AiAssistedBadge,
  DemoBadge,
  MachineTranslationBadge,
  TranslationPendingBadge,
  UnreviewedBadge,
} from "@/components/badges";
import { errorText } from "@/components/layout/error-text";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { InterviewStatus } from "@/lib/domain/constants";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import { ownerMessages } from "@/lib/i18n/messages/owner";
import { publicMessages } from "@/lib/i18n/messages/public";
import { shellMessages } from "@/lib/i18n/messages/shell";
import type { PlaceNameLike } from "@/lib/region/names";
import { RemoveClaim } from "./remove-claim";
import {
  groupClaims,
  languageName,
  ownerMayAct,
  placeLabel,
  reviewCounts,
  toCardData,
  translationRows,
  type OpenTextSource,
  type OwnerClaim,
  type OwnerRegionProps,
} from "./review";

export type OwnerPlaceLike = {
  _id: string;
  slug: string;
  isMock: boolean;
  names: readonly PlaceNameLike[];
};
export type InterviewLike = {
  _id: string;
  language: string;
  status: InterviewStatus;
  isMock: boolean;
  createdAt: number;
};
export type OwnerPlaceViewProps = {
  locale: Locale;
  region: OwnerRegionProps;
  /** null when the place does not exist, cannot be read, or is not this viewer's. */
  place: OwnerPlaceLike | null;
  claims: readonly OwnerClaim[];
  interviews: readonly InterviewLike[];
  onConfirm(claimId: string): Promise<void>;
  onEdit(claimId: string, text: string): Promise<void>;
  onRemove(claimId: string): Promise<void>;
  onTranslate(): Promise<{ pending: number }>;
  onWithdraw(interviewId: string): Promise<void>;
};

const linkClass =
  "inline-flex min-h-11 items-center text-ai underline underline-offset-4 focus-visible:outline-2";

export function OwnerNotFound({ locale }: { locale: Locale }): React.JSX.Element {
  const shell = messagesFor(shellMessages, locale);
  return (
    <div lang={locale} className="space-y-3">
      <h1 className="text-2xl font-semibold">{shell.notFoundTitle}</h1>
      <p>{shell.notFoundBody}</p>
      <a className={linkClass} href={localePath(locale, "/owner")}>
        {messagesFor(ownerMessages, locale).backToHome}
      </a>
    </div>
  );
}

function OpenTextNote({
  locale,
  openText,
}: {
  locale: Locale;
  openText?: OpenTextSource;
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  return (
    <div className="space-y-1 text-sm">
      <p>{m.fromOpenText}</p>
      <p>{m.openTextNote}</p>
      {openText && (
        <>
          <p>
            {format(m.attribution, { attribution: openText.attribution })} ·{" "}
            {format(m.licenceLine, { licence: openText.licence })}
            {openText.revisionRef && ` · ${format(m.revision, { revision: openText.revisionRef })}`}
          </p>
          <p>
            {/^https:\/\//i.test(openText.sourceUrl) ? (
              <a href={openText.sourceUrl} rel="noopener noreferrer" className={linkClass}>
                {openText.sourceUrl}
              </a>
            ) : (
              openText.sourceUrl
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** Confirmed and published text stays read-only; open text has no owner actions. */
function ReadOnlyClaim({
  locale,
  region,
  claim,
  children,
}: {
  locale: Locale;
  region: OwnerRegionProps;
  claim: OwnerClaim;
  children?: React.ReactNode;
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  const ui = messagesFor(interviewUiMessages, locale);
  const { card, cautionLabel, cautionReviewed } = toCardData(
    claim,
    locale,
    region.cautionVocabulary,
    region.defaultLocale,
  );
  const rows = claim.origin === "interview" ? translationRows(claim, region.locales) : [];
  const original = { lang: card.langOriginal, text: card.textOriginal, state: "original" as const };
  const texts = [original, ...rows];
  // Japanese comes first when available; a missing translation never hides the original.
  if (locale === "ja") texts.sort((a, b) => Number(b.lang === "ja") - Number(a.lang === "ja"));
  const renderText = (row: (typeof texts)[number]) => (
    <div key={row.lang} className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
        <span>
          {row.state === "original"
            ? m.original
            : format(m.translationLabel, { language: languageName(row.lang, locale) })}
        </span>
        {row.state === "machine" && <MachineTranslationBadge locale={locale} />}
        {row.state === "pending" && <TranslationPendingBadge locale={locale} />}
        {row.state === "human" && (
          <span>
            {row.reviewedBy ? format(m.checkedBy, { name: row.reviewedBy }) : m.checkedByPerson}
          </span>
        )}
      </p>
      {row.text !== undefined && (
        <p lang={row.lang} className="whitespace-pre-wrap">
          {row.text}
        </p>
      )}
    </div>
  );
  return (
    <Card lang={locale} className="rounded-[14px] border border-line py-0 shadow-none ring-0">
      <CardContent className="space-y-5 p-5 text-base leading-7 break-words sm:p-6">
        {renderText(texts[0]!)}
        {claim.origin === "interview" && card.quote && (
          <div className="space-y-2 text-[15px] text-muted-foreground">
            <p>{ui.whatYouSaid}</p>
            <blockquote
              lang={card.langOriginal}
              className="border-l-2 border-line pl-3 whitespace-pre-wrap text-muted-foreground"
            >
              {card.quote}
            </blockquote>
          </div>
        )}
        {texts.slice(1).map(renderText)}
        {claim.origin === "open_text" && <OpenTextNote locale={locale} openText={claim.openText} />}
        <div className="flex flex-wrap items-center gap-2 text-[15px]">
          <span>
            {ui[card.kind]}
            {cautionLabel ? `, ${cautionLabel}` : ""}
          </span>
          {cautionLabel !== undefined && !cautionReviewed && <UnreviewedBadge locale={locale} />}
          {card.aiAssisted && <AiAssistedBadge locale={locale} />}
          {card.isMock && <DemoBadge locale={locale} />}
        </div>
        <p role="status" className="text-[15px] text-muted-foreground">
          {ui[card.status]}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

export function ReviewCard({
  locale,
  region,
  claim,
  onConfirm,
  onEdit,
  onRemove,
}: {
  locale: Locale;
  region: OwnerRegionProps;
  claim: OwnerClaim;
  onConfirm: OwnerPlaceViewProps["onConfirm"];
  onEdit: OwnerPlaceViewProps["onEdit"];
  onRemove: OwnerPlaceViewProps["onRemove"];
}): React.JSX.Element {
  const ui = messagesFor(interviewUiMessages, locale);
  const id = useId();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [text, setText] = useState(claim.textOriginal);
  async function run(action: () => Promise<void>, done?: () => void) {
    if (pending || !ownerMayAct(claim)) return;
    setPending(true);
    setError(undefined);
    try {
      await action();
      done?.();
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      setPending(false);
    }
  }
  return (
    <ReadOnlyClaim locale={locale} region={region} claim={claim}>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">
        <Button
          className="h-auto min-h-11 rounded-[10px] bg-kon px-4 py-3 text-base text-white"
          disabled={pending}
          onClick={() => void run(() => onConfirm(claim._id))}
        >
          {ui.confirm}
        </Button>
        <Button
          className="h-auto min-h-11 rounded-[10px] border-beni px-4 py-3 text-base text-beni hover:bg-beni/5"
          variant="outline"
          disabled={pending}
          onClick={() => setRemoving(true)}
        >
          {ui.remove}
        </Button>
      </div>
      <Button
        className="h-auto min-h-11 rounded-[10px] text-base"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setText(claim.textOriginal);
          setEditing(true);
        }}
      >
        {ui.edit}
      </Button>
      {editing && (
        <div className="space-y-3">
          <Label htmlFor={id}>{ui.edit}</Label>
          <Textarea
            id={id}
            lang={claim.langOriginal}
            value={text}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-auto min-h-11 rounded-[10px] text-base"
              disabled={pending || !text.trim()}
              onClick={() =>
                void run(
                  () => onEdit(claim._id, text),
                  () => setEditing(false),
                )
              }
            >
              {ui.save}
            </Button>
            <Button
              className="h-auto min-h-11 rounded-[10px] text-base"
              variant="outline"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              {ui.cancel}
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={removing}
        onOpenChange={(open) => {
          if (!pending) setRemoving(open);
        }}
      >
        <DialogContent lang={locale} showCloseButton={false}>
          <DialogTitle>{ui.remove}</DialogTitle>
          <DialogDescription>{ui.removeConfirmation}</DialogDescription>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button
            className="h-auto min-h-11 rounded-[10px] text-base"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              void run(
                () => onRemove(claim._id),
                () => setRemoving(false),
              )
            }
          >
            {ui.remove}
          </Button>
          <Button
            className="h-auto min-h-11 rounded-[10px] text-base"
            variant="outline"
            disabled={pending}
            onClick={() => setRemoving(false)}
          >
            {ui.cancel}
          </Button>
        </DialogContent>
      </Dialog>
    </ReadOnlyClaim>
  );
}

function TranslateControl({
  locale,
  onTranslate,
}: {
  locale: Locale;
  onTranslate: OwnerPlaceViewProps["onTranslate"];
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState<number>();
  const [error, setError] = useState<string>();
  async function run() {
    if (pending) return;
    setPending(true);
    setRequested(undefined);
    setError(undefined);
    try {
      setRequested((await onTranslate()).pending);
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-2">
      <p>{m.translateNote}</p>
      <Button
        className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
        type="button"
        disabled={pending}
        onClick={() => void run()}
      >
        {pending ? m.translating : m.translateButton}
      </Button>
      {requested !== undefined && (
        <p role="status">
          {requested > 0 ? format(m.translateRequested, { count: requested }) : m.translateNothing}
        </p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}

/** What withdrawing takes away, said plainly. Rendered inside a Dialog (it holds the title). */
export function WithdrawDialogBody({
  locale,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  locale: Locale;
  pending: boolean;
  error?: string;
  onConfirm(): void;
  onCancel(): void;
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  return (
    <>
      <DialogTitle>{m.withdrawTitle}</DialogTitle>
      <DialogDescription>{m.withdrawIntro}</DialogDescription>
      <ul className="list-disc space-y-1 pl-5">
        <li>{m.withdrawRecording}</li>
        <li>{m.withdrawTranscript}</li>
        <li>{m.withdrawClaims}</li>
        <li>{m.withdrawSentences}</li>
      </ul>
      <p className="font-medium">{m.withdrawIrreversible}</p>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button
        className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? m.withdrawing : m.withdrawConfirm}
      </Button>
      <Button
        className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onCancel}
      >
        {m.cancel}
      </Button>
    </>
  );
}

function WithdrawControl({
  locale,
  interviewId,
  onWithdraw,
}: {
  locale: Locale;
  interviewId: string;
  onWithdraw: OwnerPlaceViewProps["onWithdraw"];
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await onWithdraw(interviewId);
      setOpen(false);
    } catch (failure) {
      setError(errorText(failure, locale));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        className="h-auto min-h-11 rounded-[10px] px-4 py-3 text-base whitespace-normal"
        type="button"
        variant="outline"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {m.withdraw}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent lang={locale} showCloseButton={false}>
          <WithdrawDialogBody
            locale={locale}
            pending={pending}
            error={error}
            onConfirm={() => void confirm()}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  id,
  heading,
  intro,
  children,
}: {
  id: string;
  heading: string;
  intro: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-[22px] font-bold">
        {heading}
      </h2>
      <p>{intro}</p>
      {children}
    </section>
  );
}

function formatDate(milliseconds: number, locale: Locale): string {
  // UTC, like the footnotes on the public page, so a date reads the same on every device.
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", dateStyle: "medium" }).format(
    milliseconds,
  );
}

export function OwnerPlaceView(props: OwnerPlaceViewProps): React.JSX.Element {
  const { locale, region, place, claims, interviews } = props;
  if (place === null) return <OwnerNotFound locale={locale} />;
  const m = messagesFor(ownerMessages, locale);
  const label = placeLabel(
    place.names,
    locale,
    region,
    messagesFor(publicMessages, locale).unnamed,
  );
  const groups = groupClaims(claims);
  const counts = reviewCounts(claims, region.locales);
  const readOnly = (claim: OwnerClaim) => (
    <li key={claim._id}>
      <ReadOnlyClaim locale={locale} region={region} claim={claim}>
        <RemoveClaim locale={locale} claim={claim} onRemove={props.onRemove} />
      </ReadOnlyClaim>
    </li>
  );
  return (
    <div lang={locale} className="max-w-3xl space-y-8 leading-7 break-words text-kon">
      <p className="rounded-[14px] bg-kamenozoki p-4 text-lg font-bold">{m.publicationNote}</p>
      <header className="space-y-3">
        <a className={linkClass} href={localePath(locale, "/owner")}>
          {m.backToHome}
        </a>
        <h1 className="flex flex-wrap items-baseline gap-3 text-2xl font-semibold">
          <span lang={label.lang}>{label.text}</span>
          {place.isMock && <DemoBadge locale={locale} />}
        </h1>
        <p>
          <a
            className={linkClass}
            href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
          >
            {m.publicPage}
          </a>
        </p>
      </header>

      <Section id="owner-to-review" heading={m.toReviewHeading} intro={m.toReviewIntro}>
        {groups.toReview.length === 0 ? (
          <p>{m.toReviewEmpty}</p>
        ) : (
          <ul className="space-y-4">
            {groups.toReview.map((claim) =>
              ownerMayAct(claim) ? (
                <li key={claim._id}>
                  <ReviewCard
                    locale={locale}
                    region={region}
                    claim={claim}
                    onConfirm={props.onConfirm}
                    onEdit={props.onEdit}
                    onRemove={props.onRemove}
                  />
                </li>
              ) : (
                readOnly(claim)
              ),
            )}
          </ul>
        )}
      </Section>

      <Section id="owner-confirmed" heading={m.confirmedHeading} intro={m.confirmedIntro}>
        {counts.untranslated > 0 && (
          <TranslateControl locale={locale} onTranslate={props.onTranslate} />
        )}
        {groups.confirmed.length === 0 ? (
          <p>{m.confirmedEmpty}</p>
        ) : (
          <ul className="space-y-4">{groups.confirmed.map(readOnly)}</ul>
        )}
      </Section>

      <Section id="owner-published" heading={m.publishedHeading} intro={m.publishedIntro}>
        {groups.published.length === 0 ? (
          <p>{m.publishedEmpty}</p>
        ) : (
          <ul className="space-y-4">{groups.published.map(readOnly)}</ul>
        )}
      </Section>

      <Section id="owner-interviews" heading={m.interviewsHeading} intro={m.interviewsIntro}>
        {interviews.length === 0 ? (
          <p>{m.interviewsEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {interviews.map((interview) => (
              <li key={interview._id}>
                <Card lang={locale}>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <p>
                      {format(m.interviewTitle, { date: formatDate(interview.createdAt, locale) })}
                    </p>
                    <p>
                      {format(m.interviewLanguage, {
                        language: languageName(interview.language, locale),
                      })}
                    </p>
                    <p>{m[`interviewStatus_${interview.status}`]}</p>
                    {interview.isMock && <DemoBadge locale={locale} />}
                    {interview.status !== "withdrawn" && (
                      <WithdrawControl
                        locale={locale}
                        interviewId={interview._id}
                        onWithdraw={props.onWithdraw}
                      />
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
