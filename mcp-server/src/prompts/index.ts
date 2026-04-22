import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "greeting",
    "A friendly greeting prompt for the CieloVista project.",
    async () => {
      return {
        messages: [
          {
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: "Welcome to the CieloVista project! How can I assist you today?",
            },
          },
        ],
      };
    }
  );

  server.prompt(
    "project-summary",
    "Summarizes what the CieloVista project is about.",
    async () => {
      return {
        messages: [
          {
            role: "assistant" as const,
            content: {
              type: "text" as const,
              text: "CieloVista Tools is a VS Code extension providing developer utilities including Copilot helpers, terminal tools, CSS hover inspection, Python runner, and OpenAI chat integration.",
            },
          },
        ],
      };
    }
  );
}
// FILE REMOVED BY REQUEST
