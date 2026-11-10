import { createMcpHandler } from "mcp-handler";
import { convexConnectorData } from "@/lib/connector/convex-data";
import {
  CONNECTOR_INSTRUCTIONS,
  CONNECTOR_NAME,
  registerConnectorTools,
} from "@/lib/connector/mcp";
import { CONNECTOR_DEFAULTS } from "@/lib/connector/policy";
import { NOREN_ORIGIN } from "@/lib/connector/urls";
import { getActiveRegion } from "@/lib/region";

// The Noren connector: a remote MCP server (Streamable HTTP, stateless, no sign-in) that lets
// Claude, ChatGPT and other assistants read Noren's public data. See src/lib/connector for the
// tools. The route is dark until the region turns `features.connector` on: off, it is a 404, as if
// the route did not exist.

const handler = createMcpHandler(
  (server) => {
    const region = getActiveRegion();
    registerConnectorTools(server, {
      data: convexConnectorData(region.id),
      region,
      origin: NOREN_ORIGIN,
      // Through the connector a member's story goes out only when its writer allowed it.
      options: CONNECTOR_DEFAULTS,
      now: Date.now,
    });
  },
  {
    instructions: CONNECTOR_INSTRUCTIONS,
    serverInfo: { name: CONNECTOR_NAME, version: "1.0.0" },
  },
);

/** Every answer, the 404 included, is hidden from search engines and never cached. */
function hidden(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serve(request: Request): Promise<Response> {
  if (!getActiveRegion().features.connector) {
    return hidden(new Response("Not found", { status: 404 }));
  }
  return hidden(await handler(request));
}

export { serve as DELETE, serve as GET, serve as POST };
