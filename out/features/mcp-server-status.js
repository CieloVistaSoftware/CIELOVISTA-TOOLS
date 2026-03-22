"use strict";
// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMcpServer = startMcpServer;
exports.stopMcpServer = stopMcpServer;
exports.getMcpServerStatus = getMcpServerStatus;
exports.onMcpServerStatusChange = onMcpServerStatusChange;
/**
 * mcp-server-status.ts
 *
 * Event-driven MCP server process manager for CieloVista Tools.
 * - Starts/stops MCP server (dist/index.js)
 * - Emits status events (up/down) for real-time UI updates
 * - No polling: uses process events only
 * - Exports: startMcpServer, stopMcpServer, getMcpServerStatus, onMcpServerStatusChange
 */
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
// Internal state
let mcpProcess = null;
let mcpStatus = 'down';
let statusListeners = [];
const MCP_PATH = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'mcp-server', 'dist', 'index.js');
function startMcpServer() {
    if (mcpProcess && mcpStatus === 'up')
        return;
    mcpProcess = (0, child_process_1.spawn)('node', [MCP_PATH], { stdio: 'ignore', cwd: path.dirname(MCP_PATH) });
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
function stopMcpServer() {
    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
        mcpStatus = 'down';
        notifyStatus();
    }
}
function getMcpServerStatus() {
    return mcpStatus;
}
function onMcpServerStatusChange(listener) {
    statusListeners.push(listener);
}
function notifyStatus() {
    for (const listener of statusListeners) {
        listener(mcpStatus);
    }
}
//# sourceMappingURL=mcp-server-status.js.map