#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  process.stdin.resume();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CieloVista MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
// FILE REMOVED BY REQUEST
