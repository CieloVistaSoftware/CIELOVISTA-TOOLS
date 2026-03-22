// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log }     from '../../shared/output-channel';
import type { AuditResults, ParsedAction } from './types';

const FEATURE = 'doc-auditor';

export function getReportDir(): string {
    const ws  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const dir = ws ? path.join(ws, 'docs') : 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\reports';
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    return dir;
}

export function reportFileName(type: 'full' | 'duplicates' | 'similar' | 'orphans' | 'move-candidates'): string {
    return `audit-${type}-${new Date().toISOString().slice(0, 10)}.md`;
}

export function saveAuditReport(results: AuditResults): string {
    const reportDir  = getReportDir();
    const reportPath = path.join(reportDir, reportFileName('full'));
    const lines: string[] = [
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
            lines.push(`### ${g.fileName}`, `<!-- AUDIT-ACTION:merge:${g.files.map(f=>f.filePath).join('::')} -->`);
            for (const f of g.files) { lines.push(`- \`${f.filePath}\` (${f.projectName}, ${f.sizeBytes} bytes)`, `  <!-- AUDIT-ACTION:open:${f.filePath} -->`); }
            lines.push(``);
        }
    }
    if (results.similar.length) {
        lines.push(`## Similar Content Pairs`, ``);
        for (const g of results.similar) {
            lines.push(`### ${Math.round(g.similarity*100)}% — ${g.fileA.fileName} ↔ ${g.fileB.fileName}`,
                `<!-- AUDIT-ACTION:diff:${g.fileA.filePath}::${g.fileB.filePath} -->`,
                `<!-- AUDIT-ACTION:merge:${g.fileA.filePath}::${g.fileB.filePath} -->`,
                `- A: \`${g.fileA.filePath}\``, `- B: \`${g.fileB.filePath}\``, ``);
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
            lines.push(`- \`${o.file.filePath}\``,
                `  <!-- AUDIT-ACTION:delete:${o.file.filePath} -->`,
                `  <!-- AUDIT-ACTION:open:${o.file.filePath} -->`, ``);
        }
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    log(FEATURE, `Report saved: ${reportPath}`);
    return reportPath;
}

export function parseReportActions(reportContent: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    const lines = reportContent.split('\n');
    const tagRe = /<!--\s*AUDIT-ACTION:(\w[\w-]*):(.*?)\s*-->/;
    const kindLabels: Record<string, string> = { merge:'Merge', diff:'Diff', 'move-to-global':'Move to Global', delete:'Delete', open:'Open' };
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(tagRe);
        if (!match) { continue; }
        const kind  = match[1] as ParsedAction['kind'];
        const paths = match[2].trim().split('::').map(p => p.trim()).filter(Boolean);
        if (!paths.length) { continue; }
        let context = '';
        for (let j = i-1; j >= 0 && j >= i-3; j--) {
            const ln = lines[j].replace(/<!--.*?-->/g,'').trim();
            if (ln) { context = ln.replace(/^#+\s*/, '').slice(0, 80); break; }
        }
        actions.push({ label: `${kindLabels[kind]??kind}: ${paths.map(p=>path.basename(p)).join(' ↔ ')}`, kind, paths, context });
    }
    return actions;
}
