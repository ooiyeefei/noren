import type { PlannedRun } from "./types";

/**
 * The few Apify REST API v2 calls the collectors need (https://docs.apify.com/api/v2). The token
 * goes in the Authorization header, never in a URL, so it cannot end up in a log line.
 */
export const APIFY_API = "https://api.apify.com/v2";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId: string;
  /** What the run cost the owner, platform usage and event charges together (API reference). */
  usageTotalUsd?: number | null;
  chargedEventCounts?: Record<string, number>;
  pricingInfo?: {
    pricingModel?: string;
    pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: number }> };
  };
};

export type ApifyClient = {
  start(run: PlannedRun, options: { timeoutSecs: number }): Promise<ApifyRun>;
  wait(runId: string): Promise<ApifyRun>;
  items(datasetId: string): Promise<unknown[]>;
};

/** The cost of a finished run: usageTotalUsd, or the charged events when it is missing. */
export function runCostUsd(run: ApifyRun): number {
  const events = run.pricingInfo?.pricingPerEvent?.actorChargeEvents ?? {};
  let fromEvents = 0;
  for (const [event, count] of Object.entries(run.chargedEventCounts ?? {}))
    fromEvents += (events[event]?.eventPriceUsd ?? 0) * count;
  const usage =
    typeof run.usageTotalUsd === "number" && Number.isFinite(run.usageTotalUsd)
      ? run.usageTotalUsd
      : 0;
  return Math.max(usage, fromEvents);
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

export function createApifyClient(options: {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): ApifyClient {
  const send = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(`${APIFY_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (response.ok) return ((await response.json()) as { data: T }).data;
      // Rate limits and server errors are retried with backoff; anything else is reported.
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      let detail = "";
      try {
        const body = (await response.json()) as { error?: { type?: string; message?: string } };
        detail = [body.error?.type, body.error?.message].filter(Boolean).join(": ");
      } catch {
        /* Not JSON. */
      }
      throw new ApifyError(
        `Apify ${init.method ?? "GET"} ${path.split("?")[0]} failed: HTTP ${response.status}${detail ? ` ${detail.replaceAll(options.token, "[redacted]").slice(0, 300)}` : ""}`,
        response.status,
      );
    }
  }
  return {
    async start(run, { timeoutSecs }) {
      const params = new URLSearchParams({
        maxTotalChargeUsd: String(run.maxTotalChargeUsd),
        maxItems: String(run.maxItems),
        timeout: String(timeoutSecs),
      });
      return await call<ApifyRun>(`/acts/${run.actorId.replace("/", "~")}/runs?${params}`, {
        method: "POST",
        body: JSON.stringify(run.input),
      });
    },
    async wait(runId) {
      for (;;) {
        const run = await call<ApifyRun>(
          `/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`,
        );
        if (TERMINAL.has(run.status)) return run;
      }
    },
    async items(datasetId) {
      const all: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await send(
          `${APIFY_API}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&offset=${offset}&limit=1000`,
          { headers: { Authorization: `Bearer ${options.token}` } },
        );
        if (!response.ok)
          throw new ApifyError(
            `Apify dataset read failed: HTTP ${response.status}`,
            response.status,
          );
        const page = (await response.json()) as unknown[];
        all.push(...page);
        if (page.length < 1000) return all;
      }
    },
  };
}

/**
 * The spending limit for one collection. A run starts only when the money already spent plus the
 * run's own cap (its maxTotalChargeUsd, the most it can cost) stays within the limit.
 */
export class Budget {
  spentUsd = 0;
  constructor(readonly limitUsd: number) {
    if (!Number.isFinite(limitUsd) || limitUsd <= 0)
      throw new Error("--budget-usd must be a positive number");
  }
  allows(run: Pick<PlannedRun, "maxTotalChargeUsd">): boolean {
    return this.spentUsd + run.maxTotalChargeUsd <= this.limitUsd + 1e-9;
  }
  record(usd: number) {
    this.spentUsd += Math.max(0, usd);
  }
  get remainingUsd() {
    return Math.max(0, this.limitUsd - this.spentUsd);
  }
}
