import { shrinkPhoto } from "./shrink";

/** Runs in the browser, and needs no setting beyond what the page was given. */

export type BrowserPhotoLimits = { maxEdgePixels: number; jpegQuality: number };
export type UploadedPhoto = { photoId: string; width: number; height: number };
export type PhotoProblem = "unreadable" | "rejected" | "limit" | "failed";

export class PhotoUploadError extends Error {
  constructor(
    readonly problem: PhotoProblem,
    detail: string,
  ) {
    super(detail.trim() || problem);
    this.name = "PhotoUploadError";
  }
}

export type PickedPhoto = {
  id: number;
  preview: string;
  state: "working" | "ready" | "failed";
  photoId?: string;
  problem?: PhotoProblem;
};
export type PhotoDraft = { photoIds: string[]; busy: boolean };
export const NO_PHOTOS: PhotoDraft = { photoIds: [], busy: false };

export function photoDraft(items: readonly PickedPhoto[]): PhotoDraft {
  return {
    photoIds: items.flatMap((item) => (item.photoId === undefined ? [] : [item.photoId])),
    busy: items.some((item) => item.state === "working"),
  };
}

/** A canvas would flatten a GIF and rasterise an SVG. Neither is a photo someone took. */
export function isStillPhotoFile({ type }: { type: string }): boolean {
  if (type === "") return true;
  return type.startsWith("image/") && type !== "image/gif" && type !== "image/svg+xml";
}

export function takeFiles<F extends { type: string }>(
  files: readonly F[],
  room: number,
): { taken: F[]; overflow: boolean; wrong: boolean } {
  const still = files.filter(isStillPhotoFile);
  return {
    taken: still.slice(0, Math.max(0, room)),
    overflow: still.length > room,
    wrong: still.length !== files.length,
  };
}

function failureText(error: unknown): string {
  return error instanceof Error
    ? `${error.name || "Error"}: ${error.message || "no message"}`
    : `NonError: ${typeof error}`;
}

async function routeFailure(response: Response): Promise<PhotoUploadError> {
  let code = "unknown";
  let message = "";
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // A gateway's error page is not JSON. The status below still says what happened.
  }
  const detail = `${response.status} ${code}${message ? `: ${message}` : ""}`;
  if (code === "rate_limited") return new PhotoUploadError("limit", detail);
  if (code === "invalid_input") return new PhotoUploadError("rejected", detail);
  return new PhotoUploadError("failed", detail);
}

/** Shrink, ask for a permit, post straight to S3, then ask the server to check what arrived. */
export async function uploadStoryPhoto(
  file: Blob,
  {
    placeId,
    limits,
    fetch = globalThis.fetch.bind(globalThis),
    shrink = shrinkPhoto,
  }: {
    placeId: string;
    limits: BrowserPhotoLimits;
    fetch?: typeof globalThis.fetch;
    shrink?: typeof shrinkPhoto;
  },
): Promise<UploadedPhoto> {
  let jpeg: Blob;
  try {
    jpeg = await shrink(file, limits);
  } catch (error) {
    throw new PhotoUploadError("unreadable", failureText(error));
  }
  const postJson = async (path: string, body: unknown) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await routeFailure(response);
    return response;
  };
  try {
    const permit = (await (await postJson("/api/story-photos/permit", { placeId })).json()) as {
      photoId: string;
      upload: { url: string; fields: Record<string, string> };
    };
    const form = new FormData();
    for (const [name, value] of Object.entries(permit.upload.fields)) form.append(name, value);
    // S3 ignores every field after the file, so the file goes last.
    form.append("file", jpeg, "photo.jpg");
    const stored = await fetch(permit.upload.url, {
      method: "POST",
      body: form,
      credentials: "omit",
    });
    if (!stored.ok) throw new PhotoUploadError("failed", `storage answered ${stored.status}`);
    const finished = await postJson("/api/story-photos/finish", { photoId: permit.photoId });
    return (await finished.json()) as UploadedPhoto;
  } catch (error) {
    throw error instanceof PhotoUploadError
      ? error
      : new PhotoUploadError("failed", failureText(error));
  }
}
