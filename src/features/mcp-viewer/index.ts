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
 *
 * Security (#780): the server answers only its own page. Every route goes
 * through authorizeMcpViewerRequest() (per-server token + own Host header),
 * no response carries a CORS header, and every path-taking route accepts only
 * paths inside a registered project or the global docs folder
 * (resolveViewerPath()).
 */

import * as vscode       from 'vscode';
import * as http         from 'http';
import * as fs           from 'fs';
import { execFile }      from 'child_process';
import { log } from '../../shared/output-channel';
import { mdToHtml } from '../../shared/md-renderer';
import { loadRegistry, registeredRoots } from '../../shared/registry';
import { readRequestBody } from '../../shared/http-utils';
import { resolveAllowedPath } from '../../shared/local-image-route';
import { createServerToken, requestHasToken, isOwnHost, SERVER_TOKEN_PARAM } from '../../shared/server-token';
import { buildCatalog } from '../doc-catalog/commands';
import { buildViewerHtml } from './html';
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

let _server:      http.Server | undefined;
let _serverPort:  number      | undefined;
/** This server's token (#780): only pages it renders carry it. Lives as long as the server. */
let _serverToken: string      | undefined;

/** Dispose the HTTP server — called from extension deactivate. */
export function disposeMcpViewerServer(): void {
    if (_server) {
        try { _server.close(); } catch { /* noop */ }
        _server      = undefined;
        _serverPort  = undefined;
        _serverToken = undefined;
    }
}

/* ── Endpoint handlers (reused by both HTTP and tests) ────────────────────── */

interface ProjectJson { name: string; path: string; type: string; description: string; status: string; }
interface DocJson     { projectName: string; fileName: string; filePath: string; title: string; description: string; lastModified: string; }
function cardToDocJson(c: CatalogCard): DocJson {
    return {
        projectName: c.projectName,
        fileName:    c.fileName,
        filePath:    c.filePath,
        title:       c.title,
        description: c.description,
        lastModified: c.lastModified,
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

/* ── report_viewer_error ─────────────────────────────────────────────────── */

function handleReportViewerError(params: { message?: string; endpoint?: string; url?: string }): { filed: boolean; issueUrl?: string } {
    const message  = params.message  || 'unknown viewer error';
    const endpoint = params.endpoint || 'unknown';
    const title    = `fix(mcp-viewer): empty/error result on ${endpoint} — ${message.slice(0, 80)}`;
    const body     = [
        '## Auto-filed by MCP Viewer',
        '',
        `**Endpoint:** \`${endpoint}\``,
        `**Error:** ${message}`,
        `**Viewer URL:** ${params.url || 'unknown'}`,
        `**Time:** ${new Date().toISOString()}`,
        '',
        '## Steps to reproduce',
        `1. Open MCP Endpoint Viewer`,
        `2. Click the \`${endpoint}\` tab and press **Run**`,
        `3. Observe error: ${message}`,
        '',
        '## Expected',
        'Data rendered in the viewer panel without JavaScript errors.',
    ].join('\n');

    log(FEATURE, `Viewer error on ${endpoint}: ${message}`);

    return new Promise<{ filed: boolean; issueUrl?: string }>((resolve) => {
        execFile('gh', [
            'issue', 'create',
            '--repo', 'CieloVistaSoftware/CIELOVISTA-TOOLS',
            '--title', title,
            '--body', body,
            '--label', 'priority:1',
        ], { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd() }, (err, stdout) => {
            if (err) {
                log(FEATURE, `Auto-issue filing failed: ${err.message}`);
                resolve({ filed: false });
            } else {
                const issueUrl = stdout.trim();
                log(FEATURE, `Auto-filed issue: ${issueUrl}`);
                resolve({ filed: true, issueUrl });
            }
        });
    }) as unknown as { filed: boolean; issueUrl?: string };
}

/* ── HTTP server wiring ───────────────────────────────────────────────────── */

/**
 * JSON reply. No Access-Control-Allow-Origin header (#780): the viewer page is
 * served by this same server, so its requests are same-origin, and a page on
 * any other origin must not be able to read a response.
 */
function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type':   'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
}

function htmlResponse(res: http.ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
}

function escHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** JSON for a value placed inside an inline script: no "<", so no "</script>" breakout. */
function jsonForScript(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The md-preview Back target, only when it is a page of this server (#780).
 * Anything else (another origin, a javascript: URL) becomes '' and Back
 * falls back to history. The parsed href never contains "<" or a quote.
 */
function sameServerBackUrl(raw: string, port: number): string {
    if (!raw) { return ''; }
    try {
        const u = new URL(raw);
        return u.origin === `http://127.0.0.1:${port}` || u.origin === `http://localhost:${port}` ? u.href : '';
    } catch {
        return '';
    }
}

function buildMarkdownPreviewHtml(filePath: string, markdown: string, token: string, backUrl?: string): string {
    const safePath    = escHtml(filePath);
    const safeFileName = escHtml(filePath.split(/[\\/]/).pop() ?? filePath);
    const safeBack    = backUrl || '';
    const renderedHtml = mdToHtml(markdown);
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${safeFileName}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1e1e1e;color:#d4d4d4}
header{position:sticky;top:0;background:#252526;border-bottom:1px solid #404040;padding:10px 16px;font-size:12px;color:#9cdcfe;font-family:Consolas,monospace;display:flex;align-items:center;gap:10px}
.btn-back{background:#2d2d2d;color:#9cdcfe;border:1px solid #404040;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px;font-family:inherit}
.btn-back:hover{border-color:#0078d4;color:#fff}
.btn-reveal{background:#2d2d2d;color:#9cdcfe;border:1px solid #404040;border-radius:4px;padding:5px 8px;cursor:pointer;font-size:12px;font-family:inherit;flex-shrink:0;title:attr(title)}
.btn-reveal:hover{border-color:#0078d4;color:#fff}
.path-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:#9cdcfe}
.path-label:hover{text-decoration:underline}
main{max-width:980px;margin:0 auto;padding:18px 20px 40px;line-height:1.65}
h1,h2,h3,h4{color:#fff;margin-top:1.4em}
a{color:#FFD700}
code{background:#2d2d2d;border-radius:4px;padding:1px 4px}
pre{background:#111;border:1px solid #2d2d2d;border-radius:6px;padding:12px;overflow:auto}
blockquote{border-left:3px solid #0078d4;padding-left:10px;color:#9e9e9e}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #2d2d2d;padding:6px 8px}
.fm-block{font-family:Georgia,'Times New Roman',serif;font-size:.9rem;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:3px 10px;align-items:baseline;padding:10px 14px;margin-bottom:16px;border:1px solid rgba(77,171,247,0.35);border-radius:5px;background:rgba(77,171,247,0.06)}
.fm-row{display:contents}
.fm-label{font-size:11px;font-weight:700;color:#4dabf7;font-variant:small-caps;letter-spacing:.04em;white-space:nowrap}
.fm-value{font-size:12px;color:#74c7ec;font-style:italic;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
</style></head>
<body>
<header><button id="btn-back" class="btn-back" title="Back to MCP Endpoint Viewer">&larr; Back</button><button id="btn-reveal" class="btn-reveal" title="Reveal in Explorer">&#128194;</button><span id="path-label" class="path-label" title="Click to reveal in Explorer">${safePath}</span></header>
<main>${renderedHtml}</main>
<script>
var backUrl = ${jsonForScript(safeBack)};
var currentFilePath = ${jsonForScript(filePath)};
// Every request to this server carries its token (#780).
var TOKEN = ${jsonForScript(token)};
document.getElementById('btn-back').addEventListener('click', function(){
    if (backUrl) { window.location.href = backUrl; return; }
    if (window.history.length > 1) { window.history.back(); return; }
    window.location.href = '/';
});
function revealFile() {
    if (!currentFilePath) { return; }
    fetch('/api/reveal?t=' + TOKEN + '&path=' + encodeURIComponent(currentFilePath)).catch(function(){});
}
document.getElementById('btn-reveal').addEventListener('click', revealFile);
document.getElementById('path-label').addEventListener('click', revealFile);
(function(){
    var pathRe = /[A-Za-z]:\\[^\s<>'"\\|*?]+/g;
    function linkifyPaths(root) {
        var nodes = [];
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while ((n = walker.nextNode())) { nodes.push(n); }
        nodes.forEach(function(node) {
            var text = node.nodeValue || '';
            pathRe.lastIndex = 0;
            if (!pathRe.test(text)) { return; }
            pathRe.lastIndex = 0;
            var frag = document.createDocumentFragment();
            var last = 0, m;
            while ((m = pathRe.exec(text)) !== null) {
                if (m.index > last) { frag.appendChild(document.createTextNode(text.slice(last, m.index))); }
                var fp = m[0];
                if (/\.md$/i.test(fp)) {
                    var a = document.createElement('a');
                    a.href = '/md-preview?t=' + TOKEN + '&path=' + encodeURIComponent(fp) + '&back=' + encodeURIComponent(window.location.href);
                    a.textContent = fp;
                    frag.appendChild(a);
                } else {
                    var span = document.createElement('span');
                    span.textContent = fp;
                    span.style.fontFamily = 'Consolas,monospace';
                    span.style.color = '#ce9178';
                    frag.appendChild(span);
                }
                last = m.index + fp.length;
            }
            if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
            node.parentNode.replaceChild(frag, node);
        });
    }
    var main = document.querySelector('main');
    if (main) { linkifyPaths(main); }
})();
</script>
</body></html>`;
}

/**
 * The one gate for every route of this server (#780), run before any route.
 * The server listens on 127.0.0.1, which every web page the user has open
 * can reach. A request is answered only when:
 *
 *   - its Host header names this server's own loopback address, so a
 *     DNS-rebinding page (evil.example resolving to 127.0.0.1) is refused;
 *   - it carries this server's token (?t=), which only pages this server
 *     rendered contain. No response carries a CORS header, so a page on
 *     another origin cannot read a page to learn the token.
 *
 * Same helpers as the View-a-Doc server (#752, #758): shared/server-token.ts.
 */
function authorizeMcpViewerRequest(req: http.IncomingMessage, url: URL, port: number, token: string): boolean {
    return isOwnHost(req.headers.host, port) && requestHasToken(url, token);
}

/**
 * The file a path-taking route may use, or why not (#780). Only paths inside
 * a registered project root or the registry's global docs folder, after
 * following symlinks (shared/local-image-route.ts resolveAllowedPath). The
 * ?path= value is decoded once, by URL parsing, and never again.
 *
 *   /api/reveal   an existing file or folder
 *   /md-preview   an existing .md file
 */
function resolveViewerPath(url: URL): ReturnType<typeof resolveAllowedPath> {
    const requested = url.searchParams.get('path');
    const result = resolveAllowedPath(requested, registeredRoots(),
        url.pathname === '/md-preview' ? { kind: 'file', extensions: ['.md'] } : { kind: 'any' });
    if (!result.ok) {
        log(FEATURE, `Viewer server refused ${url.pathname} (${result.reason}): ${requested ?? ''}`);
    }
    return result;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, port: number, token: string): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost');
    const p   = url.pathname;

    if (!authorizeMcpViewerRequest(req, url, port, token)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }

    /* Main HTML page — counts loaded here so topbar renders with real numbers. */
    if (p === '/' || p === '/index.html') {
        const summary = handleListProjects();
        htmlResponse(res, 200, buildViewerHtml(port, summary.projectCount, token));
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

    if (p === '/api/reveal') {
        const allowed = resolveViewerPath(url);
        if (!allowed.ok) {
            jsonResponse(res, allowed.status, { ok: false, error: allowed.status === 404 ? 'Path not found' : 'Refused' });
            return;
        }
        try {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(allowed.path));
            jsonResponse(res, 200, { ok: true });
        } catch {
            jsonResponse(res, 500, { ok: false, error: 'Could not reveal file' });
        }
        return;
    }

    if (p === '/md-preview') {
        const allowed = resolveViewerPath(url);
        if (!allowed.ok) {
            htmlResponse(res, allowed.status, allowed.status === 404 ? '<h1>Markdown file not found</h1>' : '<h1>Refused</h1>');
            return;
        }
        const filePath = allowed.path;
        const backUrl = sameServerBackUrl(url.searchParams.get('back') || '', port);
        try {
            const md = fs.readFileSync(filePath, 'utf8');
            htmlResponse(res, 200, buildMarkdownPreviewHtml(filePath, md, token, backUrl));
            return;
        } catch {
            htmlResponse(res, 500, '<h1>Unable to read markdown file</h1>');
            return;
        }
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

    /* JSON-RPC endpoint for MCP protocol compatibility */
    if (p === '/mcp' && req.method === 'POST') {
        try {
            const body = await readRequestBody(req);
            const jsonRpc = JSON.parse(body);

            // Validate JSON-RPC structure
            if (!jsonRpc || jsonRpc.jsonrpc !== '2.0' || !jsonRpc.method) {
                jsonResponse(res, 400, {
                    jsonrpc: '2.0',
                    id: jsonRpc?.id,
                    error: { code: -32600, message: 'Invalid Request' }
                });
                return;
            }

            const method = jsonRpc.method as string;
            const params = (jsonRpc.params as Record<string, unknown>) || {};
            const id = jsonRpc.id;

            // Handle notifications (no response expected)
            if (id === undefined || id === null) {
                res.writeHead(202);
                res.end();
                return;
            }

            // Route to appropriate handler based on method name
            let result: unknown;
            try {
                switch (method) {
                    case 'list_projects':
                        result = handleListProjects(coerceStatus(params.status as string | null));
                        break;
                    case 'find_project':
                        result = handleFindProject(params.query as string || '', coerceStatus(params.status as string | null));
                        break;
                    case 'search_docs':
                        result = await handleSearchDocs(params.query as string || '', params.projectName as string || '');
                        break;
                    case 'get_catalog':
                        result = await handleGetCatalog(params.projectName as string || '');
                        break;
                    case 'list_symbols':
                        result = handleListSymbols(new URLSearchParams(params as Record<string, string>));
                        break;
                    case 'find_symbol':
                        result = handleFindSymbol(new URLSearchParams(params as Record<string, string>));
                        break;
                    case 'list_cvt_commands':
                        result = handleListCvtCommands(new URLSearchParams(params as Record<string, string>));
                        break;
                    case 'report_viewer_error':
                        result = await handleReportViewerError(params as { message?: string; endpoint?: string; url?: string });
                        break;
                    default:
                        jsonResponse(res, 200, {
                            jsonrpc: '2.0',
                            id,
                            error: { code: -32601, message: 'Method not found' }
                        });
                        return;
                }

                jsonResponse(res, 200, {
                    jsonrpc: '2.0',
                    id,
                    result
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                jsonResponse(res, 200, {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32603, message }
                });
            }
            return;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            jsonResponse(res, 400, {
                jsonrpc: '2.0',
                error: { code: -32603, message }
            });
            return;
        }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
}

// readRequestBody is imported from '../../shared/http-utils'

/** Ensure the HTTP server is running, then open the browser. */
async function openViewer(): Promise<void> {
    if (_server && _serverPort && _serverToken) {
        await vscode.env.openExternal(vscode.Uri.parse(viewerUrl(_serverPort, _serverToken)));
        log(FEATURE, `Reopened existing viewer on port ${_serverPort}`);
        return;
    }

    // A fresh token for a fresh server (#780): only the URL opened here, and
    // the pages the server renders, carry it.
    const token = createServerToken();
    _serverToken = token;
    _server = http.createServer((req, res) => {
        const port = _serverPort || 0;
        void handleRequest(req, res, port, token).catch(err => {
            log(FEATURE, `Request error: ${(err as Error).message}`);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal error');
            }
        });
    });

    _server.on('error', err => {
        log(FEATURE, `Server error: ${err.message}`);
        _server      = undefined;
        _serverPort  = undefined;
        _serverToken = undefined;
    });

    await new Promise<void>((resolve) => {
        _server!.listen(0, '127.0.0.1', () => {
            const addr  = _server!.address() as { port: number };
            _serverPort = addr.port;
            log(FEATURE, `Viewer server listening on port ${_serverPort}`);
            resolve();
        });
    });

    await vscode.env.openExternal(vscode.Uri.parse(viewerUrl(_serverPort!, token)));
    log(FEATURE, `Viewer opened at http://127.0.0.1:${_serverPort}/`);
}

/** The viewer page's address, token included (#780). */
function viewerUrl(port: number, token: string): string {
    return `http://127.0.0.1:${port}/?${SERVER_TOKEN_PARAM}=${token}`;
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
