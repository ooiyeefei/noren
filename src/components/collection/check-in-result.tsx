"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useDraft } from "@/components/drafts/drafts";
import { ErrorMessage } from "@/components/layout/error-message";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import {
  BODY_LIMIT,
  toWrittenArgs,
  type StoryRegion,
  type WrittenStoryArgs,
} from "@/components/place/add-story-form";
import { ShownAs, type ShownAsActions } from "@/components/place/shown-as";
import type { PublicRegionProps } from "@/components/public/mapping";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import type { CheckInOutcome, CheckInSpot } from "./check-in-card";
import { NextPanelCard, type SetLike } from "./next-panel-card";
import { Noren } from "./noren";

export type CheckInResultActions = {
  /** The member's own line, through the same path as any story they write here (FR-118). */
  writeLine(args: WrittenStoryArgs): Promise<unknown>;
  /** A normal "Still here". A check-in alone confirms nothing (FR-119). */
  stillHere(): Promise<unknown>;
  /** Set until the member has seen the name their line goes out under (FR-131). */
  shownAs?: ShownAsActions;
};

const SECONDARY =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-kon px-5 py-2 font-bold text-kon disabled:opacity-50";

function LineForm({
  locale,
  region,
  displayName,
  write,
  shownAs,
  draftName,
}: {
  locale: Locale;
  region: StoryRegion;
  displayName?: string;
  write: CheckInResultActions["writeLine"];
  shownAs?: ShownAsActions;
  draftName?: string;
}) {
  const m = messagesFor(collectionMessages, locale);
  const id = useId();
  const [body, setBody] = useDraft(draftName, "");
  const [pending, setPending] = useState(false);
  const [shared, setShared] = useState(false);
  const [problem, setProblem] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function share() {
    const prepared = toWrittenArgs({ url: "", note: "", title: "", author: "", body }, region);
    setProblem(!prepared.ok);
    if (!prepared.ok || busy.current || shownAs) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await write(prepared.args);
      setBody("");
      setShared(true);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (shared)
    return (
      <p role="status" data-line-shared="" className="font-bold">
        {m.lineShared}
      </p>
    );
  return (
    <div className="space-y-2 rounded-[10px] border border-line p-4">
      <label htmlFor={id} className="block font-bold">
        {m.whatDidYouHave}
      </label>
      <textarea
        id={id}
        value={body}
        maxLength={BODY_LIMIT}
        rows={2}
        placeholder={m.linePlaceholder}
        aria-invalid={problem || undefined}
        className="block w-full rounded-[10px] border border-input p-3 text-[16px]"
        onChange={(event) => setBody(event.target.value)}
      />
      {shownAs && <ShownAs locale={locale} hintId={`${id}-name`} actions={shownAs} />}
      {/* Sharing is the agreement to show it; saying so beside the button is the consent. */}
      <p id={`${id}-public`} className="text-[13px] text-muted-foreground">
        {displayName
          ? format(m.shownAs, { name: displayName })
          : messagesFor(addStoryMessages, locale).shownPublicly}
      </p>
      {problem && (
        <p role="alert" className="text-beni">
          {m.lineProblem}
        </p>
      )}
      {error !== null && <ErrorMessage error={error} locale={locale} />}
      <button
        type="button"
        disabled={pending || !!shownAs}
        aria-describedby={shownAs ? `${id}-public ${id}-name` : `${id}-public`}
        className={SECONDARY}
        onClick={() => void share()}
      >
        {pending ? m.sharingLine : m.shareLine}
      </button>
    </div>
  );
}

function StillHere({
  locale,
  press,
}: {
  locale: Locale;
  press: CheckInResultActions["stillHere"];
}) {
  const m = messagesFor(collectionMessages, locale);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  async function send() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await press();
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (done)
    return (
      <p role="status" className="font-bold">
        {m.stillHereDone}
      </p>
    );
  return (
    <div className="space-y-2">
      {error !== null && <ErrorMessage error={error} locale={locale} />}
      <button type="button" disabled={pending} className={SECONDARY} onClick={() => void send()}>
        {m.stillHere}
      </button>
    </div>
  );
}

/** One line a steward picked from the place's own story, with its AI label (FR-117). */
export function PeopleMention({
  locale,
  line,
}: {
  locale: Locale;
  line: { en: string; ja: string; postsRead: number };
}) {
  const m = messagesFor(collectionMessages, locale);
  return (
    <div data-people-mention="" className="space-y-1 rounded-[10px] bg-kamenozoki/60 p-4">
      <p className="font-bold">{m.peopleMention}</p>
      <p className="text-[16px]">{locale === "ja" ? line.ja : line.en}</p>
      <p className="text-[13px] text-muted-foreground">
        {format(m.aiLabel, { count: String(line.postsRead) })}
      </p>
    </div>
  );
}

/**
 * What follows a passed check-in, in order: the panel dyes, what people mention, what the person
 * had, "Still here", then the next panel. On the last panel it leads to the whole picture.
 */
export function CheckInResult({
  locale,
  region,
  outcome,
  pin,
  spot,
  set,
  stamp,
  displayName,
  setHref,
  actions,
  draftName,
}: {
  locale: Locale;
  region: PublicRegionProps;
  outcome: CheckInOutcome;
  pin: { lat: number; lng: number };
  spot: CheckInSpot;
  set?: SetLike | null;
  stamp?: React.ReactNode;
  displayName?: string;
  setHref: string;
  actions: CheckInResultActions;
  /** Keeps the member's unsent line through a reload. */
  draftName?: string;
}) {
  const m = messagesFor(collectionMessages, locale);
  const picked = spot.pickedLine;
  // The press removed the button that had focus, so reading the result starts from its heading.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const title =
    outcome.outcome === "dyed"
      ? format(m.dyedTitle, { panel: String(outcome.panelIndex + 1) })
      : outcome.outcome === "already_dyed"
        ? m.alreadyDyedTitle
        : m.alreadyHereTitle;
  return (
    <section data-check-in="done" data-check-in-outcome={outcome.outcome} className="space-y-4">
      <h2 ref={heading} tabIndex={-1} className="text-[22px] font-bold outline-none">
        {title}
      </h2>
      {set && (
        <Noren
          locale={locale}
          name={neighbourhoodName(set.names, locale)}
          panels={set.panels}
          panelCount={set.panelCount}
          fresh={outcome.outcome === "dyed" ? outcome.panelIndex : undefined}
        />
      )}
      {stamp}
      {picked && <PeopleMention locale={locale} line={picked} />}
      <LineForm
        locale={locale}
        region={region}
        displayName={displayName}
        write={actions.writeLine}
        shownAs={actions.shownAs}
        draftName={draftName}
      />
      <StillHere locale={locale} press={actions.stillHere} />
      {outcome.finished ? (
        <a
          data-see-whole=""
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 font-bold text-white"
          href={setHref}
        >
          {m.seeWhole}
        </a>
      ) : (
        set && <NextPanelCard locale={locale} region={region} set={set} from={pin} />
      )}
    </section>
  );
}
