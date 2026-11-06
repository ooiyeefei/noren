import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("check sources", "0 18 * * *", internal.sourceChecks.checkSources, {});
crons.cron("write ready stories", "0 19 * * *", internal.placeStories.writeReadyStories, {});
crons.interval("sweep unattached photos", { hours: 1 }, internal.storyPhotos.sweepUnattached, {});
crons.interval("remove photo objects", { hours: 1 }, internal.storyPhotoActions.removeObjects, {});
export default crons;
