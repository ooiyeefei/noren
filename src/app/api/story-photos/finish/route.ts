import { createPhotoFinishRoute } from "@/lib/photos/routes";
import { photoRouteDeps } from "@/lib/photos/server";

export const POST = createPhotoFinishRoute(photoRouteDeps());
