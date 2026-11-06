import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { PhotoObjectSettings } from "./settings";

export const PHOTO_CONTENT_TYPE = "image/jpeg";

export type UploadPermit = { url: string; fields: Record<string, string> };
export type PhotoRead =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: "missing" | "too_large" };

/** What Noren needs from object storage. The routes and the Convex action only know this. */
export type PhotoStore = {
  /** A permit for a browser to upload to exactly this key, and nowhere else. */
  permit(key: string, limits: { maxBytes: number; expiresSeconds: number }): Promise<UploadPermit>;
  read(key: string, maxBytes: number): Promise<PhotoRead>;
  write(key: string, jpeg: Uint8Array, options: { cacheSeconds: number }): Promise<void>;
  remove(key: string): Promise<void>;
};

/** The part of an S3 client this uses, so a test can pass a fake and never reach AWS. */
export type S3Sender = Pick<S3Client, "send">;

/**
 * Without list permission, which this bucket's user does not have, S3 answers a missing key with
 * AccessDenied. The caller already signed a permit with these credentials, so this means no upload.
 */
const MISSING = new Set(["NoSuchKey", "NotFound", "AccessDenied"]);

export function createS3PhotoStore(
  settings: PhotoObjectSettings,
  client: S3Sender = new S3Client({
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  }),
): PhotoStore {
  const Bucket = settings.bucket;
  return {
    async permit(Key, { maxBytes, expiresSeconds }) {
      // The signing is local. It needs a real client only for its region and credentials.
      const { url, fields } = await createPresignedPost(client as S3Client, {
        Bucket,
        Key,
        Fields: { "Content-Type": PHOTO_CONTENT_TYPE },
        Conditions: [
          ["content-length-range", 1, maxBytes],
          ["eq", "$Content-Type", PHOTO_CONTENT_TYPE],
        ],
        Expires: expiresSeconds,
      });
      return { url, fields };
    },
    async read(Key, maxBytes) {
      try {
        const { ContentLength, Body } = await client.send(new GetObjectCommand({ Bucket, Key }));
        if (!Body) return { ok: false, reason: "missing" };
        if (ContentLength !== undefined && ContentLength > maxBytes) {
          (Body as { destroy?: () => void }).destroy?.();
          return { ok: false, reason: "too_large" };
        }
        return { ok: true, bytes: await Body.transformToByteArray() };
      } catch (error) {
        if (error instanceof Error && MISSING.has(error.name))
          return { ok: false, reason: "missing" };
        throw error;
      }
    },
    async write(Key, jpeg, { cacheSeconds }) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: jpeg,
          ContentType: PHOTO_CONTENT_TYPE,
          // Short on purpose, unlike most immutable files: a removal has to take effect by this time.
          CacheControl: `public, max-age=${cacheSeconds}`,
        }),
      );
    },
    async remove(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    },
  };
}
