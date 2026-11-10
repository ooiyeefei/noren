import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { ASSISTANT_RULES, CONNECTOR_TOOLS, type ConnectorTool } from "./tools";
import type { ToolContext } from "./types";

// Hosts the shared tools on an MCP server. Nothing here knows what the tools do.

export const CONNECTOR_NAME = "noren";

/** Sent to every assistant when it connects. */
export const CONNECTOR_INSTRUCTIONS =
  "Noren is a bilingual (Japanese and English) map of local places in Nagasaki, with stories written by the people who have been there. " +
  "These tools are read-only and need no sign-in. " +
  ASSISTANT_RULES;

type AnyTool = ConnectorTool<z.ZodObject>;

function register(server: McpServer, tool: AnyTool, ctx: ToolContext) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      // Read-only for the person and for Noren's data. The two draws add one to an anonymous
      // weekly count of how often a place was suggested; that is the whole of what they write.
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const outcome = await tool.run(input, ctx);
        if (!outcome.ok) {
          return { isError: true, content: [{ type: "text" as const, text: outcome.message }] };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(outcome.result, null, 2) }],
        };
      } catch (error) {
        // Name the error: a bare message can be empty, and an operator needs to see what threw.
        const name = error instanceof Error ? error.name : typeof error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`connector tool ${tool.name} failed (${name}: ${message || "no message"})`);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Noren could not read its data just now. Ask the person to try again in a moment.",
            },
          ],
        };
      }
    },
  );
}

export function registerConnectorTools(server: McpServer, ctx: ToolContext): void {
  // Each tool's input type is narrower than a bare object schema; the schema itself checks it.
  for (const tool of CONNECTOR_TOOLS) register(server, tool as unknown as AnyTool, ctx);
}
