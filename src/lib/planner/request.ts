import { v, type Infer } from "convex/values";
import { normaliseTag } from "../draw/rules";

// What the page sends with each question. The server keeps none of it.
//
// Where the person starts is a neighbourhood or a place, never coordinates: a phone that offers
// "nearest to me" works the neighbourhood out itself (nearest.ts) and sends only its id. These
// validators have no field a latitude or longitude could travel in, and Convex refuses a field a
// validator does not name.

export const MAX_TURNS = 8;
export const MAX_TURN_CHARS = 700;
export const MAX_AVOID = 8;
export const MAX_INTERESTS = 5;
export const MAX_DONE = 12;
export const MAX_TAG_CHARS = 40;
export const MAX_DONE_CHARS = 80;
export const MAX_SLUG_CHARS = 200;

export const requestFields = {
  /** The recent turns, oldest first. The last one is the person's. */
  turns: v.array(
    v.object({ role: v.union(v.literal("user"), v.literal("assistant")), text: v.string() }),
  ),
  /**
   * The memory snapshot a request needs (src/lib/memory snapshotOf): hard rules and tastes as the tags
   * the draw reads, and today's trip as short labels. Nothing else from the device.
   */
  memory: v.object({
    avoid: v.array(v.string()),
    interests: v.array(v.string()),
    done: v.array(v.object({ label: v.string(), slug: v.optional(v.string()) })),
  }),
  start: v.optional(
    v.union(
      v.object({ kind: v.literal("neighbourhood"), id: v.string() }),
      v.object({ kind: v.literal("place"), slug: v.string() }),
    ),
  ),
  language: v.union(v.literal("en"), v.literal("ja")),
};

export const requestValidator = v.object(requestFields);
export type PlannerRequest = Infer<typeof requestValidator>;

export class RequestError extends Error {
  override name = "RequestError";
}

/**
 * Checks sizes and shapes the validators cannot, and returns the request as the planner will use it:
 * trimmed, with tags normalised and repeats removed. Throws a RequestError for a request that is
 * simply too big or has no question in it.
 */
export function checkRequest(request: PlannerRequest): PlannerRequest {
  if (request.turns.length === 0 || request.turns.length > MAX_TURNS) {
    throw new RequestError(`turns: 1 to ${MAX_TURNS}`);
  }
  const turns = request.turns.map((turn) => ({ role: turn.role, text: turn.text.trim() }));
  if (turns.some((turn) => turn.text.length > MAX_TURN_CHARS)) {
    throw new RequestError(`turns: at most ${MAX_TURN_CHARS} characters each`);
  }
  const last = turns[turns.length - 1]!;
  if (last.role !== "user" || last.text === "") throw new RequestError("the last turn is yours");
  if (turns[0]!.role !== "user") throw new RequestError("the first turn is yours");

  const tags = (list: readonly string[], name: string, max: number) => {
    if (list.length > max) throw new RequestError(`${name}: at most ${max}`);
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const raw of list) {
      const tag = raw.trim();
      if (tag === "") continue;
      if (tag.length > MAX_TAG_CHARS) throw new RequestError(`${name}: tags are short`);
      const key = normaliseTag(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(tag);
    }
    return kept;
  };
  const { memory } = request;
  if (memory.done.length > MAX_DONE) throw new RequestError(`done: at most ${MAX_DONE}`);
  const done = memory.done.flatMap((entry) => {
    const label = entry.label.trim();
    if (label === "") return [];
    if (label.length > MAX_DONE_CHARS || (entry.slug?.length ?? 0) > MAX_SLUG_CHARS) {
      throw new RequestError("done: entries are short");
    }
    return [{ label, ...(entry.slug === undefined ? {} : { slug: entry.slug }) }];
  });
  if (request.start?.kind === "place" && request.start.slug.length > MAX_SLUG_CHARS) {
    throw new RequestError("start: the place is not a slug");
  }
  return {
    turns,
    memory: {
      avoid: tags(memory.avoid, "avoid", MAX_AVOID),
      interests: tags(memory.interests, "interests", MAX_INTERESTS),
      done,
    },
    ...(request.start === undefined ? {} : { start: request.start }),
    language: request.language,
  };
}

/** The latest thing the person wrote: the only words a memory proposal may rest on. */
export function latestUserText(request: PlannerRequest): string {
  for (let index = request.turns.length - 1; index >= 0; index--) {
    const turn = request.turns[index]!;
    if (turn.role === "user") return turn.text;
  }
  return "";
}
