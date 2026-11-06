import "server-only";

import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { convexToken } from "../convex/server";
import { activeRegionConfig } from "../region/registry";
import { reencodePhoto } from "./process";
import type { PhotoRouteDeps } from "./routes";
import { createS3PhotoStore } from "./s3-store";

/** The real services behind the two photo routes. Every Convex call goes as the signed-in member. */
export function photoRouteDeps(): PhotoRouteDeps {
  return {
    region: activeRegionConfig(),
    env: process.env,
    store: (settings) => createS3PhotoStore(settings),
    reencode: reencodePhoto,
    convex: async () => {
      const token = await convexToken();
      if (token === null) return null;
      const photo = (photoId: string) => photoId as Id<"storyPhoto">;
      return {
        begin: ({ placeId }) =>
          fetchMutation(
            api.storyPhotos.beginUpload,
            { placeId: placeId as Id<"place"> },
            { token },
          ),
        ticket: ({ photoId }) =>
          fetchQuery(api.storyPhotos.uploadTicket, { photoId: photo(photoId) }, { token }),
        complete: ({ photoId, width, height }) =>
          fetchMutation(
            api.storyPhotos.completeUpload,
            { photoId: photo(photoId), width, height },
            { token },
          ),
        remove: ({ photoId }) =>
          fetchMutation(api.storyPhotos.remove, { photoId: photo(photoId) }, { token }),
      };
    },
  };
}
