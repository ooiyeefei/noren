import { voiceTables } from "./tables/storyVoice";
import { defineSchema } from "convex/server";
import { collectionTables } from "./tables/collection";
import { communityTables } from "./tables/community";
import { connectorTables } from "./tables/connector";
import { interviewTables } from "./tables/interviews";
import { placeTables } from "./tables/places";
import { postcardTables } from "./tables/postcard";
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
  ...connectorTables,
  ...postcardTables,
});
