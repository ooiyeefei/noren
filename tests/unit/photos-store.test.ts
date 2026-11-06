import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createS3PhotoStore, type S3Sender } from "@/lib/photos/s3-store";

const settings = {
  bucket: "fictional-photo-bucket",
  region: "ap-northeast-1",
  accessKeyId: "AKIAFICTIONAL",
  secretAccessKey: "fictional-secret-value",
};

type Command = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(answer: (command: Command) => unknown = () => ({})) {
  const send = vi.fn(async (command: Command) => answer(command));
  return { send: send as unknown as S3Sender["send"], commands: send };
}

function named(name: string, message = "fictional") {
  return Object.assign(new Error(message), { name });
}

describe("the upload permit", () => {
  // Signing happens locally. No request leaves this machine.
  const permit = () => {
    const client = new S3Client({
      region: settings.region,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
    });
    const send = vi.spyOn(client, "send");
    return {
      send,
      result: createS3PhotoStore(settings, client).permit("incoming/abc123.jpg", {
        maxBytes: 6_000_000,
        expiresSeconds: 300,
      }),
    };
  };

  it("posts to the bucket's own address, which the content security policy names", async () => {
    const { url } = await permit().result;
    expect(url).toBe("https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com/");
  });

  it("allows one exact key, a size limit and a JPEG content type, for a short time", async () => {
    const { fields } = await permit().result;
    expect(fields.key).toBe("incoming/abc123.jpg");
    expect(fields["Content-Type"]).toBe("image/jpeg");
    const policy = JSON.parse(Buffer.from(fields.Policy!, "base64").toString()) as {
      expiration: string;
      conditions: unknown[];
    };
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 6_000_000]);
    expect(policy.conditions).toContainEqual(["eq", "$Content-Type", "image/jpeg"]);
    expect(policy.conditions).toContainEqual({ key: "incoming/abc123.jpg" });
    expect(policy.conditions).toContainEqual({ bucket: "fictional-photo-bucket" });
    const seconds = (Date.parse(policy.expiration) - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it("makes no network call and never hands over the secret key", async () => {
    const { send, result } = permit();
    const { url, fields } = await result;
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify({ url, fields })).not.toContain(settings.secretAccessKey);
  });
});

describe("reading an upload", () => {
  it("returns the bytes", async () => {
    const { send } = fakeClient(() => ({
      ContentLength: 3,
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    }));
    const store = createS3PhotoStore(settings, { send });
    expect(await store.read("incoming/a.jpg", 10)).toEqual({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  it("refuses a file over the limit without reading it", async () => {
    const transformToByteArray = vi.fn();
    const destroy = vi.fn();
    const { send } = fakeClient(() => ({
      ContentLength: 11,
      Body: { transformToByteArray, destroy },
    }));
    expect(await createS3PhotoStore(settings, { send }).read("incoming/a.jpg", 10)).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(transformToByteArray).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  // Without list permission, which the setup script does not give, S3 answers a missing key this way.
  it.each(["NoSuchKey", "NotFound", "AccessDenied"])(
    "treats %s as nothing uploaded",
    async (name) => {
      const { send } = fakeClient(() => {
        throw named(name);
      });
      expect(await createS3PhotoStore(settings, { send }).read("incoming/a.jpg", 10)).toEqual({
        ok: false,
        reason: "missing",
      });
    },
  );

  it("lets any other failure surface", async () => {
    const { send } = fakeClient(() => {
      throw named("SlowDown");
    });
    await expect(
      createS3PhotoStore(settings, { send }).read("incoming/a.jpg", 10),
    ).rejects.toThrow();
  });
});

describe("writing and removing", () => {
  it("writes a JPEG that may be cached only for the time a removal may take", async () => {
    const { send, commands } = fakeClient();
    await createS3PhotoStore(settings, { send }).write("photos/a.jpg", Buffer.from([9]), {
      cacheSeconds: 3600,
    });
    const [command] = commands.mock.calls[0]!;
    expect(command.constructor.name).toBe("PutObjectCommand");
    expect(command.input).toMatchObject({
      Bucket: "fictional-photo-bucket",
      Key: "photos/a.jpg",
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=3600",
    });
  });

  it("deletes the object", async () => {
    const { send, commands } = fakeClient();
    await createS3PhotoStore(settings, { send }).remove("photos/a.jpg");
    const [command] = commands.mock.calls[0]!;
    expect(command.constructor.name).toBe("DeleteObjectCommand");
    expect(command.input).toEqual({ Bucket: "fictional-photo-bucket", Key: "photos/a.jpg" });
  });
});
