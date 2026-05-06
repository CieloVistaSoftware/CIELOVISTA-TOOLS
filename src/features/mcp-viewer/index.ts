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
import * as fs     from 'fs';
import * as path   from 'path';
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
interface DocJson     { projectName: string; fileName: string; filePath: string; title: string; description: string; lastModified: string; dewey?: string; }
type DocViolationCode =
    | 'missing-frontmatter'
    | 'missing-subject'
    | 'missing-id'
    | 'missing-title'
    | 'missing-project'
    | 'missing-description'
    | 'missing-status'
    | 'invalid-subject-format'
    | 'subject-project-mismatch'
    | 'invalid-id-format'
    | 'invalid-status'
    | 'identity-collision';

interface DocViolationJson {
    projectName: string;
    projectDewey: number;
    filePath: string;
    identity?: string;
    code: DocViolationCode;
    message: string;
}

interface ValidateDocJson {
    ok: boolean;
    filePath: string;
    projectName: string;
    projectDewey: number;
    expectedSubjectPrefix: string;
    identity?: string;
    violations: DocViolationJson[];
}

function cardToDocJson(c: CatalogCard): DocJson {
    return {
        projectName: c.projectName,
        fileName:    c.fileName,
        filePath:    c.filePath,
        title:       c.title,
        description: c.description,
        lastModified: c.lastModified,
        dewey:       c.dewey,
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

function parseFrontmatter(content: string): Record<string, string> | null {
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
    if (!match) { return null; }
    const out: Record<string, string> = {};
    const lines = match[1].split(/\r?\n/);
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx <= 0) { continue; }
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key) { out[key] = value; }
    }
    return out;
}

async function handleListDocViolations(params: URLSearchParams): Promise<{
    projectName: string;
    totalDocsScanned: number;
    totalViolations: number;
    violations: DocViolationJson[];
    byProject: Array<{ projectName: string; projectDewey: number; count: number }>;
    byCode: Array<{ code: DocViolationCode; count: number }>;
}> {
    const requestedProject = (params.get('projectName') || '').trim();
    const cards = (await buildCatalog()) ?? [];
    const docs = requestedProject ? cards.filter((c) => c.projectName === requestedProject) : cards;

    const reg = loadRegistry();
    const deweyMap = new Map<string, number>();
    if (reg) {
        deweyMap.set('global', 0);
        reg.projects.forEach((p, i) => { deweyMap.set(p.name, (i + 1) * 100); });
    }

    const violations: DocViolationJson[] = [];
    const identityBuckets = new Map<string, Array<{ projectName: string; projectDewey: number; filePath: string }>>();
    const allowedStatus = new Set(['active', 'draft', 'archived']);

    for (const d of docs) {
        const projectDewey = deweyMap.get(d.projectName) ?? Number(String(d.dewey || '').split('.')[0] || '999');
        const expectedPrefix = String(projectDewey).padStart(3, '0');
        let content = '';
        try {
            content = fs.readFileSync(d.filePath, 'utf8');
        } catch {
            continue;
        }

        const fm = parseFrontmatter(content);
        if (!fm) {
            violations.push({
                projectName: d.projectName,
                projectDewey,
                filePath: d.filePath,
                code: 'missing-frontmatter',
                message: 'Missing YAML front-matter block',
            });
            continue;
        }

        const subject = (fm.subject ?? '').trim();
        const id = (fm.id ?? '').trim();
        const title = (fm.title ?? '').trim();
        const project = (fm.project ?? '').trim();
        const description = (fm.description ?? '').trim();
        const status = (fm.status ?? '').trim().toLowerCase();

        if (!subject) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-subject', message: 'Missing required front-matter field: subject' });
        } else if (!/^\d{3}\.\d+$/.test(subject)) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'invalid-subject-format', message: 'subject must match pattern ###.# (for example 200.1)' });
        } else if (!subject.startsWith(`${expectedPrefix}.`)) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'subject-project-mismatch', message: `subject prefix must match project Dewey ${expectedPrefix}` });
        }

        if (!id) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-id', message: 'Missing required front-matter field: id' });
        } else if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,24}$/.test(id) || id.length < 3 || id.length > 50) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'invalid-id-format', message: 'id must be lowercase-kebab-case, 3-50 chars' });
        }

        if (!title) { violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-title', message: 'Missing required front-matter field: title' }); }
        if (!project) { violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-project', message: 'Missing required front-matter field: project' }); }
        if (!description) { violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-description', message: 'Missing required front-matter field: description' }); }
        if (!status) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'missing-status', message: 'Missing required front-matter field: status' });
        } else if (!allowedStatus.has(status)) {
            violations.push({ projectName: d.projectName, projectDewey, filePath: d.filePath, code: 'invalid-status', message: 'status must be one of: active, draft, archived' });
        }

        if (subject && id) {
            const identity = `${subject}.${id}`.toLowerCase();
            const bucket = identityBuckets.get(identity);
            if (bucket) {
                bucket.push({ projectName: d.projectName, projectDewey, filePath: d.filePath });
            } else {
                identityBuckets.set(identity, [{ projectName: d.projectName, projectDewey, filePath: d.filePath }]);
            }
        }
    }

    for (const [identity, bucket] of identityBuckets) {
        if (bucket.length < 2) { continue; }
        for (const row of bucket) {
            violations.push({
                projectName: row.projectName,
                projectDewey: row.projectDewey,
                filePath: row.filePath,
                identity,
                code: 'identity-collision',
                message: `Identity collision: ${identity} appears in ${bucket.length} docs`,
            });
        }
    }

    const byProjectMap = new Map<string, { projectName: string; projectDewey: number; count: number }>();
    for (const v of violations) {
        const key = `${v.projectName}:${v.projectDewey}`;
        const row = byProjectMap.get(key);
        if (row) { row.count += 1; }
        else { byProjectMap.set(key, { projectName: v.projectName, projectDewey: v.projectDewey, count: 1 }); }
    }

    const byCodeMap = new Map<DocViolationCode, number>();
    for (const v of violations) {
        byCodeMap.set(v.code, (byCodeMap.get(v.code) ?? 0) + 1);
    }

    return {
        projectName: requestedProject || '(all)',
        totalDocsScanned: docs.length,
        totalViolations: violations.length,
        violations,
        byProject: [...byProjectMap.values()].sort((a, b) => b.count - a.count),
        byCode: [...byCodeMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    };
}

async function handleValidateDoc(params: URLSearchParams): Promise<ValidateDocJson> {
    const rawFilePath = (params.get('filePath') || '').trim();
    if (!rawFilePath) {
        throw new Error('Missing required query param: filePath');
    }

    const resolved = path.resolve(rawFilePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${resolved}`);
    }
    if (!/\.md$/i.test(resolved)) {
        throw new Error(`validate_doc only supports .md files: ${resolved}`);
    }

    const reg = loadRegistry();
    const deweyMap = new Map<string, number>();
    if (reg) {
        deweyMap.set('global', 0);
        reg.projects.forEach((p, i) => { deweyMap.set(p.name, (i + 1) * 100); });
    }

    const roots: Array<{ projectName: string; rootPath: string; projectDewey: number }> = [];
    if (reg) {
        roots.push({ projectName: 'global', rootPath: path.resolve(reg.globalDocsPath), projectDewey: 0 });
        reg.projects.forEach((p) => {
            roots.push({
                projectName: p.name,
                rootPath: path.resolve(p.path),
                projectDewey: deweyMap.get(p.name) ?? 999,
            });
        });
    }

    const lower = resolved.toLowerCase();
    const owner = roots.find((r) => lower.startsWith(r.rootPath.toLowerCase()));
    const projectName = owner?.projectName ?? 'unknown';
    const projectDewey = owner?.projectDewey ?? 999;
    const expectedPrefix = String(projectDewey).padStart(3, '0');

    const content = fs.readFileSync(resolved, 'utf8');
    const fm = parseFrontmatter(content);
    const violations: DocViolationJson[] = [];
    const allowedStatus = new Set(['active', 'draft', 'archived']);
    let identity: string | undefined;

    if (!fm) {
        violations.push({
            projectName,
            projectDewey,
            filePath: resolved,
            code: 'missing-frontmatter',
            message: 'Missing YAML front-matter block',
        });
        return {
            ok: false,
            filePath: resolved,
            projectName,
            projectDewey,
            expectedSubjectPrefix: expectedPrefix,
            violations,
        };
    }

    const subject = (fm.subject ?? '').trim();
    const id = (fm.id ?? '').trim();
    const title = (fm.title ?? '').trim();
    const project = (fm.project ?? '').trim();
    const description = (fm.description ?? '').trim();
    const status = (fm.status ?? '').trim().toLowerCase();

    if (!subject) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-subject', message: 'Missing required front-matter field: subject' });
    } else if (!/^\d{3}\.\d+$/.test(subject)) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'invalid-subject-format', message: 'subject must match pattern ###.# (for example 200.1)' });
    } else if (projectName !== 'unknown' && !subject.startsWith(`${expectedPrefix}.`)) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'subject-project-mismatch', message: `subject prefix must match project Dewey ${expectedPrefix}` });
    }

    if (!id) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-id', message: 'Missing required front-matter field: id' });
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+){0,24}$/.test(id) || id.length < 3 || id.length > 50) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'invalid-id-format', message: 'id must be lowercase-kebab-case, 3-50 chars' });
    }

    if (!title) { violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-title', message: 'Missing required front-matter field: title' }); }
    if (!project) { violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-project', message: 'Missing required front-matter field: project' }); }
    if (!description) { violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-description', message: 'Missing required front-matter field: description' }); }
    if (!status) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'missing-status', message: 'Missing required front-matter field: status' });
    } else if (!allowedStatus.has(status)) {
        violations.push({ projectName, projectDewey, filePath: resolved, code: 'invalid-status', message: 'status must be one of: active, draft, archived' });
    }

    if (subject && id) {
        identity = `${subject}.${id}`.toLowerCase();
        const cards = (await buildCatalog()) ?? [];
        let seen = 0;
        for (const card of cards) {
            try {
                const docFm = parseFrontmatter(fs.readFileSync(card.filePath, 'utf8'));
                if (!docFm) { continue; }
                const docSubject = (docFm.subject ?? '').trim().toLowerCase();
                const docId = (docFm.id ?? '').trim().toLowerCase();
                if (docSubject && docId && `${docSubject}.${docId}` === identity) {
                    seen += 1;
                }
            } catch {
                // ignore unreadable docs
            }
        }
        if (seen > 1) {
            violations.push({
                projectName,
                projectDewey,
                filePath: resolved,
                identity,
                code: 'identity-collision',
                message: `Identity collision: ${identity} appears in ${seen} docs`,
            });
        }
    }

    return {
        ok: violations.length === 0,
        filePath: resolved,
        projectName,
        projectDewey,
        expectedSubjectPrefix: expectedPrefix,
        identity,
        violations,
    };
}

function normalizeDewey(input: string): { raw: string; digits: string } {
    const raw = input.trim().toLowerCase();
    const digits = raw.replace(/\D+/g, '');
    return { raw, digits };
}

function scoreDewey(candidate: string, query: string): number {
    const c = normalizeDewey(candidate);
    const q = normalizeDewey(query);
    if (!q.raw) {
        return 0;
    }
    if (c.raw === q.raw || (q.digits && c.digits === q.digits)) {
        return 300;
    }
    if (c.raw.startsWith(q.raw) || (q.digits && c.digits.startsWith(q.digits))) {
        return 200;
    }
    if (c.raw.includes(q.raw) || (q.digits && c.digits.includes(q.digits))) {
        return 100;
    }
    return 0;
}

async function handleLookupDewey(params: URLSearchParams): Promise<{
    query: string;
    normalized: { raw: string; digits: string };
    projectName: string;
    includeCommands: boolean;
    docMatchCount: number;
    commandMatchCount: number;
    docs: DocJson[];
    commands: ReturnType<typeof loadCvtCommands>;
}> {
    const query = (params.get('query') || '').trim();
    const projectName = (params.get('projectName') || '').trim();
    const includeCommands = params.get('includeCommands') !== 'false';
    const limit = Number(params.get('limit') || '25');
    const max = Number.isFinite(limit) && limit > 0 ? limit : 25;

    const cards = (await buildCatalog()) ?? [];
    const docsSource = projectName ? cards.filter((c) => c.projectName === projectName) : cards;
    const docs = docsSource
        .map((c) => ({ c, score: scoreDewey(c.dewey || '', query) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return (a.c.dewey || '').localeCompare(b.c.dewey || '');
        })
        .slice(0, max)
        .map((row) => cardToDocJson(row.c));

    const commands = includeCommands
        ? loadCvtCommands()
            .map((cmd) => ({ cmd, score: scoreDewey(cmd.dewey || '', query) }))
            .filter((row) => row.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return (a.cmd.dewey || '').localeCompare(b.cmd.dewey || '');
            })
            .slice(0, max)
            .map((row) => row.cmd)
        : [];

    return {
        query,
        normalized: normalizeDewey(query),
        projectName: projectName || '(all)',
        includeCommands,
        docMatchCount: docs.length,
        commandMatchCount: commands.length,
        docs,
        commands,
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

/* ── normalize_doc, get_doc_by_identity, list_old_dewey ─────────────────── */

interface NormalizeDocJson {
    filePath: string;
    projectName: string;
    projectDewey: number;
    hasFrontmatter: boolean;
    missingFields: string[];
    suggestedFrontmatter: string;
}

async function handleNormalizeDoc(params: URLSearchParams): Promise<NormalizeDocJson> {
    const rawFilePath = (params.get('filePath') || '').trim();
    if (!rawFilePath) { throw new Error('Missing required query param: filePath'); }
    const resolved = path.resolve(rawFilePath);
    if (!fs.existsSync(resolved)) { throw new Error(`File not found: ${resolved}`); }
    if (!/\.md$/i.test(resolved)) { throw new Error(`normalize_doc only supports .md files: ${resolved}`); }

    const reg = loadRegistry();
    const roots: Array<{ projectName: string; rootPath: string; projectDewey: number }> = [];
    if (reg) {
        roots.push({ projectName: 'global', rootPath: path.resolve(reg.globalDocsPath), projectDewey: 0 });
        reg.projects.forEach((p, i) => {
            roots.push({ projectName: p.name, rootPath: path.resolve(p.path), projectDewey: (i + 1) * 100 });
        });
    }
    const lower = resolved.toLowerCase();
    const owner = roots.find(r => lower.startsWith(r.rootPath.toLowerCase()));
    const projectName = owner?.projectName ?? 'unknown';
    const projectDewey = owner?.projectDewey ?? 999;
    const prefix = String(projectDewey).padStart(3, '0');

    const content = fs.readFileSync(resolved, 'utf8');
    const fm = parseFrontmatter(content);
    const hasFrontmatter = fm !== null;

    const subject     = (fm?.subject     ?? '').trim();
    const id          = (fm?.id          ?? '').trim();
    const title       = (fm?.title       ?? '').trim();
    const project     = (fm?.project     ?? '').trim();
    const description = (fm?.description ?? '').trim();
    const status      = (fm?.status      ?? '').trim();

    const missingFields: string[] = [];
    if (!subject)     { missingFields.push('subject'); }
    if (!id)          { missingFields.push('id'); }
    if (!title)       { missingFields.push('title'); }
    if (!project)     { missingFields.push('project'); }
    if (!description) { missingFields.push('description'); }
    if (!status)      { missingFields.push('status'); }

    const baseName        = path.basename(resolved, '.md');
    const mergedSubject   = subject     || `${prefix}.9`;
    const mergedId        = id          || baseName.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50);
    const mergedTitle     = title       || baseName.replace(/[-_]/g, ' ');
    const mergedProject   = project     || (projectName !== 'unknown' ? projectName : '');
    const mergedDesc      = description || '';
    const mergedStatus    = status      || 'draft';

    const fmLines = [
        '---',
        `subject: ${mergedSubject}`,
        `id: ${mergedId}`,
        `title: ${mergedTitle}`,
        mergedProject ? `project: ${mergedProject}` : null,
        mergedDesc    ? `description: ${mergedDesc.slice(0, 200)}` : null,
        `status: ${mergedStatus}`,
        '---',
    ].filter((l): l is string => l !== null);

    return { filePath: resolved, projectName, projectDewey, hasFrontmatter, missingFields, suggestedFrontmatter: fmLines.join('\n') };
}

interface DocIdentityJson {
    found: boolean;
    identity: string;
    filePath?: string;
    projectName?: string;
    projectDewey?: number;
    title?: string;
    description?: string;
    status?: string;
}

async function handleGetDocByIdentity(params: URLSearchParams): Promise<DocIdentityJson> {
    const identity = (params.get('identity') || '').trim().toLowerCase();
    if (!identity) { return { found: false, identity }; }

    const reg   = loadRegistry();
    const cards = (await buildCatalog()) ?? [];
    const deweyMap = new Map<string, number>();
    if (reg) { reg.projects.forEach((p, i) => { deweyMap.set(p.name, (i + 1) * 100); }); }

    for (const d of cards) {
        let content = '';
        try { content = fs.readFileSync(d.filePath, 'utf8'); } catch { continue; }
        const fm = parseFrontmatter(content);
        if (!fm) { continue; }
        const subject = (fm.subject ?? '').trim().toLowerCase();
        const docId   = (fm.id      ?? '').trim().toLowerCase();
        if (!subject || !docId) { continue; }
        if (`${subject}.${docId}` === identity) {
            const projectDewey = deweyMap.get(d.projectName) ?? 999;
            return {
                found: true, identity,
                filePath:    d.filePath,
                projectName: d.projectName,
                projectDewey,
                title:       (fm.title       ?? d.title       ?? '').trim(),
                description: (fm.description ?? d.description ?? '').trim(),
                status:      (fm.status      ?? 'active').trim(),
            };
        }
    }
    return { found: false, identity };
}

interface OldDeweyEntryJson { filePath: string; projectName: string; title: string; oldDewey: string; source: string; }

async function handleListOldDewey(params: URLSearchParams): Promise<{ projectName: string; totalFound: number; docs: OldDeweyEntryJson[] }> {
    const requestedProject = (params.get('projectName') || '').trim();
    const cards = (await buildCatalog()) ?? [];
    const docs  = requestedProject ? cards.filter(c => c.projectName === requestedProject) : cards;
    const OLD_DEWEY_RE = /^(\d{3,}\.\d{3})\.md$/i;
    const results: OldDeweyEntryJson[] = [];

    for (const d of docs) {
        const fnMatch = path.basename(d.filePath).match(OLD_DEWEY_RE);
        if (fnMatch) {
            results.push({ filePath: d.filePath, projectName: d.projectName, title: d.title, oldDewey: fnMatch[1], source: 'filename' });
            continue;
        }
        let content = '';
        try { content = fs.readFileSync(d.filePath, 'utf8'); } catch { continue; }
        const fm = parseFrontmatter(content);
        if (!fm) { continue; }
        const category = (fm.category ?? '').trim();
        if (category && /^\d{3,}\.\d{3}$/.test(category)) {
            results.push({ filePath: d.filePath, projectName: d.projectName, title: d.title, oldDewey: category, source: 'frontmatter-category' });
            continue;
        }
        const deweyField = (fm.dewey ?? '').trim();
        if (deweyField && /^\d{3,}\.\d{3}$/.test(deweyField)) {
            results.push({ filePath: d.filePath, projectName: d.projectName, title: d.title, oldDewey: deweyField, source: 'frontmatter-dewey' });
        }
    }
    return { projectName: requestedProject || '(all)', totalFound: results.length, docs: results };
}

function handleGetActiveMarkdown(): { filePath: string; hasActiveMarkdown: boolean } {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { filePath: '', hasActiveMarkdown: false };
    }

    const uri = editor.document.uri;
    const fsPath = uri.scheme === 'file' ? uri.fsPath : '';
    if (!fsPath || !/\.md$/i.test(fsPath)) {
        return { filePath: '', hasActiveMarkdown: false };
    }

    return { filePath: fsPath, hasActiveMarkdown: true };
}

async function handleListMarkdownPaths(params: URLSearchParams): Promise<{
    count: number;
    paths: Array<{ projectName: string; fileName: string; filePath: string; lastModified: string }>;
}> {
    const limitRaw = Number(params.get('limit') || '250');
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 250;
    const cards = (await buildCatalog()) ?? [];
    const rows = cards
        .slice()
        .sort((a, b) => {
            const ta = Date.parse(a.lastModified || '') || 0;
            const tb = Date.parse(b.lastModified || '') || 0;
            return tb - ta;
        })
        .slice(0, limit)
        .map((c) => ({
            projectName: c.projectName,
            fileName: c.fileName,
            filePath: c.filePath,
            lastModified: c.lastModified,
        }));

    return { count: rows.length, paths: rows };
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

function escHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildMarkdownPreviewHtml(filePath: string, markdown: string, backUrl?: string): string {
    const safePath = escHtml(filePath);
    const safeBack = escHtml(backUrl || '');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${safePath}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1e1e1e;color:#d4d4d4}
header{position:sticky;top:0;background:#252526;border-bottom:1px solid #404040;padding:10px 16px;font-size:12px;color:#9cdcfe;font-family:Consolas,monospace;display:flex;align-items:center;gap:10px}
.btn-back{background:#2d2d2d;color:#9cdcfe;border:1px solid #404040;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px;font-family:inherit}
.btn-back:hover{border-color:#0078d4;color:#fff}
.path-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
main{max-width:980px;margin:0 auto;padding:18px 20px 40px;line-height:1.65}
h1,h2,h3,h4{color:#fff;margin-top:1.4em}
a{color:#FFD700}
code{background:#2d2d2d;border-radius:4px;padding:1px 4px}
pre{background:#111;border:1px solid #2d2d2d;border-radius:6px;padding:12px;overflow:auto}
blockquote{border-left:3px solid #0078d4;padding-left:10px;color:#9e9e9e}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #2d2d2d;padding:6px 8px}
</style></head>
<body>
<header><button id="btn-back" class="btn-back" title="Back to MCP Endpoint Viewer">&larr; Back</button><span class="path-label">${safePath}</span></header>
<main id="content"></main>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
const raw = ${JSON.stringify(markdown)};
const backUrl = ${JSON.stringify(safeBack)};
const content = document.getElementById('content');
content.innerHTML = marked.parse(raw);
document.getElementById('btn-back').addEventListener('click', function(){
    if (backUrl) {
        window.location.href = backUrl;
        return;
    }
    if (window.history.length > 1) {
        window.history.back();
        return;
    }
    window.location.href = '/';
});
</script>
</body></html>`;
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

    if (p === '/api/list_doc_violations') {
        jsonResponse(res, 200, await handleListDocViolations(url.searchParams));
        return;
    }

    if (p === '/api/validate_doc') {
        try {
            jsonResponse(res, 200, await handleValidateDoc(url.searchParams));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            jsonResponse(res, 400, { error: message });
        }
        return;
    }

    if (p === '/api/normalize_doc') {
        try {
            jsonResponse(res, 200, await handleNormalizeDoc(url.searchParams));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            jsonResponse(res, 400, { error: message });
        }
        return;
    }

    if (p === '/api/get_doc_by_identity') {
        jsonResponse(res, 200, await handleGetDocByIdentity(url.searchParams));
        return;
    }

    if (p === '/api/list_old_dewey') {
        jsonResponse(res, 200, await handleListOldDewey(url.searchParams));
        return;
    }

    if (p === '/api/active_markdown') {
        jsonResponse(res, 200, handleGetActiveMarkdown());
        return;
    }

    if (p === '/api/list_markdown_paths') {
        jsonResponse(res, 200, await handleListMarkdownPaths(url.searchParams));
        return;
    }

    if (p === '/md-preview') {
        const filePath = url.searchParams.get('path') || '';
        const backUrl = url.searchParams.get('back') || '';
        if (!filePath || !filePath.toLowerCase().endsWith('.md') || !fs.existsSync(filePath)) {
            htmlResponse(res, 404, '<h1>Markdown file not found</h1>');
            return;
        }
        try {
            const md = fs.readFileSync(filePath, 'utf8');
            htmlResponse(res, 200, buildMarkdownPreviewHtml(filePath, md, backUrl));
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

    if (p === '/api/lookup_dewey') {
        jsonResponse(res, 200, await handleLookupDewey(url.searchParams));
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
