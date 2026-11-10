import { ConvexError } from "convex/values";
import { ConnectorDataError } from "./types";

/**
 * A rate limit or a bad argument from Convex becomes an error the tools can word; anything else is
 * ours. Shared by the connector (which reads Convex over HTTP) and the in-app planner (which reads
 * it from inside a Convex action).
 */
export async function guarded<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof ConvexError) {
      const data: unknown = error.data;
      if (typeof data === "object" && data !== null && "code" in data) {
        const message = "message" in data && typeof data.message === "string" ? data.message : "";
        if (data.code === "rate_limited") throw new ConnectorDataError("rate_limited", message);
        if (data.code === "invalid_input") throw new ConnectorDataError("invalid_input", message);
      }
    }
    throw error;
  }
}
