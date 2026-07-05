import { defineMcp } from "@lovable.dev/mcp-js";
import pingTool from "./tools/ping";
import listPublicTournamentsTool from "./tools/list-public-tournaments";

export default defineMcp({
  name: "clubero-mcp",
  title: "Clubero",
  version: "0.1.0",
  instructions:
    "Clubero MCP server. Use `ping` to verify connectivity and `list_public_tournaments` to discover upcoming public tournaments on the platform.",
  tools: [pingTool, listPublicTournamentsTool],
});
