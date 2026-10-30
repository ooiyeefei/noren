/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { addInterview, addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function world(consent = true) {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  await addPerson(b, "other", "creator", { isMock: true });
  await addPerson(b, "steward", "steward", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator });
  const interviewId = await addInterview(b, { placeId, interviewerId: creator, consent });
  const store = (type = "audio/webm", reportedSize?: number) =>
    b.t.run((ctx) => {
      const blob = new Blob(reportedSize === 0 ? [] : ["mock recording"], { type });
      // convex-test writes blob.size into _storage; avoid allocating 100 MB for this boundary.
      if (reportedSize !== undefined) Object.defineProperty(blob, "size", { value: reportedSize });
      return ctx.storage.store(blob);
    });
  const stored = () => b.t.run((ctx) => ctx.db.get("interview", interviewId));
  return { b, interviewId, store, stored };
}

describe("audio storage adapter", () => {
  it("no upload URL without consent (conflict)", async () => {
    const { b, interviewId } = await world(false);
    expect(
      await errorCode(b.as("creator").mutation(api.audio.generateUploadUrl, { interviewId })),
    ).toBe("conflict");
  });

  it("an upload URL with consent", async () => {
    const { b, interviewId } = await world();
    expect(await b.as("creator").mutation(api.audio.generateUploadUrl, { interviewId })).toMatch(
      /^https:\/\//,
    );
    expect(await b.as("steward").mutation(api.audio.generateUploadUrl, { interviewId })).toMatch(
      /^https:\/\//,
    );
  });

  it("attach accepts an audio file and moves the interview to uploaded", async () => {
    const { b, interviewId, store, stored } = await world();
    const storageId = await store();
    await b.run((ctx) =>
      ctx.db.patch("interview", interviewId, { processingError: "mock failure" }),
    );
    expect(
      await b.as("creator").mutation(api.audio.attach, { interviewId, storageId, durationS: 4 }),
    ).toEqual({ ok: true });
    expect(await stored()).toMatchObject({
      audioStorageId: storageId,
      status: "uploaded",
      durationS: 4,
    });
    expect((await stored())?.processingError).toBeUndefined();
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  it.each([
    { kind: "non-audio", type: "text/plain", size: undefined, reason: /audio content type/ },
    { kind: "empty", type: "audio/webm", size: 0, reason: /empty/ },
    { kind: "oversized", type: "audio/webm", size: 100 * 1024 * 1024 + 1, reason: /100 MB/ },
  ])(
    "attach rejects a $kind file, commits deletion and allows a valid retry",
    async ({ type, size, reason }) => {
      const { b, interviewId, store, stored } = await world();
      await b.run(async (ctx) => {
        await ctx.db.patch("interview", interviewId, { processingError: "mock failure" });
        await ctx.db.insert("auditLog", {
          actorKind: "system",
          action: "mock.fixture",
          targetType: "interview",
          targetId: interviewId,
        });
      });
      const audit = () => b.t.run((ctx) => ctx.db.query("auditLog").take(100));
      const before = await stored();
      const auditBefore = await audit();
      const storageId = await store(type, size);
      const result = await b.as("creator").mutation(api.audio.attach, { interviewId, storageId });
      expect(result).toMatchObject({ ok: false, code: "invalid_input" });
      if (result.ok) throw new Error("expected an invalid upload rejection");
      expect(result.message.trim().length).toBeGreaterThan(0);
      expect(result.message).toMatch(reason);
      expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
      expect(await b.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
      expect(await stored()).toEqual(before);
      expect(await audit()).toEqual(auditBefore);
      const valid = await store();
      expect(
        await b.as("creator").mutation(api.audio.attach, { interviewId, storageId: valid }),
      ).toEqual({ ok: true });
      expect(await stored()).toMatchObject({ audioStorageId: valid, status: "uploaded" });
    },
  );

  it("attach replaces and deletes an earlier file", async () => {
    const { b, interviewId, store, stored } = await world();
    const old = await store();
    await b.as("creator").mutation(api.audio.attach, { interviewId, storageId: old });
    const storageId = await store("audio/ogg");
    await b.as("creator").mutation(api.audio.attach, { interviewId, storageId });
    expect((await stored())?.audioStorageId).toBe(storageId);
    expect(await b.t.run((ctx) => ctx.storage.getUrl(old))).toBeNull();
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  it("another creator gets not_found on an unreadable draft", async () => {
    const { b, interviewId, store, stored } = await world();
    const storageId = await store("text/plain");
    const before = await stored();
    expect(
      await errorCode(b.as("other").mutation(api.audio.generateUploadUrl, { interviewId })),
    ).toBe("not_found");
    expect(
      await errorCode(b.as("other").mutation(api.audio.attach, { interviewId, storageId })),
    ).toBe("not_found");
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    expect(await stored()).toEqual(before);
  });

  it("another creator is forbidden when the place is readable", async () => {
    const { b, interviewId, store, stored } = await world();
    const interview = await stored();
    if (interview === null) throw new Error("fixture interview is missing");
    await b.run((ctx) => ctx.db.patch("place", interview.placeId, { visibility: "pilot" }));
    const storageId = await store("text/plain");
    expect(
      await errorCode(b.as("other").mutation(api.audio.generateUploadUrl, { interviewId })),
    ).toBe("forbidden");
    expect(
      await errorCode(b.as("other").mutation(api.audio.attach, { interviewId, storageId })),
    ).toBe("forbidden");
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    expect(await stored()).toEqual(interview);
  });

  it("attach without consent is conflict", async () => {
    const { b, interviewId, store, stored } = await world(false);
    const storageId = await store("text/plain");
    const before = await stored();
    expect(
      await errorCode(b.as("creator").mutation(api.audio.attach, { interviewId, storageId })),
    ).toBe("conflict");
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    expect(await stored()).toEqual(before);
  });

  it.each(["done", "withdrawn"] as const)(
    "upload URL and attach refuse %s interviews",
    async (status) => {
      const { b, interviewId, store } = await world();
      await b.run((ctx) => ctx.db.patch("interview", interviewId, { status }));
      expect(
        await errorCode(b.as("creator").mutation(api.audio.generateUploadUrl, { interviewId })),
      ).toBe("conflict");
      expect(
        await errorCode(
          b.as("creator").mutation(api.audio.attach, { interviewId, storageId: await store() }),
        ),
      ).toBe("conflict");
    },
  );

  it("reattaching the same storage id preserves the file", async () => {
    const { b, interviewId, store } = await world();
    const storageId = await store();
    await b.as("creator").mutation(api.audio.attach, { interviewId, storageId });
    await b.as("creator").mutation(api.audio.attach, { interviewId, storageId });
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  it("attach validates stored size at the 100 MB boundary without allocating a large blob", async () => {
    const { b, interviewId, store, stored } = await world();
    const storageId = await store("audio/webm", 100 * 1024 * 1024);
    expect(await b.as("creator").mutation(api.audio.attach, { interviewId, storageId })).toEqual({
      ok: true,
    });
    const before = await stored();
    const oversized = await store("audio/webm", 100 * 1024 * 1024 + 1);
    expect(
      await b.as("creator").mutation(api.audio.attach, { interviewId, storageId: oversized }),
    ).toEqual({ ok: false, code: "invalid_input", message: expect.stringMatching(/100 MB/) });
    expect(await stored()).toEqual(before);
    expect(await b.t.run((ctx) => ctx.storage.getUrl(oversized))).toBeNull();
    expect(await b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  it("a missing stored file is invalid_input", async () => {
    const { b, interviewId, store } = await world();
    const storageId = await store();
    await b.t.run((ctx) => ctx.storage.delete(storageId));
    expect(await b.as("creator").mutation(api.audio.attach, { interviewId, storageId })).toEqual({
      ok: false,
      code: "invalid_input",
      message: expect.stringMatching(/not found/),
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "invalid duration %s is invalid_input",
    async (durationS) => {
      const { b, interviewId, store } = await world();
      expect(
        await errorCode(
          b
            .as("creator")
            .mutation(api.audio.attach, { interviewId, storageId: await store(), durationS }),
        ),
      ).toBe("invalid_input");
    },
  );
});
