/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { ApiFromModules } from "convex/server";
import { addPerson, errorCode, newBackend } from "../tests/convex/fixtures";
import { api as generatedApi } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const api = generatedApi as typeof generatedApi &
  ApiFromModules<{ problemReport: typeof import("./problemReport") }>;
const input = {
  details: "The map does not load on my phone.",
  pagePath: "/en/map",
  device: "360×640 · Mozilla/5.0",
  locale: "en" as const,
};
const page = { numItems: 25, cursor: null };
const rows = (b: ReturnType<typeof newBackend>) =>
  b.run((ctx) => ctx.db.query("problemReport").collect());

describe("problemReport.submit", () => {
  it("a signed-out visitor stores a trimmed report, linked to no one", async () => {
    const b = newBackend(modules);
    const result = await b.t.mutation(api.problemReport.submit, {
      ...input,
      details: `  ${input.details}  `,
      contact: "  me@example.test  ",
    });
    const stored = await rows(b);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      details: input.details,
      pagePath: "/en/map",
      device: input.device,
      contact: "me@example.test",
      locale: "en",
      status: "open",
      receivedAt: result.receivedAt,
    });
    expect(Object.keys(stored[0]!).sort()).toEqual(
      [
        "_creationTime",
        "_id",
        "contact",
        "details",
        "device",
        "locale",
        "pagePath",
        "receivedAt",
        "status",
      ].sort(),
    );
  });

  it("a signed-in visitor's report is not linked to their account", async () => {
    const b = newBackend(modules);
    await addPerson(b, "member", "creator");
    await b.as("member").mutation(api.problemReport.submit, input);
    const stored = JSON.stringify(await rows(b));
    expect(stored).not.toContain("member");
    expect(stored).not.toContain("person");
  });

  it("the honeypot stores nothing and still answers success", async () => {
    const b = newBackend(modules);
    const result = await b.t.mutation(api.problemReport.submit, {
      ...input,
      details: "",
      website: "bot",
    });
    expect(result).toEqual({ receivedAt: expect.any(Number) });
    expect(await rows(b)).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("rateLimit").take(5))).toEqual([]);
  });

  it("length limits give invalid_input", async () => {
    const b = newBackend(modules);
    for (const change of [
      { details: "   short   " },
      { details: "x".repeat(2001) },
      { device: "x".repeat(301) },
      { contact: "x".repeat(201) },
    ]) {
      expect(await errorCode(b.t.mutation(api.problemReport.submit, { ...input, ...change }))).toBe(
        "invalid_input",
      );
    }
    await b.t.mutation(api.problemReport.submit, { ...input, details: "x".repeat(10) });
    await b.t.mutation(api.problemReport.submit, {
      ...input,
      details: "x".repeat(2000),
      device: "d".repeat(300),
      contact: "c".repeat(200),
    });
    expect(await rows(b)).toHaveLength(2);
  });

  it("reduces the page to a same-site path", async () => {
    const b = newBackend(modules);
    const cases: [string, string][] = [
      ["https://evil.example/x", ""],
      ["//evil", ""],
      ["/\\evil", ""],
      ["javascript:alert(1)", ""],
      ["en/map", ""],
      ["", ""],
      ["/en/places/x?y=1#z", "/en/places/x"],
      ["/en/map#top", "/en/map"],
      ["/" + "a".repeat(400), "/" + "a".repeat(299)],
    ];
    for (const [pagePath] of cases)
      await b.t.mutation(api.problemReport.submit, { ...input, pagePath });
    const stored = (await rows(b)).sort((x, y) => x._creationTime - y._creationTime);
    expect(stored.map((r) => r.pagePath)).toEqual(cases.map(([, out]) => out));
  });

  it("is rate limited at 30 an hour with rate_limited", async () => {
    const b = newBackend(modules);
    for (let i = 0; i < 30; i++) await b.t.mutation(api.problemReport.submit, input);
    expect(await errorCode(b.t.mutation(api.problemReport.submit, input))).toBe("rate_limited");
    expect(await rows(b)).toHaveLength(30);
  });
});

describe("problemReport.list and close", () => {
  async function setup() {
    const b = newBackend(modules);
    await addPerson(b, "steward", "steward");
    await addPerson(b, "member", "creator");
    await b.t.mutation(api.problemReport.submit, { ...input, contact: "secret-contact" });
    const [report] = await rows(b);
    return { b, id: report!._id };
  }

  it("only a steward lists; others and signed-out are refused", async () => {
    const { b } = await setup();
    const result = await b
      .as("steward")
      .query(api.problemReport.list, { status: "open", paginationOpts: page });
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({ contact: "secret-contact", pagePath: "/en/map" });
    for (const run of [
      () => b.as("member").query(api.problemReport.list, { status: "open", paginationOpts: page }),
      () => b.t.query(api.problemReport.list, { status: "open", paginationOpts: page }),
    ])
      expect(["forbidden", "unauthenticated"]).toContain(await errorCode(run()));
  });

  it("lists newest first", async () => {
    const { b } = await setup();
    await b.run((ctx) =>
      ctx.db.insert("problemReport", {
        ...input,
        contact: "",
        status: "open",
        receivedAt: Date.now() + 1000,
        details: "A newer report here",
      }),
    );
    const result = await b
      .as("steward")
      .query(api.problemReport.list, { status: "open", paginationOpts: page });
    expect(result.page.map((r) => r.details)).toEqual([
      "A newer report here",
      input.details,
    ]);
  });

  it("close marks done, erases the contact and audits without the words", async () => {
    const { b, id } = await setup();
    for (const run of [
      () => b.as("member").mutation(api.problemReport.close, { reportId: id }),
      () => b.t.mutation(api.problemReport.close, { reportId: id }),
    ])
      expect(["forbidden", "unauthenticated"]).toContain(await errorCode(run()));
    expect((await rows(b))[0]!.status).toBe("open");

    await b.as("steward").mutation(api.problemReport.close, { reportId: id });
    const report = (await rows(b))[0]!;
    expect(report).toMatchObject({ status: "done", contact: "", closedAt: expect.any(Number) });
    expect(report.closedBy).toBeDefined();
    const audit = await b.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "problem.closed", targetId: id });
    const text = JSON.stringify(audit);
    expect(text).not.toContain("secret-contact");
    expect(text).not.toContain("map does not load");

    const done = await b
      .as("steward")
      .query(api.problemReport.list, { status: "done", paginationOpts: page });
    expect(done.page[0]!.contact).toBeUndefined();
    expect(
      await errorCode(b.as("steward").mutation(api.problemReport.close, { reportId: id })),
    ).toBe("conflict");
  });
});
