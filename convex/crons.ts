import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("check sources", "0 18 * * *", internal.sourceChecks.checkSources, {});
crons.cron("write ready stories", "0 19 * * *", internal.placeStories.writeReadyStories, {});
crons.interval("sweep unattached photos", { hours: 1 }, internal.storyPhotos.sweepUnattached, {});
crons.interval("remove photo objects", { hours: 1 }, internal.storyPhotoActions.removeObjects, {});
crons.cron("prune suggestion counts", "0 20 * * 0", internal.connector.pruneExposure, {});
// Automatic Instagram posting (specs/003-instagram-share): starts what is due, and notes a new token.
// With the region switch off both find nothing to do.
crons.interval("post approved stories", { minutes: 10 }, internal.instagramPosts.dispatch, {});
crons.cron("note instagram token", "30 3 * * *", internal.instagramPosts.noteToken, {});
export default crons;
