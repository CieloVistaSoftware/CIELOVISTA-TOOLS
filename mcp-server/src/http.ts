#!/usr/bin/env node
// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { readBody } from './shared/request-utils.js';

console.error(
  `[cvt-mcp-http] process starting pid=${process.pid} node=${process.version} ` +
  `platform=${process.platform} arch=${process.arch}`
);

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.MCP_PORT || '3000', 10);
const ENDPOINT = '/mcp';

interface McpStreamableRequest {
  method: string;
  body: string;
  headers: Record<string, string>;
}

interface McpStreamableResponse {
  write(chunk: string): void;
  end(): void;
  setHeader(name: string, value: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
}

/**
 * Parse JSON-RPC request from body
 */
async function parseJsonRpcRequest(req: IncomingMessage): Promise<unknown> {
    const raw = await readBody(req);
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error('Invalid JSON');
    }
}

/**
 * Send JSON-RPC response
 */
function sendJsonRpcResponse(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Send 202 Accepted for notification/response (no reply expected)
 */
function sendAccepted(res: ServerResponse): void {
  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end('');
}

/**
 * Validate Origin header to prevent DNS rebinding attacks
 */
function validateOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Allow non-browser clients (no Origin header)
    return true;
  }
  // Only allow localhost origins
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Main HTTP request handler using Streamable HTTP MCP transport pattern
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Validate Origin
  if (!validateOrigin(req)) {
    sendJsonRpcResponse(res, 403, {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Origin not allowed' },
    });
    return;
  }

  const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;

  // Only handle the /mcp endpoint
  if (pathname !== ENDPOINT) {
    sendJsonRpcResponse(res, 404, {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Endpoint not found' },
    });
    return;
  }

  // Handle POST — JSON-RPC request
  if (req.method === 'POST') {
    try {
      const jsonRpc = (await parseJsonRpcRequest(req)) as Record<string, unknown>;

      // Validate JSON-RPC structure
      if (typeof jsonRpc !== 'object' || jsonRpc === null || jsonRpc.jsonrpc !== '2.0') {
        sendJsonRpcResponse(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
        });
        return;
      }

      // Notification (no id) or request (has id)
      const id = (jsonRpc as Record<string, unknown>).id;
      const method = (jsonRpc as Record<string, unknown>).method as string | undefined;

      if (!method) {
        sendJsonRpcResponse(res, 400, {
          jsonrpc: '2.0',
          id,
          error: { code: -32600, message: 'Missing method' },
        });
        return;
      }

      // If no id, it's a notification — acknowledge and close
      if (id === undefined || id === null) {
        sendAccepted(res);
        return;
      }

      // Initialize request
      if (method === 'initialize') {
        sendJsonRpcResponse(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'cielovista-mcp-server',
              version: '1.0.0',
            },
          },
        });
        return;
      }

      // Placeholder for other methods
      // Full MCP tool routing integration to follow in subsequent updates
      sendJsonRpcResponse(res, 200, {
        jsonrpc: '2.0',
        id,
        result: { status: 'ok', method, note: 'MCP tool routing not yet implemented in HTTP transport' },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      sendJsonRpcResponse(res, 400, {
        jsonrpc: '2.0',
        error: { code: -32603, message: msg },
      });
    }
    return;
  }

  // Handle GET — would support SSE for server-to-client notifications
  if (req.method === 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed\n');
    return;
  }

  // Other methods not supported
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed\n');
}

/**
 * Start HTTP server
 */
async function main(): Promise<void> {
  const server = createHttpServer(handleRequest);

  // Port-already-in-use guard: a rapid restart loop (supervisor retries)
  // could otherwise race a still-shutting-down previous instance for the
  // same port, surfacing as an opaque EADDRINUSE crash. Fail with a clear,
  // flushed message instead of an unhandled 'error' event.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[cvt-mcp-http] Port ${PORT} is already in use — another MCP HTTP instance may still be running. Not starting a second one.`);
    } else {
      console.error('[cvt-mcp-http] Fatal server error:', err);
    }
    process.exitCode = 1;
  });

  server.listen(PORT, HOST, () => {
    console.error(`[cvt-mcp-http] CieloVista MCP server running on http://${HOST}:${PORT}${ENDPOINT}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('[cvt-mcp-http] Shutting down...');
    server.close(() => {
      // Setting exitCode (not exit()) lets Node exit naturally once the
      // console.error above has actually flushed — see index.ts for the
      // same Windows async-pipe rationale.
      process.exitCode = 0;
    });
  });
}

main().catch((error) => {
  console.error('[cvt-mcp-http] Fatal error:', error);
  process.exitCode = 1;
});
