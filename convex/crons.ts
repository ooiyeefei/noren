import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.cron("check sources", "0 18 * * *", internal.sourceChecks.checkSources, {});
export default crons;
