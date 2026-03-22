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
 * marketplace-compliance.ts
 *
 * Inspects every registered CieloVista project for marketplace readiness.
 * Checks and auto-creates four required files:
 *
 *   1. package.json  — inspects for: name, description, version, publisher,
 *                      license, icon, categories, keywords, repository
 *   2. README.md     — exists and non-empty?
 *   3. CHANGELOG.md  — exists? auto-creates standard template if missing
 *   4. LICENSE       — exists? auto-creates CieloVista copyright if missing
 *   5. icon.png      — exists? auto-generates a blue star PNG if missing
 *
 * The blue star PNG is generated programmatically using only Node.js built-ins
 * (zlib for deflate compression) — no npm packages required.
 *
 * Commands registered:
 *   cvs.marketplace.scan    — scan all projects and show compliance panel
 *   cvs.marketplace.fixAll  — auto-fix all fixable issues across all projects
 *   cvs.marketplace.fixOne  — pick a project and fix its issues
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib = __importStar(require("zlib"));
const output_channel_1 = require("../shared/output-channel");
const webview_utils_1 = require("../shared/webview-utils");
const FEATURE = 'marketplace-compliance';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const CURRENT_YEAR = new Date().getFullYear();
// ─── Registry ─────────────────────────────────────────────────────────────────
function loadRegistry() {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) {
            vscode.window.showErrorMessage(`Registry not found: ${REGISTRY_PATH}`);
            return undefined;
        }
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Failed to load registry', err);
        return undefined;
    }
}
// ─── Blue star PNG generator ──────────────────────────────────────────────────
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (const byte of buf) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}
/**
 * Returns true if (x,y) — relative to star centre — is inside a 5-pointed star.
 * Uses polar coordinates with alternating outer/inner radius interpolation.
 */
function isInStar(x, y, outerR, innerR) {
    const dist = Math.sqrt(x * x + y * y);
    if (dist > outerR) {
        return false;
    }
    const POINTS = 5;
    const sector = (2 * Math.PI) / POINTS;
    // Rotate so a tip points upward
    let angle = Math.atan2(y, x) + Math.PI / 2;
    angle = ((angle % sector) + sector) % sector;
    const half = sector / 2;
    // t=0 at tip (outer), t=1 at valley (inner)
    const t = Math.abs(angle - half) / half;
    const r = innerR + (outerR - innerR) * t;
    return dist <= r;
}
/**
 * Generates a 128×128 RGBA PNG with a blue star on a transparent background.
 * Uses only Node.js built-ins — no npm packages.
 */
function createBlueStarPng() {
    const SIZE = 128;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const outerR = SIZE * 0.44;
    const innerR = SIZE * 0.18;
    // Build raw RGBA pixel data
    const rowBytes = SIZE * 4;
    const rawRows = [];
    for (let y = 0; y < SIZE; y++) {
        const row = Buffer.alloc(1 + rowBytes);
        row[0] = 0; // PNG filter: None
        for (let x = 0; x < SIZE; x++) {
            const off = 1 + x * 4;
            if (isInStar(x - cx, y - cy, outerR, innerR)) {
                row[off] = 30; // R
                row[off + 1] = 120; // G
                row[off + 2] = 255; // B — bright blue
                row[off + 3] = 255; // A — fully opaque
            }
            else {
                row[off] = 0;
                row[off + 1] = 0;
                row[off + 2] = 0;
                row[off + 3] = 0; // transparent
            }
        }
        rawRows.push(row);
    }
    const rawData = Buffer.concat(rawRows);
    const compressed = zlib.deflateSync(rawData, { level: 6 });
    // IHDR — width, height, 8-bit depth, RGBA color type (6)
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    ihdr[10] = 0; // compression method
    ihdr[11] = 0; // filter method
    ihdr[12] = 0; // interlace method
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    return Buffer.concat([
        sig,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}
// ─── File content generators ──────────────────────────────────────────────────
function licenseContent(projectName) {
    return `PROPRIETARY SOFTWARE LICENSE

Copyright (c) ${CURRENT_YEAR} CieloVista Software. All rights reserved.

This software and its source code are the exclusive property of CieloVista Software.
No part of this software may be copied, modified, distributed, sublicensed, sold,
or otherwise transferred without the prior written permission of CieloVista Software.

THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL
CIELOVISTA SOFTWARE BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING
FROM THE USE OF THIS SOFTWARE.

For licensing inquiries contact: licensing@cielovistasoftware.com

Project: ${projectName}
`;
}
function changelogContent(projectName, version) {
    const today = new Date().toISOString().slice(0, 10);
    return `# Changelog — ${projectName}

All notable changes to this project are documented here.

## [${version}] — ${today}

### Added
- Initial release

### Changed
- N/A

### Fixed
- N/A

---
*Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*
`;
}
// ─── Compliance checker ───────────────────────────────────────────────────────
function checkProject(project) {
    const issues = [];
    let pkg = null;
    if (!fs.existsSync(project.path)) {
        return { project, issues: [{ severity: 'error', file: 'folder', message: 'Project folder not found', fixable: false, fixKey: '' }], score: 0, packageJson: null };
    }
    // ── package.json ──────────────────────────────────────────────────────────
    const pkgPath = path.join(project.path, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        issues.push({ severity: 'warning', file: 'package.json', message: 'No package.json found', fixable: false, fixKey: '' });
    }
    else {
        try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const required = [
                { key: 'name', label: '"name"' },
                { key: 'description', label: '"description"' },
                { key: 'version', label: '"version"' },
                { key: 'license', label: '"license"' },
            ];
            for (const r of required) {
                if (!pkg[r.key] || pkg[r.key].trim() === '') {
                    issues.push({
                        severity: 'error',
                        file: 'package.json',
                        message: `Missing or empty field: ${r.label}`,
                        fixable: r.key === 'license',
                        fixKey: `pkg:${r.key}`,
                    });
                }
            }
            // Flag open-source licenses on proprietary projects
            const openSourceLicenses = ['MIT', 'ISC', 'Apache-2.0', 'GPL-2.0', 'GPL-3.0', 'BSD-2-Clause', 'BSD-3-Clause'];
            const currentLicense = (pkg['license'] ?? '').trim();
            if (openSourceLicenses.includes(currentLicense)) {
                issues.push({
                    severity: 'error',
                    file: 'package.json',
                    message: `License is "${currentLicense}" — CieloVista projects must use PROPRIETARY`,
                    fixable: true,
                    fixKey: 'pkg:license',
                });
            }
            // icon field
            if (!pkg['icon']) {
                issues.push({ severity: 'warning', file: 'package.json', message: 'Missing "icon" field (should be "icon.png")', fixable: true, fixKey: 'pkg:icon' });
            }
            else if (pkg['icon'] !== 'icon.png') {
                issues.push({ severity: 'info', file: 'package.json', message: `"icon" is "${pkg['icon']}" — recommended: "icon.png"`, fixable: false, fixKey: '' });
            }
            // VS Code extension specific
            if (project.type === 'vscode-extension') {
                if (!pkg['publisher']) {
                    issues.push({ severity: 'error', file: 'package.json', message: 'Missing "publisher" (required for marketplace)', fixable: true, fixKey: 'pkg:publisher' });
                }
                if (!Array.isArray(pkg['categories']) || pkg['categories'].length === 0) {
                    issues.push({ severity: 'warning', file: 'package.json', message: 'Missing or empty "categories"', fixable: false, fixKey: '' });
                }
                if (!Array.isArray(pkg['keywords']) || pkg['keywords'].length === 0) {
                    issues.push({ severity: 'info', file: 'package.json', message: 'No "keywords" — add some to improve discoverability', fixable: false, fixKey: '' });
                }
            }
            // repository
            if (!pkg['repository']) {
                issues.push({ severity: 'info', file: 'package.json', message: 'No "repository" field', fixable: false, fixKey: '' });
            }
        }
        catch (err) {
            issues.push({ severity: 'error', file: 'package.json', message: `Invalid JSON: ${err}`, fixable: false, fixKey: '' });
        }
    }
    // ── README.md ─────────────────────────────────────────────────────────────
    const readmePath = path.join(project.path, 'README.md');
    if (!fs.existsSync(readmePath)) {
        issues.push({ severity: 'error', file: 'README.md', message: 'Missing README.md', fixable: false, fixKey: '' });
    }
    else {
        const size = fs.statSync(readmePath).size;
        if (size < 100) {
            issues.push({ severity: 'warning', file: 'README.md', message: 'README.md exists but is nearly empty', fixable: false, fixKey: '' });
        }
    }
    // ── CHANGELOG.md ──────────────────────────────────────────────────────────
    const changelogPath = path.join(project.path, 'CHANGELOG.md');
    if (!fs.existsSync(changelogPath)) {
        issues.push({ severity: 'warning', file: 'CHANGELOG.md', message: 'Missing CHANGELOG.md', fixable: true, fixKey: 'create:changelog' });
    }
    // ── LICENSE ───────────────────────────────────────────────────────────────
    const licensePath = path.join(project.path, 'LICENSE');
    const licenseTxt = path.join(project.path, 'LICENSE.txt');
    if (!fs.existsSync(licensePath) && !fs.existsSync(licenseTxt)) {
        issues.push({ severity: 'error', file: 'LICENSE', message: 'Missing LICENSE file', fixable: true, fixKey: 'create:license' });
    }
    // ── icon.png ──────────────────────────────────────────────────────────────
    const iconPath = path.join(project.path, 'icon.png');
    if (!fs.existsSync(iconPath)) {
        issues.push({ severity: 'warning', file: 'icon.png', message: 'Missing icon.png', fixable: true, fixKey: 'create:icon' });
    }
    // ── Score ─────────────────────────────────────────────────────────────────
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - (errors * 20) - (warnings * 8));
    return { project, issues, score, packageJson: pkg };
}
// ─── Auto-fixer ───────────────────────────────────────────────────────────────
function fixProject(compliance) {
    const fixed = [];
    const { project, issues, packageJson } = compliance;
    let pkg = packageJson ? { ...packageJson } : null;
    for (const issue of issues) {
        if (!issue.fixable) {
            continue;
        }
        try {
            if (issue.fixKey === 'create:license') {
                const dest = path.join(project.path, 'LICENSE');
                fs.writeFileSync(dest, licenseContent(project.name), 'utf8');
                fixed.push('LICENSE');
            }
            if (issue.fixKey === 'create:changelog') {
                const version = pkg?.['version'] ?? '1.0.0';
                const dest = path.join(project.path, 'CHANGELOG.md');
                fs.writeFileSync(dest, changelogContent(project.name, version), 'utf8');
                fixed.push('CHANGELOG.md');
            }
            if (issue.fixKey === 'create:icon') {
                const dest = path.join(project.path, 'icon.png');
                fs.writeFileSync(dest, createBlueStarPng());
                fixed.push('icon.png');
                // Also update pkg icon field
                if (pkg) {
                    pkg['icon'] = 'icon.png';
                }
            }
            if (issue.fixKey === 'pkg:license' && pkg) {
                pkg['license'] = 'PROPRIETARY';
            }
            if (issue.fixKey === 'pkg:icon' && pkg) {
                pkg['icon'] = 'icon.png';
            }
            if (issue.fixKey === 'pkg:publisher' && pkg) {
                pkg['publisher'] = 'CieloVistaSoftware';
            }
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Fix failed for ${issue.fixKey} in ${project.name}`, err);
        }
    }
    // Write updated package.json if changed
    if (pkg && packageJson) {
        const pkgPath = path.join(project.path, 'package.json');
        try {
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
            if (JSON.stringify(pkg) !== JSON.stringify(packageJson)) {
                fixed.push('package.json');
            }
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Failed to write package.json for ${project.name}`, err);
        }
    }
    return fixed;
}
// ─── HTML builder ─────────────────────────────────────────────────────────────
function scoreColor(score) {
    if (score >= 80) {
        return 'var(--vscode-testing-iconPassed)';
    }
    if (score >= 50) {
        return 'var(--vscode-inputValidation-warningForeground)';
    }
    return 'var(--vscode-inputValidation-errorForeground)';
}
function buildHtml(results) {
    const perfect = results.filter(r => r.score === 100).length;
    const total = results.length;
    const fixable = results.filter(r => r.issues.some(i => i.fixable)).length;
    const rows = results.map(r => {
        const issueHtml = r.issues.length === 0
            ? '<span style="color:var(--vscode-testing-iconPassed)">✅ All good</span>'
            : r.issues.map(i => {
                const icon = i.severity === 'error' ? '🔴' : i.severity === 'warning' ? '🟡' : 'ℹ️';
                const fixBtn = i.fixable
                    ? `<button class="fix-btn" data-action="fix-one" data-proj="${(0, webview_utils_1.esc)(r.project.name)}">Fix</button>`
                    : '';
                return `<div class="issue">${icon} <span class="issue-file">${(0, webview_utils_1.esc)(i.file)}</span> — ${(0, webview_utils_1.esc)(i.message)} ${fixBtn}</div>`;
            }).join('');
        const hasFixable = r.issues.some(i => i.fixable);
        return `<tr data-proj="${(0, webview_utils_1.esc)(r.project.name)}">
  <td><button class="open-btn" data-action="open-folder" data-proj="${(0, webview_utils_1.esc)(r.project.name)}" data-path="${(0, webview_utils_1.esc)(r.project.path)}">${(0, webview_utils_1.esc)(r.project.name)}</button></td>
  <td><span class="type-badge">${(0, webview_utils_1.esc)(r.project.type)}</span></td>
  <td><span style="font-weight:700;color:${scoreColor(r.score)}">${r.score}</span></td>
  <td class="issues-col">${issueHtml}</td>
  <td>
    ${hasFixable ? `<button class="btn-primary" data-action="fix-one" data-proj="${(0, webview_utils_1.esc)(r.project.name)}">🔧 Fix</button>` : ''}
    <button class="btn-secondary" data-action="open-folder" data-path="${(0, webview_utils_1.esc)(r.project.path)}">📂 Open</button>
  </td>
</tr>`;
    }).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:0}
#toolbar{position:sticky;top:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:10}
#toolbar h1{font-size:1.1em;font-weight:700}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.pill-ok{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed)}
.pill-fix{color:var(--vscode-inputValidation-warningForeground);border-color:var(--vscode-inputValidation-warningForeground)}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600}
.btn-primary:hover{background:var(--vscode-button-hoverBackground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px}
.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
#content{padding:12px 16px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);font-weight:600;white-space:nowrap}
td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.type-badge{font-size:10px;padding:1px 6px;border-radius:3px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.issues-col{max-width:380px}
.issue{font-size:11px;line-height:1.6;display:flex;gap:4px;align-items:flex-start;flex-wrap:wrap}
.issue-file{font-family:var(--vscode-editor-font-family);font-weight:600;color:var(--vscode-textLink-foreground)}
.open-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:12px;font-weight:600;padding:0;text-decoration:underline}
.fix-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:1px 7px;border-radius:2px;cursor:pointer;font-size:10px;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
#status{padding:8px 16px;font-size:12px;display:none;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textCodeBlock-background);margin:8px 16px;border-radius:2px}
#status.visible{display:block}
</style>
</head><body>
<div id="toolbar">
  <h1>🛒 Marketplace Compliance</h1>
  <div class="pills">
    <span class="pill pill-ok">✅ ${perfect} of ${total} perfect</span>
    <span class="pill pill-fix">🔧 ${fixable} have auto-fixes</span>
  </div>
  <button class="btn-primary" data-action="fix-all">🔧 Fix All Auto-Fixable</button>
  <button class="btn-secondary" data-action="rescan">↺ Rescan</button>
</div>
<div id="status"></div>
<div id="content">
<table>
  <thead><tr><th>Project</th><th>Type</th><th>Score</th><th>Issues</th><th>Actions</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<script>
const vscode = acquireVsCodeApi();

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  const action = btn.dataset.action;

  if (action === 'fix-all') {
    setStatus('🔧 Fixing all auto-fixable issues…');
    vscode.postMessage({ command: 'fixAll' });
  }
  if (action === 'fix-one') {
    const proj = btn.dataset.proj;
    setStatus('🔧 Fixing ' + proj + '…');
    vscode.postMessage({ command: 'fixOne', project: proj });
  }
  if (action === 'open-folder') {
    vscode.postMessage({ command: 'openFolder', path: btn.dataset.path });
  }
  if (action === 'rescan') {
    setStatus('↺ Rescanning…');
    vscode.postMessage({ command: 'rescan' });
  }
});

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'status') { setStatus(msg.text); }
  if (msg.type === 'done')   { setStatus('✅ ' + msg.text); }
});

function setStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'visible';
}
</script>
</body></html>`;
}
// ─── Fix summary ────────────────────────────────────────────────────────────────
function showFixSummary(lines, totalFiles, totalProjects) {
    if (!lines.length) {
        vscode.window.showInformationMessage('No files were changed.');
        return;
    }
    const ICONS = {
        'LICENSE': '📄',
        'CHANGELOG.md': '📝',
        'icon.png': '🎨',
        'package.json': '📦',
    };
    const rows = lines.map(line => {
        const [proj, ...rest] = line.split(': ');
        const files = rest.join(': ').split(', ');
        const fileHtml = files.map(f => {
            const icon = ICONS[f.trim()] ?? '✅';
            return `<span class="file-badge">${icon} ${f.trim()}</span>`;
        }).join('');
        return `<tr><td class="proj-cell">${(0, webview_utils_1.esc)(proj)}</td><td>${fileHtml}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:20px}
h1{font-size:1.15em;font-weight:700;margin-bottom:6px}
.subtitle{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:600;font-size:12px}
td{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
.proj-cell{font-weight:700;font-size:12px;white-space:nowrap;width:160px}
.file-badge{display:inline-flex;align-items:center;gap:4px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:2px 8px;font-size:11px;margin:2px 3px 2px 0;font-family:var(--vscode-editor-font-family)}
.summary-bar{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.sum-pill{padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
</style>
</head><body>
<h1>✅ Marketplace Fix Complete</h1>
<p class="subtitle">Auto-fix run completed ${new Date().toLocaleTimeString()}</p>
<div class="summary-bar">
  <span class="sum-pill">${totalFiles} file(s) created/updated</span>
  <span class="sum-pill">${totalProjects} project(s) fixed</span>
</div>
<table>
  <thead><tr><th>Project</th><th>Files Created / Updated</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
    const summaryPanel = vscode.window.createWebviewPanel('marketplaceSummary', '✅ Fix Summary', vscode.ViewColumn.Beside, { enableScripts: false });
    summaryPanel.webview.html = html;
}
// ─── Commands ─────────────────────────────────────────────────────────────────
let _panel;
let _lastResults = [];
async function runScan() {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const results = registry.projects
        .filter(p => fs.existsSync(p.path))
        .map(p => checkProject(p));
    _lastResults = results;
    const html = buildHtml(results);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('marketplaceCompliance', '🛒 Marketplace Compliance', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'fixAll':
                await fixAll();
                break;
            case 'fixOne':
                await fixOneByName(msg.project);
                break;
            case 'openFolder':
                if (msg.path && fs.existsSync(msg.path)) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: false });
                }
                break;
            case 'rescan':
                await runScan();
                break;
        }
    });
    const issues = results.reduce((n, r) => n + r.issues.length, 0);
    if (issues === 0) {
        vscode.window.showInformationMessage('All projects are marketplace-compliant. ✅');
    }
    else {
        const fixable = results.filter(r => r.issues.some(i => i.fixable)).length;
        vscode.window.showInformationMessage(`${issues} issue(s) found across ${results.length} projects — ${fixable} have auto-fixes.`, 'Fix All').then(c => { if (c === 'Fix All') {
            fixAll();
        } });
    }
    (0, output_channel_1.log)(FEATURE, `Scan complete — ${results.length} projects, ${issues} issues`);
}
async function fixAll() {
    const toFix = _lastResults.filter(r => r.issues.some(i => i.fixable));
    if (!toFix.length) {
        vscode.window.showInformationMessage('Nothing to auto-fix.');
        return;
    }
    const summaryLines = [];
    let totalFixed = 0;
    for (const result of toFix) {
        const fixed = fixProject(result);
        if (fixed.length) {
            totalFixed += fixed.length;
            summaryLines.push(`${result.project.name}: ${fixed.join(', ')}`);
            (0, output_channel_1.log)(FEATURE, `Fixed in ${result.project.name}: ${fixed.join(', ')}`);
        }
    }
    showFixSummary(summaryLines, totalFixed, toFix.length);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${totalFixed} file(s) across ${toFix.length} project(s). See summary panel.` });
    // Rescan first so panel is updated
    await runScan();
    // Offer to open fixed folders in new windows AFTER rescan is done
    if (toFix.length > 0) {
        const action = await vscode.window.showInformationMessage(`Fixed ${totalFixed} file(s) across ${toFix.length} project(s). Open fixed folders in new windows?`, 'Open All', 'Skip');
        if (action === 'Open All') {
            for (const result of toFix) {
                if (fs.existsSync(result.project.path)) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.project.path), { forceNewWindow: true });
                }
            }
        }
    }
}
async function fixOneByName(projectName) {
    const result = _lastResults.find(r => r.project.name === projectName);
    if (!result) {
        return;
    }
    const fixed = fixProject(result);
    if (!fixed.length) {
        _panel?.webview.postMessage({ type: 'done', text: `No auto-fixable issues in ${projectName}.` });
        return;
    }
    showFixSummary([`${projectName}: ${fixed.join(', ')}`], fixed.length, 1);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed in ${projectName}: ${fixed.join(', ')}. See summary panel.` });
    // Rescan first
    await runScan();
    // Then offer to open the folder
    const projPath = result.project.path;
    if (fs.existsSync(projPath)) {
        const action = await vscode.window.showInformationMessage(`Fixed ${fixed.length} file(s) in ${projectName}. Open folder in new window?`, 'Open', 'Skip');
        if (action === 'Open') {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projPath), { forceNewWindow: true });
        }
    }
}
async function fixOneInteractive() {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const results = registry.projects
        .filter(p => fs.existsSync(p.path))
        .map(p => checkProject(p))
        .filter(r => r.issues.some(i => i.fixable));
    if (!results.length) {
        vscode.window.showInformationMessage('No auto-fixable issues found. ✅');
        return;
    }
    const picked = await vscode.window.showQuickPick(results.map(r => ({
        label: `$(tools) ${r.project.name}`,
        description: `score: ${r.score}/100 · ${r.issues.filter(i => i.fixable).length} fixable issue(s)`,
        result: r,
    })), { placeHolder: 'Pick a project to auto-fix' });
    if (!picked) {
        return;
    }
    const fixed = fixProject(picked.result);
    if (fixed.length) {
        vscode.window.showInformationMessage(`Fixed in ${picked.result.project.name}: ${fixed.join(', ')}`);
    }
    else {
        vscode.window.showInformationMessage('Nothing was auto-fixed.');
    }
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.marketplace.scan', runScan), vscode.commands.registerCommand('cvs.marketplace.fixAll', fixAll), vscode.commands.registerCommand('cvs.marketplace.fixOne', fixOneInteractive));
}
function deactivate() {
    _panel?.dispose();
    _panel = undefined;
    _lastResults = [];
}
//# sourceMappingURL=marketplace-compliance.js.map