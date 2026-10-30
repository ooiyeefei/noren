export type UploadResult = { storageId: string };

export async function uploadWithRetry(options: {
  getUploadUrl(): Promise<string>;
  file: Blob;
  fetch?: typeof globalThis.fetch;
  attempts?: number;
  backoffMs?: readonly number[];
  sleep?(ms: number): Promise<void>;
}): Promise<UploadResult> {
  const {
    file,
    getUploadUrl,
    fetch: post = globalThis.fetch,
    attempts = 3,
    backoffMs = [500, 1500],
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("RangeError: attempts must be a positive integer");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      const url = await getUploadUrl();
      response = await post(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
    } catch (cause) {
      const error = new Error(
        cause instanceof Error
          ? `${cause.name || "Error"}: ${cause.message}`
          : `Error: ${String(cause)}`,
      );
      if (attempt === attempts - 1 || (cause instanceof Error && cause.name === "AbortError"))
        throw error;
      await sleep(backoffMs[attempt] ?? backoffMs.at(-1) ?? 0);
      continue;
    }
    if (response.ok) {
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error(`HTTP ${response.status}: invalid upload response`);
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("storageId" in data) ||
        typeof data.storageId !== "string" ||
        !data.storageId.trim()
      )
        throw new Error(`HTTP ${response.status}: missing storageId`);
      return { storageId: data.storageId };
    }
    const detail =
      response.status >= 400 && response.status < 500 ? await response.text().catch(() => "") : "";
    const expired = response.status === 410 || /expired|expiration/i.test(detail);
    const retryable = response.status >= 500 || expired;
    if (!retryable || attempt === attempts - 1)
      throw new Error(`HTTP ${response.status}: upload failed`);
    await sleep(backoffMs[attempt] ?? backoffMs.at(-1) ?? 0);
  }
  throw new Error("Error: upload attempts exhausted");
}
