import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  server.resource(
    "server-info",
    "cielovista://info",
    { description: "CieloVista MCP server information", mimeType: "application/json" },
    async () => {
      const info = {
        name: "cielovista-mcp-server",
        version: "1.0.0",
        description: "MCP server for CieloVista Tools",
        tools: ["echo", "list_files", "read_file", "project_status"],
      };
      return {
        contents: [
          {
            uri: "cielovista://info",
            text: JSON.stringify(info, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
