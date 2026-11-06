import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, clerkClient, deleteUser, fetchMutation } = vi.hoisted(() => {
  const deleteUser = vi.fn();
  return {
    auth: vi.fn(),
    clerkClient: vi.fn(async () => ({ users: { deleteUser } })),
    deleteUser,
    fetchMutation: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth, clerkClient }));
vi.mock("convex/nextjs", () => ({ fetchMutation, fetchQuery: vi.fn() }));

import { POST } from "@/app/api/account/delete/route";
import { api } from "../../convex/_generated/api";

const TOKEN = "fictional-convex-token";
const USER_ID = "user_fictional";
const press = (headers: HeadersInit = {}) =>
  POST(new Request("https://noren.mock.example/api/account/delete", { method: "POST", headers }));
const named = (name: string, message: string, extra: object = {}) =>
  Object.assign(new Error(message), { name }, extra);

let logged: ReturnType<typeof vi.spyOn>;
const logText = () => logged.mock.calls.flat().join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    userId: USER_ID,
    sessionClaims: { aud: "convex" },
    getToken: async () => TOKEN,
  });
  fetchMutation.mockResolvedValue(null);
  deleteUser.mockResolvedValue({ id: USER_ID });
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  logged.mockRestore();
});

describe("POST /api/account/delete", () => {
  it("runs Noren's step with the caller's token, then deletes their Clerk user", async () => {
    const order: string[] = [];
    fetchMutation.mockImplementation(async () => void order.push("noren"));
    deleteUser.mockImplementation(async () => void order.push("clerk"));

    const response = await press();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(order).toEqual(["noren", "clerk"]);
    expect(fetchMutation).toHaveBeenCalledExactlyOnceWith(
      api.people.deleteMine,
      {},
      { token: TOKEN },
    );
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(USER_ID);
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers 401 with no session, before touching anything", async () => {
    auth.mockResolvedValue({ userId: null, getToken: async () => null });

    const response = await press();

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 401 when the session gives no Convex token", async () => {
    auth.mockResolvedValue({ userId: USER_ID, sessionClaims: null, getToken: async () => null });

    expect((await press()).status).toBe(401);
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a request from another site, before touching anything", async () => {
    const response = await press({ "Sec-Fetch-Site": "cross-site" });

    expect(response.status).toBe(403);
    expect(auth).not.toHaveBeenCalled();
    expect(fetchMutation).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 403 for any role but user, and leaves the Clerk user alone", async () => {
    fetchMutation.mockRejectedValue(
      new ConvexError({ code: "forbidden", message: "a steward deletes steward accounts" }),
    );

    const response = await press();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 500 when Noren's step fails, logs the name, and leaves the Clerk user alone", async () => {
    fetchMutation.mockRejectedValue(named("FetchError", "the backend did not answer"));

    const response = await press();

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal");
    expect(logText()).toContain("FetchError: the backend did not answer");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 500 when the session cannot be read, with a log that has the name", async () => {
    auth.mockRejectedValue(named("ClerkAuthError", "no session"));

    expect((await press()).status).toBe(500);
    expect(logText()).toContain("ClerkAuthError: no session");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  describe("when the Clerk step fails after Noren's step ran", () => {
    it("answers 502 clerk_failed and logs the error's name", async () => {
      deleteUser.mockRejectedValue(named("ClerkAPIResponseError", "Too Many Requests"));

      const response = await press();

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error.code).toBe("clerk_failed");
      expect(body.error.message.trim()).not.toBe("");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(fetchMutation).toHaveBeenCalledOnce();
      expect(logText()).toContain("ClerkAPIResponseError: Too Many Requests");
    });

    it.each([
      ["an Error with a blank name and message", named(" ", " "), /Error: \S/],
      ["a string", "gateway down", /gateway down/],
      ["an empty string", "", /\S/],
      ["undefined", undefined, /undefined/],
      ["null", null, /null/],
      ["an object", { detail: 1 }, /\S/],
      ["a value that cannot become a string", Object.create(null) as object, /cannot be read/],
    ])("still logs something useful for %s", async (_label, thrown, expected) => {
      deleteUser.mockRejectedValue(thrown);

      expect((await press()).status).toBe(502);
      expect(logText()).toMatch(/Clerk step failed \(.*\S.*\)/);
      expect(logText()).toMatch(expected);
    });

    it("lets the person press again: Noren's step runs again harmlessly, then Clerk's", async () => {
      deleteUser.mockRejectedValueOnce(named("ClerkAPIResponseError", "Internal Server Error"));
      expect((await press()).status).toBe(502);

      const again = await press();

      expect(again.status).toBe(200);
      expect(await again.json()).toEqual({ ok: true });
      expect(fetchMutation).toHaveBeenCalledTimes(2);
      expect(deleteUser).toHaveBeenCalledTimes(2);
    });

    it("counts a Clerk user that is already gone as done, for an answer that got lost", async () => {
      deleteUser.mockRejectedValue(named("ClerkAPIResponseError", "Not Found", { status: 404 }));

      const response = await press();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(logged).not.toHaveBeenCalled();
    });

    it("never logs the token or the Clerk user id", async () => {
      deleteUser.mockRejectedValue(named("ClerkAPIResponseError", "Bad Gateway"));

      await press();

      expect(logText()).not.toContain(TOKEN);
      expect(logText()).not.toContain(USER_ID);
    });
  });
});
