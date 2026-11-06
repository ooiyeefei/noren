import type { RegionConfig } from "../region/schema";

/**
 * Reads the storage settings from the environment and fails closed: any setting missing or malformed
 * means photos are off. Convex imports this too, so it must stay free of Node and AWS imports.
 */
type Env = Readonly<Record<string, string | undefined>>;

/** What deleting and writing objects needs. Convex has these and no public address. */
export type PhotoObjectSettings = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};
export type PhotoStorageSettings = PhotoObjectSettings & { publicBaseUrl: string };

/** What a page may know. Everything here reaches the browser, so no bucket and no credential. */
export type PublicPhotoProps = {
  baseUrl: string;
  maxPerStory: number;
  maxEdgePixels: number;
  jpegQuality: number;
};

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const AWS_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d+$/;

function setting(env: Env, name: string): string | null {
  return env[name]?.trim() || null;
}

export function photoObjectSettings(env: Env): PhotoObjectSettings | null {
  const bucket = setting(env, "PHOTOS_S3_BUCKET");
  const region = setting(env, "PHOTOS_S3_REGION");
  const accessKeyId = setting(env, "PHOTOS_S3_ACCESS_KEY_ID");
  const secretAccessKey = setting(env, "PHOTOS_S3_SECRET_ACCESS_KEY");
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  if (!BUCKET.test(bucket) || !AWS_REGION.test(region)) return null;
  return { bucket, region, accessKeyId, secretAccessKey };
}

function publicBaseUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function photoStorageSettings(env: Env): PhotoStorageSettings | null {
  const objects = photoObjectSettings(env);
  const base = publicBaseUrl(setting(env, "PHOTOS_PUBLIC_BASE_URL"));
  return objects === null || base === null ? null : { ...objects, publicBaseUrl: base };
}

/** The storage settings, only while the region has photos on. */
export function activePhotoSettings(
  region: Partial<Pick<RegionConfig, "photos">>,
  env: Env,
): PhotoStorageSettings | null {
  return region.photos?.enabled ? photoStorageSettings(env) : null;
}

export function publicPhotoProps(
  region: Partial<Pick<RegionConfig, "photos">>,
  env: Env,
): PublicPhotoProps | null {
  const settings = activePhotoSettings(region, env);
  if (settings === null || !region.photos) return null;
  const { maxPerStory, maxEdgePixels, jpegQuality } = region.photos;
  return { baseUrl: settings.publicBaseUrl, maxPerStory, maxEdgePixels, jpegQuality };
}

/** Where the browser posts an upload, for the content security policy. */
export function photoUploadOrigin({
  bucket,
  region,
}: Pick<PhotoObjectSettings, "bucket" | "region">): string {
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

export function photoUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/${key}`;
}
