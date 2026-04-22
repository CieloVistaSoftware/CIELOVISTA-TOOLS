// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * symbol-index.ts (mcp-viewer)
 *
 * CommonJS/extension-side port of mcp-server/src/symbol-index.ts.
 * Kept in sync by hand — the two modules have the same logic and types
 * because they run in different Node module systems (the extension is
 * compiled as CommonJS, the MCP server as ESM NodeNext).
 *
 * If this file and mcp-server/src/symbol-index.ts diverge, the MCP server
 * is the source of truth. Port changes from there into here, then rebuild.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadRegistry } from '../../shared/registry';
import type { ProjectEntry } from '../../shared/registry';

export type SymbolKind =
    | 'function' | 'class' | 'interface' | 'type'
    | 'const' | 'let' | 'var' | 'enum' | 'namespace' | 'export';

export type SymbolRole = 'src' | 'script' | 'test' | 'declaration';

export interface SymbolEntry {
    name: string;
    kind: SymbolKind;
    signature: string;
    docComment: string;
    sourceFile: string;
    projectName: string;
    role: SymbolRole;
    exported: boolean;
    line: number;
    modulePath: string;
}

const SCAN_FOLDERS: Array<{ name: string; role: SymbolRole; exts: readonly string[] }> = [
    { name: 'src',     role: 'src',         exts: ['.ts', '.js'] },
    { name: 'scripts', role: 'script',      exts: ['.js', '.ts'] },
    { name: 'tests',   role: 'test',        exts: ['.js', '.ts'] },
    { name: 'out',     role: 'declaration', exts: ['.d.ts'] },
];

const SKIP_DIR_NAMES = new Set<string>([
    'node_modules', '.git', '.vscode', '.vscode-test', 'dist',
    'reports', 'playwright-report', 'test-results', 'coverage', '.next', '.cache',
]);

const MAX_DEPTH = 6;

function extractLeadingJsDoc(lines: string[], lineIdx: number): string {
    let i = lineIdx - 1;
    while (i >= 0 && lines[i].trim() === '') { i--; }
    if (i < 0) { return ''; }
    if (!lines[i].trim().endsWith('*/')) { return ''; }
    const end = i;
    while (i >= 0 && !lines[i].includes('/**')) { i--; }
    if (i < 0) { return ''; }
    return lines.slice(i, end + 1).join('\n');
}

function parseDts(filePath: string, content: string): Array<Omit<SymbolEntry, 'projectName' | 'role' | 'modulePath'>> {
    const lines = content.split(/\r?\n/);
    const out: Array<Omit<SymbolEntry, 'projectName' | 'role' | 'modulePath'>> = [];
    const re = /^export\s+(?:declare\s+)?(function|class|interface|type|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re);
        if (!m) { continue; }
        out.push({
            name: m[2],
            kind: m[1] as SymbolKind,
            signature: lines[i].trim(),
            docComment: extractLeadingJsDoc(lines, i),
            sourceFile: filePath,
            exported: true,
            line: i + 1,
        });
    }
    return out;
}

function parseHandWritten(filePath: string, content: string): Array<Omit<SymbolEntry, 'projectName' | 'role' | 'modulePath'>> {
    const lines = content.split(/\r?\n/);
    const out: Array<Omit<SymbolEntry, 'projectName' | 'role' | 'modulePath'>> = [];
    const seen = new Set<string>();

    const push = (e: Omit<SymbolEntry, 'projectName' | 'role' | 'modulePath'>): void => {
        const key = `${e.name}:${e.line}`;
        if (seen.has(key)) { return; }
        seen.add(key);
        out.push(e);
    };

    const reFunc       = /^(export\s+(?:default\s+)?)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/;
    const reClass      = /^(export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/;
    const reConst      = /^(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?\s*=/;
    const reInterface  = /^(export\s+)?interface\s+([A-Za-z_$][\w$]*)/;
    const reType       = /^(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/;
    const reEnum       = /^(export\s+)?enum\s+([A-Za-z_$][\w$]*)/;
    const reCjsNamed   = /^module\.exports\.([A-Za-z_$][\w$]*)\s*=/;
    const reCjsObject  = /^module\.exports\s*=\s*\{/;
    const reCjsObjKey  = /^\s*([A-Za-z_$][\w$]*)\s*[:,]/;

    let inCjs = false;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        if (inCjs) {
            if (raw.includes('}')) { inCjs = false; }
            const km = raw.match(reCjsObjKey);
            if (km) {
                push({ name: km[1], kind: 'export', signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: true, line: i + 1 });
            }
            continue;
        }
        if (reCjsObject.test(raw)) {
            inCjs = true;
            if (raw.includes('}')) { inCjs = false; }
            continue;
        }

        let m: RegExpMatchArray | null;
        if ((m = raw.match(reFunc)))      { push({ name: m[3], kind: 'function',  signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reClass)))     { push({ name: m[2], kind: 'class',     signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reInterface))) { push({ name: m[2], kind: 'interface', signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reType)))      { push({ name: m[2], kind: 'type',      signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reEnum)))      { push({ name: m[2], kind: 'enum',      signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reConst)))     { push({ name: m[3], kind: m[2] as SymbolKind, signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: Boolean(m[1]), line: i + 1 }); continue; }
        if ((m = raw.match(reCjsNamed)))  { push({ name: m[1], kind: 'export',    signature: raw.trim(), docComment: extractLeadingJsDoc(lines, i), sourceFile: filePath, exported: true, line: i + 1 }); continue; }
    }
    return out;
}

function walkFolder(root: string, exts: readonly string[], depth: number, acc: string[]): void {
    if (depth > MAX_DEPTH) { return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
        if (SKIP_DIR_NAMES.has(entry.name)) { continue; }
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            walkFolder(full, exts, depth + 1, acc);
        } else if (entry.isFile()) {
            if (exts.includes('.d.ts') && entry.name.endsWith('.d.ts')) { acc.push(full); }
            else if (exts.includes('.ts') && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) { acc.push(full); }
            else if (exts.includes('.js') && entry.name.endsWith('.js') && !entry.name.endsWith('.js.map')) { acc.push(full); }
        }
    }
}

function toModulePath(projectRoot: string, filePath: string): string {
    const rel = path.relative(projectRoot, filePath);
    return rel.replace(/\.d\.ts$/, '').replace(/\.ts$/, '').replace(/\.js$/, '').split(path.sep).join('/');
}

function scanProject(project: ProjectEntry): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    if (!fs.existsSync(project.path)) { return symbols; }
    for (const folder of SCAN_FOLDERS) {
        const folderRoot = path.join(project.path, folder.name);
        if (!fs.existsSync(folderRoot)) { continue; }
        const files: string[] = [];
        walkFolder(folderRoot, folder.exts, 0, files);
        for (const file of files) {
            let content: string;
            try { content = fs.readFileSync(file, 'utf8'); }
            catch { continue; }
            const parsed = file.endsWith('.d.ts') ? parseDts(file, content) : parseHandWritten(file, content);
            for (const raw of parsed) {
                symbols.push({ ...raw, projectName: project.name, role: folder.role, modulePath: toModulePath(project.path, file) });
            }
        }
    }
    return symbols;
}

interface IndexCache {
    builtAt: number;
    symbols: SymbolEntry[];
    folderMtimes: Record<string, number>;
}

let _cache: IndexCache | undefined;

function currentFolderMtimes(): Record<string, number> {
    const reg = loadRegistry();
    if (!reg) { return {}; }
    const map: Record<string, number> = {};
    for (const p of reg.projects) {
        for (const folder of SCAN_FOLDERS) {
            const full = path.join(p.path, folder.name);
            try { map[full] = fs.statSync(full).mtimeMs; } catch { /* skip */ }
        }
    }
    return map;
}

function cacheIsFresh(): boolean {
    if (!_cache) { return false; }
    const now = currentFolderMtimes();
    const cached = _cache.folderMtimes;
    const cachedKeys = Object.keys(cached);
    const nowKeys = Object.keys(now);
    if (cachedKeys.length !== nowKeys.length) { return false; }
    for (const k of cachedKeys) { if (now[k] !== cached[k]) { return false; } }
    return true;
}

export function getSymbolIndex(): SymbolEntry[] {
    if (cacheIsFresh()) { return _cache!.symbols; }
    const reg = loadRegistry();
    const symbols: SymbolEntry[] = [];
    if (reg) {
        for (const p of reg.projects) { symbols.push(...scanProject(p)); }
    }
    _cache = { builtAt: Date.now(), symbols, folderMtimes: currentFolderMtimes() };
    return symbols;
}

export function invalidateSymbolIndex(): void { _cache = undefined; }

export interface SymbolFilter {
    query?: string;
    kind?: SymbolKind;
    projectName?: string;
    role?: SymbolRole;
    exportedOnly?: boolean;
    limit?: number;
}

export function filterSymbols(all: SymbolEntry[], f: SymbolFilter): SymbolEntry[] {
    const q = (f.query ?? '').toLowerCase();
    const out: SymbolEntry[] = [];
    for (const s of all) {
        if (f.kind && s.kind !== f.kind) { continue; }
        if (f.projectName && s.projectName !== f.projectName) { continue; }
        if (f.role && s.role !== f.role) { continue; }
        if (f.exportedOnly && !s.exported) { continue; }
        if (q) {
            const hay = `${s.name} ${s.signature} ${s.docComment}`.toLowerCase();
            if (!hay.includes(q)) { continue; }
        }
        out.push(s);
        if (f.limit && out.length >= f.limit) { break; }
    }
    return out;
}

export function findSymbolByName(all: SymbolEntry[], name: string, limit = 10): SymbolEntry[] {
    const target = name.toLowerCase();
    const exact: SymbolEntry[] = [];
    const prefix: SymbolEntry[] = [];
    for (const s of all) {
        const n = s.name.toLowerCase();
        if (n === target) { exact.push(s); }
        else if (n.startsWith(target)) { prefix.push(s); }
    }
    return [...exact, ...prefix].slice(0, limit);
}

export interface CvtCommandEntry {
    id: string;
    title: string;
    description: string;
    tags: string[];
    group: string;
    dewey: string;
    scope: string;
    action?: string;
    location?: string;
}

export function loadCvtCommands(): CvtCommandEntry[] {
    const reg = loadRegistry();
    if (!reg) { return []; }
    const cvt = reg.projects.find(p => p.name === 'cielovista-tools');
    if (!cvt) { return []; }
    const catalogPath = path.join(cvt.path, 'src', 'features', 'cvs-command-launcher', 'catalog.ts');
    if (!fs.existsSync(catalogPath)) { return []; }
    const content = fs.readFileSync(catalogPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const out: CvtCommandEntry[] = [];
    for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('{ id:') && !t.startsWith('{id:')) { continue; }
        const entry = parseCatalogLine(t);
        if (entry) { out.push(entry); }
    }
    return out;
}

function parseCatalogLine(line: string): CvtCommandEntry | undefined {
    const body = line.replace(/^\{/, '').replace(/\},?\s*$/, '');
    const pick = (key: string): string | undefined => {
        const m = body.match(new RegExp(`${key}\\s*:\\s*'([^']*)'`));
        return m ? m[1] : undefined;
    };
    const pickArray = (key: string): string[] => {
        const m = body.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
        if (!m) { return []; }
        const parts = m[1].match(/'([^']*)'/g) ?? [];
        return parts.map(p => p.slice(1, -1));
    };
    const id = pick('id');
    if (!id) { return undefined; }
    return {
        id,
        title: pick('title') ?? '',
        description: pick('description') ?? '',
        tags: pickArray('tags'),
        group: pick('group') ?? '',
        dewey: pick('dewey') ?? '',
        scope: pick('scope') ?? '',
        action: pick('action'),
        location: pick('location'),
    };
}
