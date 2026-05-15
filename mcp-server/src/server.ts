import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

const REQUEST_START_PREFIX = "[CVT MCP REQUEST START] ";
const REQUEST_ERROR_PREFIX = "[CVT MCP REQUEST ERROR] ";
const REQUEST_END_PREFIX = "[CVT MCP REQUEST END] ";
const REQUEST_SUMMARY_MAX_CHARS = 2000;

function summarizeRequest(name: string, args: unknown): string {
  try {
    const raw = JSON.stringify(args ?? {});
    const summary = raw && raw !== "undefined" ? raw : "{}";
    return `${name} ${summary.length > REQUEST_SUMMARY_MAX_CHARS ? summary.slice(0, REQUEST_SUMMARY_MAX_CHARS) + "…" : summary}`;
  } catch {
    return `${name} "[unserializable request args]"`;
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "cielovista-mcp-server",
    version: "1.0.0",
  });

  const originalTool = server.tool.bind(server);
  server.tool = ((name: string, description: string, schema: Record<string, unknown>, handler: (...args: unknown[]) => Promise<unknown> | unknown) => {
    return originalTool(name, description, schema, async (...args: unknown[]) => {
      const requestSummary = summarizeRequest(name, args[0]);
      console.error(`${REQUEST_START_PREFIX}${requestSummary}`);
      try {
        const result = await handler(...args);
        console.error(`${REQUEST_END_PREFIX}${requestSummary}`);
        return result;
      } catch (error) {
        console.error(`${REQUEST_ERROR_PREFIX}${requestSummary}`);
        console.error(`${REQUEST_END_PREFIX}${requestSummary}`);
        throw error;
      }
    });
  }) as typeof server.tool;

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
// FILE REMOVED BY REQUEST
