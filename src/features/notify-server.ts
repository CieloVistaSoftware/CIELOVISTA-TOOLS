// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * notify-server.ts
 *
 * Tiny HTTP listener on 127.0.0.1:52199.
 * Accepts POST /notify from the cielovista MCP server and writes the payload
 * directly into the "CieloVista Tools" VS Code output channel.
 *
 * MCP tool payload: { message: string, level?: 'info' | 'warn' | 'error' }
 *
 * Port 52199 — reserved for CieloVista Tools notify bridge.
 * (vscode-claude uses 52101 for its Trace Viewer)
 */

import * as http    from 'http';
import * as vscode  from 'vscode';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'notify-server';
const HOST    = '127.0.0.1';
const PORT    = 52199;

let _server: http.Server | undefined;

export function activate(context: vscode.ExtensionContext): void {
    _server = http.createServer((req, res) => {
        // Only accept POST /notify from localhost
        const url = new URL(req.url ?? '/', `http://${HOST}`);
        if (req.method !== 'POST' || url.pathname !== '/notify') {
            res.writeHead(404); res.end('Not Found'); return;
        }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); if (body.length > 65536) { res.writeHead(413); res.end(); } });
        req.on('end', () => {
            try {
                const { message, level } = JSON.parse(body) as { message: string; level?: string };
                if (!message) { res.writeHead(400); res.end('Missing message'); return; }

                if (level === 'error') {
                    log(FEATURE, `❌ ${message}`);
                } else if (level === 'warn') {
                    log(FEATURE, `⚠ ${message}`);
                } else {
                    log(FEATURE, `✅ ${message}`);
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
            } catch {
                res.writeHead(400); res.end('Bad JSON');
            }
        });
    });

    _server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            // Another VS Code window already owns the port — normal in multi-window setups.
            // Log at info level only; this is not an error.
            log(FEATURE, 'Port 52199 already in use — another window is handling notifications');
        } else {
            logError('Notify server error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    });

    _server.listen(PORT, HOST, () => {
        log(FEATURE, `Notify bridge listening on ${HOST}:${PORT}`);
    });

    context.subscriptions.push({ dispose: () => deactivate() });
}

export function deactivate(): void {
    _server?.close();
    _server = undefined;
}
