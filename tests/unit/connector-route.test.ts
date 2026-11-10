/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are JSON, read here by key */
import { beforeEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { regionSchema } from "@/lib/region/schema";

const fetchQuery = vi.hoisted(() => vi.fn());
const fetchMutation = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery, fetchMutation }));

const active = vi.hoisted(() => ({ connector: false }));
vi.mock("@/lib/region", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/region")>();
  return {
    ...original,
    getActiveRegion: () => {
      const region = original.getRegion("nagasaki")!;
      return { ...region, features: { connector: active.connector } };
    },
  };
});

import { DELETE, GET, POST } from "@/app/api/mcp/route";

const region = regionSchema.parse(nagasaki);

const rpc = (body: unknown, extra: Record<string, string> = {}) =>
  new Request("https://noren.test/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extra,
    },
    body: JSON.stringify(body),
  });

/** The JSON-RPC message in a reply, whether the server answered with JSON or one SSE event. */
async function message(response: Response): Promise<any> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data:"));
    return JSON.parse(data!.slice(5));
  }
  return JSON.parse(text);
}

beforeEach(() => {
  fetchQuery.mockReset();
  fetchMutation.mockReset();
  active.connector = false;
});

describe("the region's switch", () => {
  it("is off in the shipped region file", () => {
    expect(region.features).toEqual({ connector: false });
  });

  it("makes the route a 404 while the connector is off, whatever is asked", async () => {
    for (const response of [
      await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })),
      await GET(new Request("https://noren.test/api/mcp")),
      await DELETE(new Request("https://noren.test/api/mcp", { method: "DELETE" })),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(fetchQuery).not.toHaveBeenCalled();
    expect(fetchMutation).not.toHaveBeenCalled();
  });
});

describe("with the connector on", () => {
  beforeEach(() => {
    active.connector = true;
  });

  it("lists the five tools, each read-only and carrying the assistant's rules", async () => {
    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const { result } = await message(response);
    expect(result.tools.map((tool: any) => tool.name)).toEqual([
      "search_places",
      "get_place",
      "list_collections",
      "suggest_walk",
      "draw_omikuji",
    ]);
    for (const tool of result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.description).toMatch(/credit each story's writer by name/i);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("answers a tool call with the tool's result as text, reading Convex without a token", async () => {
    fetchQuery.mockResolvedValue([
      {
        _id: "id1",
        slug: "dejima-museum",
        category: "museum",
        isMock: false,
        names: [{ lang: "en", script: "latin", value: "Dejima Museum", isPrimary: true }],
        pin: { lat: 32.7437, lng: 129.8728 },
        hasStory: false,
      },
    ]);
    const response = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_places", arguments: { query: "dejima" } },
      }),
    );
    const { result } = await message(response);
    expect(result.isError).toBeFalsy();
    const out = JSON.parse(result.content[0].text);
    expect(out.places[0]).toMatchObject({
      slug: "dejima-museum",
      url: "https://noren.yooi.me/en/places/dejima-museum",
      confirmation: { label: "Not yet confirmed" },
    });
    // No third argument means no token: Convex sees a signed-out visitor.
    expect(fetchQuery).toHaveBeenCalledTimes(1);
    expect(fetchQuery.mock.calls[0]!.length).toBe(2);
  });

  it("reports a tool's own problem as an error result, not a crash", async () => {
    const response = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "search_places", arguments: {} },
      }),
    );
    const { result } = await message(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at least one/);
  });

  it("hides an unexpected failure behind a plain message and names it in the log", async () => {
    fetchQuery.mockRejectedValue(new TypeError("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "search_places", arguments: { query: "x" } },
      }),
    );
    const { result } = await message(response);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/try again in a moment/);
    expect(result.content[0].text).not.toMatch(/boom/);
    expect(log.mock.calls[0]![0]).toMatch(/search_places failed \(TypeError: boom\)/);
    log.mockRestore();
  });

  it("runs a draw through Convex's own mutation and returns no weights", async () => {
    fetchQuery.mockResolvedValue([]);
    fetchMutation.mockResolvedValue({
      ok: true,
      start: { kind: "neighbourhood", neighbourhoodId: "suwa", names: [] },
      stops: [],
      rulesApplied: [],
      rulesNotChecked: [],
      interestsNotMatched: [],
    });
    const response = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "suggest_walk", arguments: { neighbourhood: "suwa" } },
      }),
    );
    const { result } = await message(response);
    expect(result.isError).toBeFalsy();
    expect(fetchMutation).toHaveBeenCalledTimes(1);
    expect(fetchMutation.mock.calls[0]![1]).toMatchObject({
      regionId: "nagasaki",
      start: { kind: "neighbourhood", id: "suwa" },
      count: 3,
    });
    expect(fetchMutation.mock.calls[0]!.length).toBe(2);
  });
});
