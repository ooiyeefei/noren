import { defineSchema } from "convex/server";
import { communityTables } from "./tables/community";
import { interviewTables } from "./tables/interviews";
import { placeTables } from "./tables/places";

export default defineSchema({
  ...placeTables,
  ...interviewTables,
  ...communityTables,
});
