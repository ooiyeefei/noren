# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

A query function that takes two arguments looks like:

```ts
// convex/myFunctions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await ctx.db.query("tablename").collect();

    // Arguments passed from the client are properties of the args object.
    console.log(args.first, args.second);

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
```

Using this query function in a React component looks like:

```ts
const data = useQuery(api.myFunctions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

A mutation function looks like:

```ts
// convex/myFunctions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await ctx.db.get("messages", id);
  },
});
```

Using this mutation function in a React component looks like:

```ts
const mutation = useMutation(api.myFunctions.myMutationFunction);
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then((result) =>
    console.log(result),
  );
}
```

Use the Convex CLI to push your functions to a deployment. See everything
the Convex CLI can do by running `npx convex -h` in your project root
directory. To learn more, launch the docs with `npx convex docs`.

## Tables and functions added for the trip agent, the one map and members' reports

Specs: `specs/005-trip-agent/` (see `contracts/convex-functions.md`). "Trip member" means a signed-in person the trip switch lets in (see below). Errors are `appError` codes.

### Tables

- **`placeFact`**: one member's report, or a fact from a visitor's post, about one item of a region's fact list at one place. Indexes: `by_placeId_and_status` (`placeId`, `status`), `by_personId_and_placeId_and_key` (`personId`, `placeId`, `key`), `by_sourceId` (`sourceId`), `by_regionId_and_status` (`regionId`, `status`). Only member reports are written today.
- **`tripShare`**: the copy behind one private trip link: the days the organiser shared, the title, the owner and the region. Indexes: `by_code` (`code`), `by_ownerPersonId` (`ownerPersonId`).

### Fields and indexes added to existing tables

- **`place`**: `mapCell` (a geohash of the pin), indexed by `by_visibility_and_mapCell` (`visibility`, `mapCell`). Filled for existing rows by `places.backfillMapCell`.
- **`person`**: `trials` (an optional list of private trial names, such as `"trip"`), set by `people.setTrial`.

### Map and places

- **`places.inCells({ cells, category? })`** query, anyone. The public places in up to 32 geohash cells of one length (4 or 5 characters), in regions that are on, up to 5,000. Signed-in members also get what they may read.
- **`places.coverage({})`** query, anyone. The towns of every region that is on: id, names, centre and radius. No counts.
- **`places.bySlug({ slug })`** query, anyone. The place with that slug in any region that is on, or null.
- **`places.backfillMapCell({ cursor })`** internal mutation. Fills `mapCell` in batches of 200 and schedules its own next batch. Run from the command line; not called by the app.
- **`places.listForMap({ regionId, category? })`** query, anyone (unchanged). Takes the region from the caller and does not check the region switch.

### People

- **`people.current`** query (existing), now also returns `trip: boolean`: whether the caller may open trips.
- **`people.setTrial({ clerkUserId, trial, on })`** internal mutation. Adds or removes a trial name on a person's row, at most eight a person. Writes an audit entry. Run from the command line by the owner.

### Practical facts (behind `features.facts`)

- **`facts.forPlace({ placeId })`** query, anyone who may read the place. Up to 60 live facts: key, value, basis, day, whether the record is older than the region's limit, and the reporter's name (member) or the source and quote (post). Not behind the switch.
- **`facts.report({ placeId, key, value })`** mutation, signed-in member with a confirmed name. Adds or replaces the member's report of one key at one place. Refused when `features.facts` is off, the key is not in the region's list, the place is not readable, a demo and a real place are mixed, or the daily limit (30) is reached. Writes an audit entry.
- **`facts.remove({ factId })`** mutation, signed-in member. Removes the caller's own member report.
- **`facts.hide({ factId, reason })`** mutation, steward. Hides a report or a post fact and writes an audit entry. A takedown with target type `fact` uses the same code.

### Trips (behind `features.trip`)

Every trip function answers "not found" unless the caller is a trip member: the switch is `"open"`, or it is `"trial"` and the caller's `trials` holds `"trip"`. `tripShare.read` is the exception (see below).

- **`trips.plan({ request, seed? })`** action, trip member. Reads the candidates for each town on the route, runs the engine with a seed, and returns the plan, the seed and each stop's public details. Calls no model. Limits: 30 a minute and 300 a day.
- **`trips.interpret({ messages, outline, language })`** action, trip member. Sends the organiser's words and the outline to the planning model and returns suggestions, checked against what was said and a fixed vocabulary. Limits: 5 a minute and 40 a day. Refuses when `AI_MODEL_PLAN` is unset.
- **`trips.begin({ kind })`** internal mutation. The shared gate for the two actions above: the switch, sign-in, the trial and the rate limits.
- **`trips.candidatePlaces({ regionId, anchor })`**, **`trips.candidates({ regionId, placeIds })`**, **`trips.candidateExposure({ regionId, now })`** internal queries. Read one anchor's places, the details of up to 50 places, and two weeks of exposure counts, for `trips.plan`.
- **`trips.stopDetails({ placeIds })`** internal query. The public details of a plan's stops, for `trips.plan`.
- **`trips.stops({ placeIds })`** query, trip member. The public details of the stops of a plan kept on the device, up to 84. A place no longer public comes back null.
- **`tripShare.create({ deviceTripId, title, days })`** mutation, trip member. Makes or replaces the private link for one trip and returns its code. Limits: 20 a day, 50 kept.
- **`tripShare.read({ code })`** query, anyone with the code, whenever `features.trip` is not `"off"`. The shared plan, or null. Drops a place that is no longer public and looks quotes up again.
- **`tripShare.remove({ code })`** mutation, the link's owner. Deletes the link.
