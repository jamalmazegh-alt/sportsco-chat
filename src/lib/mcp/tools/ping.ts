import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "ping",
  title: "Ping",
  description: "Health check for the Clubero MCP server. Returns 'pong' plus any provided note.",
  inputSchema: {
    note: z.string().optional().describe("Optional note to echo back."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ note }) => ({
    content: [{ type: "text", text: note ? `pong: ${note}` : "pong" }],
  }),
});
