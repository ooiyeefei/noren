/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { encodeWav } from "../src/lib/audio/wav";
import { api, internal } from "./_generated/api";
import * as region from "./lib/region";

const provider = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock("../src/lib/ai/meta", () => ({ createMetaTranscriber: () => provider }));
vi.mock("../src/lib/ai/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/ai/config")>()),
  aiConfig: () => ({
    ok: true,
    config: { provider: "meta", apiKey: "fictional-key", modelId: "fictional-speech" },
  }),
}));
const modules = import.meta.glob("./**/*.ts");
const realRegion = region.regionConfig("nagasaki");
function enabled(value = true) {
  vi.spyOn(region, "regionConfig").mockReturnValue({
    ...realRegion,
    voice: { enabled: value, maxSeconds: 120 },
  });
}
async function upload(b: Backend, name = "mina", seconds = 1) {
  const blob = new Blob([encodeWav(new Float32Array(16000 * seconds), 16000)], {
    type: "audio/wav",
  });
  const sha256 = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
    ),
  );
  const { uploadId } = await b.as(name).mutation(api.storyVoice.generateUploadUrl, { sha256 });
  const storageId = await b.t.run((ctx) => ctx.storage.store(blob));
  return { uploadId, storageId, language: "ja" as const };
}

describe("ephemeral story voice", () => {
  beforeEach(() => {
    enabled();
    provider.transcribe.mockResolvedValue({ text: "架空の喫茶店でお茶を飲みました。" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });
  it("requires sign-in and the enabled region at upload", async () => {
    const b = newBackend(modules);
    const args = { sha256: "A".repeat(43) + "=" };
    expect(await errorCode(b.t.mutation(api.storyVoice.generateUploadUrl, args))).toBe(
      "unauthenticated",
    );
    await addPerson(b, "ren", "user");
    enabled(false);
    expect(await errorCode(b.as("ren").mutation(api.storyVoice.generateUploadUrl, args))).toBe(
      "forbidden",
    );
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
  it("turns a recording into words while a new member's name still waits, since nothing is shared", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user", { nameConfirmed: false });
    const args = await upload(b);
    expect(await b.as("mina").action(api.storyVoice.transcribe, args)).toBe(
      "架空の喫茶店でお茶を飲みました。",
    );
    expect(await b.t.run((ctx) => ctx.storage.get(args.storageId))).toBeNull();
  });
  it.each(["en", "ja"] as const)(
    "returns %s text, deletes audio and stores no transcript",
    async (language) => {
      const b = newBackend(modules);
      await addPerson(b, "mina", "user");
      const args = await upload(b);
      expect(await b.as("mina").action(api.storyVoice.transcribe, { ...args, language })).toBe(
        "架空の喫茶店でお茶を飲みました。",
      );
      expect(provider.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array), { language });
      expect(await b.t.run((ctx) => ctx.storage.get(args.storageId))).toBeNull();
      const permit = await b.t.run((ctx) => ctx.db.get("voiceUpload", args.uploadId));
      expect(permit).not.toHaveProperty("text");
      expect(permit?.used).toBe(true);
      expect(await errorCode(b.as("mina").action(api.storyVoice.transcribe, args))).toBe(
        "forbidden",
      );
    },
  );
  it("deletes audio when the provider throws, including a non-Error", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const args = await upload(b);
    provider.transcribe.mockRejectedValueOnce(null);
    expect(await errorCode(b.as("mina").action(api.storyVoice.transcribe, args))).toBe("conflict");
    expect(await b.t.run((ctx) => ctx.storage.get(args.storageId))).toBeNull();
  });
  it("checks the flag again at transcription and still deletes audio", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const args = await upload(b);
    enabled(false);
    expect(await errorCode(b.as("mina").action(api.storyVoice.transcribe, args))).toBe("forbidden");
    expect(await b.t.run((ctx) => ctx.storage.get(args.storageId))).toBeNull();
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
  it("refuses strangers and mismatched digests without deleting another recording", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    await addPerson(b, "ren", "user");
    const args = await upload(b);
    expect(await errorCode(b.as("ren").action(api.storyVoice.transcribe, args))).toBe("forbidden");
    const other = await b.t.run((ctx) => ctx.storage.store(new Blob(["private fictional audio"])));
    expect(
      await errorCode(
        b.as("mina").action(api.storyVoice.transcribe, { ...args, storageId: other }),
      ),
    ).toBe("forbidden");
    expect(await b.t.run(async (ctx) => (await ctx.storage.get(other)) !== null)).toBe(true);
    expect(await b.t.run(async (ctx) => (await ctx.storage.get(args.storageId)) !== null)).toBe(
      true,
    );
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
  it("reserves only five recordings a day for a new account", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const args = { sha256: "A".repeat(43) + "=" };
    for (let n = 0; n < 5; n++) await b.as("mina").mutation(api.storyVoice.generateUploadUrl, args);
    expect(await errorCode(b.as("mina").mutation(api.storyVoice.generateUploadUrl, args))).toBe(
      "rate_limited",
    );
  });
  it("removes a recording left behind when the browser closed before transcribing", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const other = await b.t.run((ctx) => ctx.storage.store(new Blob(["private fictional audio"])));
    const left = await upload(b);
    await b.t.mutation(internal.storyVoice.expire, { uploadId: left.uploadId });
    expect(await b.t.run((ctx) => ctx.storage.get(left.storageId))).toBeNull();
    expect(await b.t.run((ctx) => ctx.db.get("voiceUpload", left.uploadId))).toBeNull();
    expect(await b.t.run(async (ctx) => (await ctx.storage.get(other)) !== null)).toBe(true);
  });

  it("schedules a last look for an upload that lands after its permit has gone", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const other = await b.t.run((ctx) => ctx.storage.store(new Blob(["private fictional audio"])));
    const { uploadId, storageId } = await upload(b);
    const permit = await b.t.run((ctx) => ctx.db.get("voiceUpload", uploadId));
    const looks = await b.t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(looks.map((job) => job.name).sort()).toEqual(["storyVoice:expire", "storyVoice:sweep"]);
    await b.t.mutation(internal.storyVoice.sweep, {
      sha256: permit!.sha256,
      after: permit!._creationTime,
    });
    expect(await b.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
    expect(await b.t.run(async (ctx) => (await ctx.storage.get(other)) !== null)).toBe(true);
  });

  it("does not touch a file from before the permit, even with the same digest", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const { uploadId, storageId } = await upload(b);
    const permit = await b.t.run((ctx) => ctx.db.get("voiceUpload", uploadId));
    const file = await b.t.run((ctx) => ctx.db.system.get("_storage", storageId));
    await b.t.mutation(internal.storyVoice.sweep, {
      sha256: permit!.sha256,
      after: file!._creationTime + 1,
    });
    expect(await b.t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null)).toBe(true);
  });

  it("rejects overlong WAV before sending it, deletes it, and expires permits", async () => {
    const b = newBackend(modules);
    await addPerson(b, "mina", "user");
    const args = await upload(b, "mina", 121);
    expect(await errorCode(b.as("mina").action(api.storyVoice.transcribe, args))).toBe(
      "invalid_input",
    );
    expect(provider.transcribe).not.toHaveBeenCalled();
    expect(await b.t.run((ctx) => ctx.storage.get(args.storageId))).toBeNull();
    await b.t.mutation(internal.storyVoice.expire, { uploadId: args.uploadId });
    expect(await b.t.run((ctx) => ctx.db.get("voiceUpload", args.uploadId))).toBeNull();
  });
});
