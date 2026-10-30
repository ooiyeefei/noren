import type { Doc } from "../_generated/dataModel";

/** Derives the row's mock flag only from its creator, protecting invariant 2 from overrides. */
export function withMock<T extends object>(
  person: Pick<Doc<"person">, "isMock">,
  values: T,
): Omit<T, "isMock"> & { isMock: boolean } {
  return { ...values, isMock: person.isMock };
}

/** Excludes mock rows from statistics and exports, as required by invariant 2. */
export function excludeMock<T extends { isMock?: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.isMock !== true);
}
