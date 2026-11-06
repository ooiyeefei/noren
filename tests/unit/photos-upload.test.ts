import { describe, expect, it, vi } from "vitest";
import { fitWithin, PhotoUnreadable } from "@/lib/photos/shrink";
import {
  isStillPhotoFile,
  photoDraft,
  PhotoUploadError,
  takeFiles,
  uploadStoryPhoto,
  type PickedPhoto,
} from "@/lib/photos/upload";

describe("fitting a picture", () => {
  it.each([
    [4000, 3000, 2048, 2048, 1536],
    [3000, 4000, 2048, 1536, 2048],
    [2048, 2048, 2048, 2048, 2048],
    [100, 50, 2048, 100, 50],
    [10000, 1, 2048, 2048, 1],
  ])("%s by %s at most %s is %s by %s", (width, height, max, expectedWidth, expectedHeight) => {
    expect(fitWithin(width, height, max)).toEqual({ width: expectedWidth, height: expectedHeight });
  });
});

describe("which files the picker takes", () => {
  it.each([
    ["image/jpeg", true],
    ["image/png", true],
    ["image/webp", true],
    ["image/heic", true],
    ["image/heif", true],
    ["", true], // Some browsers give a HEIC file no type. The canvas decides.
    ["image/svg+xml", false],
    ["image/gif", false],
    ["application/pdf", false],
    ["video/quicktime", false],
  ])("%s: %s", (type, expected) => {
    expect(isStillPhotoFile({ type })).toBe(expected);
  });

  it("takes only what still fits on the story", () => {
    const files = ["a", "b", "c"].map((name) => ({ name, type: "image/jpeg" }));
    expect(takeFiles(files, 2)).toEqual({ taken: files.slice(0, 2), overflow: true, wrong: false });
    expect(takeFiles(files, 3)).toEqual({ taken: files, overflow: false, wrong: false });
    expect(takeFiles(files, 0)).toEqual({ taken: [], overflow: true, wrong: false });
  });

  it("leaves out a GIF and says so", () => {
    const jpeg = { type: "image/jpeg" };
    const gif = { type: "image/gif" };
    expect(takeFiles([gif, jpeg], 4)).toEqual({ taken: [jpeg], overflow: false, wrong: true });
  });
});

describe("what the form needs to know", () => {
  const item = (fields: Partial<PickedPhoto>): PickedPhoto => ({
    id: 1,
    preview: "blob:fictional",
    state: "working",
    ...fields,
  });

  it("holds the finished ids and whether any is still working", () => {
    expect(photoDraft([])).toEqual({ photoIds: [], busy: false });
    expect(
      photoDraft([
        item({ state: "ready", photoId: "a" }),
        item({ state: "working" }),
        item({ state: "failed", problem: "failed" }),
        item({ state: "ready", photoId: "b" }),
      ]),
    ).toEqual({ photoIds: ["a", "b"], busy: true });
    expect(photoDraft([item({ state: "failed", problem: "failed" })]).busy).toBe(false);
  });
});

describe("one upload", () => {
  const permit = {
    photoId: "photo1",
    upload: {
      url: "https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com/",
      fields: { key: "incoming/abc.jpg", "Content-Type": "image/jpeg", Policy: "fictional" },
    },
  };
  const limits = { maxEdgePixels: 2048, jpegQuality: 82 };
  const original = new Blob(["fictional original"], { type: "image/heic" });
  const shrunk = new Blob(["fictional jpeg"], { type: "image/jpeg" });

  function setup(answers: Partial<Record<"permit" | "s3" | "finish", Response | Error>> = {}) {
    const calls: { url: string; init: RequestInit }[] = [];
    const answer = (name: "permit" | "s3" | "finish", fallback: Response) => {
      const value = answers[name] ?? fallback;
      if (value instanceof Error) throw value;
      return value;
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url === "/api/story-photos/permit") return answer("permit", Response.json(permit));
      if (url === "/api/story-photos/finish")
        return answer("finish", Response.json({ photoId: "photo1", width: 2048, height: 1536 }));
      return answer("s3", new Response(null, { status: 204 }));
    });
    const shrink = vi.fn(async () => shrunk);
    const run = () =>
      uploadStoryPhoto(original, { placeId: "place1", limits, fetch, shrink: shrink });
    return { calls, fetch, shrink, run };
  }

  function apiError(status: number, code: string, message = code) {
    return Response.json({ error: { code, message } }, { status });
  }

  async function problemOf(work: Promise<unknown>) {
    try {
      await work;
      return "did not fail";
    } catch (error) {
      expect(error).toBeInstanceOf(PhotoUploadError);
      const failure = error as PhotoUploadError;
      expect(failure.message.trim()).not.toBe("");
      return failure.problem;
    }
  }

  it("shrinks first, asks for a permit, posts to S3, then finishes, sending only ids", async () => {
    const s = setup();
    expect(await s.run()).toEqual({ photoId: "photo1", width: 2048, height: 1536 });
    expect(s.shrink).toHaveBeenCalledWith(original, limits);
    expect(s.calls.map((call) => call.url)).toEqual([
      "/api/story-photos/permit",
      permit.upload.url,
      "/api/story-photos/finish",
    ]);
    expect(JSON.parse(String(s.calls[0]!.init.body))).toEqual({ placeId: "place1" });
    expect(JSON.parse(String(s.calls[2]!.init.body))).toEqual({ photoId: "photo1" });
  });

  it("sends S3 the permit's fields with the shrunk file last, as S3 requires", async () => {
    const s = setup();
    await s.run();
    const form = s.calls[1]!.init.body as FormData;
    const names = [...form.keys()];
    expect(names).toEqual(["key", "Content-Type", "Policy", "file"]);
    expect(form.get("key")).toBe("incoming/abc.jpg");
    expect(await (form.get("file") as File).text()).toBe("fictional jpeg");
    expect(s.calls[1]!.init.credentials).toBe("omit");
  });

  it("never sends the original file anywhere", async () => {
    const s = setup();
    await s.run();
    const file = (s.calls[1]!.init.body as FormData).get("file") as File;
    expect(await file.text()).not.toContain("original");
  });

  it("stops at an unreadable picture without asking for a permit", async () => {
    const s = setup();
    s.shrink.mockRejectedValueOnce(new PhotoUnreadable("fictional"));
    expect(await problemOf(s.run())).toBe("unreadable");
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("says when the daily limit is reached", async () => {
    const s = setup({ permit: apiError(429, "rate_limited") });
    expect(await problemOf(s.run())).toBe("limit");
    expect(s.calls).toHaveLength(1);
  });

  it("reports S3 refusing the file", async () => {
    const s = setup({ s3: new Response("<Error/>", { status: 403 }) });
    expect(await problemOf(s.run())).toBe("failed");
    expect(s.calls).toHaveLength(2);
  });

  it("reports a network failure with its name, so the message is never empty", async () => {
    const s = setup({ s3: new TypeError("") });
    try {
      await s.run();
      throw new Error("did not fail");
    } catch (error) {
      expect((error as PhotoUploadError).problem).toBe("failed");
      expect((error as PhotoUploadError).message).toContain("TypeError");
    }
  });

  it.each(["not_a_jpeg", "not_an_image", "too_many_pixels", "too_large"])(
    "says the file was refused for %s",
    async (reason) => {
      const s = setup({ finish: apiError(400, "invalid_input", reason) });
      expect(await problemOf(s.run())).toBe("rejected");
    },
  );

  it("treats any other server failure as a failure, even with a body it can't read", async () => {
    expect(await problemOf(setup({ finish: apiError(500, "internal") }).run())).toBe("failed");
    expect(await problemOf(setup({ permit: new Response("nope", { status: 502 }) }).run())).toBe(
      "failed",
    );
  });
});
