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
exports.getReportDir = getReportDir;
exports.reportFileName = reportFileName;
exports.saveAuditReport = saveAuditReport;
exports.parseReportActions = parseReportActions;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const FEATURE = 'doc-auditor';
function getReportDir() {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const dir = ws ? path.join(ws, 'docs') : 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function reportFileName(type) {
    return `audit-${type}-${new Date().toISOString().slice(0, 10)}.md`;
}
function saveAuditReport(results) {
    const reportDir = getReportDir();
    const reportPath = path.join(reportDir, reportFileName('full'));
    const lines = [
        `# CieloVista Docs Audit Report`, ``,
        `> **Date:** ${new Date().toLocaleString()}`,
        `> **Docs scanned:** ${results.totalDocsScanned}  |  **Projects:** ${results.projectsScanned}`, ``,
        `| Category | Count |`, `|---|---|`,
        `| Duplicates | ${results.duplicates.length} |`,
        `| Similar pairs | ${results.similar.length} |`,
        `| Move candidates | ${results.moveCandidates.length} |`,
        `| Orphans | ${results.orphans.length} |`, ``, `---`, ``,
    ];
    if (results.duplicates.length) {
        lines.push(`## Duplicate Filenames`, ``);
        for (const g of results.duplicates) {
            lines.push(`### ${g.fileName}`, `<!-- AUDIT-ACTION:merge:${g.files.map(f => f.filePath).join('::')} -->`);
            for (const f of g.files) {
                lines.push(`- \`${f.filePath}\` (${f.projectName}, ${f.sizeBytes} bytes)`, `  <!-- AUDIT-ACTION:open:${f.filePath} -->`);
            }
            lines.push(``);
        }
    }
    if (results.similar.length) {
        lines.push(`## Similar Content Pairs`, ``);
        for (const g of results.similar) {
            lines.push(`### ${Math.round(g.similarity * 100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`, `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`, `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, ``);
        }
    }
    if (results.moveCandidates.length) {
        lines.push(`## Move to Global`, ``);
        for (const c of results.moveCandidates) {
            lines.push(`- \`${c.file.filePath}\``, `  <!-- AUDIT-ACTION:move-to-global:${c.file.filePath} -->`, ``);
        }
    }
    if (results.orphans.length) {
        lines.push(`## Orphaned Docs`, ``);
        for (const o of results.orphans) {
            lines.push(`- \`${o.file.filePath}\``, `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`, `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, ``);
        }
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    (0, output_channel_1.log)(FEATURE, `Report saved: ${reportPath}`);
    return reportPath;
}
function parseReportActions(reportContent) {
    const actions = [];
    const lines = reportContent.split('\n');
    const tagRe = /<!--\s*AUDIT-ACTION:(\w[\w-]*):(.*?)\s*-->/;
    const kindLabels = { merge: 'Merge', diff: 'Diff', 'move-to-global': 'Move to Global', delete: 'Delete', open: 'Open' };
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(tagRe);
        if (!match) {
            continue;
        }
        const kind = match[1];
        const paths = match[2].trim().split('::').map(p => p.trim()).filter(Boolean);
        if (!paths.length) {
            continue;
        }
        let context = '';
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
            const ln = lines[j].replace(/<!--.*?-->/g, '').trim();
            if (ln) {
                context = ln.replace(/^#+\s*/, '').slice(0, 80);
                break;
            }
        }
        actions.push({ label: `${kindLabels[kind] ?? kind}: ${paths.map(p => path.basename(p)).join(' ↔ ')}`, kind, paths, context });
    }
    return actions;
}
//# sourceMappingURL=report.js.map