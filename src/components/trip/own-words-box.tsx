"use client";

import { useId, useState } from "react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { TripInterpretation, TripProposal } from "@/lib/trip/interpret";
import { TRIP_QUESTIONS } from "@/lib/trip/vocabulary";
import { matchTraveller, needsTraveller, proposalText, type Who } from "./own-words-apply";
import { buttonClass, fieldClass, helpClass, quietButtonClass } from "./route-step";

// The box to say it in your own words (T077) and the follow-up questions (T078, the page part).
// Everything the AI step returns is a suggestion beside the words it rests on, kept only on yes.
// A plain component: the container sends the words and applies what is accepted.

export type OwnWordsTraveller = { key: string; label: string };

export type OwnWordsBoxProps = {
  locale: Locale;
  travellers: readonly OwnWordsTraveller[];
  /** False until the organiser has been told, once, what is sent where. Undefined while unknown. */
  noticeSeen: boolean | undefined;
  onNoticeSeen(): void;
  /** Sends the words to the AI step. A throw, or a result in the plain state, reads as "failed". */
  interpret(words: string): Promise<TripInterpretation>;
  /** Keep one suggestion. `who` is the traveller it is for; `fresh` adds a new one. */
  onAccept(proposal: TripProposal, who: Who | undefined): void;
  /** False when the party already has as many people as a trip can hold. */
  canAddTraveller: boolean;
  /** The voice input, given the place to put the words it hears. */
  voice?(onText: (text: string) => void): React.ReactNode;
};

type Entry =
  | { id: string; kind: "suggestion"; proposal: TripProposal; saidAs: string }
  | { id: string; kind: "question"; qid: string; ifYes: TripProposal; ifNo?: TripProposal };
type Outcome = "accepted" | "dismissed";

/** Who a suggestion is for: matched from the words, or asked when it cannot be. */
function WhoPick({
  locale,
  about,
  travellers,
  canAddTraveller,
  value,
  onChange,
}: {
  locale: Locale;
  about: string;
  travellers: readonly OwnWordsTraveller[];
  canAddTraveller: boolean;
  value: string;
  onChange(value: string): void;
}) {
  const m = messagesFor(tripMessages, locale);
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-bold">
        {m.ownWho}
      </label>
      <p className={helpClass}>
        {about.trim() ? format(m.ownWhoAsk, { about: about.trim() }) : m.ownWhoAskBlank}
      </p>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        <option value="">{m.ownWhoChoose}</option>
        {travellers.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label.trim() || t.key}
          </option>
        ))}
        {canAddTraveller && <option value="@new">{m.ownWhoNew}</option>}
      </select>
      {!canAddTraveller && <p className={helpClass}>{m.ownTravellersFull}</p>}
    </div>
  );
}

function Suggestion({
  locale,
  proposal,
  words,
  travellers,
  canAddTraveller,
  onAccept,
  onDismiss,
}: {
  locale: Locale;
  proposal: TripProposal;
  /** The words it rests on; left out for a question, which rests on the organiser's yes. */
  words?: string;
  travellers: readonly OwnWordsTraveller[];
  canAddTraveller: boolean;
  onAccept(who: Who | undefined): void;
  onDismiss(): void;
}) {
  const m = messagesFor(tripMessages, locale);
  const matched = needsTraveller(proposal)
    ? matchTraveller(proposal.about, travellers)
    : undefined;
  const [picked, setPicked] = useState("");
  const wants = needsTraveller(proposal);
  const key = matched ?? (picked && picked !== "@new" ? picked : undefined);
  const ready = !wants || key !== undefined || (picked === "@new" && canAddTraveller);
  const label = travellers.find((t) => t.key === key)?.label.trim();
  const who =
    label || (picked === "@new" ? proposal.about.trim() : "") || m.ownFallbackWho;
  return (
    <li className="space-y-2 rounded-[10px] border border-line bg-white p-3">
      <p className="text-[13px] font-bold text-muted-foreground">{m.ownByAi}</p>
      <p className="font-bold break-words">{proposalText(locale, proposal, who)}</p>
      {words && <p className="text-[15px] break-words">{format(m.ownYouSaid, { words })}</p>}
      {wants && matched === undefined && (
        <WhoPick
          locale={locale}
          about={proposal.about}
          travellers={travellers}
          canAddTraveller={canAddTraveller}
          value={picked}
          onChange={setPicked}
        />
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={!ready}
          onClick={() =>
            onAccept(
              !wants
                ? undefined
                : key !== undefined
                  ? { key }
                  : { fresh: proposal.about.trim().slice(0, 40) },
            )
          }
        >
          {m.ownAccept}
        </button>
        <button type="button" className={quietButtonClass} onClick={onDismiss}>
          {m.ownDismiss}
        </button>
      </div>
    </li>
  );
}

export function OwnWordsBox(props: OwnWordsBoxProps): React.JSX.Element {
  const { locale, travellers } = props;
  const m = messagesFor(tripMessages, locale);
  const m_ = m as Record<string, string>;
  const id = useId();
  const [words, setWords] = useState("");
  const [sent, setSent] = useState("");
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  // A question answered yes, with a person still to choose, waits here.
  const [answered, setAnswered] = useState<Record<string, TripProposal | "no">>({});
  const settle = (entry: string, outcome: Outcome) =>
    setOutcomes((o) => ({ ...o, [entry]: outcome }));

  async function read() {
    const text = words.trim();
    if (text === "" || reading) return;
    setReading(true);
    setFailed(false);
    try {
      const reply = await props.interpret(text);
      if (reply.state === "plain") {
        setFailed(true);
        setEntries(null);
      } else {
        setSent(text);
        setOutcomes({});
        setAnswered({});
        setEntries([
          ...reply.proposals.map(
            (proposal, i): Entry => ({
              id: `s${i}`,
              kind: "suggestion",
              proposal,
              saidAs: proposal.saidAs,
            }),
          ),
          // A question with no wording of its own is not shown.
          ...reply.questions.flatMap((q): Entry[] =>
            m_[`question_${q.id.replaceAll("-", "_")}`] !== undefined &&
            TRIP_QUESTIONS.some((known) => known.id === q.id)
              ? [{ id: `q-${q.id}`, kind: "question", qid: q.id, ifYes: q.ifYes, ifNo: q.ifNo }]
              : [],
          ),
        ]);
      }
    } catch {
      setFailed(true);
      setEntries(null);
    } finally {
      setReading(false);
    }
  }

  const suggestions = entries?.filter((e) => e.kind === "suggestion") ?? [];
  const questions = entries?.filter((e) => e.kind === "question") ?? [];
  const open = (entry: Entry) => outcomes[entry.id] === undefined;
  const settledLine = (entry: Entry) =>
    outcomes[entry.id] ? (
      <li key={entry.id} role="status" className="text-[15px] text-muted-foreground">
        {outcomes[entry.id] === "accepted" ? m.ownAccepted : m.ownDismissed}
      </li>
    ) : null;
  return (
    <section aria-labelledby={`${id}-title`} className="max-w-2xl space-y-4 rounded-[10px] border border-line bg-white p-4">
      <h2 id={`${id}-title`} className="font-sans text-[20px] font-bold">
        {m.ownTitle}
      </h2>
      <p>{m.ownIntro}</p>
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
                {m.ownLabel}
              </label>
              <textarea
                id={`${id}-words`}
                rows={4}
                maxLength={1000}
                value={words}
                placeholder={m.ownPlaceholder}
                onChange={(event) => setWords(event.target.value)}
                className="min-h-24 w-full rounded-[10px] border border-input bg-background p-3 text-base"
              />
            </div>
            {props.voice && (
              <div className="space-y-1">
                <p className={helpClass}>{m.voiceSendConsent} {m.partyConsent}</p>
                {props.voice((text) => setWords((w) => (w.trim() ? `${w.trim()} ${text}` : text)))}
                <p className={helpClass}>{m.ownVoiceNote}</p>
              </div>
            )}
            <p id={`${id}-send`} className={helpClass}>
              {m.ownSendConsent} {m.partyConsent}
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
          {m.ownFailed}
        </p>
      )}
      {entries && suggestions.length === 0 && questions.length === 0 && (
        <p role="status">{m.ownNothing}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="space-y-3">
          {suggestions.map((entry) =>
            entry.kind !== "suggestion" ? null : open(entry) ? (
              <Suggestion
                key={entry.id}
                locale={locale}
                proposal={entry.proposal}
                words={entry.saidAs && sent.includes(entry.saidAs) ? entry.saidAs : undefined}
                travellers={travellers}
                canAddTraveller={props.canAddTraveller}
                onAccept={(who) => {
                  props.onAccept(entry.proposal, who);
                  settle(entry.id, "accepted");
                }}
                onDismiss={() => settle(entry.id, "dismissed")}
              />
            ) : (
              settledLine(entry)
            ),
          )}
        </ul>
      )}
      {questions.length > 0 && (
        <section aria-label={m.ownQuestionsHeading} className="space-y-3">
          <h3 className="font-bold">{m.ownQuestionsHeading}</h3>
          <ul className="space-y-3">
            {questions.map((entry) => {
              if (entry.kind !== "question") return null;
              if (!open(entry)) return settledLine(entry);
              const answer = answered[entry.id];
              const effect = answer && answer !== "no" ? answer : undefined;
              const apply = (proposal: TripProposal, who: Who | undefined) => {
                props.onAccept(proposal, who);
                settle(entry.id, "accepted");
              };
              const choose = (proposal: TripProposal | undefined) => {
                if (proposal === undefined) return settle(entry.id, "dismissed");
                if (!needsTraveller(proposal)) return apply(proposal, undefined);
                const only = travellers.length === 1 ? travellers[0] : undefined;
                if (only) return apply(proposal, { key: only.key });
                setAnswered((a) => ({ ...a, [entry.id]: proposal }));
              };
              return (
                <li key={entry.id} className="space-y-2 rounded-[10px] border border-line bg-white p-3">
                  <p className="font-bold">
                    {m_[`question_${entry.qid.replaceAll("-", "_")}`]}
                  </p>
                  {effect ? (
                    <Suggestion
                      locale={locale}
                      proposal={{ ...effect, about: "" }}
                      travellers={travellers}
                      canAddTraveller={props.canAddTraveller}
                      onAccept={(who) => apply(effect, who)}
                      onDismiss={() => settle(entry.id, "dismissed")}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className={quietButtonClass} onClick={() => choose(entry.ifYes)}>
                        {m.ownYes}
                      </button>
                      <button type="button" className={quietButtonClass} onClick={() => choose(entry.ifNo)}>
                        {m.ownNo}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
