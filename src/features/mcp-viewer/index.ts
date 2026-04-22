// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * mcp-viewer/index.ts
 *
 * CVT feature: live in-browser viewer for the four cielovista-tools MCP
 * catalog endpoints — `list_projects`, `find_project`, `search_docs`,
 * `get_catalog`. Uses the same local-HTTP-server pattern as View a Doc
 * (auto-assigned port, opens in system browser, no webview CSP hassle).
 *
 * The HTTP endpoints directly reuse the doc-catalog feature code that the
 * MCP server tools also use — same `loadRegistry()` registry data and same
 * `buildCatalog()` scan — so no logic is duplicated.
 *
 * Command: `cvs.mcp.viewer.open`
 */

import * as vscode from 'vscode';
import * as http   from 'http';
import { log } from '../../shared/output-channel';
import { loadRegistry } from '../../shared/registry';
import { buildCatalog } from '../doc-catalog/commands';
import type { CatalogCard } from '../doc-catalog/types';
import {
    getSymbolIndex,
    filterSymbols,
    findSymbolByName,
    loadCvtCommands,
    type SymbolKind,
    type SymbolRole,
} from './symbol-index';

const FEATURE = 'mcp-viewer';

let _server:     http.Server | undefined;
let _serverPort: number      | undefined;

/** Dispose the HTTP server — called from extension deactivate. */
export function disposeMcpViewerServer(): void {
    if (_server) {
        try { _server.close(); } catch { /* noop */ }
        _server     = undefined;
        _serverPort = undefined;
    }
}

/* ── Endpoint handlers (reused by both HTTP and tests) ────────────────────── */

interface ProjectJson { name: string; path: string; type: string; description: string; status: string; }
interface DocJson     { projectName: string; fileName: string; filePath: string; title: string; description: string; }

function cardToDocJson(c: CatalogCard): DocJson {
    return {
        projectName: c.projectName,
        fileName:    c.fileName,
        filePath:    c.filePath,
        title:       c.title,
        description: c.description,
    };
}

type StatusFilter = 'product' | 'workbench' | 'generated' | 'archived';

function coerceStatus(raw: string | null): StatusFilter | undefined {
    if (!raw) { return undefined; }
    if (raw === 'product' || raw === 'workbench' || raw === 'generated' || raw === 'archived') {
        return raw;
    }
    return undefined;
}

/** list_projects — returns the full registry, optionally filtered by status. */
function handleListProjects(status?: StatusFilter): { globalDocsPath: string; status: string; projectCount: number; projects: ProjectJson[] } {
    const reg = loadRegistry();
    if (!reg) { return { globalDocsPath: '', status: status ?? '(all)', projectCount: 0, projects: [] }; }
    const raw = status ? reg.projects.filter(p => p.status === status) : reg.projects;
    const projects: ProjectJson[] = raw.map(p => ({
        name: p.name, path: p.path, type: p.type, description: p.description, status: p.status ?? 'product',
    }));
    return { globalDocsPath: reg.globalDocsPath, status: status ?? '(all)', projectCount: projects.length, projects };
}

/** find_project — registry filter by name or description, optionally narrowed by status. */
function handleFindProject(query: string, status?: StatusFilter): { query: string; status: string; matchCount: number; matches: ProjectJson[] } {
    const reg = loadRegistry();
    const q   = (query || '').toLowerCase();
    if (!reg || !q) { return { query, status: status ?? '(all)', matchCount: 0, matches: [] }; }
    let filtered = reg.projects.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    if (status) { filtered = filtered.filter(p => p.status === status); }
    const matches: ProjectJson[] = filtered.map(p => ({
        name: p.name, path: p.path, type: p.type, description: p.description, status: p.status ?? 'product',
    }));
    return { query, status: status ?? '(all)', matchCount: matches.length, matches };
}

/** search_docs — title/description/filename substring match across all .md docs. */
async function handleSearchDocs(query: string, projectName?: string): Promise<{ query: string; projectName: string; matchCount: number; matches: DocJson[] }> {
    const cards = await buildCatalog();
    const q     = (query || '').toLowerCase();
    const proj  = (projectName || '').trim();
    if (!cards?.length || !q) { return { query, projectName: proj || '(all)', matchCount: 0, matches: [] }; }
    const filtered = cards.filter(c => {
        if (proj && c.projectName !== proj) { return false; }
        return c.title.toLowerCase().includes(q)
            || (c.description || '').toLowerCase().includes(q)
            || c.fileName.toLowerCase().includes(q);
    });
    return {
        query,
        projectName: proj || '(all)',
        matchCount:  filtered.length,
        matches:     filtered.map(cardToDocJson),
    };
}

/** get_catalog — every .md doc, optionally scoped to one project. */
async function handleGetCatalog(projectName?: string): Promise<{ projectName: string; docCount: number; docs: DocJson[] }> {
    const cards = await buildCatalog();
    const proj  = (projectName || '').trim();
    if (!cards?.length) { return { projectName: proj || '(all)', docCount: 0, docs: [] }; }
    const filtered = proj ? cards.filter(c => c.projectName === proj) : cards;
    return {
        projectName: proj || '(all)',
        docCount:    filtered.length,
        docs:        filtered.map(cardToDocJson),
    };
}

/* ── Symbol + command endpoints ────────────────────────────────────────── */

function handleListSymbols(params: URLSearchParams): unknown {
    const all = getSymbolIndex();
    const limit = Number(params.get('limit') ?? '200');
    const filtered = filterSymbols(all, {
        query:        params.get('query') || undefined,
        kind:         (params.get('kind') || undefined) as SymbolKind | undefined,
        projectName:  params.get('projectName') || undefined,
        role:         (params.get('role') || undefined) as SymbolRole | undefined,
        exportedOnly: params.get('exportedOnly') === 'true',
        limit,
    });
    return {
        query:        params.get('query') || '',
        kind:         params.get('kind') || '(any)',
        projectName:  params.get('projectName') || '(all)',
        role:         params.get('role') || '(any)',
        totalIndexed: all.length,
        matchCount:   filtered.length,
        truncated:    filtered.length >= limit,
        matches:      filtered,
    };
}

function handleFindSymbol(params: URLSearchParams): unknown {
    const name = (params.get('name') || '').trim();
    const limit = Number(params.get('limit') ?? '10');
    const all = getSymbolIndex();
    const matches = name ? findSymbolByName(all, name, limit) : [];
    return { name, totalIndexed: all.length, matchCount: matches.length, matches };
}

function handleListCvtCommands(params: URLSearchParams): unknown {
    const group = (params.get('group') || '').trim();
    const all = loadCvtCommands();
    const filtered = group ? all.filter(c => c.group === group) : all;
    return { group: group || '(all)', totalCommands: all.length, matchCount: filtered.length, commands: filtered };
}

/* ── HTTP server wiring ───────────────────────────────────────────────────── */

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type':                'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Content-Length':              Buffer.byteLength(text),
    });
    res.end(text);
}

function htmlResponse(res: http.ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, port: number): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost');
    const p   = url.pathname;

    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }

    /* Main HTML page — counts loaded here so topbar renders with real numbers. */
    if (p === '/' || p === '/index.html') {
        const { buildViewerHtml } = await import('./html');
        const summary = handleListProjects();
        htmlResponse(res, 200, buildViewerHtml(port, summary.projectCount));
        return;
    }

    if (p === '/api/list_projects') {
        const status = coerceStatus(url.searchParams.get('status'));
        jsonResponse(res, 200, handleListProjects(status));
        return;
    }

    if (p === '/api/find_project') {
        const q      = url.searchParams.get('query') || '';
        const status = coerceStatus(url.searchParams.get('status'));
        jsonResponse(res, 200, handleFindProject(q, status));
        return;
    }

    if (p === '/api/search_docs') {
        const q       = url.searchParams.get('query')       || '';
        const project = url.searchParams.get('projectName') || '';
        jsonResponse(res, 200, await handleSearchDocs(q, project));
        return;
    }

    if (p === '/api/get_catalog') {
        const project = url.searchParams.get('projectName') || '';
        jsonResponse(res, 200, await handleGetCatalog(project));
        return;
    }

    if (p === '/api/list_symbols') {
        jsonResponse(res, 200, handleListSymbols(url.searchParams));
        return;
    }

    if (p === '/api/find_symbol') {
        jsonResponse(res, 200, handleFindSymbol(url.searchParams));
        return;
    }

    if (p === '/api/list_cvt_commands') {
        jsonResponse(res, 200, handleListCvtCommands(url.searchParams));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
}

/** Ensure the HTTP server is running, then open the browser. */
async function openViewer(): Promise<void> {
    if (_server && _serverPort) {
        await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${_serverPort}/`));
        log(FEATURE, `Reopened existing viewer on port ${_serverPort}`);
        return;
    }

    _server = http.createServer((req, res) => {
        const port = _serverPort || 0;
        void handleRequest(req, res, port).catch(err => {
            log(FEATURE, `Request error: ${(err as Error).message}`);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal error');
            }
        });
    });

    _server.on('error', err => {
        log(FEATURE, `Server error: ${err.message}`);
        _server     = undefined;
        _serverPort = undefined;
    });

    await new Promise<void>((resolve) => {
        _server!.listen(0, '127.0.0.1', () => {
            const addr  = _server!.address() as { port: number };
            _serverPort = addr.port;
            log(FEATURE, `Viewer server listening on port ${_serverPort}`);
            resolve();
        });
    });

    await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${_serverPort}/`));
    log(FEATURE, `Viewer opened at http://127.0.0.1:${_serverPort}/`);
}

/* ── Feature activation ───────────────────────────────────────────────────── */

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.mcp.viewer.open', () => {
            void openViewer();
        }),
    );
}

export function deactivate(): void {
    log(FEATURE, 'Deactivating');
    disposeMcpViewerServer();
}
