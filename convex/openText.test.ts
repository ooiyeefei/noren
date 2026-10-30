/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { addOwner, addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const input = {
  lang: "en",
  text: "  Mock landmark text.  ",
  licence: "CC-BY-SA-4.0" as const,
  sourceUrl: "https://example.com/mock-landmark",
  attribution: "Fictional test author",
  revisionRef: "test-revision",
  retrievedAt: 123,
};
async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward", { isMock: true });
  const creator = await addPerson(b, "creator", "creator", { isMock: true });
  const owner = await addPerson(b, "owner", "business_owner", { isMock: true });
  const placeId = await addPlace(b, { createdBy: creator, kind: "landmark", isMock: false });
  return { b, steward, creator, owner, placeId, client: b.as("steward") };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function imported(f: Fixture, linked = false): Promise<Id<"openTextSnippet">> {
  await f.b.t.mutation(internal.openText.importSnippets, { snippets: [input] });
  const [snippet] = await f.client.query(api.openText.listUnlinked, {});
  if (linked)
    await f.client.mutation(api.openText.link, { snippetId: snippet!._id, placeId: f.placeId });
  return snippet!._id;
}

async function writeState(f: Fixture, snippetId: Id<"openTextSnippet">) {
  return await f.b.run(async (ctx) => ({
    claims: await ctx.db.query("claim").take(100),
    snippet: await ctx.db.get("openTextSnippet", snippetId),
    audit: await ctx.db.query("auditLog").take(100),
  }));
}

async function expectGuardRefusal(
  f: Fixture,
  snippetId: Id<"openTextSnippet">,
  mutate: () => Promise<unknown>,
  code: "conflict" | "not_found" = "conflict",
) {
  const before = await writeState(f, snippetId);
  expect(before.claims).toEqual([]);
  expect(before.snippet).not.toBeNull();
  expect(before.snippet?.approvedBy).toBeUndefined();
  expect(await errorCode(mutate())).toBe(code);
  expect(await writeState(f, snippetId)).toEqual(before);
}

describe("open text", () => {
  it("importSnippets inserts CC BY-SA snippets and skips a repeated sourceUrl and lang", async () => {
    const f = await setup();
    expect(
      await f.b.t.mutation(internal.openText.importSnippets, { snippets: [input, input] }),
    ).toEqual({ inserted: 1, skipped: 1 });
    expect(
      await f.b.t.mutation(internal.openText.importSnippets, {
        snippets: [input, { ...input, lang: "ja" }],
      }),
    ).toEqual({ inserted: 1, skipped: 1 });
    const rows = await f.client.query(api.openText.listUnlinked, {});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      text: "Mock landmark text.",
      approved: false,
      licence: "CC-BY-SA-4.0",
      revisionRef: "test-revision",
    });
    expect(rows[0]?.placeId).toBeUndefined();
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorKind: "system",
          action: "open_text.import",
          diff: { inserted: 1, skipped: 1 },
        }),
      ]),
    );
  });

  it("ODbL text is invalid_input", async () => {
    const f = await setup();
    expect(
      await errorCode(
        f.b.t.mutation(internal.openText.importSnippets, {
          snippets: [{ ...input, licence: "ODbL-1.0" }],
        }),
      ),
    ).toBe("invalid_input");
    expect(await f.client.query(api.openText.listUnlinked, {})).toEqual([]);
  });

  it.each(["", " ", "x".repeat(20001)])("invalid text is invalid_input (%#)", async (text) => {
    const f = await setup();
    expect(
      await errorCode(
        f.b.t.mutation(internal.openText.importSnippets, { snippets: [{ ...input, text }] }),
      ),
    ).toBe("invalid_input");
  });

  it("import validates https URLs and the 50-row batch limit atomically", async () => {
    const f = await setup();
    for (const sourceUrl of ["http://example.com/test", "not a URL"]) {
      expect(
        await errorCode(
          f.b.t.mutation(internal.openText.importSnippets, {
            snippets: [input, { ...input, sourceUrl }],
          }),
        ),
      ).toBe("invalid_input");
      expect(await f.client.query(api.openText.listUnlinked, {})).toEqual([]);
    }
    expect(
      await errorCode(
        f.b.t.mutation(internal.openText.importSnippets, {
          snippets: Array.from({ length: 51 }, () => input),
        }),
      ),
    ).toBe("invalid_input");
  });

  it("link attaches a snippet to an unowned landmark", async () => {
    const f = await setup();
    const snippetId = await imported(f, true);
    expect(await f.client.query(api.openText.listForPlace, { placeId: f.placeId })).toEqual([
      expect.objectContaining({ _id: snippetId, placeId: f.placeId, approved: false }),
    ]);
    expect(
      await f.client.mutation(api.openText.link, { snippetId, placeId: f.placeId }),
    ).toBeNull();
    const other = await addPlace(f.b, { createdBy: f.creator });
    expect(
      await errorCode(f.client.mutation(api.openText.link, { snippetId, placeId: other })),
    ).toBe("conflict");
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "open_text.link",
          actorPersonId: f.steward,
          diff: { placeId: f.placeId },
        }),
      ]),
    );
  });

  it("link refuses a place that is not a landmark", async () => {
    const f = await setup();
    const snippetId = await imported(f);
    const business = await addPlace(f.b, {
      createdBy: f.creator,
      kind: "business",
      withPin: true,
    });
    await expectGuardRefusal(f, snippetId, () =>
      f.client.mutation(api.openText.link, { snippetId, placeId: business }),
    );
    expect((await writeState(f, snippetId)).snippet?.placeId).toBeUndefined();
  });

  it("link refuses a landmark that has no pin", async () => {
    const f = await setup();
    const snippetId = await imported(f);
    const unpinned = await addPlace(f.b, {
      createdBy: f.creator,
      kind: "landmark",
      withPin: false,
    });
    await expectGuardRefusal(f, snippetId, () =>
      f.client.mutation(api.openText.link, { snippetId, placeId: unpinned }),
    );
    expect((await writeState(f, snippetId)).snippet?.placeId).toBeUndefined();
  });

  it("link accepts a pinned landmark without an owner", async () => {
    const f = await setup();
    const snippetId = await imported(f);
    expect(await f.b.run((ctx) => ctx.db.query("placeOwner").take(10))).toEqual([]);
    expect(
      await f.client.mutation(api.openText.link, { snippetId, placeId: f.placeId }),
    ).toBeNull();
    expect((await writeState(f, snippetId)).snippet).toMatchObject({ placeId: f.placeId });
    expect(await f.client.query(api.openText.listUnlinked, {})).toEqual([]);
  });

  it("approveExcerpts refuses when the linked place is not a landmark", async () => {
    const f = await setup();
    const snippetId = await imported(f, true);
    await f.b.t.run((ctx) => ctx.db.patch("place", f.placeId, { kind: "business" }));
    await expectGuardRefusal(f, snippetId, () =>
      f.client.mutation(api.openText.approveExcerpts, {
        snippetId,
        excerpts: [{ start: 0, end: 4, kind: "fact" }],
      }),
    );
  });

  it("approveExcerpts refuses a landmark that lost its pin", async () => {
    const f = await setup();
    const snippetId = await imported(f, true);
    await f.b.t.run(async (ctx) => {
      const pins = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", f.placeId))
        .take(100);
      for (const pin of pins) await ctx.db.delete("pin", pin._id);
    });
    await expectGuardRefusal(f, snippetId, () =>
      f.client.mutation(api.openText.approveExcerpts, {
        snippetId,
        excerpts: [{ start: 0, end: 4, kind: "fact" }],
      }),
    );
  });

  it("a missing place is not_found, not conflict", async () => {
    for (const linked of [false, true]) {
      const f = await setup();
      const snippetId = await imported(f, linked);
      await f.b.t.run((ctx) => ctx.db.delete("place", f.placeId));
      await expectGuardRefusal(
        f,
        snippetId,
        () =>
          linked
            ? f.client.mutation(api.openText.approveExcerpts, {
                snippetId,
                excerpts: [{ start: 0, end: 4, kind: "fact" }],
              })
            : f.client.mutation(api.openText.link, { snippetId, placeId: f.placeId }),
        "not_found",
      );
    }
  });

  it("link to a place with an owner is conflict", async () => {
    const f = await setup();
    const snippetId = await imported(f);
    await addOwner(f.b, f.placeId, f.owner, f.steward);
    expect(
      await errorCode(f.client.mutation(api.openText.link, { snippetId, placeId: f.placeId })),
    ).toBe("conflict");
    expect(await f.client.query(api.openText.listUnlinked, {})).toHaveLength(1);
  });

  it("approveExcerpts creates published open-text claims whose quote is the excerpt", async () => {
    const f = await setup();
    const snippetId = await imported(f, true);
    const ids = await f.client.mutation(api.openText.approveExcerpts, {
      snippetId,
      excerpts: [
        { start: 4, end: 14, kind: "story" },
        { start: 0, end: 4, kind: "fact" },
      ],
    });
    expect(ids).toHaveLength(2);
    const claim = await f.b.run((ctx) => ctx.db.get("claim", ids[0]!));
    expect(claim).toMatchObject({
      placeId: f.placeId,
      kind: "story",
      textOriginal: "landmark",
      quote: " landmark ",
      langOriginal: "en",
      origin: "open_text",
      status: "published",
      reviewerId: f.steward,
      sourceOpenTextId: snippetId,
      spanStart: 4,
      spanEnd: 14,
      isMock: false,
    });
    expect(
      (await f.client.query(api.openText.listForPlace, { placeId: f.placeId }))[0]?.approved,
    ).toBe(true);
    expect(await f.b.run((ctx) => ctx.db.query("auditLog").take(10))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "open_text.approve",
          actorPersonId: f.steward,
          diff: { claimIds: ids },
        }),
      ]),
    );
  });

  it.each([
    { start: -1, end: 2 },
    { start: 0, end: 100 },
    { start: 4, end: 5 },
    { start: 2, end: 2 },
    { start: 0.5, end: 2 },
  ])("an out-of-range or blank excerpt is invalid_input (%j)", async (span) => {
    const f = await setup();
    const snippetId = await imported(f, true);
    expect(
      await errorCode(
        f.client.mutation(api.openText.approveExcerpts, {
          snippetId,
          excerpts: [
            { start: 0, end: 4, kind: "story" },
            { ...span, kind: "fact" },
          ],
        }),
      ),
    ).toBe("invalid_input");
    expect(await f.b.run((ctx) => ctx.db.query("claim").take(10))).toEqual([]);
    expect(
      (await f.client.query(api.openText.listForPlace, { placeId: f.placeId }))[0]?.approved,
    ).toBe(false);
  });

  it("approval requires a linked snippet, no owner and 1 to 20 excerpts", async () => {
    const f = await setup();
    const snippetId = await imported(f);
    const excerpt = { start: 0, end: 4, kind: "story" as const };
    expect(
      await errorCode(
        f.client.mutation(api.openText.approveExcerpts, { snippetId, excerpts: [excerpt] }),
      ),
    ).toBe("conflict");
    await f.client.mutation(api.openText.link, { snippetId, placeId: f.placeId });
    for (const count of [0, 21]) {
      expect(
        await errorCode(
          f.client.mutation(api.openText.approveExcerpts, {
            snippetId,
            excerpts: Array.from({ length: count }, () => excerpt),
          }),
        ),
      ).toBe("invalid_input");
    }
    await f.b.run((ctx) => ctx.db.patch("openTextSnippet", snippetId, { text: "x".repeat(601) }));
    expect(
      await errorCode(
        f.client.mutation(api.openText.approveExcerpts, {
          snippetId,
          excerpts: [{ start: 0, end: 601, kind: "fact" }],
        }),
      ),
    ).toBe("invalid_input");
    await addOwner(f.b, f.placeId, f.owner, f.steward);
    expect(
      await errorCode(
        f.client.mutation(api.openText.approveExcerpts, { snippetId, excerpts: [excerpt] }),
      ),
    ).toBe("conflict");
  });

  it("a creator is forbidden", async () => {
    const f = await setup();
    const snippetId = await imported(f, true);
    const client = f.b.as("creator");
    for (const work of [
      client.query(api.openText.listUnlinked, {}),
      client.query(api.openText.listForPlace, { placeId: f.placeId }),
      client.mutation(api.openText.link, { snippetId, placeId: f.placeId }),
      client.mutation(api.openText.approveExcerpts, {
        snippetId,
        excerpts: [{ start: 0, end: 4, kind: "fact" }],
      }),
    ]) {
      expect(await errorCode(work)).toBe("forbidden");
    }
  });

  it("listUnlinked shows only unlinked snippets", async () => {
    const f = await setup();
    await imported(f, true);
    await f.b.t.mutation(internal.openText.importSnippets, {
      snippets: [{ ...input, sourceUrl: "https://example.com/other" }],
    });
    const rows = await f.client.query(api.openText.listUnlinked, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceUrl).toBe("https://example.com/other");
    expect(rows[0]?.placeId).toBeUndefined();
  });
});
