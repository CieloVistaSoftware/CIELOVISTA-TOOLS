// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import { log }     from '../../shared/output-channel';
import { mergeFiles, moveToGlobal, deleteDoc, diffFiles } from './actions';
import type { AuditResults, Finding, FindingKind } from './types';

const FEATURE = 'doc-auditor';

export function buildFindingsList(results: AuditResults): Finding[] {
    const findings: Finding[] = [];
    for (const g of results.duplicates) {
        findings.push({ kind:'duplicate', title:`Duplicate: ${g.fileName}`, description:`${g.files.length} copies in: ${g.files.map(f=>f.projectName).join(', ')}`, primaryPaths: g.files.map(f=>f.filePath) });
    }
    for (const g of results.similar) {
        findings.push({ kind:'similar', title:`${Math.round(g.similarity*100)}% similar: ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, description:`${g.fileA.projectName} ↔ ${g.fileB.projectName} · ${g.reason}`, primaryPaths:[g.fileA.filePath,g.fileB.filePath] });
    }
    for (const c of results.moveCandidates) {
        findings.push({ kind:'move', title:`Move to Global: ${c.file.fileName}`, description:`${c.file.projectName} · ${c.reason}`, primaryPaths:[c.file.filePath], secondaryPath:c.file.filePath });
    }
    for (const o of results.orphans) {
        findings.push({ kind:'orphan', title:`Orphan: ${o.file.fileName}`, description:`${o.file.projectName} · ${o.reason}`, primaryPaths:[o.file.filePath], secondaryPath:o.file.filePath });
    }
    return findings;
}

function actionsFor(kind: FindingKind): vscode.QuickPickItem[] {
    const SKIP  = { label:'$(arrow-right) Skip', description:'skip' };
    const STOP  = { label:'$(x) Stop walkthrough', description:'stop' };
    switch (kind) {
        case 'duplicate': return [{ label:'$(git-merge) Merge all into one', description:'merge' }, { label:'$(go-to-file) Open first copy', description:'open' }, SKIP, STOP];
        case 'similar':   return [{ label:'$(diff) Diff side by side', description:'diff' }, { label:'$(git-merge) Merge into one', description:'merge' }, SKIP, STOP];
        case 'move':      return [{ label:'$(cloud-upload) Move to CieloVistaStandards', description:'move' }, { label:'$(go-to-file) Open file', description:'open' }, SKIP, STOP];
        case 'orphan':    return [{ label:'$(go-to-file) Open to review', description:'open' }, { label:'$(trash) Delete this file', description:'delete' }, SKIP, STOP];
    }
}

export async function walkThroughFindings(results: AuditResults): Promise<void> {
    const findings = buildFindingsList(results);
    if (!findings.length) { vscode.window.showInformationMessage('No findings to walk through.'); return; }
    const kindIcon: Record<FindingKind, string> = { duplicate:'📄', similar:'🔀', move:'📦', orphan:'👻' };
    let actioned = 0, skipped = 0;
    for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const choice = await vscode.window.showQuickPick(actionsFor(f.kind), {
            title: `(${i+1} of ${findings.length})  ${kindIcon[f.kind]}  ${f.title}`,
            placeHolder: f.description, ignoreFocusOut: true,
        });
        if (!choice) { break; }
        const action = choice.description;
        if (action === 'stop') { break; }
        if (action === 'skip') { skipped++; continue; }
        switch (action) {
            case 'merge':  await mergeFiles(f.primaryPaths); actioned++; break;
            case 'diff':   await diffFiles(f.primaryPaths); break;
            case 'move':   if (f.secondaryPath) { await moveToGlobal(f.secondaryPath); actioned++; } break;
            case 'delete': if (f.secondaryPath) { await deleteDoc(f.secondaryPath); actioned++; } break;
            case 'open': {
                const p = f.secondaryPath ?? f.primaryPaths[0];
                if (p && fs.existsSync(p)) { const doc = await vscode.workspace.openTextDocument(p); await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside); }
                break;
            }
        }
    }
    vscode.window.showInformationMessage(`Walkthrough complete — ${actioned} actions taken, ${skipped} skipped.`);
    log(FEATURE, `Walkthrough: ${actioned} actioned, ${skipped} skipped of ${findings.length}`);
}
