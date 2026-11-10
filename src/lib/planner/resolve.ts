import { normaliseTag } from "../draw/rules";
import { MAX_LABEL_LENGTH } from "../memory/constants";
import { canon, ruleFromText, tasteFromText } from "../memory/vocabulary";
import { displayName, neighbourhoodLabel, placeRow, type PlaceRow } from "../connector/present";
import { SLIP_HAS_STORY, SLIP_NO_STORY } from "../connector/tools";
import type { OmikujiResult } from "../connector/types";
import type { RegionConfig } from "../region/schema";
import type { Submit } from "./agent";
import { checkIntro } from "./intro";
import type { TurnLedger, WalkRecord } from "./ledger";
import { toPlannerPlace } from "./ledger";
import { latestUserText, type PlannerRequest } from "./request";
import type {
  PlannerAnswer,
  PlannerProposal,
  PlannerQuote,
  PlannerReply,
  PlannerStop,
  PlannerWalk,
  PlannerWhy,
} from "./reply";

// Opening the model's answer against what the tools returned. This is where Principle V is kept:
//
//  - The stops, their order, their reasons and their walking times are the draw's, copied from its
//    result. The model cannot add, drop, reorder or describe a stop.
//  - A quote is shown only if its id was handed out by a tool in this turn and it belongs to the place
//    it is shown under. Anything else is dropped and counted (`leftOut`), so the page can say so.
//  - A place the model names must be one a tool returned this turn.
//  - "Nobody has written about that" is shown only when a lookup happened and found no words there.
//  - A memory proposal must rest on words the person wrote in their latest message.
//  - The intro passes only if it says nothing but true numbers (intro.ts).
//
// If the answer is missing or does not fit the schema, or anything unexpected happens while checking
// it, the person gets the plain draw and no AI text. It fails closed.

export const QUOTES_PER_STOP = 2;
export const QUOTES_PER_ANSWER = 4;
export const MAX_PROPOSALS = 3;
export const MAX_ANSWERS = 3;

export type ResolveInput = {
  submit: Submit | null;
  ledger: TurnLedger;
  request: PlannerRequest;
  region: RegionConfig;
};

function stopFacts(record: WalkRecord) {
  const legs = record.result.stops.map((stop) => stop.leg.minutes);
  return {
    stops: record.result.stops.length,
    totalMinutes: legs.reduce((sum, minutes) => sum + minutes, 0),
    wildCards: record.result.stops.filter((stop) => stop.wildCard).length,
    legMinutes: legs,
  };
}

function whyOf(
  stop: { wildCard: boolean; matchedInterests: string[] },
  hadInterests: boolean,
): PlannerWhy {
  if (stop.wildCard) return { kind: "wild" };
  if (stop.matchedInterests.length > 0)
    return { kind: "matched", interests: stop.matchedInterests };
  return { kind: "random", hadInterests };
}

/** The draw as the page shows it, with `quotes` filled in for the stops that have any. */
function walkOf(
  record: WalkRecord,
  region: RegionConfig,
  quotes: ReadonlyMap<string, PlannerQuote[]>,
): PlannerWalk {
  const { result, request } = record;
  const facts = stopFacts(record);
  const startName =
    result.start.kind === "place"
      ? displayName({ names: result.start.names }, region)
      : (() => {
          const label = neighbourhoodLabel(region, result.start.neighbourhoodId);
          return label === null ? "" : `${label.en} (${label.ja})`;
        })();
  let from = startName;
  const stops: PlannerStop[] = result.stops.map((stop) => {
    const row = placeRow({ ...stop, isMock: false }, stop.neighbourhoodId, {
      region,
      origin: "",
      language: "en",
    });
    const entry: PlannerStop = {
      place: toPlannerPlace(row),
      why: whyOf(stop, request.interests.length > 0),
      minutes: stop.leg.minutes,
      metres: stop.leg.metres,
      from,
      quotes: quotes.get(stop.slug) ?? [],
    };
    from = row.name;
    return entry;
  });
  return {
    start: {
      kind: result.start.kind,
      name: startName,
      ...(result.start.slug === undefined ? {} : { slug: result.start.slug }),
    },
    stops,
    asked: request.count,
    totalMinutes: facts.totalMinutes,
    wildCards: facts.wildCards,
    rulesApplied: result.rulesApplied.map(({ tag, checks, limit }) => ({ tag, checks, limit })),
    rulesNotChecked: result.rulesNotChecked.map(({ tag, reason }) => ({ tag, reason })),
    interestsNotMatched: result.interestsNotMatched,
  };
}

function omikujiOf(
  result: Extract<OmikujiResult, { ok: true }> | null,
  region: RegionConfig,
): PlannerReply["omikuji"] {
  if (result === null) return null;
  const row: PlaceRow = placeRow({ ...result.place, isMock: false }, result.place.neighbourhoodId, {
    region,
    origin: "",
    language: "en",
  });
  return {
    day: result.day,
    area: neighbourhoodLabel(region, result.neighbourhoodId),
    place: toPlannerPlace(row),
    slip: result.place.hasStory ? SLIP_HAS_STORY : SLIP_NO_STORY,
  };
}

/** The draw alone: no words from the model, nothing it picked. */
function plainReply(input: ResolveInput, leftOut = 0): PlannerReply {
  const record = input.ledger.chosenWalk();
  const walk = record === null ? null : walkOf(record, input.region, new Map());
  const omikuji = omikujiOf(input.ledger.omikuji, input.region);
  return {
    state: walk === null && omikuji === null ? "empty" : "plain",
    intro: null,
    needsStart: false,
    walk,
    omikuji,
    answers: [],
    proposals: [],
    leftOut,
    pickedByAi: false,
  };
}

const CONTROL = /[\u0000-\u001f\u007f<>]/;

function sayings(request: PlannerRequest): string {
  return canon(latestUserText(request));
}

function checkProposals(
  raw: Submit["memoryProposals"],
  input: ResolveInput,
): { kept: PlannerProposal[]; dropped: number } {
  const said = sayings(input.request);
  const { memory } = input.request;
  const avoid = new Set(memory.avoid.map(normaliseTag));
  const done = new Set(memory.done.map((entry) => canon(entry.label)));
  const kept: PlannerProposal[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const proposal of raw) {
    const text = proposal.text.trim().replace(/\s+/g, " ");
    const saidAs = proposal.saidAs.trim().replace(/\s+/g, " ");
    const usable =
      text !== "" &&
      text.length <= MAX_LABEL_LENGTH &&
      !CONTROL.test(text) &&
      !CONTROL.test(saidAs) &&
      canon(saidAs).length >= 2 &&
      said.includes(canon(saidAs));
    if (!usable) {
      dropped++;
      continue;
    }
    let redundant = false;
    if (proposal.kind === "rule") {
      const draft = ruleFromText(text);
      if (draft === null) {
        dropped++;
        continue;
      }
      const has = avoid.has(normaliseTag(draft.tag));
      redundant = proposal.op === "add" ? has : !has;
    } else if (proposal.kind === "taste") {
      const draft = tasteFromText(text);
      if (draft === null) {
        dropped++;
        continue;
      }
      // Only the top few tastes are in the snapshot, so a removal is left for the page to check.
      redundant = proposal.op === "add" && memory.interests.map(canon).includes(canon(draft.key));
    } else {
      const has = done.has(canon(text));
      redundant = proposal.op === "add" ? has : !has;
    }
    const key = `${proposal.op}|${proposal.kind}|${canon(text)}`;
    if (redundant || seen.has(key)) continue;
    seen.add(key);
    kept.push({ id: `p${kept.length + 1}`, op: proposal.op, kind: proposal.kind, text, saidAs });
  }
  return { kept: kept.slice(0, MAX_PROPOSALS), dropped };
}

function resolveAi(input: ResolveInput, submit: Submit): PlannerReply {
  const { ledger, region } = input;
  let leftOut = 0;
  const record = ledger.chosenWalk();
  const stopSlugs = new Set(record?.result.stops.map((stop) => stop.slug) ?? []);

  // Quotes under the stops: only the draw's stops, only quotes from that very place.
  const byStop = new Map<string, PlannerQuote[]>();
  for (const entry of submit.stops) {
    if (!stopSlugs.has(entry.slug)) {
      leftOut++;
      continue;
    }
    for (const id of entry.quoteIds) {
      const quote = ledger.quotes.get(id);
      if (quote === undefined || quote.slug !== entry.slug) {
        leftOut++;
        continue;
      }
      const list = byStop.get(entry.slug) ?? [];
      if (list.some((existing) => existing.id === id) || list.length >= QUOTES_PER_STOP) continue;
      byStop.set(entry.slug, [...list, quote]);
    }
  }

  const answers: PlannerAnswer[] = [];
  for (const answer of submit.answers.slice(0, MAX_ANSWERS)) {
    if (answer.notWritten) {
      const known = answer.slug === "" ? undefined : ledger.places.get(answer.slug);
      const contradicted = known !== undefined && ledger.quotesAt(known.slug).length > 0;
      // The claim needs a lookup behind it, and a place to tie it to when it names one.
      if (ledger.searches === 0 || (answer.slug !== "" && known === undefined) || contradicted) {
        leftOut++;
        continue;
      }
      answers.push({
        kind: "notWritten",
        ...(known === undefined ? {} : { place: { slug: known.slug, name: known.name } }),
      });
      continue;
    }
    const quotes: PlannerQuote[] = [];
    for (const id of answer.quoteIds) {
      const quote = ledger.quotes.get(id);
      if (quote === undefined) {
        leftOut++;
        continue;
      }
      if (!quotes.some((existing) => existing.id === id) && quotes.length < QUOTES_PER_ANSWER) {
        quotes.push(quote);
      }
    }
    if (quotes.length > 0) answers.push({ kind: "quotes", quotes });
    else if (answer.quoteIds.length === 0) leftOut++;
  }

  const proposals = checkProposals(submit.memoryProposals, input);
  leftOut += proposals.dropped;

  // The intro counts only with a walk to describe, and only if it is nothing but true numbers.
  const intro =
    record === null || submit.intro.trim() === ""
      ? null
      : checkIntro(submit.intro, {
          ...stopFacts(record),
          placeNames: [...ledger.places.values()].flatMap((place) => place.names),
        });

  const walk = record === null ? null : walkOf(record, region, byStop);
  const omikuji = omikujiOf(ledger.omikuji, region);
  const pickedByAi =
    intro !== null || answers.length > 0 || [...byStop.values()].some((list) => list.length > 0);
  const needsStart = record === null && ledger.walkDraws === 0 && submit.needsStart;
  const nothingToShow =
    walk === null &&
    omikuji === null &&
    answers.length === 0 &&
    proposals.kept.length === 0 &&
    !needsStart;
  return {
    state: nothingToShow ? "empty" : "ai",
    intro,
    needsStart,
    walk,
    omikuji,
    answers,
    proposals: proposals.kept,
    leftOut,
    pickedByAi,
  };
}

/** What the page gets. Never throws: a surprise while checking is a plain draw, not an error. */
export function resolveReply(input: ResolveInput): PlannerReply {
  if (input.submit === null) return plainReply(input);
  try {
    return resolveAi(input, input.submit);
  } catch (error) {
    console.error(
      `planner answer could not be checked (${error instanceof Error ? error.name || "Error" : "NonError"})`,
    );
    return plainReply(input);
  }
}
