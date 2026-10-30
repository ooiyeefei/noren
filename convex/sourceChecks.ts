import { v } from "convex/values";
import { ADAPTERS } from "../src/lib/adapters";
import { SOURCE_ADAPTER_IDS } from "../src/lib/domain/constants";
import type { SourceLiveness } from "../src/lib/ports";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

function redactQueries(value: string): string {
  return value.replace(/\?[^\s]*/g, "?[redacted]").replace(/[\r\n]/g, " ");
}

export const checkSources = internalAction({
  args: {},
  returns: v.object({ checked: v.number(), gone: v.number() }),
  handler: async (ctx) => {
    const sources: { sourceId: Id<"source">; adapter: string; canonicalUrl: string }[] =
      await ctx.runQuery(internal.sources.listToCheck, { limit: 50 });
    let gone = 0;
    for (const source of sources) {
      let result: SourceLiveness = "unknown";
      const adapter = SOURCE_ADAPTER_IDS.find((id) => id === source.adapter);
      try {
        if (adapter !== undefined) result = await ADAPTERS[adapter].liveness(source.canonicalUrl);
      } catch (error) {
        const name = error instanceof Error ? error.name : "UnknownError";
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `checkSources: ${source.sourceId} ${redactQueries(name)}: ${redactQueries(message)}`,
        );
      }
      await ctx.runMutation(internal.sources.recordCheck, { sourceId: source.sourceId, result });
      if (result === "gone") gone++;
    }
    return { checked: sources.length, gone };
  },
});
