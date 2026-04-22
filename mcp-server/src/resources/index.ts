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
        tools: [
          "echo",
          "list_files",
          "read_file",
          "project_status",
          "write_file",
          "edit_file",
          "delete_file",
          "create_directory",
          "list_projects",
          "find_project",
          "get_catalog",
          "search_docs",
        ],
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
// FILE REMOVED BY REQUEST
