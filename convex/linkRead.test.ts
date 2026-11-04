/// <reference types="vite/client" />
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";

const fake = vi.hoisted(() => ({ model: undefined as unknown, lookup: vi.fn() }));
vi.mock("../src/lib/ai/claim-extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/ai/claim-extractor")>()),
  createLanguageModel: () => fake.model,
}));
vi.mock("node:dns/promises", () => ({ lookup: fake.lookup }));

const modules = import.meta.glob("./**/*.ts");
const youtube = "https://www.youtube.com/watch?v=abcdefghijk";
const instagram = "https://www.instagram.com/p/FICTIONAL1/";
const blog = "https://blog.fictional.example/cat-street";

const drafted = "The baker feeds the cats at closing time.";
function modelSaying(note: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify({ note }) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

async function world() {
  const b = newBackend(modules);
  const member = await addPerson(b, "member", "user");
  const creator = await addPerson(b, "creator", "creator");
  const placeId = await addPlace(b, {
    createdBy: creator,
    visibility: "demo_public",
    kind: "landmark",
  });
  return { b, member, placeId };
}

describe("reading a pasted link", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetcher.mockReset();
    fake.lookup.mockReset();
    fake.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fake.model = modelSaying(drafted);
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("AI_MODEL_WRITE_STORY", "meta:muse-spark-fictional");
    vi.stubEnv("META_API_KEY", "fictional");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses a visitor who has not signed in, before any fetch", async () => {
    const { b, placeId } = await world();
    expect(await errorCode(b.t.action(api.linkRead.previewLink, { placeId, url: youtube }))).toBe(
      "unauthenticated",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads a video's oEmbed and keeps none of it", async () => {
    const { b, placeId } = await world();
    fetcher.mockResolvedValue(
      Response.json({ title: "Cats at dusk", author_name: "Fictional Walker" }),
    );
    expect(
      await b.as("member").action(api.linkRead.previewLink, { placeId, url: youtube }),
    ).toEqual({ outcome: "read", caption: "Cats at dusk", author: "Fictional Walker" });
    expect(await b.run((ctx) => ctx.db.query("source").take(1))).toEqual([]);
  });

  it("fetches nothing for Instagram and gives no words", async () => {
    const { b, placeId } = await world();
    expect(
      await b.as("member").action(api.linkRead.previewLink, { placeId, url: instagram }),
    ).toEqual({ outcome: "embed_only" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(fake.lookup).not.toHaveBeenCalled();
  });

  it("refuses a page that resolves to a private address, and logs only the error's name", async () => {
    const { b, placeId } = await world();
    fake.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    expect(await b.as("member").action(api.linkRead.previewLink, { placeId, url: blog })).toEqual({
      outcome: "unread",
      failure: "RefusedLink",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("link preview failed: RefusedLink");
  });

  it("stops at the daily limit, before any fetch", async () => {
    const { b, member, placeId } = await world();
    await b.run((ctx) =>
      ctx.db.insert("rateLimit", {
        key: `contribution:preview:${member}`,
        windowStart: Date.now(),
        count: 200,
      }),
    );
    expect(
      await errorCode(b.as("member").action(api.linkRead.previewLink, { placeId, url: youtube })),
    ).toBe("rate_limited");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses to draft without the tick: nothing is read and no model runs", async () => {
    const { b, placeId } = await world();
    const model = fake.model as MockLanguageModelV4;
    const refused = await b
      .as("member")
      .action(api.linkRead.draftNote, {
        placeId,
        url: youtube,
        lang: "en",
        mine: false as true,
      })
      .catch((error: unknown) => error);
    expect(String(refused)).toMatch(/Validator error/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("drafts from the post it reads itself, and shares and stores nothing", async () => {
    const { b, placeId } = await world();
    const model = fake.model as MockLanguageModelV4;
    fetcher.mockResolvedValue(Response.json({ title: "The baker feeds the cats at closing time" }));
    expect(
      await b
        .as("member")
        .action(api.linkRead.draftNote, { placeId, url: youtube, lang: "en", mine: true }),
    ).toEqual({ note: drafted });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
      "The baker feeds the cats at closing time",
    );
    expect(await b.run((ctx) => ctx.db.query("source").take(1))).toEqual([]);
  });

  it("sends nothing to a model when the post gave no words", async () => {
    const { b, placeId } = await world();
    const model = fake.model as MockLanguageModelV4;
    expect(
      await b
        .as("member")
        .action(api.linkRead.draftNote, { placeId, url: instagram, lang: "en", mine: true }),
    ).toEqual({ note: null, failure: "NothingToRead" });
    expect(model.doGenerateCalls).toHaveLength(0);
    fetcher.mockResolvedValue(new Response("", { status: 404 }));
    expect(
      await b
        .as("member")
        .action(api.linkRead.draftNote, { placeId, url: youtube, lang: "en", mine: true }),
    ).toEqual({ note: null, failure: "OembedFailed HTTP 404" });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("says so when no model is set, and reads nothing", async () => {
    const { b, placeId } = await world();
    vi.stubEnv("AI_MODEL_WRITE_STORY", "");
    expect(
      await b
        .as("member")
        .action(api.linkRead.draftNote, { placeId, url: youtube, lang: "en", mine: true }),
    ).toEqual({ note: null, failure: "NotConfigured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
