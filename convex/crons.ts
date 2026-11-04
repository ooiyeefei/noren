import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("check sources", "0 18 * * *", internal.sourceChecks.checkSources, {});
crons.cron("write ready stories", "0 19 * * *", internal.placeStories.writeReadyStories, {});
export default crons;
