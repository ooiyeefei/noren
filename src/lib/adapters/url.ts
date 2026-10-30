export type UrlRefusal = "invalid_url" | "unsupported_scheme" | "too_long";

export function parseHttpUrl(
  input: string,
): { ok: true; url: URL } | { ok: false; reason: UrlRefusal } {
  const value = input.trim();
  if (value.length > 2048) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }
  if (
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    url.hostname.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    url.port
  ) {
    return { ok: false, reason: "invalid_url" };
  }
  url.hostname = url.hostname.toLowerCase();
  return { ok: true, url };
}

export function parsedUrl(input: string): URL | null {
  const result = parseHttpUrl(input);
  return result.ok ? result.url : null;
}

export function cleanUrl(url: URL, extraTracking: readonly string[] = []): string {
  const cleaned = new URL(url.href);
  // Hash routes and the pasted scheme can identify different link-card pages.
  cleaned.pathname = cleaned.pathname.replace(/\/+$/, "");
  for (const key of [...cleaned.searchParams.keys()]) {
    const name = key.toLowerCase();
    if (
      name.startsWith("utm_") ||
      ["fbclid", "gclid", "igsh", "igshid", ...extraTracking].includes(name)
    ) {
      cleaned.searchParams.delete(key);
    }
  }
  return cleaned.href;
}

export function requireMatch(input: string, matches: (url: string) => boolean): URL {
  const url = parsedUrl(input);
  if (!url || !matches(input)) throw new Error("URL does not match this adapter");
  return url;
}

export async function fetchStatus(url: string, timeoutMs = 8000): Promise<number | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await globalThis.fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
        });
        // Only the status is a signal; never read oEmbed content or metadata.
        void response.body?.cancel().catch(() => undefined);
        return response.status;
      })(),
      timeout,
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
