import { type GenericValidator, v } from "convex/values";
import { expect, it } from "vitest";
import schema from "../../convex/schema";

const bannedWords = new Set([
  "rating",
  "ratings",
  "score",
  "scores",
  "star",
  "stars",
  "sentiment",
  "sentiments",
  "rank",
  "ranking",
]);

function bannedNames(names: string[]): string[] {
  return names.filter((name) =>
    name
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((word) => bannedWords.has(word)),
  );
}

function fieldPaths(validator: GenericValidator, path: string): string[] {
  switch (validator.kind) {
    case "object":
      return Object.entries(validator.fields).flatMap(([name, field]) => {
        const fieldPath = `${path}.${name}`;
        return [fieldPath, ...fieldPaths(field, fieldPath)];
      });
    case "array":
      return fieldPaths(validator.element, `${path}[]`);
    case "union":
      return validator.members.flatMap((member: GenericValidator) => fieldPaths(member, path));
    case "record":
      return [
        ...fieldPaths(validator.key, `${path}{key}`),
        ...fieldPaths(validator.value, `${path}{value}`),
      ];
    default:
      return [];
  }
}

const hasMockFlag = [
  "person",
  "place",
  "placeCheck",
  "source",
  "interview",
  "claim",
  "note",
  "linkCountDaily",
];
const inheritsMockFlag = [
  "placeOwner",
  "placeName",
  "pin",
  "placeExternalRef",
  "consent",
  "transcript",
  "claimTranslation",
  "pageVersion",
  "pageSentence",
  "noteTranslation",
];
const notPersonCreated = [
  "seedOsmCandidate",
  "openTextSnippet",
  "phraseCard",
  "takedownRequest",
  "rateLimit",
  "auditLog",
];

it("no table or field is named like a rating, score or sentiment", () => {
  const names = Object.entries(schema.tables).flatMap(([tableName, table]) => [
    tableName,
    ...fieldPaths(table.validator, tableName),
  ]);
  expect(bannedNames(names), "Banned table or field paths").toEqual([]);
});

it("every table is classified for the mock flag", () => {
  const classified = [...hasMockFlag, ...inheritsMockFlag, ...notPersonCreated];
  expect(classified.toSorted(), "Each schema table must be listed exactly once").toEqual(
    Object.keys(schema.tables).toSorted(),
  );

  for (const [tableName, table] of Object.entries(schema.tables)) {
    const fields: Record<string, GenericValidator> = table.validator.fields;
    if (hasMockFlag.includes(tableName)) {
      expect(fields.isMock?.kind, `${tableName}.isMock must be a boolean`).toBe("boolean");
      expect(fields.isMock?.isOptional, `${tableName}.isMock must be required`).toBe("required");
    } else {
      expect(Object.hasOwn(fields, "isMock"), `${tableName} must not have isMock`).toBe(false);
    }
  }
});

it("the banned-word check catches a planted field", () => {
  expect(bannedNames(["overallRating", "sentimentScore"])).toEqual([
    "overallRating",
    "sentimentScore",
  ]);
  expect(bannedNames(["start", "startedAt", "restart"])).toEqual([]);

  const nested = v.object({
    segments: v.optional(v.array(v.object({ start: v.number(), overallRating: v.number() }))),
    alternatives: v.union(v.null(), v.object({ sentiment_score: v.number() })),
    entries: v.record(v.string(), v.object({ ranking: v.number() })),
  });
  expect(bannedNames(fieldPaths(nested, "fixture"))).toEqual([
    "fixture.segments[].overallRating",
    "fixture.alternatives.sentiment_score",
    "fixture.entries{value}.ranking",
  ]);
});
