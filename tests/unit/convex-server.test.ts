import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import {
  convexToken,
  currentPersonOnServer,
  requireRoleOnServer,
} from "../../src/lib/convex/server";

const getToken = vi.fn();
const mockAuth = vi.mocked(auth);
const mockQuery = vi.mocked(fetchQuery);

function session(userId: string | null, aud?: string) {
  // Only the auth fields consumed by the helper are needed in this fixture.
  mockAuth.mockResolvedValue({
    userId,
    sessionClaims: aud ? { aud } : null,
    getToken,
  } as unknown as Awaited<ReturnType<typeof auth>>);
}

beforeEach(() => {
  vi.resetAllMocks();
  session("mock-user");
  getToken.mockResolvedValue("mock-token");
  mockQuery.mockResolvedValue(null);
});

it("uses getToken without a template for aud convex", async () => {
  session("mock-user", "convex");
  expect(await convexToken()).toBe("mock-token");
  expect(getToken).toHaveBeenCalledExactlyOnceWith();
});

it.each([undefined, "other"])("uses the convex template for other sessions (%s)", async (aud) => {
  session("mock-user", aud);
  await convexToken();
  expect(getToken).toHaveBeenCalledExactlyOnceWith({ template: "convex" });
});

it("signed out gives null without querying Convex", async () => {
  session(null);
  expect(await convexToken()).toBeNull();
  expect(await currentPersonOnServer()).toBeNull();
  expect(getToken).not.toHaveBeenCalled();
  expect(mockQuery).not.toHaveBeenCalled();
});

it("does not query without a token", async () => {
  getToken.mockResolvedValue(null);
  expect(await currentPersonOnServer()).toBeNull();
  expect(mockQuery).not.toHaveBeenCalled();
});

it.each(["signed out", "no person"])("requireRoleOnServer returns 401 for %s", async (state) => {
  if (state === "signed out") session(null);
  const result = await requireRoleOnServer(["creator"]);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.response.status).toBe(401);
});

it("refuses a user asking for creator", async () => {
  mockQuery.mockResolvedValue({ displayName: "Demo person", role: "user" });
  const result = await requireRoleOnServer(["creator"]);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.response.status).toBe(403);
});

it.each(["creator", "steward"] as const)(
  "allows %s for creator and returns the person",
  async (role) => {
    const person = { displayName: "Demo person", role };
    mockQuery.mockResolvedValue(person);
    expect(await requireRoleOnServer(["creator"])).toEqual({ ok: true, person });
    expect(mockQuery).toHaveBeenCalledExactlyOnceWith(
      api.people.current,
      {},
      { token: "mock-token" },
    );
  },
);

it("does not allow a creator to act as steward", async () => {
  mockQuery.mockResolvedValue({ displayName: "Demo person", role: "creator" });
  const result = await requireRoleOnServer(["steward"]);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.response.status).toBe(403);
});
