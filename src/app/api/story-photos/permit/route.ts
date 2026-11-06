import { createPhotoPermitRoute } from "@/lib/photos/routes";
import { photoRouteDeps } from "@/lib/photos/server";

export const POST = createPhotoPermitRoute(photoRouteDeps());
