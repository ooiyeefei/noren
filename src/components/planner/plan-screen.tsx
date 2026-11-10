"use client";

import { ConvexError } from "convex/values";
import { useReducer, useRef, useState } from "react";
import { memoryStore, useMemory } from "@/components/memory/use-memory";
import { normaliseTag } from "@/lib/draw/rules";
import type { LocationRead } from "@/lib/collection/location";
import type { Locale } from "@/lib/i18n";
import { remembersMessages } from "@/lib/i18n/messages/remembers";
import { messagesFor } from "@/lib/i18n";
import {
  JAPAN_UTC_OFFSET_HOURS,
  relevantProposals,
  ruleLabel,
  snapshotOf,
  tasteFromText,
  tasteLabel,
  topTastes,
} from "@/lib/memory";
import { answerProposal } from "@/lib/planner/answer";
import { chatReducer, emptyChat, requestTurns, type StartChoice } from "@/lib/planner/chat";
import { nearestNeighbourhoodId } from "@/lib/planner/nearest";
import type { PlannerReply, PlannerRequest } from "@/lib/planner";
import { startForRequest, type PlaceOption } from "@/lib/planner/start";
import type { Neighbourhood } from "@/lib/region/schema";
import { PlanView } from "./plan-view";
import { neighbourhoodName, type NearestStatus } from "./start-picker";

export type AskPlanner = (request: PlannerRequest) => Promise<PlannerReply>;

/** The code a Convex error carries. A production deployment hides the message, never the code. */
export function failureCode(error: unknown): "rate_limited" | "failed" {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "code" in data &&
      data.code === "rate_limited"
    ) {
      return "rate_limited";
    }
  }
  return "failed";
}

/**
 * The planner chat. It holds the conversation in the page and nothing else: reload and it is gone. Each
 * question carries the recent turns, the memory snapshot it needs and where to start. The phone works
 * out "nearest to me" itself and keeps the reading to itself; only a neighbourhood's id is sent.
 */
export function PlanScreen({
  locale,
  neighbourhoods,
  places,
  ask,
  locate,
  voice,
}: {
  locale: Locale;
  neighbourhoods: readonly Neighbourhood[];
  places: readonly PlaceOption[];
  ask: AskPlanner;
  locate(): Promise<LocationRead>;
  /** The voice input; its words go into the box for the visitor to check and send. */
  voice?: (onText: (text: string) => void) => React.ReactNode;
}): React.JSX.Element {
  const [chat, dispatch] = useReducer(chatReducer, emptyChat);
  const [input, setInput] = useState("");
  const [start, setStart] = useState<StartChoice | null>(null);
  const [nearest, setNearest] = useState<NearestStatus>({ kind: "idle" });
  const [placeQuery, setPlaceQuery] = useState("");
  const { memory, now } = useMemory();
  const busy = useRef(false);
  const remembers = messagesFor(remembersMessages, locale);

  async function send() {
    const text = input.trim();
    if (text === "" || chat.pending || busy.current) return;
    busy.current = true;
    const sent = chatReducer(chat, { type: "send", text });
    dispatch({ type: "send", text });
    setInput("");
    const clock = { now: Date.now(), utcOffsetHours: JAPAN_UTC_OFFSET_HOURS };
    const where = startForRequest(start);
    try {
      const reply = await ask({
        turns: requestTurns(sent),
        memory: snapshotOf(memory, clock),
        ...(where === undefined ? {} : { start: where }),
        language: locale,
      });
      // Only suggestions that would change something are offered.
      dispatch({
        type: "reply",
        reply: { ...reply, proposals: relevantProposals(memoryStore().get(), reply.proposals) },
      });
    } catch (error) {
      dispatch({ type: "error", code: failureCode(error) });
    } finally {
      busy.current = false;
    }
  }

  async function findNearest() {
    setNearest({ kind: "locating" });
    // The reading is judged here and dropped; only the neighbourhood's id survives this function.
    const found = nearestNeighbourhoodId(await locate(), { neighbourhoods: [...neighbourhoods] });
    if (found.kind === "found") {
      const picked = neighbourhoods.find((n) => n.id === found.neighbourhoodId);
      if (picked !== undefined) {
        setStart({
          kind: "neighbourhood",
          id: picked.id,
          name: neighbourhoodName(picked.names, picked.id),
        });
        setNearest({ kind: "idle" });
        return;
      }
    }
    setNearest(found.kind === "found" ? { kind: "far" } : { kind: found.kind });
  }

  function answer(turnId: string, proposalId: string, choice: "yes" | "no") {
    const action = answerProposal(chat, memoryStore(), turnId, proposalId, choice);
    if (action !== null) dispatch(action);
  }

  const interestLabel = (tag: string) => {
    const draft = tasteFromText(tag);
    return draft === null ? tag : tasteLabel(draft, locale);
  };
  return (
    <PlanView
      locale={locale}
      chat={chat}
      input={input}
      onInput={setInput}
      onSend={() => void send()}
      picker={{
        locale,
        neighbourhoods,
        places,
        value: start,
        nearest,
        placeQuery,
        onPlaceQuery: setPlaceQuery,
        onChoose: (choice) => {
          setStart(choice);
          setPlaceQuery("");
          setNearest({ kind: "idle" });
        },
        onClear: () => setStart(null),
        onNearest: () => void findNearest(),
      }}
      using={{
        rules: memory.rules.map((rule) => ruleLabel(rule, locale, remembers.allergyPrefix)),
        tastes: topTastes(memory, now).map((taste) => tasteLabel(taste, locale)),
        done: memory.trip.items.map((item) => item.label),
      }}
      ruleLabels={Object.fromEntries(
        memory.rules.map((rule) => [
          normaliseTag(rule.tag),
          ruleLabel(rule, locale, remembers.allergyPrefix),
        ]),
      )}
      interestLabel={interestLabel}
      onAnswer={answer}
      voice={voice?.((text) => setInput((current) => (current ? `${current} ${text}` : text)))}
    />
  );
}
