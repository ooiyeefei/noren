import { ConvexError } from "convex/values";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reencodePhoto } from "@/lib/photos/process";
import {
  createPhotoFinishRoute,
  createPhotoPermitRoute,
  type PhotoConvex,
  type PhotoRouteDeps,
} from "@/lib/photos/routes";
import type { PhotoStore } from "@/lib/photos/s3-store";
import { activeRegionConfig } from "@/lib/region/registry";

const region = activeRegionConfig();
const env = {
  PHOTOS_S3_BUCKET: "fictional-photo-bucket",
  PHOTOS_S3_REGION: "ap-northeast-1",
  PHOTOS_S3_ACCESS_KEY_ID: "AKIAFICTIONAL",
  PHOTOS_S3_SECRET_ACCESS_KEY: "fictional-secret-value",
  PHOTOS_PUBLIC_BASE_URL: "https://photos.fictional.example",
};
const on = { photos: { ...region.photos, enabled: true } };
const INCOMING = `incoming/${"a".repeat(32)}.jpg`;
const FINAL = `photos/${"b".repeat(32)}.jpg`;

function appError(code: string) {
  return new ConvexError({ code, message: `fictional ${code}` });
}

function setup(overrides: Partial<PhotoRouteDeps> = {}) {
  const convex = {
    begin: vi.fn<PhotoConvex["begin"]>(async () => ({ photoId: "photo1", incomingKey: INCOMING })),
    ticket: vi.fn<PhotoConvex["ticket"]>(async () => ({ incomingKey: INCOMING, key: FINAL })),
    complete: vi.fn<PhotoConvex["complete"]>(async () => null),
    remove: vi.fn<PhotoConvex["remove"]>(async () => null),
  };
  const store = {
    permit: vi.fn<PhotoStore["permit"]>(async () => ({
      url: "https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com/",
      fields: { key: INCOMING },
    })),
    read: vi.fn<PhotoStore["read"]>(),
    write: vi.fn<PhotoStore["write"]>(async () => undefined),
    remove: vi.fn<PhotoStore["remove"]>(async () => undefined),
  };
  const makeStore = vi.fn(() => store);
  const deps: PhotoRouteDeps = {
    region: on,
    env,
    convex: async () => convex,
    store: makeStore,
    reencode: reencodePhoto,
    ...overrides,
  };
  const post = (handler: (request: Request) => Promise<Response>, body: unknown) =>
    handler(
      new Request("https://noren.test/api/story-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return {
    convex,
    store,
    makeStore,
    permit: (body: unknown = { placeId: "place1" }) => post(createPhotoPermitRoute(deps), body),
    finish: (body: unknown = { photoId: "photo1" }) => post(createPhotoFinishRoute(deps), body),
  };
}

async function realJpeg(width = 120, height = 80) {
  return await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .withExif({ IFD0: { Make: "FictionalCam" } })
    .jpeg()
    .toBuffer();
}

async function codeOf(response: Response) {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ["permit", (s: ReturnType<typeof setup>) => s.permit()],
  ["finish", (s: ReturnType<typeof setup>) => s.finish()],
] as const)("the %s route when it should refuse", (_name, call) => {
  it("refuses while the region has photos off, before doing any work", async () => {
    const s = setup({ region: { photos: { ...region.photos, enabled: false } } });
    const response = await call(s);
    expect(response.status).toBe(404);
    expect(s.makeStore).not.toHaveBeenCalled();
    expect(s.convex.begin).not.toHaveBeenCalled();
    expect(s.convex.ticket).not.toHaveBeenCalled();
  });

  it.each(Object.keys(env))("refuses when %s is missing", async (name) => {
    const s = setup({ env: { ...env, [name]: undefined } });
    expect((await call(s)).status).toBe(404);
    expect(s.makeStore).not.toHaveBeenCalled();
  });

  it("refuses someone signed out", async () => {
    const s = setup({ convex: async () => null });
    const response = await call(s);
    expect(response.status).toBe(401);
    expect(s.makeStore).not.toHaveBeenCalled();
  });
});

describe("the permit route", () => {
  it("gives a permit for the key Convex chose", async () => {
    const s = setup();
    const response = await s.permit();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await response.json()).toEqual({
      photoId: "photo1",
      upload: {
        url: "https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com/",
        fields: { key: INCOMING },
      },
    });
    expect(s.convex.begin).toHaveBeenCalledWith({ placeId: "place1" });
    expect(s.store.permit).toHaveBeenCalledWith(INCOMING, {
      maxBytes: region.photos.maxUploadBytes,
      expiresSeconds: region.photos.permitSeconds,
    });
  });

  it("ignores a key the client sends", async () => {
    const s = setup();
    const response = await s.permit({ placeId: "place1", key: "photos/someone-elses.jpg" });
    expect(response.status).toBe(200);
    expect(s.store.permit.mock.calls[0]![0]).toBe(INCOMING);
  });

  it.each(["forbidden", "rate_limited", "not_found"])(
    "passes on Convex's %s and gives no permit",
    async (code) => {
      const s = setup();
      s.convex.begin.mockRejectedValueOnce(appError(code));
      const response = await s.permit();
      expect(await codeOf(response)).toBe(code);
      expect(s.store.permit).not.toHaveBeenCalled();
    },
  );

  it("refuses a body with no place", async () => {
    const s = setup();
    expect((await s.permit({})).status).toBe(400);
    expect((await s.permit({ placeId: "../../etc" })).status).toBe(400);
    expect(s.convex.begin).not.toHaveBeenCalled();
  });

  it("will not sign a key outside incoming/, even if a row somehow holds one", async () => {
    const s = setup();
    s.convex.begin.mockResolvedValueOnce({ photoId: "photo1", incomingKey: FINAL });
    expect((await s.permit()).status).toBe(500);
    expect(s.store.permit).not.toHaveBeenCalled();
  });
});

describe("the finish route", () => {
  it("re-encodes, writes the new file, deletes the upload, and records it, in that order", async () => {
    const s = setup();
    const order: string[] = [];
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: await realJpeg() });
    s.store.write.mockImplementationOnce(async () => void order.push("write"));
    s.store.remove.mockImplementationOnce(async () => void order.push("remove"));
    s.convex.complete.mockImplementationOnce(async () => {
      order.push("complete");
      return null;
    });
    const response = await s.finish();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ photoId: "photo1", width: 120, height: 80 });
    expect(order).toEqual(["write", "remove", "complete"]);
    expect(s.store.read).toHaveBeenCalledWith(INCOMING, region.photos.maxUploadBytes);
    expect(s.store.remove).toHaveBeenCalledWith(INCOMING);
    expect(s.convex.complete).toHaveBeenCalledWith({ photoId: "photo1", width: 120, height: 80 });
  });

  it("stores no metadata: the bytes written come from the re-encode, not the upload", async () => {
    const s = setup();
    const upload = await realJpeg();
    expect(upload.includes("FictionalCam")).toBe(true);
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: upload });
    await s.finish();
    const [key, written, options] = s.store.write.mock.calls[0]!;
    expect(key).toBe(FINAL);
    expect(options).toEqual({ cacheSeconds: region.photos.cacheSeconds });
    expect(Buffer.from(written).includes("FictionalCam")).toBe(false);
    expect((await sharp(written).metadata()).exif).toBeUndefined();
  });

  it("takes only a photo id, so a client can't point it at another key", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: await realJpeg() });
    await s.finish({ photoId: "photo1", key: "photos/someone-elses.jpg", incomingKey: "x" });
    expect(s.convex.ticket).toHaveBeenCalledWith({ photoId: "photo1" });
    expect(s.store.read.mock.calls[0]![0]).toBe(INCOMING);
    expect(s.store.write.mock.calls[0]![0]).toBe(FINAL);
  });

  it("stops when the upload is someone else's, touching nothing", async () => {
    const s = setup();
    s.convex.ticket.mockRejectedValueOnce(appError("not_found"));
    expect(await codeOf(await s.finish())).toBe("not_found");
    expect(s.store.read).not.toHaveBeenCalled();
    expect(s.store.write).not.toHaveBeenCalled();
    expect(s.store.remove).not.toHaveBeenCalled();
  });

  it("refuses a ticket whose keys are not the shape Convex makes", async () => {
    const s = setup();
    s.convex.ticket.mockResolvedValueOnce({ incomingKey: FINAL, key: INCOMING });
    expect((await s.finish()).status).toBe(500);
    expect(s.store.read).not.toHaveBeenCalled();
  });

  it("refuses bytes that are no JPEG, writes nothing and drops the row", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({
      ok: true,
      bytes: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><script>1</script></svg>',
      ),
    });
    const response = await s.finish();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_input", message: "not_a_jpeg" },
    });
    expect(s.store.write).not.toHaveBeenCalled();
    expect(s.convex.complete).not.toHaveBeenCalled();
    expect(s.convex.remove).toHaveBeenCalledWith({ photoId: "photo1" });
  });

  it("still answers with the refusal if dropping the row fails", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: Buffer.from("fictional") });
    s.convex.remove.mockRejectedValueOnce(new Error("fictional outage"));
    expect((await s.finish()).status).toBe(400);
  });

  it("says when nothing was uploaded", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: false, reason: "missing" });
    expect(await codeOf(await s.finish())).toBe("conflict");
    expect(s.store.write).not.toHaveBeenCalled();
  });

  it("refuses an upload over the size limit", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: false, reason: "too_large" });
    expect(await codeOf(await s.finish())).toBe("invalid_input");
    expect(s.store.write).not.toHaveBeenCalled();
    expect(s.convex.remove).toHaveBeenCalledWith({ photoId: "photo1" });
  });

  it("still records the photo when the upload can't be deleted, since it expires by itself", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: await realJpeg() });
    s.store.remove.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "SlowDown" }));
    expect((await s.finish()).status).toBe(200);
    expect(s.convex.complete).toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.join(" ")).toContain("SlowDown");
  });

  it.each(["not_found", "unauthenticated"])(
    "deletes the new file when the row or its member went away meanwhile (%s)",
    async (code) => {
      const s = setup();
      s.store.read.mockResolvedValueOnce({ ok: true, bytes: await realJpeg() });
      s.convex.complete.mockRejectedValueOnce(appError(code));
      expect(await codeOf(await s.finish())).toBe(code);
      expect(s.store.remove).toHaveBeenCalledWith(FINAL);
    },
  );

  it("keeps the new file on any other failure, because the row still owns it", async () => {
    const s = setup();
    s.store.read.mockResolvedValueOnce({ ok: true, bytes: await realJpeg() });
    s.convex.complete.mockRejectedValueOnce(new Error("fictional outage"));
    expect((await s.finish()).status).toBe(500);
    expect(s.store.remove).not.toHaveBeenCalledWith(FINAL);
  });

  it("never lets a diagnostic degrade to nothing, and never logs a secret", async () => {
    const s = setup();
    s.store.read.mockRejectedValueOnce(Object.assign(new Error(""), { name: "AbortError" }));
    const response = await s.finish();
    expect(response.status).toBe(500);
    const logged = vi.mocked(console.error).mock.calls.join(" ");
    expect(logged).toContain("AbortError");
    expect(logged).not.toContain(env.PHOTOS_S3_SECRET_ACCESS_KEY);
  });
});
