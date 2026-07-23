#!/usr/bin/env node
// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * mcp-server/src/index.ts
 *
 * Stdio entry point for the CieloVista MCP server. Spawned by the extension's
 * mcp-server-status.ts supervisor as `node mcp-server/dist/index.js`.
 *
 * Hardening for issues #615 / #653:
 *
 *   1) A first-line startup log is written before any heavier module
 *      (the MCP SDK, our own server/tool registrations) is loaded, using
 *      dynamic import() instead of static import. If a future crash-loop
 *      happens again with empty stdout/stderr (issue #615's
 *      STATUS_DLL_INIT_FAILED signature), this line tells us whether the
 *      crash happened before or after module load even got underway —
 *      static imports execute before any of our own code runs, so a
 *      failure there is otherwise invisible.
 *
 *   2) The fatal-error path no longer calls process.exit(1) directly after
 *      console.error(). On Windows, when stdout/stderr are non-TTY pipes
 *      (exactly the case here — the extension spawns us with
 *      stdio: ['pipe','pipe','pipe']), writes to those streams are
 *      asynchronous. Calling process.exit() immediately after console.error()
 *      can terminate the process before the OS pipe buffer flushes, so the
 *      error message is silently lost — the supervisor then only observes
 *      a bare "process exited with code 1" with no diagnostic content.
 *      This is a plausible root cause for issue #653's generic report.
 *      Fix: set process.exitCode instead of calling process.exit(), and
 *      release the stdin handle (see below) so Node exits naturally once
 *      the event loop drains — which happens only after pending writes
 *      have flushed.
 *
 *   3) process.stdin.resume() puts stdin into flowing mode, which keeps the
 *      event loop alive indefinitely. That's correct for the running
 *      server (stdio transport needs it) but means the fatal-error path
 *      MUST pause stdin again, otherwise removing process.exit() would
 *      turn a clean crash into a silent hang instead of an exit.
 */

console.error(
  `[cvt-mcp] process starting pid=${process.pid} node=${process.version} ` +
  `platform=${process.platform} arch=${process.arch}`
);

async function main(): Promise<void> {
  process.stdin.resume();

  // Dynamic import so the startup log above is guaranteed to land before
  // the MCP SDK (or our own server/tool modules) begin loading.
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { createServer } = await import("./server.js");

  console.error("[cvt-mcp] modules loaded, creating server...");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[cvt-mcp] CieloVista MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("[cvt-mcp] Fatal error during startup:", error);
  // Do not process.exit(1) here — see hardening note (2) above. Setting
  // exitCode and releasing stdin lets Node exit naturally once queued
  // stdout/stderr writes have actually flushed.
  process.exitCode = 1;
  process.stdin.pause();
});
