import type { LanguageModel } from "ai";
import type { ConnectorData } from "../connector/types";
import type { RegionConfig } from "../region/schema";
import { runPlanner } from "./agent";
import { checkRequest, type PlannerRequest } from "./request";
import type { PlannerReply } from "./reply";
import { resolveReply } from "./resolve";

export * from "./reply";
export { checkRequest, latestUserText, requestFields, requestValidator } from "./request";
export type { PlannerRequest } from "./request";

/** The model failed and there is no draw to fall back on. */
export class PlannerUnavailable extends Error {
  override name = "PlannerUnavailable";
}

export type PlannerDeps = {
  model: LanguageModel;
  data: ConnectorData;
  region: RegionConfig;
  origin: string;
  now(): number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

/**
 * One question, start to finish: check the request, run the model against Noren's tools, and open
 * its answer against what the tools returned. Stateless: nothing is kept after the reply.
 */
export async function planReply(request: PlannerRequest, deps: PlannerDeps): Promise<PlannerReply> {
  const checked = checkRequest(request);
  const run = await runPlanner(
    checked,
    {
      data: deps.data,
      region: deps.region,
      origin: deps.origin,
      now: deps.now,
      locale: checked.language,
      memory: checked.memory,
      ...(checked.start === undefined ? {} : { start: checked.start }),
    },
    {
      model: deps.model,
      ...(deps.maxOutputTokens === undefined ? {} : { maxOutputTokens: deps.maxOutputTokens }),
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    },
  );
  const reply = resolveReply({
    submit: run.submit,
    ledger: run.ledger,
    request: checked,
    region: deps.region,
  });
  if (run.modelFailed && reply.state === "empty") throw new PlannerUnavailable("the model failed");
  return reply;
}
