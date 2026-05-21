#!/usr/bin/env node
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';

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
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
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

  server.listen(PORT, HOST, () => {
    console.error(`CieloVista MCP server running on http://${HOST}:${PORT}${ENDPOINT}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('Shutting down...');
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
