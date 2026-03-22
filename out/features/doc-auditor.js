"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
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
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * doc-auditor.ts
 *
 * Documentation audit tool for all CieloVista projects.
 *
 * Scans every registered project and the global CieloVistaStandards folder,
 * then detects and resolves four categories of doc problems:
 *
 *   1. DUPLICATES   — same filename found in multiple places
 *   2. NEAR-MATCHES — different filenames, similar content (>70% overlap)
 *   3. MOVE CANDIDATES — project-local docs that belong in global standards
 *   4. ORPHANS      — docs nobody references (no links to them anywhere)
 *
 * Every destructive action (merge, move, delete) requires explicit user
 * confirmation before anything is touched.
 *
 * Commands registered:
 *   cvs.audit.docs           — run full audit and show results panel
 *   cvs.audit.findDuplicates — scan for duplicate filenames only
 *   cvs.audit.findSimilar    — scan for near-matching content
 *   cvs.audit.findOrphans    — scan for unreferenced docs
 *   cvs.audit.mergeFiles     — interactively merge two docs into one
 *   cvs.audit.moveToGlobal   — move a project doc to CieloVistaStandards
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const registry_1 = require("../shared/registry");
const FEATURE = 'doc-auditor';
/**
 * Returns the docs folder for the current VS Code workspace.
 * Falls back to CieloVistaStandards/reports if no workspace is open.
 * Creates the folder if it does not exist.
 */
function getReportDir() {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const dir = ws
        ? path.join(ws, 'docs')
        : 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
/** Returns a datestamped report filename for a given audit type. */
function reportFileName(type) {
    const date = new Date().toISOString().slice(0, 10);
    return `audit-${type}-${date}.md`;
}
// ─── Doc collection ───────────────────────────────────────────────────────────
/** Returns all markdown docs under a directory tree (max 3 levels deep). */
function collectDocs(rootPath, projectName, maxDepth = 3) {
    const results = [];
    function walk(dir, depth) {
        if (depth > maxDepth) {
            return;
        }
        if (!fs.existsSync(dir)) {
            return;
        }
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            // Skip node_modules, .git, out, dist
            if (['node_modules', '.git', 'out', 'dist', '.vscode'].includes(entry.name)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            }
            else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content
                        .toLowerCase()
                        .replace(/\s+/g, ' ')
                        .replace(/[#*`_\[\]()]/g, '')
                        .trim();
                    results.push({
                        filePath: fullPath,
                        fileName: entry.name,
                        projectName,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        content,
                        normalized,
                    });
                }
                catch { /* skip unreadable */ }
            }
        }
    }
    walk(rootPath, 0);
    return results;
}
// ─── Analysis ─────────────────────────────────────────────────────────────────
/**
 * Computes a simple similarity score between two normalized strings.
 * Uses word overlap (Jaccard index on word sets).
 * Returns 0.0 to 1.0.
 */
function computeSimilarity(a, b) {
    if (!a || !b) {
        return 0;
    }
    const wordsA = new Set(a.split(' ').filter(w => w.length > 3));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 3));
    if (wordsA.size === 0 || wordsB.size === 0) {
        return 0;
    }
    let intersection = 0;
    for (const word of wordsA) {
        if (wordsB.has(word)) {
            intersection++;
        }
    }
    const union = wordsA.size + wordsB.size - intersection;
    return intersection / union;
}
/** Global doc filenames that suggest the content belongs in CieloVistaStandards. */
const GLOBAL_CANDIDATE_PATTERNS = [
    /^CODING.?STANDARDS/i,
    /^TIER1.?LAWS/i,
    /^JAVASCRIPT.?STANDARDS/i,
    /^GIT.?WORKFLOW/i,
    /^WEB.?COMPONENT/i,
    /^ARCHITECTURE.?PRINCIPLES/i,
    /^ONBOARDING/i,
    /^COPILOT.?RULES/i,
    /^GLOBAL/i,
    /^STANDARDS/i,
];
function isGlobalCandidate(file) {
    // Already global
    if (file.projectName === 'global') {
        return undefined;
    }
    for (const pattern of GLOBAL_CANDIDATE_PATTERNS) {
        if (pattern.test(file.fileName)) {
            return `Filename "${file.fileName}" matches a global standards pattern`;
        }
    }
    // Check content for global language
    if (file.content.includes('all projects') ||
        file.content.includes('ALL projects') ||
        file.content.includes('every project') ||
        file.content.includes('global standard')) {
        return 'Content uses global-standard language ("all projects", "global standard")';
    }
    return undefined;
}
/** Filenames that are never considered orphans (they're always referenced implicitly). */
const ALWAYS_REFERENCED = new Set([
    'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'LICENSE.md',
    'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md',
]);
function isOrphan(file, allDocs) {
    if (ALWAYS_REFERENCED.has(file.fileName.toUpperCase()) ||
        ALWAYS_REFERENCED.has(file.fileName)) {
        return undefined;
    }
    // Check if any other doc links to this file
    const baseName = file.fileName.replace(/\.md$/i, '');
    for (const other of allDocs) {
        if (other.filePath === file.filePath) {
            continue;
        }
        if (other.content.includes(file.fileName) ||
            other.content.includes(baseName)) {
            return undefined;
        }
    }
    // Check if any CLAUDE.md or README in the same project mentions it
    // (already checked above — but give it a pass if it's CURRENT-STATUS or similar)
    if (/CURRENT.?STATUS|PARKING.?LOT|TODAY|PROMPT.?HISTORY/i.test(file.fileName)) {
        return undefined;
    }
    return 'No other doc links to this file';
}
// ─── Full audit ───────────────────────────────────────────────────────────────
async function runAudit() {
    // Load the standard CLAUDE.md for comparison
    let standardClaude = undefined;
    const standardClaudePath = path.join('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools', 'CLAUDE.md');
    if (fs.existsSync(standardClaudePath)) {
        const content = fs.readFileSync(standardClaudePath, 'utf8');
        standardClaude = {
            filePath: standardClaudePath,
            fileName: 'CLAUDE.md',
            projectName: 'global',
            sizeBytes: Buffer.byteLength(content, 'utf8'),
            content,
            normalized: content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim(),
        };
    }
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return undefined;
    }
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Auditing CieloVista docs…', cancellable: false }, async (progress) => {
        // Collect all docs
        progress.report({ message: 'Collecting global docs…' });
        const allDocs = collectDocs(registry.globalDocsPath, 'global');
        for (const project of registry.projects) {
            progress.report({ message: `Scanning ${project.name}…` });
            if (fs.existsSync(project.path)) {
                allDocs.push(...collectDocs(project.path, project.name));
            }
        }
        (0, output_channel_1.log)(FEATURE, `Collected ${allDocs.length} docs across ${registry.projects.length + 1} locations`);
        // 1. Duplicates — same filename in multiple places
        const byName = new Map();
        for (const doc of allDocs) {
            const key = doc.fileName.toLowerCase();
            if (!byName.has(key)) {
                byName.set(key, []);
            }
            byName.get(key).push(doc);
        }
        const duplicates = [];
        for (const [fileName, files] of byName) {
            if (files.length > 1) {
                duplicates.push({ fileName, files });
            }
        }
        // 2. Near-matches — different filenames, similar content (>65%)
        progress.report({ message: 'Checking for similar content…' });
        const similar = [];
        const compared = new Set();
        for (let i = 0; i < allDocs.length; i++) {
            for (let j = i + 1; j < allDocs.length; j++) {
                const a = allDocs[i];
                const b = allDocs[j];
                // Skip same filename (already in duplicates) and tiny files
                if (a.fileName.toLowerCase() === b.fileName.toLowerCase()) {
                    continue;
                }
                if (a.sizeBytes < 100 || b.sizeBytes < 100) {
                    continue;
                }
                const key = [a.filePath, b.filePath].sort().join('::');
                if (compared.has(key)) {
                    continue;
                }
                compared.add(key);
                const score = computeSimilarity(a.normalized, b.normalized);
                if (score >= 0.65) {
                    similar.push({
                        similarity: score,
                        fileA: a,
                        fileB: b,
                        reason: `${Math.round(score * 100)}% word overlap`,
                    });
                }
            }
        }
        // Sort similar by score descending
        similar.sort((a, b) => b.similarity - a.similarity);
        // 3. Move candidates and CLAUDE.md standard check
        progress.report({ message: 'Checking for misplaced docs and CLAUDE.md compliance…' });
        const moveCandidates = [];
        const warningCandidates = [];
        for (const doc of allDocs) {
            // CLAUDE.md special logic
            if (doc.fileName.toLowerCase() === 'claude.md' && standardClaude && doc.projectName !== 'global') {
                const score = computeSimilarity(doc.normalized, standardClaude.normalized);
                if (score < 0.95) {
                    warningCandidates.push({ file: doc, reason: `⚠️ This CLAUDE.md is not similar to the standard. You can overwrite it with the standard version.` });
                    continue;
                }
            }
            const reason = isGlobalCandidate(doc);
            if (reason) {
                moveCandidates.push({ file: doc, reason });
            }
        }
        // warningCandidates attached below after results object is built
        // 4. Orphans
        progress.report({ message: 'Checking for orphaned docs…' });
        const orphans = [];
        for (const doc of allDocs) {
            const reason = isOrphan(doc, allDocs);
            if (reason) {
                orphans.push({ file: doc, reason });
            }
        }
        const auditResults = {
            duplicates,
            similar,
            moveCandidates,
            orphans,
            totalDocsScanned: allDocs.length,
            projectsScanned: registry.projects.length + 1,
        };
        auditResults.warningCandidates = warningCandidates;
        return auditResults;
    });
}
// ─── Results panel ────────────────────────────────────────────────────────────
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * Builds a tabbed file preview block for a group of DocFiles.
 * Each tab shows the file path header + scrollable content preview.
 * Data is embedded directly — no async reads needed at click time.
 */
function buildTabPreview(groupId, files) {
    const MAX_PREVIEW = 4000;
    const tabs = files.map((f, i) => {
        const active = i === 0 ? ' active' : '';
        const label = `${f.projectName}/${f.fileName}`;
        return `<button class="tab-btn${active}" data-group="${groupId}" data-tab="${i}" onclick="switchTab('${groupId}',${i})">${esc(label)}</button>`;
    }).join('');
    const panes = files.map((f, i) => {
        const active = i === 0 ? '' : ' hidden';
        const preview = f.content.length > MAX_PREVIEW
            ? f.content.slice(0, MAX_PREVIEW) + `\n\n… (${f.content.length - MAX_PREVIEW} more chars)`
            : f.content;
        return `<div class="tab-pane${active}" data-group="${groupId}" data-pane="${i}">
          <div class="file-meta">
            <span class="path-label">${esc(f.filePath)}</span>
            <span class="size-label">${f.sizeBytes} bytes</span>
            <button class="sm-btn" onclick="openFile(${JSON.stringify(esc(f.filePath)).replace(/&quot;/g, '"')})">Open in editor ↗</button>
          </div>
          <pre class="preview">${esc(preview)}</pre>
        </div>`;
    }).join('');
    return `<div class="tab-block">
      <div class="tab-bar">${tabs}</div>
      <div class="tab-panes">${panes}</div>
    </div>`;
}
function buildAuditHtml(results) {
    // ── CLAUDE.md warnings ───────────────────────────────────────────────
    let warningRows = '';
    if (results.warningCandidates && results.warningCandidates.length) {
        warningRows = results.warningCandidates.map((c, mi) => {
            const gid = `warn-${mi}`;
            return `<div class="card warning">
              <div class="card-title">⚠️ ${esc(c.file.projectName)}/${esc(c.file.fileName)}</div>
              <div class="muted">${esc(c.reason)}</div>
              <div class="recommendation">You can overwrite this file with the standard CLAUDE.md. <button onclick=\"cmd('overwriteWithStandard',${JSON.stringify(JSON.stringify(c.file.filePath))})\">📝 Overwrite with Standard</button></div>
              ${buildTabPreview(gid, [c.file])}
            </div>`;
        }).join('');
    }
    // ── Guidance box ─────────────────────────────────────────────────────────
    const totalIssues = results.duplicates.length + results.similar.length +
        results.moveCandidates.length + results.orphans.length;
    const guidanceLines = [];
    if (results.duplicates.length) {
        guidanceLines.push(`<li><strong>📄 ${results.duplicates.length} duplicate filename(s)</strong> — same file exists in multiple projects. Review each tab to see which version is most up-to-date, then <em>keep the best one</em> and delete the rest — or use <strong>Merge</strong> to combine them. CLAUDE.md files are expected duplicates (project-specific) — skip those.</li>`);
    }
    if (results.similar.length) {
        guidanceLines.push(`<li><strong>🔀 ${results.similar.length} similar content pair(s)</strong> — different filenames but overlapping content. Use <strong>Diff</strong> first to see exactly what differs, then decide whether to merge or keep separate.</li>`);
    }
    if (results.moveCandidates.length) {
        guidanceLines.push(`<li><strong>📦 ${results.moveCandidates.length} move candidate(s)</strong> — docs that look like global standards but live inside a project. Use <strong>Move to Global</strong> to relocate them to CieloVistaStandards so all projects can reference the single copy.</li>`);
    }
    if (results.orphans.length) {
        guidanceLines.push(`<li><strong>👻 ${results.orphans.length} orphan(s)</strong> — docs nobody links to. Open each one to decide if it's still needed. If not, delete it.</li>`);
    }
    const guidanceHtml = totalIssues === 0
        ? `<div class="guidance ok-box">✅ Everything looks clean. No issues found across ${results.totalDocsScanned} docs.</div>`
        : `<div class="guidance"><strong>What to do:</strong><ul>${guidanceLines.join('')}</ul><p class="tip">💡 Tip — always review the file tabs before clicking Merge or Delete. Nothing is deleted without a confirmation dialog.</p></div>`;
    // ── Duplicate groups ──────────────────────────────────────────────────────
    const dupeRows = results.duplicates.map((g, gi) => {
        const gid = `dupe-${gi}`;
        const allPaths = JSON.stringify(g.files.map(f => f.filePath));
        const recommendation = g.fileName.toLowerCase() === 'claude.md'
            ? '⚠️ CLAUDE.md is project-specific — each project should keep its own copy. Only merge if they are truly identical.'
            : g.fileName.toLowerCase().includes('current-status')
                ? '⚠️ CURRENT-STATUS.md is project-specific — do not merge. Each project needs its own.'
                : `✅ Recommended: pick the most complete version as the keeper, delete the rest.`;
        return `<div class="card">
          <div class="card-title">📄 ${esc(g.fileName)} — ${g.files.length} copies</div>
          <div class="recommendation">${recommendation}</div>
          ${buildTabPreview(gid, g.files)}
          <div class="actions">
            <button onclick="cmd('merge',${JSON.stringify(allPaths)})">⛙ Merge all into one…</button>
            <button class="secondary" onclick="cmd('walkGroup',${JSON.stringify(allPaths)})">👣 Walk through individually</button>
          </div>
        </div>`;
    }).join('');
    // ── Similar pairs ─────────────────────────────────────────────────────────
    const simRows = results.similar.map((g, si) => {
        const gid = `sim-${si}`;
        const pairPaths = JSON.stringify([g.fileA.filePath, g.fileB.filePath]);
        return `<div class="card">
          <div class="card-title">🔀 ${Math.round(g.similarity * 100)}% similar — ${esc(g.fileA.fileName)} ↔ ${esc(g.fileB.fileName)}</div>
          <div class="muted">${esc(g.reason)}</div>
          <div class="recommendation">✅ Recommended: click Diff first to see exactly what's different, then decide whether to merge.</div>
          ${buildTabPreview(gid, [g.fileA, g.fileB])}
          <div class="actions">
            <button onclick="cmd('diff',${JSON.stringify(pairPaths)})">⬛ Diff side by side</button>
            <button class="secondary" onclick="cmd('merge',${JSON.stringify(pairPaths)})">⛙ Merge…</button>
          </div>
        </div>`;
    }).join('');
    // ── Move candidates ───────────────────────────────────────────────────────
    const moveRows = results.moveCandidates.map((c, mi) => {
        const gid = `move-${mi}`;
        return `<div class="card">
          <div class="card-title">📦 ${esc(c.file.projectName)}/${esc(c.file.fileName)}</div>
          <div class="muted">${esc(c.reason)}</div>
          <div class="recommendation">✅ Recommended: move to CieloVistaStandards so all projects reference a single copy. The original will be deleted after copying.</div>
          ${buildTabPreview(gid, [c.file])}
          <div class="actions">
            <button onclick="cmd('moveToGlobal',${JSON.stringify(JSON.stringify(c.file.filePath))})">📦 Move to Global Standards…</button>
          </div>
        </div>`;
    }).join('');
    // ── Orphans ───────────────────────────────────────────────────────────────
    const orphanRows = results.orphans.map((o, oi) => {
        const gid = `orphan-${oi}`;
        return `<div class="card">
          <div class="card-title">👻 ${esc(o.file.projectName)}/${esc(o.file.fileName)}</div>
          <div class="muted">${esc(o.reason)}</div>
          <div class="recommendation">⚠️ Review the file below before deleting — it may be useful but just not linked yet.</div>
          ${buildTabPreview(gid, [o.file])}
          <div class="actions">
            <button class="danger" onclick="cmd('delete',${JSON.stringify(JSON.stringify(o.file.filePath))})">🗑 Delete…</button>
          </div>
        </div>`;
    }).join('');
    const section = (title, count, body, sectionId, empty = 'None found. ✅') => `<div class="section" data-section="${sectionId}"><h2>${title} <span class="badge">${count}</span></h2>${count === 0 ? `<p class="ok">${empty}</p>` : body}</div>`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box}
  body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:16px 20px;margin:0}
  h1{font-size:1.3em;margin-bottom:4px}
  h2{font-size:1.05em;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:6px;margin-top:24px}
  .summary{display:flex;gap:12px;margin:12px 0 16px;flex-wrap:wrap}
  .stat{background:var(--vscode-textCodeBlock-background);padding:8px 14px;border-radius:4px;text-align:center;min-width:78px}
  .stat-n{font-size:1.5em;font-weight:700;display:block}
  .stat-label{font-size:0.8em;color:var(--vscode-descriptionForeground)}
  .stat{cursor:pointer;transition:outline 0.1s}
  .stat:hover{outline:2px solid var(--vscode-focusBorder)}
  .stat.active-filter{outline:2px solid var(--vscode-focusBorder);background:var(--vscode-button-background)}
  .stat.active-filter .stat-n,.stat.active-filter .stat-label{color:var(--vscode-button-foreground)}
  .section{transition:opacity 0.15s}
  .section.filtered-out{display:none}
  .guidance{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:12px 16px;margin-bottom:20px;line-height:1.6}
  .guidance ul{margin:6px 0 6px 18px;padding:0}
  .guidance li{margin:4px 0}
  .tip{color:var(--vscode-descriptionForeground);font-size:0.88em;margin:8px 0 0}
  .ok-box{color:var(--vscode-testing-iconPassed)}
  .section{margin-bottom:28px}
  .card{border:1px solid var(--vscode-panel-border);border-radius:4px;padding:12px 14px;margin-bottom:12px}
  .card-title{font-weight:700;font-size:0.95em;margin-bottom:6px}
  .recommendation{font-size:0.85em;margin:4px 0 10px;padding:6px 10px;border-radius:3px;background:var(--vscode-editor-background);border-left:3px solid var(--vscode-focusBorder)}
  .muted{color:var(--vscode-descriptionForeground);font-size:0.85em;margin:2px 0 6px}
  .badge{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 8px;font-size:0.8em}
  .ok{color:var(--vscode-testing-iconPassed)}
  /* Tabs */
  .tab-block{border:1px solid var(--vscode-panel-border);border-radius:4px;overflow:hidden;margin:8px 0 10px}
  .tab-bar{display:flex;flex-wrap:wrap;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}
  .tab-btn{background:transparent;color:var(--vscode-descriptionForeground);border:none;border-right:1px solid var(--vscode-panel-border);padding:5px 12px;cursor:pointer;font-size:11px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
  .tab-btn:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-editor-foreground)}
  .tab-btn.active{background:var(--vscode-textCodeBlock-background);color:var(--vscode-editor-foreground);font-weight:600;border-bottom:2px solid var(--vscode-focusBorder)}
  .tab-pane{display:block}
  .tab-pane.hidden{display:none}
  .file-meta{display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);flex-wrap:wrap}
  .path-label{font-family:var(--vscode-editor-font-family);font-size:0.8em;color:var(--vscode-descriptionForeground);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .size-label{font-size:0.78em;color:var(--vscode-descriptionForeground);white-space:nowrap}
  .sm-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:2px 8px;border-radius:2px;cursor:pointer;font-size:11px;white-space:nowrap}
  .sm-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
  pre.preview{margin:0;padding:10px;background:var(--vscode-textCodeBlock-background);font-family:var(--vscode-editor-font-family);font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-all;max-height:280px;overflow-y:auto}
  .actions{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:5px 12px;border-radius:2px;cursor:pointer;font-size:12px}
  button:hover{background:var(--vscode-button-hoverBackground)}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
  button.danger{background:var(--vscode-inputValidation-errorBackground);color:var(--vscode-inputValidation-errorForeground)}
  button.danger:hover{opacity:0.85}
</style>
</head><body>
<h1>📋 CieloVista Docs Audit</h1>
<p class="muted">Scanned ${results.totalDocsScanned} docs across ${results.projectsScanned} projects</p>

<div class="summary">
  <div class="stat" onclick="filterSection('all')" title="Show all sections"><span class="stat-n">${results.totalDocsScanned}</span><span class="stat-label">Docs scanned</span></div>
  <div class="stat" data-filter="duplicates" onclick="filterSection('duplicates')" title="Show duplicates only"><span class="stat-n" style="color:${results.duplicates.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.duplicates.length}</span><span class="stat-label">Duplicates</span></div>
  <div class="stat" data-filter="similar" onclick="filterSection('similar')" title="Show similar pairs only"><span class="stat-n" style="color:${results.similar.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.similar.length}</span><span class="stat-label">Similar pairs</span></div>
  <div class="stat" data-filter="move" onclick="filterSection('move')" title="Show move candidates only"><span class="stat-n" style="color:${results.moveCandidates.length ? 'var(--vscode-inputValidation-infoForeground)' : 'inherit'}">${results.moveCandidates.length}</span><span class="stat-label">Move candidates</span></div>
  <div class="stat" data-filter="orphans" onclick="filterSection('orphans')" title="Show orphans only"><span class="stat-n" style="color:${results.orphans.length ? 'var(--vscode-inputValidation-warningForeground)' : 'inherit'}">${results.orphans.length}</span><span class="stat-label">Orphans</span></div>
</div>

${guidanceHtml}

${warningRows ? `<div class="section" data-section="claude-warnings"><h2>⚠️ CLAUDE.md Warnings <span class="badge">${results.warningCandidates.length}</span></h2>${warningRows}</div>` : ''}
${section('📄 Duplicate Filenames', results.duplicates.length, dupeRows, 'duplicates')}
${section('🔀 Similar Content', results.similar.length, simRows, 'similar')}
${section('📦 Should Move to Global Standards', results.moveCandidates.length, moveRows, 'move')}
${section('👻 Orphaned Docs', results.orphans.length, orphanRows, 'orphans')}

<script>
  const vscode = acquireVsCodeApi();

  // cmd — sends a message to the extension.
  // pathsJson is a JSON string of either a single path string or an array of paths.
  function cmd(command, pathsJson) {
    let data;
    try { data = JSON.parse(pathsJson); } catch { data = pathsJson; }
    vscode.postMessage({ command, data });
  }

  // Open a file directly from the tab meta bar
  function openFile(filePath) {
    vscode.postMessage({ command: 'open', data: filePath });
  }

  // Stat box filter — click a stat to show only that section, click again or click total to show all
  let _activeFilter = 'all';
  function filterSection(id) {
    if (_activeFilter === id) { id = 'all'; } // toggle off
    _activeFilter = id;

    // Update stat box highlight
    document.querySelectorAll('.stat[data-filter]').forEach(el => {
      el.classList.toggle('active-filter', el.dataset.filter === id);
    });

    // Show/hide sections
    document.querySelectorAll('.section[data-section]').forEach(el => {
      const show = id === 'all' || el.dataset.section === id;
      el.classList.toggle('filtered-out', !show);
    });

    // Scroll to the section if filtering to one
    if (id !== 'all') {
      const target = document.querySelector('.section[data-section="' + id + '"]');
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  }

  // Tab switching
  function switchTab(groupId, tabIndex) {
    document.querySelectorAll('[data-group="' + groupId + '"].tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === tabIndex);
    });
    document.querySelectorAll('[data-group="' + groupId + '"].tab-pane, [data-group="' + groupId + '"][data-pane]').forEach(pane => {
      const idx = parseInt(pane.dataset.pane || '-1');
      pane.classList.toggle('hidden', idx !== tabIndex);
    });
  }
</script>
</body></html>`;
}
// ─── Actions ──────────────────────────────────────────────────────────────────
async function mergeFiles(filePaths) {
    if (!filePaths?.length || filePaths.length < 2) {
        vscode.window.showWarningMessage('Select at least two files to merge.');
        return;
    }
    // Show what we're merging
    const names = filePaths.map(p => path.basename(p)).join(', ');
    const confirm = await vscode.window.showWarningMessage(`Merge ${filePaths.length} files into one?\n${names}`, { modal: true }, 'Merge', 'Cancel');
    if (confirm !== 'Merge') {
        return;
    }
    // Pick the output file name
    const outputName = await vscode.window.showInputBox({
        prompt: 'Output filename',
        value: path.basename(filePaths[0]),
    });
    if (!outputName?.trim()) {
        return;
    }
    // Pick destination
    const destPick = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Save merged file here',
    });
    if (!destPick?.[0]) {
        return;
    }
    try {
        // Read and concatenate all files with a separator
        let merged = `# Merged Document\n\n> Merged from: ${filePaths.map(p => path.basename(p)).join(', ')}\n> Date: ${new Date().toISOString().slice(0, 10)}\n\n---\n\n`;
        for (const filePath of filePaths) {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            const title = path.basename(filePath, '.md');
            merged += `## From: ${title}\n\n${content}\n\n---\n\n`;
        }
        const outputPath = path.join(destPick[0].fsPath, outputName.trim());
        fs.writeFileSync(outputPath, merged, 'utf8');
        (0, output_channel_1.log)(FEATURE, `Merged ${filePaths.length} files → ${outputPath}`);
        const openIt = await vscode.window.showInformationMessage(`Merged into ${outputName}. Open it?`, 'Open', 'No');
        if (openIt === 'Open') {
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);
        }
        // Offer to delete the source files
        const deleteSource = await vscode.window.showWarningMessage(`Delete the ${filePaths.length} source files now?`, { modal: true }, 'Delete Sources', 'Keep Sources');
        if (deleteSource === 'Delete Sources') {
            for (const fp of filePaths) {
                try {
                    fs.unlinkSync(fp);
                }
                catch (err) {
                    (0, output_channel_1.logError)(FEATURE, `Failed to delete ${fp}`, err);
                }
            }
            vscode.window.showInformationMessage('Source files deleted.');
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Merge failed', err);
        vscode.window.showErrorMessage(`Merge failed: ${err}`);
    }
}
async function moveToGlobal(filePath) {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const fileName = path.basename(filePath);
    const destPath = path.join(registry.globalDocsPath, fileName);
    if (fs.existsSync(destPath)) {
        const overwrite = await vscode.window.showWarningMessage(`${fileName} already exists in CieloVistaStandards. Overwrite?`, { modal: true }, 'Overwrite', 'Cancel');
        if (overwrite !== 'Overwrite') {
            return;
        }
    }
    const confirm = await vscode.window.showWarningMessage(`Move ${fileName} to CieloVistaStandards and delete the original?`, { modal: true }, 'Move', 'Cancel');
    if (confirm !== 'Move') {
        return;
    }
    try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
        (0, output_channel_1.log)(FEATURE, `Moved ${filePath} → ${destPath}`);
        vscode.window.showInformationMessage(`Moved to CieloVistaStandards: ${fileName}`);
        const open = await vscode.window.showInformationMessage('Open the moved file?', 'Open', 'No');
        if (open === 'Open') {
            const doc = await vscode.workspace.openTextDocument(destPath);
            await vscode.window.showTextDocument(doc);
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Move to global failed', err);
        vscode.window.showErrorMessage(`Move failed: ${err}`);
    }
}
async function deleteDoc(filePath) {
    const fileName = path.basename(filePath);
    const confirm = await vscode.window.showWarningMessage(`Permanently delete ${fileName}?\n${filePath}`, { modal: true }, 'Delete', 'Cancel');
    if (confirm !== 'Delete') {
        return;
    }
    try {
        fs.unlinkSync(filePath);
        (0, output_channel_1.log)(FEATURE, `Deleted: ${filePath}`);
        vscode.window.showInformationMessage(`Deleted: ${fileName}`);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Delete failed', err);
        vscode.window.showErrorMessage(`Delete failed: ${err}`);
    }
}
async function diffFiles(filePaths) {
    if (filePaths.length < 2) {
        return;
    }
    const [a, b] = filePaths;
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(a), vscode.Uri.file(b), `Diff: ${path.basename(a)} ↔ ${path.basename(b)}`);
}
// ─── Report saving ──────────────────────────────────────────────────────────────
/**
 * ACTION TAG FORMAT (embedded as HTML comments so the file stays valid Markdown):
 *   <!-- AUDIT-ACTION:merge:pathA::pathB -->
 *   <!-- AUDIT-ACTION:move-to-global:path -->
 *   <!-- AUDIT-ACTION:delete:path -->
 *   <!-- AUDIT-ACTION:diff:pathA::pathB -->
 *   <!-- AUDIT-ACTION:open:path -->
 *
 * actOnReport() parses these tags to build the action list.
 */
function saveAuditReport(results) {
    const reportDir = getReportDir();
    const reportPath = path.join(reportDir, reportFileName('full'));
    const now = new Date();
    const lines = [
        `# CieloVista Docs Audit Report`,
        ``,
        `> **Saved to:** ${reportPath}`,
        `> **Run from:** ${vscode.workspace.workspaceFolders?.[0]?.name ?? 'no workspace'}`,
        ``,
        `**Date:** ${now.toLocaleString()}`,
        `**Docs scanned:** ${results.totalDocsScanned}`,
        `**Projects scanned:** ${results.projectsScanned}`,
        ``,
        `---`,
        ``,
        `## Summary`,
        ``,
        `| Category | Count |`,
        `|---|---|`,
        `| Duplicate filenames | ${results.duplicates.length} |`,
        `| Similar content pairs | ${results.similar.length} |`,
        `| Move to global candidates | ${results.moveCandidates.length} |`,
        `| Orphaned docs | ${results.orphans.length} |`,
        ``,
        `---`,
        ``,
    ];
    if (results.duplicates.length) {
        lines.push(`## Duplicate Filenames`, ``);
        for (const g of results.duplicates) {
            const allPaths = g.files.map(f => f.filePath).join('::');
            lines.push(`### ${g.fileName}`, `<!-- AUDIT-ACTION:merge:${allPaths} -->`);
            for (const f of g.files) {
                lines.push(`- \`${f.filePath}\` (${f.projectName}, ${f.sizeBytes} bytes)`, `  <!-- AUDIT-ACTION:open:${f.filePath} -->`);
            }
            lines.push(``);
        }
    }
    if (results.similar.length) {
        lines.push(`## Similar Content Pairs`, ``);
        for (const g of results.similar) {
            lines.push(`### ${Math.round(g.similarity * 100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`, `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`, `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, `- Reason: ${g.reason}`, ``);
        }
    }
    if (results.moveCandidates.length) {
        lines.push(`## Should Move to Global Standards`, ``);
        for (const c of results.moveCandidates) {
            lines.push(`- \`${c.file.filePath}\``, `  <!-- AUDIT-ACTION:move-to-global:${c.file.filePath} -->`, `  - Reason: ${c.reason}`, ``);
        }
    }
    if (results.orphans.length) {
        lines.push(`## Orphaned Docs`, ``);
        for (const o of results.orphans) {
            lines.push(`- \`${o.file.filePath}\``, `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`, `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, `  - Reason: ${o.reason}`, ``);
        }
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    (0, output_channel_1.log)(FEATURE, `Report saved: ${reportPath}`);
    return reportPath;
}
/** Flattens all audit results into an ordered list of individual findings. */
function buildFindingsList(results) {
    const findings = [];
    for (const g of results.duplicates) {
        findings.push({
            kind: 'duplicate',
            title: `Duplicate: ${g.fileName}`,
            description: `${g.files.length} copies in: ${g.files.map(f => f.projectName).join(', ')}`,
            primaryPaths: g.files.map(f => f.filePath),
        });
    }
    for (const g of results.similar) {
        findings.push({
            kind: 'similar',
            title: `${Math.round(g.similarity * 100)}% similar: ${g.fileA.fileName} ↔ ${g.fileB.fileName}`,
            description: `${g.fileA.projectName} ↔ ${g.fileB.projectName}  ·  ${g.reason}`,
            primaryPaths: [g.fileA.filePath, g.fileB.filePath],
        });
    }
    for (const c of results.moveCandidates) {
        findings.push({
            kind: 'move',
            title: `Move to Global: ${c.file.fileName}`,
            description: `${c.file.projectName}  ·  ${c.reason}`,
            primaryPaths: [c.file.filePath],
            secondaryPath: c.file.filePath,
        });
    }
    for (const o of results.orphans) {
        findings.push({
            kind: 'orphan',
            title: `Orphan: ${o.file.fileName}`,
            description: `${o.file.projectName}  ·  ${o.reason}`,
            primaryPaths: [o.file.filePath],
            secondaryPath: o.file.filePath,
        });
    }
    return findings;
}
/** Returns the action choices available for a given finding kind. */
function actionsFor(kind) {
    switch (kind) {
        case 'duplicate':
            return [
                { label: '$(git-merge) Merge all copies into one', description: 'merge' },
                { label: '$(go-to-file) Open first copy', description: 'open' },
                { label: '$(arrow-right) Skip this finding', description: 'skip' },
                { label: '$(x) Stop walkthrough', description: 'stop' },
            ];
        case 'similar':
            return [
                { label: '$(diff) Diff the two files side by side', description: 'diff' },
                { label: '$(git-merge) Merge into one', description: 'merge' },
                { label: '$(arrow-right) Skip this finding', description: 'skip' },
                { label: '$(x) Stop walkthrough', description: 'stop' },
            ];
        case 'move':
            return [
                { label: '$(cloud-upload) Move to CieloVistaStandards', description: 'move' },
                { label: '$(go-to-file) Open file', description: 'open' },
                { label: '$(arrow-right) Skip this finding', description: 'skip' },
                { label: '$(x) Stop walkthrough', description: 'stop' },
            ];
        case 'orphan':
            return [
                { label: '$(go-to-file) Open to review', description: 'open' },
                { label: '$(trash) Delete this file', description: 'delete' },
                { label: '$(arrow-right) Skip this finding', description: 'skip' },
                { label: '$(x) Stop walkthrough', description: 'stop' },
            ];
    }
}
/**
 * Walks through every finding from an audit result one by one.
 * Shows a progress counter (Finding 3 of 12) and offers contextual
 * actions for each. User can skip, act, or stop at any point.
 */
async function walkThroughFindings(results) {
    const findings = buildFindingsList(results);
    if (!findings.length) {
        vscode.window.showInformationMessage('No findings to walk through.');
        return;
    }
    const total = findings.length;
    let actioned = 0;
    let skipped = 0;
    for (let i = 0; i < findings.length; i++) {
        const finding = findings[i];
        const counter = `(${i + 1} of ${total})`;
        const kindIcon = {
            duplicate: '📄',
            similar: '🔀',
            move: '📦',
            orphan: '👻',
        };
        const choice = await vscode.window.showQuickPick(actionsFor(finding.kind), {
            title: `${counter}  ${kindIcon[finding.kind]}  ${finding.title}`,
            placeHolder: finding.description,
            ignoreFocusOut: true, // don't close when user clicks editor
        });
        // Dismissed with Escape — treat as stop
        if (!choice) {
            break;
        }
        const action = choice.description;
        if (action === 'stop') {
            break;
        }
        if (action === 'skip') {
            skipped++;
            continue;
        }
        // Execute the chosen action
        switch (action) {
            case 'merge':
                await mergeFiles(finding.primaryPaths);
                actioned++;
                break;
            case 'diff':
                await diffFiles(finding.primaryPaths);
                // Don't count diff as actioned — user may still want to merge after
                break;
            case 'move':
                if (finding.secondaryPath) {
                    await moveToGlobal(finding.secondaryPath);
                    actioned++;
                }
                break;
            case 'open':
                const openPath = finding.secondaryPath ?? finding.primaryPaths[0];
                if (openPath && fs.existsSync(openPath)) {
                    const doc = await vscode.workspace.openTextDocument(openPath);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'delete':
                if (finding.secondaryPath) {
                    await deleteDoc(finding.secondaryPath);
                    actioned++;
                }
                break;
        }
    }
    vscode.window.showInformationMessage(`Walkthrough complete — ${actioned} actions taken, ${skipped} skipped, ${total - actioned - skipped} remaining.`);
    (0, output_channel_1.log)(FEATURE, `Walkthrough finished: ${actioned} actioned, ${skipped} skipped of ${total} findings`);
}
// ─── Main audit command ───────────────────────────────────────────────────────
let _panel;
async function runFullAudit() {
    const results = await runAudit();
    if (!results) {
        return;
    }
    const html = buildAuditHtml(results);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('docAudit', '📋 Docs Audit', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'open':
                if (msg.data && fs.existsSync(msg.data)) {
                    const doc = await vscode.workspace.openTextDocument(msg.data);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            case 'merge':
                await mergeFiles(Array.isArray(msg.data) ? msg.data : [msg.data]);
                break;
            case 'moveToGlobal':
                await moveToGlobal(msg.data);
                break;
            case 'delete':
                await deleteDoc(msg.data);
                break;
            case 'diff':
                await diffFiles(Array.isArray(msg.data) ? msg.data : [msg.data]);
                break;
            case 'walkGroup':
                // Walk through a group of paths one at a time via open-in-editor
                const paths = Array.isArray(msg.data) ? msg.data : [msg.data];
                for (const fp of paths) {
                    if (fs.existsSync(fp)) {
                        const d = await vscode.workspace.openTextDocument(fp);
                        await vscode.window.showTextDocument(d, vscode.ViewColumn.Beside);
                        const next = await vscode.window.showInformationMessage(`Reviewing: ${path.basename(fp)}`, 'Next', 'Stop');
                        if (next !== 'Next') {
                            break;
                        }
                    }
                }
                break;
        }
    });
    // Save report to disk then offer walkthrough
    try {
        const reportPath = saveAuditReport(results);
        const total = results.duplicates.length + results.similar.length +
            results.moveCandidates.length + results.orphans.length;
        if (total === 0) {
            vscode.window.showInformationMessage('Audit complete — no issues found. ✅');
        }
        else {
            const choice = await vscode.window.showInformationMessage(`Audit found ${total} issue(s). Walk through them now?`, 'Walk Through Now', 'Open Report', 'Later');
            if (choice === 'Walk Through Now') {
                await walkThroughFindings(results);
            }
            else if (choice === 'Open Report') {
                const doc = await vscode.workspace.openTextDocument(reportPath);
                await vscode.window.showTextDocument(doc);
            }
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save report', err);
    }
    (0, output_channel_1.log)(FEATURE, `Audit complete — ${results.totalDocsScanned} docs, ${results.duplicates.length} dupes, ${results.similar.length} similar, ${results.moveCandidates.length} move candidates, ${results.orphans.length} orphans`);
}
/** Browse and open a past audit report from the current project's docs folder. */
async function openPastReport() {
    const reportDir = getReportDir();
    const files = fs.readdirSync(reportDir)
        .filter(f => /^audit-.+\.md$/i.test(f))
        .sort()
        .reverse(); // newest first
    if (!files.length) {
        vscode.window.showInformationMessage('No audit reports found in this project\'s docs/ folder. Run an audit first.');
        return;
    }
    const now = Date.now();
    const picked = await vscode.window.showQuickPick(files.map(f => {
        // Extract date from filename: audit-<type>-YYYY-MM-DD.md
        const m = f.match(/(\d{4}-\d{2}-\d{2})/);
        let isOld = false;
        if (m) {
            const dt = new Date(m[1]);
            isOld = (now - dt.getTime()) > 1000 * 60 * 60 * 24 * 30;
        }
        return {
            label: `${isOld ? '🗑️ ' : ''}$(file) ${f}${isOld ? '  (Marked for Deletion)' : ''}`,
            description: path.join(reportDir, f),
            filePath: path.join(reportDir, f),
        };
    }), { placeHolder: `${files.length} audit reports found — select one to open` });
    if (!picked) {
        return;
    }
    const doc = await vscode.workspace.openTextDocument(picked.filePath);
    await vscode.window.showTextDocument(doc);
}
/** Parses all AUDIT-ACTION tags out of a saved report file. */
function parseReportActions(reportContent) {
    const actions = [];
    const lines = reportContent.split('\n');
    const tagRe = /<!--\s*AUDIT-ACTION:(\w[\w-]*):(.*?)\s*-->/;
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(tagRe);
        if (!match) {
            continue;
        }
        const kind = match[1];
        const raw = match[2].trim();
        const paths = raw.split('::').map(p => p.trim()).filter(Boolean);
        if (!paths.length) {
            continue;
        }
        // Use the nearest non-tag line above as context label
        let context = '';
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
            const ln = lines[j].replace(/<!--.*?-->/g, '').trim();
            if (ln) {
                context = ln.replace(/^#+\s*/, '').slice(0, 80);
                break;
            }
        }
        const kindLabels = {
            'merge': 'Merge',
            'diff': 'Diff',
            'move-to-global': 'Move to Global',
            'delete': 'Delete',
            'open': 'Open',
        };
        actions.push({
            label: `${kindLabels[kind] ?? kind}: ${paths.map(p => path.basename(p)).join(' ↔ ')}`,
            kind,
            paths,
            context,
        });
    }
    return actions;
}
/**
 * Pick a saved audit report, parse its action tags, show a quick-pick
 * of every actionable item, and execute the chosen action.
 */
async function actOnReport() {
    const reportDir = getReportDir();
    const files = fs.readdirSync(reportDir)
        .filter(f => /^audit-.+\.md$/i.test(f))
        .sort()
        .reverse();
    if (!files.length) {
        vscode.window.showInformationMessage('No audit reports found. Run an audit first.');
        return;
    }
    // Step 1 — pick report
    const now = Date.now();
    const reportPick = await vscode.window.showQuickPick(files.map(f => {
        // Extract date from filename: audit-<type>-YYYY-MM-DD.md
        const m = f.match(/(\d{4}-\d{2}-\d{2})/);
        let isOld = false;
        if (m) {
            const dt = new Date(m[1]);
            isOld = (now - dt.getTime()) > 1000 * 60 * 60 * 24 * 30;
        }
        return {
            label: `${isOld ? '🗑️ ' : ''}$(file) ${f}${isOld ? '  (Marked for Deletion)' : ''}`,
            description: path.join(reportDir, f),
            filePath: path.join(reportDir, f),
        };
    }), { placeHolder: 'Select an audit report to act on' });
    if (!reportPick) {
        return;
    }
    // Step 2 — parse actions
    let content;
    try {
        content = fs.readFileSync(reportPick.filePath, 'utf8');
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Could not read report', err);
        vscode.window.showErrorMessage(`Could not read report: ${err}`);
        return;
    }
    const actions = parseReportActions(content);
    if (!actions.length) {
        vscode.window.showInformationMessage('No actionable items found in this report.');
        return;
    }
    // Step 3 — pick action
    const actionPick = await vscode.window.showQuickPick(actions.map(a => ({
        label: `$(${a.kind === 'delete' ? 'trash' : a.kind === 'diff' ? 'diff' : a.kind === 'merge' ? 'git-merge' : a.kind === 'open' ? 'go-to-file' : 'arrow-right'}) ${a.label}`,
        description: a.context,
        detail: a.paths.join('  →  '),
        action: a,
    })), {
        placeHolder: `${actions.length} actions available in ${path.basename(reportPick.filePath)}`,
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!actionPick) {
        return;
    }
    // Step 4 — execute
    const { kind, paths } = actionPick.action;
    (0, output_channel_1.log)(FEATURE, `Acting on report: ${kind} — ${paths.join(', ')}`);
    switch (kind) {
        case 'open':
            if (fs.existsSync(paths[0])) {
                const doc = await vscode.workspace.openTextDocument(paths[0]);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
            else {
                vscode.window.showWarningMessage(`File no longer exists: ${paths[0]}`);
            }
            break;
        case 'diff':
            await diffFiles(paths);
            break;
        case 'merge':
            await mergeFiles(paths);
            break;
        case 'move-to-global':
            await moveToGlobal(paths[0]);
            break;
        case 'delete':
            await deleteDoc(paths[0]);
            break;
    }
}
// ─── Quick scan commands ──────────────────────────────────────────────────────
async function quickFindDuplicates() {
    const results = await runAudit();
    if (!results) {
        return;
    }
    if (!results.duplicates.length) {
        vscode.window.showInformationMessage('No duplicate filenames found.');
        return;
    }
    // Save focused report
    try {
        const reportDir = getReportDir();
        const reportPath = path.join(reportDir, reportFileName('duplicates'));
        const lines = [
            `# Duplicate Filenames Audit`,
            ``,
            `> **Date:** ${new Date().toLocaleString()}`,
            `> **Workspace:** ${vscode.workspace.workspaceFolders?.[0]?.name ?? 'none'}`,
            ``,
            `---`,
            ``,
        ];
        for (const g of results.duplicates) {
            const allPaths = g.files.map(f => f.filePath).join('::');
            lines.push(`## ${g.fileName}`, `<!-- AUDIT-ACTION:merge:${allPaths} -->`);
            for (const f of g.files) {
                lines.push(`- \`${f.filePath}\` (${f.projectName}, ${f.sizeBytes} bytes)`, `  <!-- AUDIT-ACTION:open:${f.filePath} -->`);
            }
            lines.push(``);
        }
        fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.duplicates.length} duplicates. Report saved to docs/${path.basename(reportPath)}`, 'Act on Report')
            .then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save duplicates report', err);
    }
    const items = results.duplicates.map(g => ({
        label: `$(copy) ${g.fileName}`,
        description: `${g.files.length} copies`,
        detail: g.files.map(f => `${f.projectName}/${f.fileName}`).join('  |  '),
    }));
    await vscode.window.showQuickPick(items, {
        placeHolder: `${results.duplicates.length} duplicate filenames found`,
        matchOnDescription: true,
    });
}
async function quickFindSimilar() {
    const results = await runAudit();
    if (!results) {
        return;
    }
    if (!results.similar.length) {
        vscode.window.showInformationMessage('No near-duplicate content found.');
        return;
    }
    try {
        const reportDir = getReportDir();
        const reportPath = path.join(reportDir, reportFileName('similar'));
        const lines = [
            `# Similar Content Audit`,
            ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``,
        ];
        for (const g of results.similar) {
            lines.push(`## ${Math.round(g.similarity * 100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`, `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`, `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, `- Reason: ${g.reason}`, ``);
        }
        fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.similar.length} similar pairs. Report saved to docs/${path.basename(reportPath)}`, 'Act on Report')
            .then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save similar report', err);
    }
    const items = results.similar.map(g => ({
        label: `$(git-compare) ${Math.round(g.similarity * 100)}% similar`,
        description: `${g.fileA.projectName}/${g.fileA.fileName}  ↔  ${g.fileB.projectName}/${g.fileB.fileName}`,
        detail: g.reason,
        data: g,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${results.similar.length} similar content pairs found`,
        matchOnDescription: true,
    });
    if (picked) {
        await diffFiles([picked.data.fileA.filePath, picked.data.fileB.filePath]);
    }
}
async function quickFindOrphans() {
    const results = await runAudit();
    if (!results) {
        return;
    }
    if (!results.orphans.length) {
        vscode.window.showInformationMessage('No orphaned docs found.');
        return;
    }
    try {
        const reportDir = getReportDir();
        const reportPath = path.join(reportDir, reportFileName('orphans'));
        const lines = [
            `# Orphaned Docs Audit`,
            ``, `> **Date:** ${new Date().toLocaleString()}`, ``, `---`, ``,
        ];
        for (const o of results.orphans) {
            lines.push(`- \`${o.file.filePath}\``, `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`, `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, `  - Reason: ${o.reason}`, ``);
        }
        fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
        vscode.window.showInformationMessage(`Found ${results.orphans.length} orphans. Report saved to docs/${path.basename(reportPath)}`, 'Act on Report')
            .then(c => { if (c === 'Act on Report') {
            actOnReport();
        } });
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to save orphans report', err);
    }
    const items = results.orphans.map(o => ({
        label: `$(warning) ${o.file.projectName}/${o.file.fileName}`,
        description: o.reason,
        detail: o.file.filePath,
        data: o,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `${results.orphans.length} orphaned docs found`,
        matchOnDescription: true,
    });
    if (picked) {
        const doc = await vscode.workspace.openTextDocument(picked.data.file.filePath);
        await vscode.window.showTextDocument(doc);
    }
}
async function interactiveMerge() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    // Build flat list of all docs for user to pick from
    const all = collectDocs(registry.globalDocsPath, 'global');
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) {
            all.push(...collectDocs(p.path, p.name));
        }
    }
    const items = all.map(f => ({
        label: `$(markdown) ${f.fileName}`,
        description: f.projectName,
        detail: f.filePath,
        picked: false,
        data: f,
    }));
    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select 2 or more docs to merge',
        matchOnDescription: true,
    });
    if (!selected || selected.length < 2) {
        vscode.window.showWarningMessage('Select at least 2 docs to merge.');
        return;
    }
    await mergeFiles(selected.map(s => s.data.filePath));
}
async function interactiveMoveToGlobal() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const all = [];
    for (const p of registry.projects) {
        if (fs.existsSync(p.path)) {
            all.push(...collectDocs(p.path, p.name));
        }
    }
    const items = all.map(f => ({
        label: `$(markdown) ${f.fileName}`,
        description: f.projectName,
        detail: f.filePath,
        data: f,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a project doc to move to CieloVistaStandards',
        matchOnDescription: true,
    });
    if (!picked) {
        return;
    }
    await moveToGlobal(picked.data.filePath);
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.audit.docs', runFullAudit), vscode.commands.registerCommand('cvs.audit.findDuplicates', quickFindDuplicates), vscode.commands.registerCommand('cvs.audit.findSimilar', quickFindSimilar), vscode.commands.registerCommand('cvs.audit.findOrphans', quickFindOrphans), vscode.commands.registerCommand('cvs.audit.mergeFiles', interactiveMerge), vscode.commands.registerCommand('cvs.audit.moveToGlobal', interactiveMoveToGlobal), vscode.commands.registerCommand('cvs.audit.openReport', openPastReport), vscode.commands.registerCommand('cvs.audit.actOnReport', actOnReport), vscode.commands.registerCommand('cvs.audit.walkthrough', async () => {
        const results = await runAudit();
        if (results) {
            await walkThroughFindings(results);
        }
    }));
}
function deactivate() {
    _panel?.dispose();
    _panel = undefined;
}
// Note: overwriteWithStandard messages are handled inside _panel.webview.onDidReceiveMessage
//# sourceMappingURL=doc-auditor.js.map