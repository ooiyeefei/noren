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
  "story",
];
const inheritsMockFlag = [
  "placeOwner",
  "placeName",
  "pin",
  "placeExternalRef",
  "consent",
  "transcript",
  "claimTranslation",
  "translationCheck",
  "pageVersion",
  "pageSentence",
  "noteTranslation",
  // From its person: a demo account checks in only at demo places.
  "personCollection",
  // From its source: only story finder sources on real places have one.
  "sourceExcerptTranslation",
  // From their place and the found posts they read: the agent only runs on real places.
  "placeStory",
  "placeStoryRun",
  // From its person and place: a demo account or a demo place is refused at upload.
  "storyPhoto",
  "voiceUpload",
];
const notPersonCreated = [
  "seedOsmCandidate",
  // Made by an admin and looked after by stewards, for real places only.
  "collectionSet",
  "collectionPanel",
  "collectionPlace",
  // Public posts the story finder collected for real places only, their counts, and shown quotes.
  "mentionCandidate",
  "mentionCount",
  "shownQuote",
  "openTextSnippet",
  "phraseCard",
  "takedownRequest",
  "rateLimit",
  "auditLog",
  "translationCheckRun",
  // Storage keys waiting to be deleted, written by the system after a removal.
  "photoObjectRemoval",
  // How often a real place was suggested in a week, written only by a connector draw. No person.
  "placeExposure",
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
    // A table whose documents take one of several shapes is checked shape by shape.
    const validator: GenericValidator = table.validator;
    const shapes: GenericValidator[] = validator.kind === "union" ? validator.members : [validator];
    for (const shape of shapes) {
      expect(shape.kind, `${tableName} documents must be objects`).toBe("object");
      const fields: Record<string, GenericValidator> = shape.kind === "object" ? shape.fields : {};
      if (hasMockFlag.includes(tableName)) {
        expect(fields.isMock?.kind, `${tableName}.isMock must be a boolean`).toBe("boolean");
        expect(fields.isMock?.isOptional, `${tableName}.isMock must be required`).toBe("required");
      } else {
        expect(Object.hasOwn(fields, "isMock"), `${tableName} must not have isMock`).toBe(false);
      }
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
