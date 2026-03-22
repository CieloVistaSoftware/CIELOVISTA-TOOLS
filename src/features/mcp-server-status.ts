// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * mcp-server-status.ts
 *
 * Event-driven MCP server process manager for CieloVista Tools.
 * - Starts/stops MCP server (dist/index.js)
 * - Emits status events (up/down) for real-time UI updates
 * - No polling: uses process events only
 * - Exports: startMcpServer, stopMcpServer, getMcpServerStatus, onMcpServerStatusChange
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

// Internal state
let mcpProcess: ChildProcess | null = null;
let mcpStatus: 'up' | 'down' = 'down';
let statusListeners: ((status: 'up' | 'down') => void)[] = [];

const MCP_PATH = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'mcp-server', 'dist', 'index.js');

export function startMcpServer(): void {
  if (mcpProcess && mcpStatus === 'up') return;
  mcpProcess = spawn('node', [MCP_PATH], { stdio: 'ignore', cwd: path.dirname(MCP_PATH) });
  mcpStatus = 'up';
  notifyStatus();
  if (mcpProcess) {
    mcpProcess.on('exit', () => {
      mcpStatus = 'down';
      notifyStatus();
      mcpProcess = null;
    });
    mcpProcess.on('error', () => {
      mcpStatus = 'down';
      notifyStatus();
      mcpProcess = null;
    });
  }
}

export function stopMcpServer(): void {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
    mcpStatus = 'down';
    notifyStatus();
  }
}

export function getMcpServerStatus(): 'up' | 'down' {
  return mcpStatus;
}

export function onMcpServerStatusChange(listener: (status: 'up' | 'down') => void): void {
  statusListeners.push(listener);
}

function notifyStatus() {
  for (const listener of statusListeners) {
    listener(mcpStatus);
  }
}
