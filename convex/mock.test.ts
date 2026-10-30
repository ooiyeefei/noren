import { describe, expect, expectTypeOf, it } from "vitest";
import type { Doc } from "./_generated/dataModel";
import { excludeMock, withMock } from "./lib/mock";

const mockPerson: Pick<Doc<"person">, "isMock"> = { isMock: true };
const realPerson: Pick<Doc<"person">, "isMock"> = { isMock: false };

describe("withMock", () => {
  it("flags a mock person's row", () => {
    expect(withMock(mockPerson, { body: "Demo note" })).toEqual({
      body: "Demo note",
      isMock: true,
    });
  });

  it("flags a real person's row as real", () => {
    expect(withMock(realPerson, { body: "Note" })).toEqual({
      body: "Note",
      isMock: false,
    });
  });

  it.each([
    { person: mockPerson, supplied: false, expected: true },
    { person: realPerson, supplied: true, expected: false },
  ])(
    "overrides caller-supplied isMock=$supplied with $expected",
    ({ person, supplied, expected }) => {
      expect(withMock(person, { isMock: supplied }).isMock).toBe(expected);
    },
  );

  it("preserves every other field and its type without changing the input", () => {
    const values = {
      body: "Demo note",
      ordinal: 2,
      tags: ["demo"],
      metadata: { lang: "en" },
      parent: null,
      isMock: false as const,
    };
    const result = withMock(mockPerson, values);

    expect(result).toEqual({ ...values, isMock: true });
    expect(result.metadata).toBe(values.metadata);
    expect(result.tags).toBe(values.tags);
    expect(values.isMock).toBe(false);
    expectTypeOf(result.body).toEqualTypeOf<string>();
    expectTypeOf(result.ordinal).toEqualTypeOf<number>();
    expectTypeOf(result.isMock).toEqualTypeOf<boolean>();
  });
});

describe("excludeMock", () => {
  it("removes exactly mock rows and preserves order, fields and input", () => {
    const rows: { id: string; isMock?: boolean }[] = [
      { id: "mock-first", isMock: true },
      { id: "real-first", isMock: false },
      { id: "unflagged" },
      { id: "mock-last", isMock: true },
      { id: "real-last", isMock: false },
    ];
    const original = structuredClone(rows);
    const result = excludeMock(rows);

    expect(result).toEqual([rows[1], rows[2], rows[4]]);
    expect(result[0]).toBe(rows[1]);
    expect(rows).toEqual(original);
    expectTypeOf(result).toEqualTypeOf<typeof rows>();
  });

  it("returns an empty array for empty input", () => {
    expect(excludeMock([])).toEqual([]);
  });
});
