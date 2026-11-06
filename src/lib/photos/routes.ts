import { ConvexError } from "convex/values";
import { z } from "zod";
import { errorResponse, jsonError, parseJson } from "../http/handler";
import type { RegionConfig } from "../region/schema";
import type { PhotoLimits, ReencodedPhoto } from "./process";
import type { PhotoStore } from "./s3-store";
import { activePhotoSettings, type PhotoObjectSettings } from "./settings";

/** The Convex functions the routes call, as the signed-in member. The client never names a key. */
export type PhotoConvex = {
  begin(args: { placeId: string }): Promise<{ photoId: string; incomingKey: string }>;
  ticket(args: { photoId: string }): Promise<{ incomingKey: string; key: string }>;
  complete(args: { photoId: string; width: number; height: number }): Promise<unknown>;
  remove(args: { photoId: string }): Promise<unknown>;
};

export type PhotoRouteDeps = {
  region: Partial<Pick<RegionConfig, "photos">>;
  env: Readonly<Record<string, string | undefined>>;
  /** Null when signed out. */
  convex: () => Promise<PhotoConvex | null>;
  store: (settings: PhotoObjectSettings) => PhotoStore;
  reencode: (input: Uint8Array, limits: PhotoLimits) => Promise<ReencodedPhoto>;
};

const id = z.string().regex(/^[a-z0-9]{1,64}$/);
const permitBody = z.object({ placeId: id });
const finishBody = z.object({ photoId: id });
const INCOMING_KEY = /^incoming\/[0-9a-f]{32}\.jpg$/;
const FINAL_KEY = /^photos\/[0-9a-f]{32}\.jpg$/;
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

function failureName(error: unknown): string {
  return error instanceof Error ? `${error.name || "Error"}` : `NonError: ${typeof error}`;
}

function convexCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data: unknown = error.data;
  return typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
    ? data.code
    : undefined;
}

/**
 * Whatever is switched off, the answer is the same and no work is done. The feature stays
 * undiscoverable until the region and every setting are in place.
 */
async function ready(deps: PhotoRouteDeps) {
  const settings = activePhotoSettings(deps.region, deps.env);
  if (settings === null || !deps.region.photos)
    return { ok: false as const, response: jsonError("not_found", "photos are switched off") };
  const convex = await deps.convex();
  if (convex === null)
    return { ok: false as const, response: jsonError("unauthenticated", "sign in to continue") };
  return { ok: true as const, settings, photos: deps.region.photos, convex };
}

/** Step one: a permit to upload one file straight to S3, because Vercel caps a body at 4.5 MB. */
export function createPhotoPermitRoute(
  deps: PhotoRouteDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const on = await ready(deps);
      if (!on.ok) return on.response;
      const body = await parseJson(permitBody, request);
      if (!body.ok) return body.response;
      const { photoId, incomingKey } = await on.convex.begin(body.data);
      if (!INCOMING_KEY.test(incomingKey)) throw new Error("begin returned an unexpected key");
      const upload = await deps.store(on.settings).permit(incomingKey, {
        maxBytes: on.photos.maxUploadBytes,
        expiresSeconds: on.photos.permitSeconds,
      });
      return Response.json({ photoId, upload }, { headers: HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * Step two: turn what arrived into the only copy anyone can read. It takes a photo id alone, and
 * Convex says which keys belong to it and whether they are this member's.
 */
export function createPhotoFinishRoute(
  deps: PhotoRouteDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const on = await ready(deps);
      if (!on.ok) return on.response;
      const body = await parseJson(finishBody, request);
      if (!body.ok) return body.response;
      const { photoId } = body.data;
      const { incomingKey, key } = await on.convex.ticket({ photoId });
      if (!INCOMING_KEY.test(incomingKey) || !FINAL_KEY.test(key))
        throw new Error("ticket returned an unexpected key");
      const store = deps.store(on.settings);

      // Dropping the row queues deletion of its objects, so a refused file does not linger.
      const refuse = async (reason: string) => {
        try {
          await on.convex.remove({ photoId });
        } catch (error) {
          console.error(`story photo: could not drop a refused upload: ${failureName(error)}`);
        }
        return jsonError("invalid_input", reason);
      };

      const read = await store.read(incomingKey, on.photos.maxUploadBytes);
      if (!read.ok) {
        return read.reason === "missing"
          ? jsonError("conflict", "upload_missing")
          : await refuse("too_large");
      }
      const photo = await deps.reencode(read.bytes, on.photos);
      if (!photo.ok) return await refuse(photo.reason);

      await store.write(key, photo.jpeg, { cacheSeconds: on.photos.cacheSeconds });
      try {
        await store.remove(incomingKey);
      } catch (error) {
        // Not worth failing the member's upload: the bucket expires incoming/ by itself.
        console.error(`story photo: could not delete an upload: ${failureName(error)}`);
      }
      const { width, height } = photo;
      try {
        await on.convex.complete({ photoId, width, height });
      } catch (error) {
        // The row went while this ran, so nothing will ever delete the file just written. In any
        // other failure the row still names it, and removing the row queues its deletion.
        if (convexCode(error) === "not_found") await store.remove(key);
        throw error;
      }
      return Response.json({ photoId, width, height }, { headers: HEADERS });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
