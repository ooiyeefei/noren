import { defineSchema } from "convex/server";
import { communityTables } from "./tables/community";
import { interviewTables } from "./tables/interviews";
import { placeTables } from "./tables/places";
import { storyFinderTables } from "./tables/storyFinder";

export default defineSchema({
  ...placeTables,
  ...interviewTables,
  ...communityTables,
  ...storyFinderTables,
});
