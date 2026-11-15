"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationRead } from "@/lib/collection/location";
import { format, type Locale } from "@/lib/i18n";
import type { WalkMessageTable } from "@/lib/i18n/messages/walk";
import { checkDoor, knockAtDoor, type DoorResult } from "@/lib/slip/door";
import { answersParam, starterText, type AnswerRef } from "@/lib/slip/question";
import type { Fix, Pin, SlipQuestion } from "@/lib/walk/types";
import { cn } from "@/lib/utils";

/** What the seal needs from the page. Nothing in it reaches Noren: the door is checked on the phone. */
export type DoorProps = {
  /** The seal is open (kept on this device). */
  opened: boolean;
  /** Called once when the seal opens, by any of the three ways. */
  onOpen(): void;
  /** The walk's latest reading, if a walk is on. */
  position: Fix | null;
  /** The collection's allowance for the phone's own error. */
  accuracyAllowanceMetres: number;
  /** One reading of the phone's position, on a press (readLocation). */
  locate(): Promise<LocationRead>;
};

const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 text-[17px] font-bold text-white disabled:opacity-50";
const OUTLINE =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[10px] border-2 border-kon px-5 py-2 text-[17px] font-bold text-kon disabled:opacity-50";

/** The words of a slip's question, or undefined for a starter this version no longer has. */
export function questionText(question: SlipQuestion, locale: Locale): string | undefined {
  return question.kind === "story" ? question.text : starterText(question.key, locale);
}

/** The reference a story written from this question carries (the `answers` link parameter). */
export function answerRefOf(question: SlipQuestion): AnswerRef {
  return question.kind === "story"
    ? { kind: "story", storyId: question.storyId }
    : { kind: "starter", key: question.key };
}

/**
 * The question inside a slip. Sealed, it says so; it opens at the door, by a reading that puts the
 * phone within SLIP_OPEN_METRES of the place, or on a press of "Open without location". The
 * distance is worked out here, on the phone, and nothing is sent when the seal opens.
 */
export function SealedQuestion({
  locale,
  m,
  question,
  placePath,
  pin,
  door,
}: {
  locale: Locale;
  m: WalkMessageTable;
  question: SlipQuestion;
  /** The place page's path, without a query. */
  placePath: string;
  pin: Pin;
  door: DoorProps;
}) {
  const { opened, onOpen, position, accuracyAllowanceMetres, locate } = door;
  const text = questionText(question, locale);
  const [result, setResult] = useState<DoorResult | null>(null);
  const [locating, setLocating] = useState(false);
  // A seal that is already open when the card appears is not announced or animated again.
  const [startedSealed] = useState(!opened);
  const justOpened = startedSealed && opened;
  const opening = useRef<HTMLDivElement>(null);

  // A walk's readings open the seal as soon as one puts the phone at the door.
  useEffect(() => {
    if (opened || position === null) return;
    if (checkDoor(position, pin, accuracyAllowanceMetres).kind === "open") onOpen();
  }, [opened, position, pin, accuracyAllowanceMetres, onOpen]);
  // The buttons are gone once it opens, so focus goes to what they revealed.
  useEffect(() => {
    if (justOpened) opening.current?.focus({ preventScroll: true });
  }, [justOpened]);

  if (text === undefined) return null;

  async function atTheDoor() {
    setLocating(true);
    setResult(null);
    const answer = await knockAtDoor(locate, pin, accuracyAllowanceMetres);
    setLocating(false);
    if (answer.kind === "open") onOpen();
    else setResult(answer);
  }

  const status = locating
    ? m.locating
    : result?.kind === "far"
      ? format(m.doorFar, { metres: result.metres.toLocaleString(locale) })
      : result?.kind === "rough"
        ? format(m.doorRough, { metres: result.accuracy.toLocaleString(locale) })
        : result?.kind === "none"
          ? m.doorNone
          : justOpened
            ? m.sealOpened
            : "";
  const asked =
    question.kind === "story"
      ? question.askedBy
        ? format(m.askedByName, { name: question.askedBy })
        : m.askedBySomeone
      : m.askedStarter;
  const ref = answerRefOf(question);
  const newTab = { target: "_blank", rel: "noopener" } as const;

  return (
    <div data-slip-question-box="" className="space-y-3">
      <div role="status" aria-live="polite" className="font-bold empty:hidden">
        {status}
      </div>
      {opened ? (
        <div
          ref={opening}
          tabIndex={-1}
          data-slip-question=""
          className={cn(
            "space-y-3 rounded-[10px] border-2 border-kon/30 p-4 focus:outline-none",
            justOpened && "slip-reveal",
          )}
        >
          <p className="text-[15px] font-bold text-muted-foreground">{asked}</p>
          <p
            lang={question.kind === "story" ? question.lang : locale}
            className="text-[20px] leading-snug font-bold [overflow-wrap:anywhere]"
          >
            {text}
          </p>
          <a
            data-slip-write=""
            className={BUTTON}
            href={`${placePath}?tab=stories&write=1&answers=${answersParam(ref)}`}
            {...newTab}
          >
            {m.writeHeard}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </div>
      ) : (
        <div
          data-slip-sealed=""
          className="space-y-3 rounded-[10px] border-2 border-dashed border-beni/70 bg-kamenozoki/60 p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-beni text-[20px] font-bold text-white"
            >
              封
            </span>
            <div className="space-y-1">
              <p className="font-bold">{m.sealedTitle}</p>
              <p>{m.sealedLine}</p>
            </div>
          </div>
          {position === null ? (
            <button
              type="button"
              data-slip-door=""
              className={BUTTON}
              disabled={locating}
              onClick={() => void atTheDoor()}
            >
              {m.atTheDoor}
            </button>
          ) : (
            <p className="text-[15px]">{m.sealWalking}</p>
          )}
          <button
            type="button"
            data-slip-open-without=""
            className={OUTLINE}
            disabled={locating}
            onClick={onOpen}
          >
            {m.openWithout}
          </button>
          <p className="text-[15px] text-muted-foreground">{m.sealPrivacy}</p>
        </div>
      )}
    </div>
  );
}
