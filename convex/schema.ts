import { voiceTables } from "./tables/storyVoice";
import { defineSchema } from "convex/server";
import { collectionTables } from "./tables/collection";
import { communityTables } from "./tables/community";
import { interviewTables } from "./tables/interviews";
import { placeTables } from "./tables/places";
import { storyFinderTables } from "./tables/storyFinder";
import { storyPhotoTables } from "./tables/storyPhotos";

export default defineSchema({
  ...placeTables,
  ...interviewTables,
  ...communityTables,
  ...storyFinderTables,
  ...collectionTables,
  ...storyPhotoTables,
  ...voiceTables,
});
