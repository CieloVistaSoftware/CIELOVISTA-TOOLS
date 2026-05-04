// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * js-error-audit.ts
 *
 * JS Error Handling Audit — DiskCleanUp
 *
 * Workflow per finding:
 *   1. Each violation/warning gets a unique persistent ID (ERR-001, WRN-001 …)
 *   2. Per-row: "🤖 AI Fix" → Claude generates the corrected file
 *   3. Diff overlay shows exactly what changed, line by line
 *   4. User accepts or rejects — no changes written without explicit approval
 *   5. After accept → file written → audit re-runs automatically
 *
 * Fix kinds:
 *   NO_TRY_CATCH  — wrap async/IO functions in try/catch with ErrLog
 *   BARE_CATCH    — fill empty catch{} blocks with ErrLog.log call
 *   NO_ERRLOG     — add ErrLog.log to existing catch blocks
 *   EXCLUDE       — pure data/config module, remove from audit rule
 *
 * State stored in:  <project>/data/js-error-audit-state.json
 * Command:          cvs.audit.jsErrors
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { execSync } from 'child_process';
import { log, logError } from '../shared/output-channel';
import { loadRegistry }  from '../shared/registry';
import { callClaude }    from '../shared/anthropic-client';

const FEATURE = 'js-error-audit';

// ─── Types ────────────────────────────────────────────────────────────────────

type FixKind = 'NO_TRY_CATCH' | 'BARE_CATCH' | 'NO_ERRLOG' | 'EXCLUDE';
type EntryStatus = 'open' | 'accepted' | 'rejected' | 'excluded' | 'skipped';

interface AuditViolation {
    file:           string;
    tryCatchCount:  number;
    hasErrLog:      boolean;
    severity:       'ERROR' | 'WARN';
    issue?:         string;
    issues?:        string[];
    note?:          string;
}

interface AuditReport {
    violations: AuditViolation[];
    warnings:   AuditViolation[];
    clean:      AuditViolation[];
    scannedAt:  string;
}

interface ErrorEntry {
    id:       string;          // ERR-001, WRN-001 …
    file:     string;          // relative path from project root
    severity: 'ERROR' | 'WARN';
    fixKind:  FixKind;
    issues:   string[];
    status:   EntryStatus;
    fixedAt?: string;
}

interface AuditState {
    entries: ErrorEntry[];
    lastSeen: string;
}

// ─── Project root ─────────────────────────────────────────────────────────────

function findDiskCleanUpRoot(): string | undefined {
    const registry = loadRegistry();
    if (registry) {
        const entry = registry.projects.find(p =>
            p.name.toLowerCase().includes('diskcleanup') ||
            p.name.toLowerCase().includes('disk-cleanup')
        );
        if (entry && fs.existsSync(entry.path)) { return entry.path; }
    }
    const fallback = 'C:\\Users\\jwpmi\\source\\repos\\DiskCleanUp';
    if (fs.existsSync(fallback)) { return fallback; }
    return undefined;
}

function findAuditJson(root: string):  string { return path.join(root, 'data', 'js-error-audit.json'); }
function findStateJson(root: string):  string { return path.join(root, 'data', 'js-error-audit-state.json'); }
function findAuditScript(root: string): string { return path.join(root, 'scripts', 'js-error-audit.js'); }

// ─── State management ─────────────────────────────────────────────────────────

function loadState(root: string): AuditState {
    const p = findStateJson(root);
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) as AuditState; }
    catch { return { entries: [], lastSeen: '' }; }
}

function saveState(root: string, state: AuditState): void {
    const dir = path.dirname(findStateJson(root));
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(findStateJson(root), JSON.stringify(state, null, 2), 'utf8');
}

/** Merge fresh audit results into persisted state, assigning IDs to new entries. */
function mergeState(root: string, report: AuditReport): AuditState {
    const state = loadState(root);
    const byFile = new Map<string, ErrorEntry>(state.entries.map(e => [e.file, e]));

    let errSeq  = state.entries.filter(e => e.severity === 'ERROR').length;
    let warnSeq = state.entries.filter(e => e.severity === 'WARN').length;

    const allFindings: Array<{ v: AuditViolation; severity: 'ERROR' | 'WARN' }> = [
        ...report.violations.map(v => ({ v, severity: 'ERROR' as const })),
        ...report.warnings  .map(v => ({ v, severity: 'WARN'  as const })),
    ];

    const nextEntries: ErrorEntry[] = [];

    for (const { v, severity } of allFindings) {
        const existing = byFile.get(v.file);
        if (existing) {
            // Update issues in case they changed but keep ID and status
            existing.issues  = v.issues ?? (v.issue ? [v.issue] : []);
            existing.fixKind = classifyFixKind(v);
            nextEntries.push(existing);
        } else {
            // New finding — assign next ID
            const seq    = severity === 'ERROR' ? ++errSeq : ++warnSeq;
            const prefix = severity === 'ERROR' ? 'ERR' : 'WRN';
            const id     = `${prefix}-${String(seq).padStart(3, '0')}`;
            nextEntries.push({
                id,
                file:     v.file,
                severity,
                fixKind:  classifyFixKind(v),
                issues:   v.issues ?? (v.issue ? [v.issue] : []),
                status:   'open',
            });
        }
    }

    const newState: AuditState = { entries: nextEntries, lastSeen: new Date().toISOString() };
    saveState(root, newState);
    return newState;
}

function updateEntryStatus(root: string, id: string, status: EntryStatus): void {
    const state = loadState(root);
    const entry = state.entries.find(e => e.id === id);
    if (!entry) { return; }
    entry.status  = status;
    if (status === 'accepted') { entry.fixedAt = new Date().toISOString(); }
    saveState(root, state);
}

// ─── Fix kind classification ───────────────────────────────────────────────────

function classifyFixKind(v: AuditViolation): FixKind {
    const issues = v.issues ?? (v.issue ? [v.issue] : []);
    if (issues.some(i => i.includes('bare catch'))) { return 'BARE_CATCH'; }
    if (issues.some(i => i.includes('ErrLog')))      { return 'NO_ERRLOG'; }
    return 'NO_TRY_CATCH'; // zero try/catch — needs wrapping
}

// ─── Line finder for warnings ─────────────────────────────────────────────────

function findIssueLine(absPath: string, fixKind: FixKind): number {
    if (!fs.existsSync(absPath)) { return 0; }
    try {
        const lines = fs.readFileSync(absPath, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (fixKind === 'BARE_CATCH' && /catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(lines[i])) { return i + 1; }
            if (fixKind === 'NO_ERRLOG'  && /\bcatch\s*[({]/.test(lines[i]))                    { return i + 1; }
        }
    } catch { /* ignore */ }
    return 0;
}

// ─── Diff generation ──────────────────────────────────────────────────────────

interface DiffLine {
    kind:    'add' | 'del' | 'eq';
    lineNo:  number | null;  // null for added lines (no original line)
    oLineNo: number | null;
    text:    string;
}

function buildDiff(original: string, fixed: string): DiffLine[] {
    const oLines = original.split('\n');
    const fLines = fixed.split('\n');

    // Simple patience-style diff using LCS on line content
    const lcs = computeLCS(oLines, fLines);
    const diff: DiffLine[] = [];

    let oi = 0, fi = 0, li = 0;
    while (oi < oLines.length || fi < fLines.length) {
        if (li < lcs.length) {
            const [lo, lf] = lcs[li];
            // Output deletions before this common line
            while (oi < lo) {
                diff.push({ kind: 'del', lineNo: oi + 1, oLineNo: oi + 1, text: oLines[oi] });
                oi++;
            }
            // Output additions before this common line
            while (fi < lf) {
                diff.push({ kind: 'add', lineNo: null, oLineNo: fi + 1, text: fLines[fi] });
                fi++;
            }
            // Common line
            diff.push({ kind: 'eq', lineNo: oi + 1, oLineNo: fi + 1, text: oLines[oi] });
            oi++; fi++; li++;
        } else {
            // No more common lines
            while (oi < oLines.length) {
                diff.push({ kind: 'del', lineNo: oi + 1, oLineNo: oi + 1, text: oLines[oi] });
                oi++;
            }
            while (fi < fLines.length) {
                diff.push({ kind: 'add', lineNo: null, oLineNo: fi + 1, text: fLines[fi] });
                fi++;
            }
        }
    }

    return diff;
}

/** O(n*m) LCS returning pairs of [originalIndex, fixedIndex] */
function computeLCS(a: string[], b: string[]): [number, number][] {
    const m = a.length, n = b.length;
    // Cap to avoid O(n²) on very large files
    if (m * n > 200_000) { return []; }

    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
        }
    }
    // Backtrack
    const result: [number, number][] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i-1] === b[j-1]) { result.unshift([i-1, j-1]); i--; j--; }
        else if (dp[i-1][j] > dp[i][j-1]) { i--; }
        else { j--; }
    }
    return result;
}

/** Collapse unchanged runs to show only context around changes (±3 lines) */
function collapseDiff(diff: DiffLine[], context = 3): DiffLine[] {
    const changed = new Set<number>();
    diff.forEach((d, i) => { if (d.kind !== 'eq') { changed.add(i); } });

    const keep = new Set<number>();
    for (const idx of changed) {
        for (let k = Math.max(0, idx - context); k <= Math.min(diff.length - 1, idx + context); k++) {
            keep.add(k);
        }
    }

    const collapsed: DiffLine[] = [];
    let lastKept = -1;
    for (let i = 0; i < diff.length; i++) {
        if (keep.has(i)) {
            if (lastKept >= 0 && i > lastKept + 1) {
                collapsed.push({ kind: 'eq', lineNo: null, oLineNo: null, text: `… ${i - lastKept - 1} unchanged lines …` });
            }
            collapsed.push(diff[i]);
            lastKept = i;
        }
    }
    return collapsed;
}

// ─── AI fix generation ────────────────────────────────────────────────────────

async function generateAiFix(absPath: string, entry: ErrorEntry): Promise<string> {
    const src = fs.readFileSync(absPath, 'utf8');
    const filename = path.basename(entry.file);
    const tag = filename.replace(/\.js$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '_');

    let instruction = '';

    switch (entry.fixKind) {
        case 'NO_TRY_CATCH':
            instruction = `\
Your task: Add proper error handling to this JavaScript file.

Rules — follow ALL of them:
1. ONLY wrap functions that do async work, I/O, network calls, DOM manipulation, or could throw
2. Do NOT wrap pure data functions, getters, array maps, object literals, or constant definitions
3. Every catch block MUST call: ErrLog.log('[${filename}]', err?.message || String(err), err?.stack || null, '${tag}_ERROR')
4. If ErrLog is not already imported, add: import { ErrLog } from './error-logger.js';
5. Use the EXACT error variable name from the catch clause, default to 'err'
6. Do not change any logic — only add error handling around existing code
7. Return ONLY the complete corrected JavaScript file. No explanation, no markdown fences.`;
            break;

        case 'BARE_CATCH':
            instruction = `\
Your task: Fill in all empty catch{} blocks in this JavaScript file.

Rules:
1. Find every bare catch{} or catch(e){} with an empty body
2. Replace with: catch (err) { ErrLog.log('[${filename}]', err?.message || String(err), err?.stack || null, '${tag}_ERROR'); }
3. If ErrLog is not already imported, add: import { ErrLog } from './error-logger.js';
4. Do not change anything else
5. Return ONLY the complete corrected JavaScript file. No explanation, no markdown fences.`;
            break;

        case 'NO_ERRLOG':
            instruction = `\
Your task: Wire ErrLog into all existing catch blocks in this JavaScript file.

Rules:
1. Find every catch block that does NOT already call ErrLog.log
2. Add as the FIRST statement inside each such catch: ErrLog.log('[${filename}]', err?.message || String(err), err?.stack || null, '${tag}_ERROR');
3. Use the actual error variable name from the catch clause
4. If ErrLog is not already imported, add: import { ErrLog } from './error-logger.js';
5. Do not change anything else
6. Return ONLY the complete corrected JavaScript file. No explanation, no markdown fences.`;
            break;
    }

    const prompt = `${instruction}\n\n--- FILE: ${filename} ---\n${src}`;
    const result = await callClaude(prompt, 8000);

    // Strip any accidental markdown fences the AI might add
    return result
        .replace(/^```(?:javascript|js)?\n/i, '')
        .replace(/\n```\s*$/i, '')
        .trim();
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadgeHtml(status: EntryStatus): string {
    const map: Record<EntryStatus, string> = {
        open:     '<span class="status-badge status-open">open</span>',
        accepted: '<span class="status-badge status-accepted">✅ accepted</span>',
        rejected: '<span class="status-badge status-rejected">✕ rejected</span>',
        excluded: '<span class="status-badge status-excluded">🚫 excluded</span>',
        skipped:  '<span class="status-badge status-skipped">skipped</span>',
    };
    return map[status] ?? '';
}

function buildAuditHtml(
    report:   AuditReport,
    state:    AuditState,
    root:     string
): string {
    const total       = report.violations.length + report.warnings.length + report.clean.length;
    const scannedAt   = report.scannedAt ? new Date(report.scannedAt).toLocaleString() : '';
    const openCount   = state.entries.filter(e => e.status === 'open').length;
    const fixedCount  = state.entries.filter(e => e.status === 'accepted').length;

    const buildViolationRow = (entry: ErrorEntry) => {
        const absPath   = path.join(root, entry.file.replace(/\//g, path.sep));
        const exists    = fs.existsSync(absPath);
        const basename  = path.basename(entry.file);
        const issueHtml = entry.issues.map(i => `<div class="issue-line">• ${esc(i)}</div>`).join('');
        const isDone    = entry.status !== 'open';

        const openBtn = exists
            ? `<button class="btn-fix btn-open" data-action="open" data-path="${esc(absPath)}" data-line="0" title="Open file in editor">📄 Open</button>`
            : `<button class="btn-fix btn-disabled" disabled>📄 Open</button>`;

        const aiFix = exists && !isDone
            ? `<button class="btn-fix btn-ai" data-action="ai-fix" data-id="${esc(entry.id)}" data-path="${esc(absPath)}" title="Use AI to generate a fix — you will review the diff before anything changes">🤖 AI Fix</button>`
            : '';

        const excludeBtn = exists && !isDone && entry.severity === 'ERROR'
            ? `<button class="btn-fix btn-muted" data-action="exclude" data-id="${esc(entry.id)}" data-path="${esc(absPath)}" data-file="${esc(entry.file)}" title="This file has no async code — exclude it from the no-try/catch rule in the audit script">🚫 Exclude from rule</button>`
            : '';

        return `<tr class="row-violation ${isDone ? 'row-done' : ''}" data-id="${esc(entry.id)}">
  <td class="id-cell"><span class="err-id">${esc(entry.id)}</span></td>
  <td class="dot-cell">🔴</td>
  <td class="name-cell" title="${esc(entry.file)}">${esc(basename)}<div class="rel-path">${esc(entry.file)}</div></td>
  <td class="issue-cell">${issueHtml}</td>
  <td class="status-cell">${statusBadgeHtml(entry.status)}</td>
  <td class="btn-cell">${openBtn}${aiFix}${excludeBtn}</td>
</tr>`;
    };

    const buildWarningRow = (entry: ErrorEntry) => {
        const absPath  = path.join(root, entry.file.replace(/\//g, path.sep));
        const exists   = fs.existsSync(absPath);
        const basename = path.basename(entry.file);
        const line     = findIssueLine(absPath, entry.fixKind);
        const lineHint = line > 0 ? ` line ${line}` : '';
        const lineAttr = line > 0 ? ` data-line="${line}"` : ' data-line="0"';
        const issueHtml = entry.issues.map(i => `<div class="issue-line">• ${esc(i)}</div>`).join('');
        const isDone    = entry.status !== 'open';

        const openBtn = exists
            ? `<button class="btn-fix btn-open" data-action="open" data-path="${esc(absPath)}"${lineAttr} title="Open file at the issue line">📄 Open${esc(lineHint)}</button>`
            : `<button class="btn-fix btn-disabled" disabled>📄 Open</button>`;

        const aiFix = exists && !isDone
            ? `<button class="btn-fix btn-ai" data-action="ai-fix" data-id="${esc(entry.id)}" data-path="${esc(absPath)}" title="Use AI to fix — you review the diff first">🤖 AI Fix</button>`
            : '';

        return `<tr class="row-warning ${isDone ? 'row-done' : ''}" data-id="${esc(entry.id)}">
  <td class="id-cell"><span class="warn-id">${esc(entry.id)}</span></td>
  <td class="dot-cell">🟡</td>
  <td class="name-cell" title="${esc(entry.file)}">${esc(basename)}<div class="rel-path">${esc(entry.file)}</div></td>
  <td class="issue-cell">${issueHtml}</td>
  <td class="status-cell">${statusBadgeHtml(entry.status)}</td>
  <td class="btn-cell">${openBtn}${aiFix}</td>
</tr>`;
    };

    const errEntries  = state.entries.filter(e => e.severity === 'ERROR');
    const warnEntries = state.entries.filter(e => e.severity === 'WARN');

    const violationRows = errEntries.map(buildViolationRow).join('');
    const warningRows   = warnEntries.map(buildWarningRow).join('');

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.toolbar{position:sticky;top:0;z-index:20;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1;white-space:nowrap}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid;white-space:nowrap}
.pill-err{border-color:#f48771;color:#f48771}
.pill-warn{border-color:#cca700;color:#cca700}
.pill-ok{border-color:#3fb950;color:#3fb950}
.pill-fixed{border-color:#58a6ff;color:#58a6ff}
.btn-toolbar{border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap}
.btn-toolbar-ai{background:#6e40c9;color:#fff}
.btn-toolbar-ai:hover{background:#7e50d9}
.btn-toolbar-rerun{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-toolbar-rerun:hover{background:var(--vscode-button-hoverBackground)}
.content{padding:12px 16px 40px}
.section-heading{font-size:0.95em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin:18px 0 10px;display:flex;align-items:center;gap:8px}
.section-note{font-size:11px;color:var(--vscode-descriptionForeground);font-weight:400;margin-left:4px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}
td{padding:5px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.row-done td{opacity:0.5}
.id-cell{width:68px}
.dot-cell{width:24px;text-align:center;font-size:13px}
.name-cell{font-weight:700;max-width:180px;overflow:hidden}
.rel-path{font-size:9px;color:var(--vscode-descriptionForeground);font-weight:400;word-break:break-all}
.issue-cell{font-size:11px;color:var(--vscode-descriptionForeground)}
.issue-line{margin:1px 0}
.status-cell{width:100px}
.btn-cell{white-space:nowrap;display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.btn-fix{border:none;padding:3px 9px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap}
.btn-ai{background:#6e40c9;color:#fff}
.btn-ai:hover{background:#7e50d9}
.btn-open{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.btn-open:hover{background:var(--vscode-button-secondaryHoverBackground)}
.btn-muted{background:transparent;border:1px solid var(--vscode-panel-border)!important;color:var(--vscode-descriptionForeground);padding:2px 8px}
.btn-muted:hover{border-color:var(--vscode-focusBorder)!important;color:var(--vscode-editor-foreground)}
.btn-disabled{opacity:0.35;cursor:not-allowed;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.err-id{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;font-weight:700;background:rgba(244,135,113,0.15);color:#f48771;border:1px solid rgba(244,135,113,0.4);border-radius:3px;padding:1px 5px}
.warn-id{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;font-weight:700;background:rgba(204,167,0,0.15);color:#cca700;border:1px solid rgba(204,167,0,0.4);border-radius:3px;padding:1px 5px}
.status-badge{font-size:10px;padding:1px 6px;border-radius:3px;white-space:nowrap}
.status-open{background:rgba(244,135,113,0.1);color:#f48771;border:1px solid rgba(244,135,113,0.3)}
.status-accepted{background:rgba(63,185,80,0.1);color:#3fb950;border:1px solid rgba(63,185,80,0.3)}
.status-rejected{background:rgba(127,127,127,0.1);color:#888;border:1px solid rgba(127,127,127,0.3)}
.status-excluded{background:rgba(88,166,255,0.1);color:#58a6ff;border:1px solid rgba(88,166,255,0.3)}
.status-skipped{background:rgba(127,127,127,0.1);color:#888;border:1px solid rgba(127,127,127,0.3)}
.meta{font-size:11px;color:var(--vscode-descriptionForeground);padding:8px 16px;border-top:1px solid var(--vscode-panel-border);margin-top:16px}

/* ── Diff overlay ────────────────────────────────────────────── */
#diff-overlay{display:none;position:fixed;inset:0;z-index:100;background:var(--vscode-editor-background);flex-direction:column}
#diff-overlay.visible{display:flex}
#diff-toolbar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;background:var(--vscode-editor-background)}
#diff-title{font-weight:700;font-size:1.0em;flex:1}
#diff-meta{font-size:11px;color:var(--vscode-descriptionForeground)}
.btn-accept{background:#3fb950;color:#fff;border:none;padding:6px 18px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:700}
.btn-accept:hover{background:#4ccc60}
.btn-reject{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:3px;cursor:pointer;font-size:13px;font-weight:600}
.btn-reject:hover{background:var(--vscode-button-secondaryHoverBackground)}
#diff-stats{font-size:11px;padding:6px 16px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:16px;flex-shrink:0}
.stat-add{color:#3fb950;font-weight:600}
.stat-del{color:#f48771;font-weight:600}
#diff-content{flex:1;overflow-y:auto;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;line-height:1.5}
.diff-line{display:grid;grid-template-columns:48px 48px 1fr;min-height:19px}
.diff-line.add{background:rgba(63,185,80,0.12)}
.diff-line.del{background:rgba(244,135,113,0.12)}
.diff-line.sep{background:var(--vscode-textCodeBlock-background);color:var(--vscode-descriptionForeground);font-style:italic;grid-template-columns:1fr}
.diff-lineno{padding:0 6px;text-align:right;color:var(--vscode-descriptionForeground);font-size:10px;border-right:1px solid var(--vscode-panel-border);user-select:none;min-width:48px}
.diff-lineno.add-no{color:#3fb950}
.diff-lineno.del-no{color:#f48771}
.diff-text{padding:0 8px;white-space:pre;overflow:hidden;text-overflow:ellipsis}
.diff-text.add{color:var(--vscode-editor-foreground)}
.diff-text.del{color:var(--vscode-editor-foreground);text-decoration:line-through;opacity:0.7}
.diff-prefix{padding:0 4px;font-weight:700;user-select:none}
.diff-prefix.add{color:#3fb950}
.diff-prefix.del{color:#f48771}
.diff-prefix.eq{color:transparent}

/* ── Status bar ── */
#status-bar{position:fixed;bottom:0;left:0;right:0;padding:7px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none;align-items:center;gap:8px}
#status-bar.visible{display:flex}
.spin{display:inline-block;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
`;

    const diffLinesJson = '[]'; // placeholder — populated dynamically via postMessage

    const JS = `
(function(){
'use strict';
const vscode = acquireVsCodeApi();

function showStatus(msg, persist) {
  var b = document.getElementById('status-bar');
  b.innerHTML = msg; b.className = 'visible';
  if (!persist) { setTimeout(function(){ b.className=''; }, 5000); }
}
function hideStatus(){ document.getElementById('status-bar').className=''; }

// ── Diff overlay ──────────────────────────────────────────────
var _currentDiffId = null;

function showDiff(payload) {
  _currentDiffId = payload.id;
  document.getElementById('diff-title').textContent = '🔍 Review AI fix — ' + payload.filename + ' (' + payload.id + ')';
  document.getElementById('diff-meta').textContent  = 'Fix kind: ' + payload.fixKind + ' · AI: ' + payload.provider;

  var adds = payload.diff.filter(function(d){ return d.kind==='add'; }).length;
  var dels = payload.diff.filter(function(d){ return d.kind==='del'; }).length;
  document.getElementById('diff-stats').innerHTML =
    '<span class="stat-add">+' + adds + ' added</span>' +
    '<span class="stat-del">−' + dels + ' removed</span>' +
    '<span style="color:var(--vscode-descriptionForeground)">' + payload.diff.length + ' lines shown (±3 context)</span>';

  var html = payload.diff.map(function(d){
    if (d.kind === 'sep') {
      return '<div class="diff-line sep"><div style="padding:0 8px">' + esc(d.text) + '</div></div>';
    }
    var prefix = d.kind==='add' ? '+' : d.kind==='del' ? '−' : ' ';
    var cls    = d.kind;
    var oNo    = d.kind==='del' ? (d.lineNo||'') : '';
    var nNo    = d.kind==='add' ? (d.oLineNo||'') : (d.kind==='eq'?(d.lineNo||''):'');
    return '<div class="diff-line ' + cls + '">' +
      '<div class="diff-lineno del-no">' + oNo + '</div>' +
      '<div class="diff-lineno add-no">' + nNo + '</div>' +
      '<div class="diff-text ' + cls + '"><span class="diff-prefix ' + cls + '">' + prefix + '</span>' + esc(d.text) + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('diff-content').innerHTML = html || '<div style="padding:20px;color:var(--vscode-descriptionForeground)">No changes detected — file may already be correct.</div>';
  document.getElementById('diff-overlay').className = 'visible';
  hideStatus();
}

function hideDiff(){
  document.getElementById('diff-overlay').className = '';
  _currentDiffId = null;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Message handler ───────────────────────────────────────────
window.addEventListener('message', function(e){
  var m = e.data;
  switch(m.type){
    case 'diff-ready':  showDiff(m.payload); break;
    case 'done':        showStatus('✅ ' + m.text); break;
    case 'error':       showStatus('❌ ' + m.text); break;
    case 'reload':      vscode.postMessage({command:'reload'}); break;
    case 'row-status':
      var row = document.querySelector('[data-id="' + m.id + '"]');
      if (row) {
        var cell = row.querySelector('.status-cell');
        if (cell) { cell.innerHTML = m.html; }
        if (m.done) { row.classList.add('row-done'); row.querySelectorAll('.btn-ai,.btn-muted').forEach(function(b){b.remove();}); }
      }
      break;
  }
});

// ── Click handler ─────────────────────────────────────────────
document.addEventListener('click', function(e){
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var a = btn.dataset.action;

  if (a === 'open') {
    vscode.postMessage({command:'open', path:btn.dataset.path, line:btn.dataset.line||0});
    return;
  }

  if (a === 'ai-fix') {
    var id = btn.dataset.id;
    showStatus('<span class="spin">⏳</span> Generating AI fix for ' + id + '… this may take 10–30 seconds', true);
    vscode.postMessage({command:'aiFix', id:id, path:btn.dataset.path});
    return;
  }

  if (a === 'fix-all') {
    showStatus('<span class="spin">⏳</span> Fixing all open violations…', true);
    vscode.postMessage({command:'fixAll'});
    return;
  }

  if (a === 'accept') {
    vscode.postMessage({command:'accept', id:_currentDiffId});
    hideDiff();
    showStatus('<span class="spin">⏳</span> Writing fix and re-running audit…', true);
    return;
  }

  if (a === 'reject') {
    vscode.postMessage({command:'reject', id:_currentDiffId});
    hideDiff();
    showStatus('Fix rejected — no changes made.');
    return;
  }

  if (a === 'exclude') {
    vscode.postMessage({command:'exclude', id:btn.dataset.id, path:btn.dataset.path, file:btn.dataset.file});
    showStatus('Excluding from rule and re-running audit…', true);
    return;
  }

  if (a === 'rerun') {
    showStatus('<span class="spin">⏳</span> Re-running audit…', true);
    vscode.postMessage({command:'rerun'});
    return;
  }
});

})();
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>

<!-- ── Diff overlay (shown when AI fix is ready) ── -->
<div id="diff-overlay">
  <div id="diff-toolbar">
    <span id="diff-title">Review AI Fix</span>
    <span id="diff-meta"></span>
    <button class="btn-accept" data-action="accept">✅ Accept &amp; Write File</button>
    <button class="btn-reject" data-action="reject">✕ Reject</button>
  </div>
  <div id="diff-stats"></div>
  <div id="diff-content"></div>
</div>

<!-- ── Main panel ── -->
<div class="toolbar">
  <h2>🛡️ JS Error Audit — DiskCleanUp</h2>
  <span class="pill pill-err">❌ ${report.violations.length} violations</span>
  <span class="pill pill-warn">⚠️ ${report.warnings.length} warnings</span>
  <span class="pill pill-ok">✅ ${report.clean.length} clean</span>
  ${fixedCount > 0 ? `<span class="pill pill-fixed">🔧 ${fixedCount} fixed</span>` : ''}
  ${openCount > 0 ? `<button class="btn-toolbar btn-toolbar-ai" data-action="fix-all" title="AI-generate fixes for all open violations in sequence — you review each diff before anything is written">🤖 Fix All Violations (${openCount})</button>` : ''}
  <button class="btn-toolbar btn-toolbar-rerun" data-action="rerun">↺ Re-run Audit</button>
</div>

<div class="content">
${report.violations.length > 0 ? `
<div class="section-heading">
  ❌ Violations — must fix (${report.violations.length})
  <span class="section-note">· Click 🤖 AI Fix to generate a change · you review the diff before anything is written</span>
</div>
<table>
  <thead><tr><th>ID</th><th></th><th>File</th><th>Issue</th><th>Status</th><th>Actions</th></tr></thead>
  <tbody>${violationRows}</tbody>
</table>` : '<div style="padding:20px;color:#3fb950;font-weight:700">✅ No violations — all files have error handling.</div>'}

${report.warnings.length > 0 ? `
<div class="section-heading">
  ⚠️ Warnings — open and fix manually or use AI Fix (${report.warnings.length})
  <span class="section-note">· Has try/catch but catch body needs attention</span>
</div>
<table>
  <thead><tr><th>ID</th><th></th><th>File</th><th>Issue</th><th>Status</th><th>Actions</th></tr></thead>
  <tbody>${warningRows}</tbody>
</table>` : ''}

<div class="meta">
  Project: <code>${esc(root)}</code> &nbsp;·&nbsp;
  Scanned: ${esc(scannedAt)} &nbsp;·&nbsp;
  ${total} total files &nbsp;·&nbsp;
  State: <code>${esc(findStateJson(root))}</code>
</div>
</div>

<div id="status-bar"></div>
<script>${JS}</script>
</body></html>`;
}

// ─── Panel state ──────────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;

// Pending fixes in queue for Fix All
const _fixQueue: string[] = [];
// Map of pending fixed content waiting for accept/reject: id → { path, content }
const _pendingFix = new Map<string, { absPath: string; fixedContent: string; entry: ErrorEntry }>();

// ─── Core commands ────────────────────────────────────────────────────────────

async function runJsErrorAudit(): Promise<void> {
    try {
        const root = findDiskCleanUpRoot();
        if (!root) {
            logError('Could not find DiskCleanUp project. Check your project registry.', '', FEATURE);
            vscode.window.showErrorMessage('Could not find DiskCleanUp project. Check your project registry.');
            return;
        }

        let report = loadReport(root);
        if (!report) {
            const run = await vscode.window.showWarningMessage(
                'No js-error-audit.json found. Run the audit first?',
                'Run npm run audit:errors', 'Cancel'
            );
            if (run !== 'Run npm run audit:errors') { return; }
            await runAuditScript(root);
            report = loadReport(root);
            if (!report) {
                logError('Audit failed — check the terminal.', '', FEATURE);
                vscode.window.showErrorMessage('Audit failed — check the terminal.');
                return;
            }
        }

        const state = mergeState(root, report);
        showPanel(report, state, root);
    } catch (err) {
        logError('runJsErrorAudit failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage('JS Error Audit failed: ' + (err instanceof Error ? err.message : String(err)));
    }
}

function loadReport(root: string): AuditReport | undefined {
    const p = findAuditJson(root);
    if (!fs.existsSync(p)) { return undefined; }
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) as AuditReport; }
    catch (err) { logError('Failed to parse audit JSON', err instanceof Error ? err.stack || String(err) : String(err), FEATURE); return undefined; }
}

function refresh(root: string): void {
    const report = loadReport(root);
    if (!report || !_panel) { return; }
    const state = mergeState(root, report);
    _panel.webview.html = buildAuditHtml(report, state, root);
}

// ─── Panel setup ──────────────────────────────────────────────────────────────

function showPanel(report: AuditReport, state: AuditState, root: string): void {
    const html = buildAuditHtml(report, state, root);

    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    } else {
        _panel = vscode.window.createWebviewPanel(
            'jsErrorAudit', '🛡️ JS Error Audit', vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; _pendingFix.clear(); _fixQueue.length = 0; });
    }

    attachHandler(root);
    log(FEATURE, `Panel opened — ${report.violations.length} violations, ${report.warnings.length} warnings`);
}

// ─── Message handler ──────────────────────────────────────────────────────────

function attachHandler(root: string): void {
    if (!_panel) { return; }

    _panel.webview.onDidReceiveMessage(async msg => {
        try {
            switch (msg.command) {
                case 'open': {
                    try {
                        if (!fs.existsSync(msg.path)) {
                            logError(`File not found: ${msg.path}`, '', FEATURE);
                            _panel?.webview.postMessage({ type: 'error', text: 'File not found: ' + msg.path });
                            break;
                        }
                        const doc    = await vscode.workspace.openTextDocument(msg.path);
                        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                        const line   = msg.line ? Math.max(0, parseInt(msg.line) - 1) : 0;
                        if (line > 0) {
                            const range = new vscode.Range(line, 0, line, 999);
                            editor.selection = new vscode.Selection(range.start, range.end);
                            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                        }
                    } catch (err) {
                        logError(`Failed to open file: ${msg.path}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: 'Failed to open file: ' + msg.path });
                    }
                    break;
                }
                case 'aiFix': {
                    try {
                        await handleAiFix(root, msg.id, msg.path);
                    } catch (err) {
                        logError(`AI fix failed for ${msg.id}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: `AI fix failed for ${msg.id}: ${err}` });
                    }
                    break;
                }
                case 'fixAll': {
                    try {
                        const state = loadState(root);
                        const open  = state.entries.filter(e => e.severity === 'ERROR' && e.status === 'open');
                        if (!open.length) {
                            _panel?.webview.postMessage({ type: 'done', text: 'No open violations to fix.' });
                            break;
                        }
                        const first = open[0];
                        const absPath = path.join(root, first.file.replace(/\//g, path.sep));
                        _fixQueue.length = 0;
                        for (const e of open.slice(1)) { _fixQueue.push(e.id); }
                        await handleAiFix(root, first.id, absPath);
                    } catch (err) {
                        logError('Fix All failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: 'Fix All failed: ' + (err instanceof Error ? err.message : String(err)) });
                    }
                    break;
                }
                case 'accept': {
                    try {
                        const pending = _pendingFix.get(msg.id);
                        if (!pending) {
                            logError(`No pending fix found for ${msg.id}`, '', FEATURE);
                            _panel?.webview.postMessage({ type: 'error', text: 'No pending fix found for ' + msg.id });
                            break;
                        }
                        fs.writeFileSync(pending.absPath, pending.fixedContent, 'utf8');
                        _pendingFix.delete(msg.id);
                        updateEntryStatus(root, msg.id, 'accepted');
                        log(FEATURE, `Accepted fix for ${msg.id} — file written`);
                        _panel?.webview.postMessage({
                            type: 'row-status', id: msg.id,
                            html: '<span class="status-badge status-accepted">✅ accepted</span>',
                            done: true,
                        });
                        await runAuditScript(root);
                        refresh(root);
                        if (_fixQueue.length > 0) {
                            const nextId = _fixQueue.shift()!;
                            const nextState = loadState(root);
                            const nextEntry = nextState.entries.find(e => e.id === nextId);
                            if (nextEntry) {
                                const nextPath = path.join(root, nextEntry.file.replace(/\//g, path.sep));
                                await handleAiFix(root, nextId, nextPath);
                            }
                        } else {
                            _panel?.webview.postMessage({ type: 'done', text: `Fix accepted and written — audit refreshed.` });
                        }
                    } catch (err) {
                        logError(`Accept fix failed for ${msg.id}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: `Accept fix failed for ${msg.id}: ${err}` });
                    }
                    break;
                }
                case 'reject': {
                    try {
                        _pendingFix.delete(msg.id);
                        updateEntryStatus(root, msg.id, 'rejected');
                        _panel?.webview.postMessage({
                            type: 'row-status', id: msg.id,
                            html: '<span class="status-badge status-rejected">✕ rejected</span>',
                            done: false,
                        });
                        if (_fixQueue.length > 0) {
                            const nextId = _fixQueue.shift()!;
                            const nextState = loadState(root);
                            const nextEntry = nextState.entries.find(e => e.id === nextId);
                            if (nextEntry) {
                                const nextPath = path.join(root, nextEntry.file.replace(/\//g, path.sep));
                                await handleAiFix(root, nextId, nextPath);
                            }
                        }
                    } catch (err) {
                        logError(`Reject fix failed for ${msg.id}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: `Reject fix failed for ${msg.id}: ${err}` });
                    }
                    break;
                }
                case 'exclude': {
                    try {
                        const scriptPath = findAuditScript(root);
                        if (!fs.existsSync(scriptPath)) {
                            logError('Audit script not found.', '', FEATURE);
                            _panel?.webview.postMessage({ type: 'error', text: 'Audit script not found.' });
                            break;
                        }
                        const basename = path.basename(msg.file);
                        let scriptSrc  = fs.readFileSync(scriptPath, 'utf8');
                        if (!scriptSrc.includes(`'${basename}'`)) {
                            scriptSrc = scriptSrc.replace(
                                /const INTENTIONAL_NO_CATCH = new Set\(\[/,
                                `const INTENTIONAL_NO_CATCH = new Set([\n  '${basename}',   // pure module — excluded via JS Error Audit`
                            );
                            fs.writeFileSync(scriptPath, scriptSrc, 'utf8');
                        }
                        updateEntryStatus(root, msg.id, 'excluded');
                        log(FEATURE, `Excluded ${basename} from audit rule`);
                        await runAuditScript(root);
                        refresh(root);
                    } catch (err) {
                        logError(`Exclude failed for ${msg.id}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: `Exclude failed for ${msg.id}: ${err}` });
                    }
                    break;
                }
                case 'rerun': {
                    try {
                        await runAuditScript(root);
                        refresh(root);
                        _panel?.webview.postMessage({ type: 'done', text: 'Audit complete.' });
                    } catch (err) {
                        logError('Re-run audit failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: 'Re-run audit failed: ' + (err instanceof Error ? err.message : String(err)) });
                    }
                    break;
                }
                case 'reload': {
                    try {
                        refresh(root);
                    } catch (err) {
                        logError('Reload failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        _panel?.webview.postMessage({ type: 'error', text: 'Reload failed: ' + (err instanceof Error ? err.message : String(err)) });
                    }
                    break;
                }
            }
        } catch (err) {
            logError(`Handler error: ${msg.command}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            _panel?.webview.postMessage({ type: 'error', text: String(err) });
        }
    });
}

// ─── AI fix helper ────────────────────────────────────────────────────────────

async function handleAiFix(root: string, id: string, absPath: string): Promise<void> {
    const state = loadState(root);
    const entry = state.entries.find(e => e.id === id);
    if (!entry) {
        _panel?.webview.postMessage({ type: 'error', text: `Entry ${id} not found in state.` });
        return;
    }
    if (!fs.existsSync(absPath)) {
        _panel?.webview.postMessage({ type: 'error', text: `File not found: ${absPath}` });
        return;
    }

    try {
        const original     = fs.readFileSync(absPath, 'utf8');
        const fixedContent = await generateAiFix(absPath, entry);

        if (fixedContent === original.trim()) {
            _panel?.webview.postMessage({ type: 'done', text: `${id}: AI returned no changes — file may already be correct.` });
            return;
        }

        // Store pending fix
        _pendingFix.set(id, { absPath, fixedContent, entry });

        // Build diff and send to webview
        const rawDiff       = buildDiff(original, fixedContent);
        const collapsedDiff = collapseDiff(rawDiff);

        _panel?.webview.postMessage({
            type:    'diff-ready',
            payload: {
                id,
                filename: path.basename(absPath),
                fixKind:  entry.fixKind,
                provider: 'AI',
                diff:     collapsedDiff,
            },
        });
    } catch (err) {
        logError(`AI fix failed for ${id}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        _panel?.webview.postMessage({ type: 'error', text: `AI fix failed for ${id}: ${err}` });
    }
}

// ─── Audit script runner ──────────────────────────────────────────────────────

async function runAuditScript(root: string): Promise<void> {
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Running JS error audit…', cancellable: false },
        async () => {
            try {
                execSync('npm run audit:errors', { cwd: root, stdio: 'pipe' });
            } catch (err: any) {
                log(FEATURE, `Audit script output: ${err?.stdout?.toString() ?? ''}`);
            }
        }
    );
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.audit.jsErrors', runJsErrorAudit),
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
    _pendingFix.clear();
    _fixQueue.length = 0;
}

/** @internal — exported for unit testing only */
export const _test = {
    classifyFixKind,
    findIssueLine,
    buildDiff,
    computeLCS,
    collapseDiff,
    mergeState,
    loadState,
    saveState,
    esc,
    findAuditJson,
    findStateJson,
};
