import { isRetryable, type FailureCode } from "../../src/lib/share/auto-post";

/**
 * Instagram's content publishing API, "Instagram API with Instagram login" (graph.instagram.com):
 * make a media container from a public JPEG address and a caption, wait until it is FINISHED, then
 * publish it. Plain fetch, no library. Meta's pages used are listed in specs/003-instagram-share.
 *
 * The access token is only ever sent in a request body or query, never logged, never put in an
 * error. A failure carries a code and nothing else from the response.
 */
export const GRAPH_HOST = "https://graph.instagram.com";
/** A pinned version; Meta keeps each for about two years. Check it when you next touch this file. */
export const GRAPH_VERSION = "v23.0";

export type Credentials = { token: string; accountId: string };

/** The credentials from the environment, or null when either is missing or blank. */
export function readCredentials(env: Record<string, string | undefined>): Credentials | null {
  const token = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const accountId = env.INSTAGRAM_ACCOUNT_ID?.trim();
  if (!token || !accountId || !/^\d+$/.test(accountId)) return null;
  return { token, accountId };
}

export class InstagramError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) {
    super(code);
    this.name = "InstagramError";
    this.code = code;
  }
  get retryable(): boolean {
    return isRetryable(this.code);
  }
}

export type ApiDeps = { fetchFn?: typeof fetch };

type Graph = Record<string, unknown>;

/** Reads Meta's error object into one of our codes. Never keeps the message text. */
export function classifyFailure(status: number, body: unknown): FailureCode {
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? ((body as { error: unknown }).error as Graph | null)
      : null;
  const code = typeof error?.code === "number" ? error.code : undefined;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : undefined;
  if (status === 401 || code === 190 || code === 102) return "token_invalid";
  if (code === 4 || code === 17 || code === 32 || code === 613 || subcode === 2207042)
    return "rate_limited";
  if (subcode === 2207009 || subcode === 2207052 || subcode === 36003 || subcode === 2207004)
    return "image_rejected";
  if (code === 100 && subcode !== undefined) return "image_rejected";
  return "api_error";
}

async function call(
  creds: Credentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  deps: ApiDeps,
): Promise<Graph> {
  const fetchFn = deps.fetchFn ?? ((input: URL, init: RequestInit) => fetch(input, init));
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
  let init: RequestInit;
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", creds.token);
    init = { method, signal: AbortSignal.timeout(20_000) };
  } else {
    const body = new URLSearchParams({ ...params, access_token: creds.token });
    init = {
      method,
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(20_000),
    };
  }
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (caught) {
    throw new InstagramError(
      caught instanceof Error && (caught.name === "TimeoutError" || caught.name === "AbortError")
        ? "timeout"
        : "network",
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new InstagramError(classifyFailure(response.status, body));
  if (typeof body !== "object" || body === null) throw new InstagramError("api_error");
  return body as Graph;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** How many posts the API has published in the last 24 hours, and how many it allows. */
export async function publishingLimit(
  creds: Credentials,
  deps: ApiDeps = {},
): Promise<{ used: number; total: number } | null> {
  const body = await call(
    creds,
    "GET",
    `${creds.accountId}/content_publishing_limit`,
    { fields: "quota_usage,config" },
    deps,
  );
  const first = Array.isArray(body.data) ? (body.data[0] as Graph | undefined) : undefined;
  const config = first?.config as Graph | undefined;
  if (typeof first?.quota_usage !== "number" || typeof config?.quota_total !== "number")
    return null;
  return { used: first.quota_usage, total: config.quota_total };
}

export async function createContainer(
  creds: Credentials,
  input: { imageUrl: string; caption: string },
  deps: ApiDeps = {},
): Promise<string> {
  const body = await call(
    creds,
    "POST",
    `${creds.accountId}/media`,
    { image_url: input.imageUrl, caption: input.caption },
    deps,
  );
  const id = text(body.id);
  if (id === null) throw new InstagramError("api_error");
  return id;
}

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";

export async function containerStatus(
  creds: Credentials,
  containerId: string,
  deps: ApiDeps = {},
): Promise<ContainerStatus> {
  const body = await call(creds, "GET", containerId, { fields: "status_code" }, deps);
  const code = text(body.status_code);
  if (
    code === "IN_PROGRESS" ||
    code === "FINISHED" ||
    code === "PUBLISHED" ||
    code === "ERROR" ||
    code === "EXPIRED"
  )
    return code;
  throw new InstagramError("api_error");
}

export async function publishContainer(
  creds: Credentials,
  containerId: string,
  deps: ApiDeps = {},
): Promise<string> {
  const body = await call(
    creds,
    "POST",
    `${creds.accountId}/media_publish`,
    { creation_id: containerId },
    deps,
  );
  const id = text(body.id);
  if (id === null) throw new InstagramError("api_error");
  return id;
}

/** The public link of a published post, or null when Instagram does not give one yet. */
export async function permalinkOf(
  creds: Credentials,
  mediaId: string,
  deps: ApiDeps = {},
): Promise<string | null> {
  const body = await call(creds, "GET", mediaId, { fields: "permalink" }, deps);
  return text(body.permalink);
}

/** The newest post on the account; used to find a post whose publish call was cut off. */
export async function latestMedia(
  creds: Credentials,
  deps: ApiDeps = {},
): Promise<{ id: string; permalink: string | null } | null> {
  const body = await call(
    creds,
    "GET",
    `${creds.accountId}/media`,
    { fields: "id,permalink", limit: "1" },
    deps,
  );
  const first = Array.isArray(body.data) ? (body.data[0] as Graph | undefined) : undefined;
  const id = text(first?.id);
  return id === null ? null : { id, permalink: text(first?.permalink) };
}

/** Waits between polls; tests replace `sleeper.sleep` so they do not wait. */
export const sleeper = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Seconds to wait before each poll of a container that is still IN_PROGRESS (about 2 minutes in all). */
export const POLL_DELAYS_MS = [2000, 3000, 5000, 8000, 13000, 20000, 30000, 30000];
