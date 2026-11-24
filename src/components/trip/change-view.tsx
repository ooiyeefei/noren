"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { TRIP_CONSENT_VERSION } from "@/lib/trip/consent";
import type { TripInterpretation } from "@/lib/trip/interpret";
import type { ChangeOp, Plan } from "@/lib/trip/types";
import { matchTraveller } from "./own-words-apply";
import { tripSendRejected } from "./plan-consent";
import { buttonClass, fieldClass, helpClass, quietButtonClass } from "./route-step";
import { choiceText, reasonText } from "./unmet-banner";

// The change page (T110, T111): say what changed, by a button or in words, and see what moved. The
// buttons call no model. Words are read by Noren's AI into suggestions that are applied only on
// yes. A refused change says which rule, limit or rest it would break and leaves the plan alone.
// A plain component: the container makes the change and keeps it on the phone.

/** One stop that moved, as the page can say it. `was` and `now` are names, not ids. */
export type MovedLine = { slot: string; day?: number; was?: string; now?: string; why: string };
export type ChangeEntry = { at: number; saidAs: string; moved: MovedLine[] };

export type LastResult =
  | { kind: "applied"; saidAs: string; moved: MovedLine[]; unmet: Plan["unmet"] }
  | { kind: "refused"; unmet: Plan["unmet"] }
  | { kind: "undone" };

export type ChangeDay = {
  index: number;
  stops: { slot: string; name: string; done: boolean }[];
};

export type ChangeTraveller = { key: string; label: string; hasLikes: boolean };

/** How an op is said in words, in the organiser's labels and the stop and town names. */
export type OpNames = {
  who(key: string): string;
  stop(slot: string): string;
  town(id: string): string;
};

export function opText(locale: Locale, op: ChangeOp, names: OpNames): string {
  const m = messagesFor(tripMessages, locale);
  switch (op.op) {
    case "lighten":
      return format(m.opLighten, { n: op.day });
    case "quieter":
      return op.day === undefined ? m.opQuieterAll : format(m.opQuieter, { n: op.day });
    case "shorter_walks":
      return op.day === undefined ? m.opShorterAll : format(m.opShorter, { n: op.day });
    case "more_for":
      return op.day === undefined
        ? format(m.opMoreFor, { who: names.who(op.who) })
        : format(m.opMoreForDay, { who: names.who(op.who), n: op.day });
    case "skip":
      return format(m.opSkip, { stop: names.stop(op.slot) });
    case "redraw":
      return format(m.opRedraw, { stop: names.stop(op.slot) });
    case "stay_longer":
      return format(m.opStay, { minutes: op.minutes, stop: names.stop(op.slot) });
    case "add_pin":
      return format(m.opPin, { n: op.pin.day });
    case "move_night":
      return format(m.opNight, { n: op.night, town: names.town(op.to) });
    case "weather":
      return format(op.kind === "rain" ? m.opRain : m.opHeat, { n: op.day });
  }
}

function dayLabel(m: Record<string, string>, day: number | undefined): string {
  return day === undefined ? "" : `${format(m.movedDay!, { n: day })} `;
}

/** What moved, each with its plain reason. What stayed the same is not mentioned. */
export function MovedList({
  locale,
  moved,
}: {
  locale: Locale;
  moved: readonly MovedLine[];
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale) as Record<string, string>;
  return (
    <ul className="space-y-3">
      {moved.map((line, index) => {
        const was = line.was ?? m.movedUnknown!;
        const now = line.now ?? m.movedUnknown!;
        const sentence =
          line.why === "done"
            ? format(m.movedDone!, { was: line.was ?? now })
            : line.now === undefined
              ? format(m.movedLeft!, { was })
              : line.was === undefined
                ? format(m.movedAdded!, { now })
                : format(m.movedChanged!, { was, now });
        return (
          <li key={`${line.slot}-${index}`} className="space-y-0.5">
            <p className="font-bold break-words">
              {dayLabel(m, line.day)}
              {sentence}
            </p>
            <p className="text-[15px]">{reasonText(locale, line.why)}</p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A refused change: the rule, limit or rest it would break in plain words, the choices Noren
 * returned, and a line that the plan on screen is as it was (FR-329). Nothing is loosened.
 */
export function RefusedNotice({
  locale,
  unmet,
  onDismiss,
}: {
  locale: Locale;
  unmet: Plan["unmet"];
  onDismiss?(): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      role="alert"
      className="max-w-3xl space-y-3 rounded-[10px] border border-beni bg-white p-4"
    >
      <h2 id={`${id}-title`} className="font-sans text-[20px] font-bold">
        {m.refusedHeading}
      </h2>
      <p className="font-bold">{m.refusedUnchanged}</p>
      <ul className="space-y-3">
        {unmet.map((entry, index) => (
          <li key={`${entry.detail}-${entry.slot ?? ""}-${index}`} className="space-y-2">
            <p>
              {entry.day !== undefined && (
                <span className="font-bold">{format(m.movedDay, { n: entry.day })} </span>
              )}
              {reasonText(locale, entry.detail)}
            </p>
            {entry.choices.length > 0 && (
              <div className="space-y-1">
                <p className="text-[14px] font-bold text-muted-foreground">{m.unmetChoices}</p>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {entry.choices.map((choice) => (
                    <li key={choice}>
                      {onDismiss && (choice === "keep_plan" || choice === "choose_another_change") ? (
                        <button type="button" className={quietButtonClass} onClick={onDismiss}>
                          {choiceText(locale, choice)}
                        </button>
                      ) : (
                        <span>{choiceText(locale, choice)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The box for typed or spoken changes (T111)

type Suggestion = {
  id: string;
  op: ChangeOp | { op: "more_for"; day?: number };
  saidAs: string;
  /** For a turn: the words that point at a person. */
  about?: string;
};
type Outcome = "applied" | "dismissed";

function SuggestedChange({
  locale,
  suggestion,
  sent,
  travellers,
  names,
  busy,
  onApply,
  onDismiss,
}: {
  locale: Locale;
  suggestion: Suggestion;
  sent: string;
  travellers: readonly ChangeTraveller[];
  names: OpNames;
  busy: boolean;
  onApply(op: ChangeOp, saidAs: string, consentVersion: string): void;
  onDismiss(): void;
}) {
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const turn = suggestion.op.op === "more_for";
  const matched = turn ? matchTraveller(suggestion.about ?? "", travellers) : undefined;
  const [picked, setPicked] = useState("");
  const who = matched ?? (picked || undefined);
  const op: ChangeOp | undefined =
    suggestion.op.op === "more_for"
      ? who === undefined
        ? undefined
        : { op: "more_for", who, ...(suggestion.op.day !== undefined && { day: suggestion.op.day }) }
      : suggestion.op;
  const words = suggestion.saidAs && sent.includes(suggestion.saidAs) ? suggestion.saidAs : undefined;
  return (
    <li className="space-y-2 rounded-[10px] border border-line bg-white p-3">
      <p className="text-[13px] font-bold text-muted-foreground">{m.ownByAi}</p>
      <p className="font-bold break-words">
        {op
          ? opText(locale, op, names)
          : opText(locale, { ...suggestion.op, who: "" } as ChangeOp, { ...names, who: () => m.ownFallbackWho })}
      </p>
      {words && <p className="text-[15px] break-words">{format(m.ownYouSaid, { words })}</p>}
      {turn && matched === undefined && (
        <div className="space-y-1">
          <label htmlFor={`${id}-who`} className="block font-bold">
            {m.ownWho}
          </label>
          <p className={helpClass}>
            {suggestion.about?.trim()
              ? format(m.ownWhoAsk, { about: suggestion.about.trim() })
              : m.ownWhoAskBlank}
          </p>
          <select
            id={`${id}-who`}
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            className={fieldClass}
          >
            <option value="">{m.ownWhoChoose}</option>
            {travellers
              .filter((t) => t.hasLikes)
              .map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label.trim() || t.key}
                </option>
              ))}
          </select>
        </div>
      )}
      <p id={`${id}-apply`} className={helpClass}>
        {m.changeSendConsent} {m.partyConsent}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          aria-describedby={`${id}-apply`}
          disabled={op === undefined || busy}
          onClick={() => op && onApply(op, words ?? sent, TRIP_CONSENT_VERSION)}
        >
          {m.typedApply}
        </button>
        <button type="button" className={quietButtonClass} onClick={onDismiss}>
          {m.ownDismiss}
        </button>
      </div>
    </li>
  );
}

export type ChangeWordsProps = {
  locale: Locale;
  travellers: readonly ChangeTraveller[];
  names: OpNames;
  /** False until the organiser has been told, once, what is sent where. Undefined while unknown. */
  noticeSeen: boolean | undefined;
  onNoticeSeen(): void;
  busy: boolean;
  /** Sends the words and the version agreed to at the read button. */
  interpret(words: string, consentVersion: string): Promise<TripInterpretation>;
  onApply(op: ChangeOp, saidAs: string, consentVersion: string): void;
  voice?(onText: (text: string) => void): React.ReactNode;
};

export function ChangeWords(props: ChangeWordsProps): React.JSX.Element {
  const { locale } = props;
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const [words, setWords] = useState("");
  const [sent, setSent] = useState("");
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState<"failed" | "invalid_input">();
  const [found, setFound] = useState<Suggestion[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  async function read() {
    const text = words.trim();
    if (text === "" || reading) return;
    setReading(true);
    setFailed(undefined);
    try {
      const reply = await props.interpret(text, TRIP_CONSENT_VERSION);
      if (reply.state === "plain") {
        setFailed("failed");
        setFound(null);
      } else {
        setSent(text);
        setOutcomes({});
        setFound(
          reply.ops.slice(0, 6).map(
            (entry, i): Suggestion => ({
              id: `c${i}`,
              op: entry.op,
              saidAs: entry.saidAs,
              ...("about" in entry && { about: entry.about }),
            }),
          ),
        );
      }
    } catch (error) {
      setFailed(tripSendRejected(error) ? "invalid_input" : "failed");
      setFound(null);
    } finally {
      setReading(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="max-w-2xl space-y-4 rounded-[10px] border border-line bg-white p-4"
    >
      <h2 id={`${id}-title`} className="font-sans text-[20px] font-bold">
        {m.typedTitle}
      </h2>
      <p>{m.typedIntro}</p>
      {props.noticeSeen === false ? (
        <div role="note" className="space-y-2 rounded-[10px] bg-kamenozoki p-4">
          <h3 className="font-bold">{m.ownNoticeTitle}</h3>
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            <li>{m.ownNoticeKept}</li>
            <li>{m.ownNoticeServers}</li>
            <li>{m.ownNoticeAi}</li>
          </ul>
          <button type="button" className={buttonClass} onClick={props.onNoticeSeen}>
            {m.ownNoticeOk}
          </button>
        </div>
      ) : (
        props.noticeSeen === true && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor={`${id}-words`} className="block font-bold">
                {m.typedLabel}
              </label>
              <textarea
                id={`${id}-words`}
                rows={3}
                maxLength={700}
                value={words}
                placeholder={m.typedPlaceholder}
                onChange={(event) => setWords(event.target.value)}
                className="min-h-24 w-full rounded-[10px] border border-input bg-background p-3 text-base"
              />
            </div>
            {props.voice && (
              <div className="space-y-1">
                <p className={helpClass}>{m.voiceSendConsent} {m.partyConsent}</p>
                {props.voice((text) => setWords((w) => (w.trim() ? `${w.trim()} ${text}` : text)))}
                <p className={helpClass}>{ m.ownVoiceNote }</p>
              </div>
            )}
            <p id={`${id}-send`} className={helpClass}>
              {m.changeWordsSendConsent} {m.partyConsent}
            </p>
            <button
              type="button"
              className={buttonClass}
              aria-describedby={`${id}-send`}
              disabled={reading || words.trim() === ""}
              onClick={() => void read()}
            >
              {reading ? m.ownReading : m.ownRead}
            </button>
          </div>
        )
      )}
      {failed && (
        <p role="alert" className="font-bold text-beni">
          {failed === "invalid_input" ? m.tripSendRejected : m.typedFailed}
        </p>
      )}
      {found && found.length === 0 && <p role="status">{m.typedNothing}</p>}
      {found && found.length > 0 && (
        <ul className="space-y-3">
          {found.map((suggestion) =>
            outcomes[suggestion.id] ? (
              <li key={suggestion.id} role="status" className="text-[15px] text-muted-foreground">
                {outcomes[suggestion.id] === "applied" ? m.typedApplied : m.ownDismissed}
              </li>
            ) : (
              <SuggestedChange
                key={suggestion.id}
                locale={locale}
                suggestion={suggestion}
                sent={sent}
                travellers={props.travellers}
                names={props.names}
                busy={props.busy}
                onApply={(op, saidAs, consentVersion) => {
                  props.onApply(op, saidAs, consentVersion);
                  setOutcomes((o) => ({ ...o, [suggestion.id]: "applied" }));
                }}
                onDismiss={() => setOutcomes((o) => ({ ...o, [suggestion.id]: "dismissed" }))}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The page

export type ChangeViewProps = {
  locale: Locale;
  tripId: string;
  days: readonly ChangeDay[];
  /** Nights the trip has, and the towns one can be moved to. */
  nightCount: number;
  towns: readonly { id: string; name: string }[];
  travellers: readonly ChangeTraveller[];
  /** The day offered first: today's, else the first with work left. */
  today: number;
  busy: boolean;
  offline: boolean;
  problem?: "failed" | "offline" | "invalid_input";
  last?: LastResult;
  onDismissLast?(): void;
  canUndo: boolean;
  onUndo(): void;
  /** What was said or pressed, oldest first as the phone keeps them. */
  changes: readonly ChangeEntry[];
  names: OpNames;
  onChange(ops: ChangeOp[], saidAs: string, consentVersion: string): void;
  /** The box for typed words; a container supplies it because it talks to the server. */
  words?: React.ReactNode;
};

const ALL = 0;

export function ChangeView(props: ChangeViewProps): React.JSX.Element {
  const { locale } = props;
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  const [day, setDay] = useState(props.today);
  const [slot, setSlot] = useState("");
  const [night, setNight] = useState(1);
  const [town, setTown] = useState("");
  const blocked = props.busy || props.offline;
  const one = day === ALL ? undefined : day;
  const stops = props.days.flatMap((d) =>
    d.stops.filter((s) => !s.done).map((s) => ({ ...s, day: d.index })),
  );
  const chosenSlot = slot || stops[0]?.slot || "";
  const planHref = localePath(locale, `/trip/${encodeURIComponent(props.tripId)}`);
  const withLikes = props.travellers.filter((t) => t.hasLikes && t.label.trim() !== "");
  const press = (ops: ChangeOp[], saidAs: string) => () =>
    props.onChange(ops, saidAs, TRIP_CONSENT_VERSION);
  return (
    <div className="space-y-8" lang={locale}>
      <p className="max-w-prose text-[17px]">{m.changeIntro}</p>
      {props.offline && (
        <p role="status" className="max-w-3xl rounded-[10px] bg-kamenozoki p-3 font-bold">
          {m.changeOffline}
        </p>
      )}
      {props.busy && (
        <p role="status" className="font-bold">
          {m.planChanging}
        </p>
      )}
      {props.problem && (
        <p role="alert" className="max-w-3xl font-bold text-beni">
          {props.problem === "invalid_input"
            ? m.tripSendRejected
            : props.problem === "offline" ? m.planOfflineChange : m.planChangeFailed}
        </p>
      )}

      {props.last?.kind === "refused" && (
        <RefusedNotice locale={locale} unmet={props.last.unmet} onDismiss={props.onDismissLast} />
      )}
      {props.last?.kind === "undone" && (
        <p role="status" className="max-w-3xl rounded-[10px] bg-kamenozoki p-3 font-bold">
          {m.changeUndone}
        </p>
      )}
      {props.last?.kind === "applied" && (
        <section
          aria-labelledby={`${id}-moved`}
          className="max-w-3xl space-y-3 rounded-[10px] border border-line bg-white p-4"
        >
          <h2 id={`${id}-moved`} className="font-sans text-[20px] font-bold">
            {m.movedHeading}
          </h2>
          <p className="break-words text-[15px] text-muted-foreground">
            {format(m.movedFor, { said: props.last.saidAs })}
          </p>
          {props.last.moved.length > 0 ? (
            <MovedList locale={locale} moved={props.last.moved} />
          ) : (
            <p>{m.movedNothing}</p>
          )}
          {props.last.unmet.length > 0 && (
            <div className="space-y-2 border-t border-line pt-3">
              <h3 className="font-bold">{m.couldNotChange}</h3>
              <ul className="space-y-1">
                {props.last.unmet.map((entry, index) => (
                  <li key={`${entry.detail}-${entry.slot ?? ""}-${index}`}>
                    {dayLabel(m as Record<string, string>, entry.day)}
                    {reasonText(locale, entry.detail)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby={`${id}-quick`} className="max-w-3xl space-y-4">
        <h2 id={`${id}-quick`} className="font-sans text-[20px] font-bold">
          {m.quickHeading}
        </h2>
        <p className={helpClass}>{m.changeSendConsent} {m.partyConsent}</p>
        <div className="max-w-xs space-y-1">
          <label htmlFor={`${id}-day`} className="block font-bold">
            {m.changeDayLabel}
          </label>
          <select
            id={`${id}-day`}
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
            className={fieldClass}
          >
            <option value={ALL}>{m.changeAllDays}</option>
            {props.days.map((d) => (
              <option key={d.index} value={d.index}>
                {d.index === props.today
                  ? format(m.changeDayToday, { n: d.index })
                  : format(m.planDay, { n: d.index })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={blocked}
            onClick={press([{ op: "quieter", ...(one && { day: one }) }], m.btnQuieter)}
          >
            {m.btnQuieter}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={blocked}
            onClick={press([{ op: "shorter_walks", ...(one && { day: one }) }], m.btnShorter)}
          >
            {m.btnShorter}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={blocked || one === undefined}
            onClick={press([{ op: "lighten", day: one! }], m.btnTired)}
          >
            {m.btnTired}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={blocked || one === undefined}
            onClick={press([{ op: "weather", day: one!, kind: "rain" }], m.btnRain)}
          >
            {m.btnRain}
          </button>
        </div>
        {one === undefined && <p className={helpClass}>{m.changeNeedsDay}</p>}
        {withLikes.length > 0 ? (
          <div className="space-y-2">
            <p className="font-bold">{m.btnMoreForHeading}</p>
            <div className="flex flex-wrap gap-3">
              {withLikes.map((t) => {
                const said = format(m.btnMoreFor, { label: t.label.trim() });
                return (
                  <button
                    key={t.key}
                    type="button"
                    className={quietButtonClass}
                    disabled={blocked}
                    onClick={press([{ op: "more_for", who: t.key, ...(one && { day: one }) }], said)}
                  >
                    {said}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className={helpClass}>{m.btnMoreForNone}</p>
        )}
        <details className="rounded-[10px] border border-line bg-white p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-bold">{m.btnLonger}</summary>
          <div className="space-y-3 pt-2">
            {stops.length === 0 ? (
              <p className={helpClass}>{m.changeNoStops}</p>
            ) : (
              <>
                <div className="space-y-1">
                  <label htmlFor={`${id}-stop`} className="block font-bold">
                    {m.changeStopLabel}
                  </label>
                  <select
                    id={`${id}-stop`}
                    value={chosenSlot}
                    onChange={(event) => setSlot(event.target.value)}
                    className={fieldClass}
                  >
                    {stops.map((s) => (
                      <option key={s.slot} value={s.slot}>
                        {format(m.planDay, { n: s.day })}: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={blocked}
                  onClick={press(
                    [{ op: "stay_longer", slot: chosenSlot, minutes: 30 }],
                    m.btnLonger,
                  )}
                >
                  {m.btnLongerGo}
                </button>
              </>
            )}
          </div>
        </details>
        {props.nightCount > 0 && props.towns.length > 0 && (
          <details className="rounded-[10px] border border-line bg-white p-4">
            <summary className="min-h-11 cursor-pointer py-2 font-bold">{m.btnNight}</summary>
            <div className="space-y-3 pt-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor={`${id}-night`} className="block font-bold">
                    {m.changeNightLabel}
                  </label>
                  <select
                    id={`${id}-night`}
                    value={night}
                    onChange={(event) => setNight(Number(event.target.value))}
                    className={fieldClass}
                  >
                    {Array.from({ length: props.nightCount }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {format(m.nightLabel, { n })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${id}-town`} className="block font-bold">
                    {m.changeTownLabel}
                  </label>
                  <select
                    id={`${id}-town`}
                    value={town}
                    onChange={(event) => setTown(event.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{m.townNone}</option>
                    {props.towns.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={blocked || town === ""}
                onClick={press([{ op: "move_night", night, to: town }], m.btnNight)}
              >
                {m.btnNightGo}
              </button>
            </div>
          </details>
        )}
      </section>

      {props.words}

      <section aria-labelledby={`${id}-undo`} className="max-w-3xl space-y-2">
        <h2 id={`${id}-undo`} className="font-sans text-[20px] font-bold">
          {m.undoHeading}
        </h2>
        <p className={helpClass}>{m.undoHelp}</p>
        <button
          type="button"
          className={quietButtonClass}
          disabled={!props.canUndo || props.busy}
          onClick={props.onUndo}
        >
          {m.undoButton}
        </button>
      </section>

      <section aria-labelledby={`${id}-list`} className="max-w-3xl space-y-3">
        <h2 id={`${id}-list`} className="font-sans text-[20px] font-bold">
          {m.changesHeading}
        </h2>
        {props.changes.length === 0 ? (
          <p>{m.changesNone}</p>
        ) : (
          <ol className="space-y-4">
            {[...props.changes].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="space-y-2 border-l-4 border-line pl-4">
                <p className="break-words font-bold">{entry.saidAs}</p>
                <p className="text-[14px] text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(entry.at)}
                </p>
                {entry.moved.length > 0 ? (
                  <MovedList locale={locale} moved={entry.moved} />
                ) : (
                  <p className="text-[15px]">{m.movedNothing}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link className="inline-flex min-h-11 items-center text-ai underline" href={planHref}>
        {m.changeBackToPlan}
      </Link>
    </div>
  );
}
