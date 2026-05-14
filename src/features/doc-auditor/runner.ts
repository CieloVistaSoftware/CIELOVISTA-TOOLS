// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log }     from '../../shared/output-channel';
import { loadRegistry } from '../../shared/registry';
import { collectDocs }  from './scanner';
import { computeSimilarity, isGlobalCandidate, isOrphan, filterDuplicates } from './analyzer';
import type { DocFile, AuditResults, MoveCandidate } from './types';

const FEATURE = 'doc-auditor';
const STANDARD_CLAUDE_PATH = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\CLAUDE.md';

export interface AuditProgressReporter {
    report(message: string): void;
}

export async function runAudit(progressReporter?: AuditProgressReporter): Promise<AuditResults | undefined> {
    const report = (message: string): void => {
        progressReporter?.report(message);
    };

    // Load the standard CLAUDE.md for drift-detection
    let standardClaude: DocFile | undefined;
    if (fs.existsSync(STANDARD_CLAUDE_PATH)) {
        const content = fs.readFileSync(STANDARD_CLAUDE_PATH, 'utf8');
        standardClaude = {
            filePath: STANDARD_CLAUDE_PATH, fileName: 'CLAUDE.md', projectName: 'global',
            sizeBytes: Buffer.byteLength(content, 'utf8'), content,
            normalized: content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim(),
        };
    }

    const registry = loadRegistry();
    if (!registry) { return undefined; }

    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Auditing CieloVista docs…', cancellable: false },
        async (progress) => {
            report('Collecting global docs…');
            progress.report({ message: 'Collecting global docs…' });
            const allDocs: DocFile[] = collectDocs(registry.globalDocsPath, 'global');
            report(`Audited ${allDocs.length} docs (global)…`);
            progress.report({ message: `Audited ${allDocs.length} docs (global)…` });
            for (const project of registry.projects) {
                const scanMessage = `Scanning ${project.name}…`;
                report(scanMessage);
                progress.report({ message: scanMessage });
                if (fs.existsSync(project.path)) {
                    const projectDocs = collectDocs(project.path, project.name);
                    allDocs.push(...projectDocs);
                    const countedMessage = `Audited ${allDocs.length} docs… (${project.name})`;
                    report(countedMessage);
                    progress.report({ message: countedMessage });
                }
            }
            log(FEATURE, `Collected ${allDocs.length} docs`);

            // 1 — duplicates (per-project files like CLAUDE.md are exempt from cross-project flagging)
            const byName = new Map<string, DocFile[]>();
            for (const doc of allDocs) {
                const key = doc.fileName.toLowerCase();
                if (!byName.has(key)) { byName.set(key, []); }
                byName.get(key)!.push(doc);
            }
            const duplicates = filterDuplicates(byName);

            // 2 — similar content
            report('Checking for similar content…');
            progress.report({ message: 'Checking for similar content…' });
            const similar: AuditResults['similar'] = [];
            const compared = new Set<string>();
            for (let i = 0; i < allDocs.length; i++) {
                for (let j = i + 1; j < allDocs.length; j++) {
                    const a = allDocs[i], b = allDocs[j];
                    if (a.fileName.toLowerCase() === b.fileName.toLowerCase()) { continue; }
                    if (a.sizeBytes < 100 || b.sizeBytes < 100) { continue; }
                    const key = [a.filePath, b.filePath].sort().join('::');
                    if (compared.has(key)) { continue; }
                    compared.add(key);
                    const score = computeSimilarity(a.normalized, b.normalized);
                    if (score >= 0.65) {
                        similar.push({ similarity: score, fileA: a, fileB: b, reason: `${Math.round(score * 100)}% word overlap` });
                    }
                }
            }
            similar.sort((a, b) => b.similarity - a.similarity);

            // 3 — move candidates + CLAUDE.md drift
            report('Checking for misplaced docs…');
            progress.report({ message: 'Checking for misplaced docs…' });
            const moveCandidates: MoveCandidate[] = [];
            const warningCandidates: MoveCandidate[] = [];
            for (const doc of allDocs) {
                if (doc.fileName.toLowerCase() === 'claude.md' && standardClaude && doc.projectName !== 'global') {
                    if (computeSimilarity(doc.normalized, standardClaude.normalized) < 0.95) {
                        warningCandidates.push({ file: doc, reason: '⚠️ This CLAUDE.md differs from the standard. You can overwrite it.' });
                        continue;
                    }
                }
                const reason = isGlobalCandidate(doc);
                if (reason) { moveCandidates.push({ file: doc, reason }); }
            }

            // 4 — orphans
            report('Checking for orphaned docs…');
            progress.report({ message: 'Checking for orphaned docs…' });
            const orphans = allDocs
                .map(doc => ({ file: doc, reason: isOrphan(doc, allDocs) }))
                .filter((o): o is { file: DocFile; reason: string } => o.reason !== undefined);

            return {
                duplicates, similar, moveCandidates, orphans,
                totalDocsScanned: allDocs.length,
                projectsScanned: registry.projects.length + 1,
                warningCandidates,
            } satisfies AuditResults;
        }
    ) as unknown as AuditResults | undefined;
}
