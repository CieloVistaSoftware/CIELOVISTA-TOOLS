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
exports.buildFindingsList = buildFindingsList;
exports.walkThroughFindings = walkThroughFindings;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const output_channel_1 = require("../../shared/output-channel");
const actions_1 = require("./actions");
const FEATURE = 'doc-auditor';
function buildFindingsList(results) {
    const findings = [];
    for (const g of results.duplicates) {
        findings.push({ kind: 'duplicate', title: `Duplicate: ${g.fileName}`, description: `${g.files.length} copies in: ${g.files.map(f => f.projectName).join(', ')}`, primaryPaths: g.files.map(f => f.filePath) });
    }
    for (const g of results.similar) {
        findings.push({ kind: 'similar', title: `${Math.round(g.similarity * 100)}% similar: ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, description: `${g.fileA.projectName} ↔ ${g.fileB.projectName} · ${g.reason}`, primaryPaths: [g.fileA.filePath, g.fileB.filePath] });
    }
    for (const c of results.moveCandidates) {
        findings.push({ kind: 'move', title: `Move to Global: ${c.file.fileName}`, description: `${c.file.projectName} · ${c.reason}`, primaryPaths: [c.file.filePath], secondaryPath: c.file.filePath });
    }
    for (const o of results.orphans) {
        findings.push({ kind: 'orphan', title: `Orphan: ${o.file.fileName}`, description: `${o.file.projectName} · ${o.reason}`, primaryPaths: [o.file.filePath], secondaryPath: o.file.filePath });
    }
    return findings;
}
function actionsFor(kind) {
    const SKIP = { label: '$(arrow-right) Skip', description: 'skip' };
    const STOP = { label: '$(x) Stop walkthrough', description: 'stop' };
    switch (kind) {
        case 'duplicate': return [{ label: '$(git-merge) Merge all into one', description: 'merge' }, { label: '$(go-to-file) Open first copy', description: 'open' }, SKIP, STOP];
        case 'similar': return [{ label: '$(diff) Diff side by side', description: 'diff' }, { label: '$(git-merge) Merge into one', description: 'merge' }, SKIP, STOP];
        case 'move': return [{ label: '$(cloud-upload) Move to CieloVistaStandards', description: 'move' }, { label: '$(go-to-file) Open file', description: 'open' }, SKIP, STOP];
        case 'orphan': return [{ label: '$(go-to-file) Open to review', description: 'open' }, { label: '$(trash) Delete this file', description: 'delete' }, SKIP, STOP];
    }
}
async function walkThroughFindings(results) {
    const findings = buildFindingsList(results);
    if (!findings.length) {
        vscode.window.showInformationMessage('No findings to walk through.');
        return;
    }
    const kindIcon = { duplicate: '📄', similar: '🔀', move: '📦', orphan: '👻' };
    let actioned = 0, skipped = 0;
    for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const choice = await vscode.window.showQuickPick(actionsFor(f.kind), {
            title: `(${i + 1} of ${findings.length})  ${kindIcon[f.kind]}  ${f.title}`,
            placeHolder: f.description, ignoreFocusOut: true,
        });
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
        switch (action) {
            case 'merge':
                await (0, actions_1.mergeFiles)(f.primaryPaths);
                actioned++;
                break;
            case 'diff':
                await (0, actions_1.diffFiles)(f.primaryPaths);
                break;
            case 'move':
                if (f.secondaryPath) {
                    await (0, actions_1.moveToGlobal)(f.secondaryPath);
                    actioned++;
                }
                break;
            case 'delete':
                if (f.secondaryPath) {
                    await (0, actions_1.deleteDoc)(f.secondaryPath);
                    actioned++;
                }
                break;
            case 'open': {
                const p = f.secondaryPath ?? f.primaryPaths[0];
                if (p && fs.existsSync(p)) {
                    const doc = await vscode.workspace.openTextDocument(p);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                break;
            }
        }
    }
    vscode.window.showInformationMessage(`Walkthrough complete — ${actioned} actions taken, ${skipped} skipped.`);
    (0, output_channel_1.log)(FEATURE, `Walkthrough: ${actioned} actioned, ${skipped} skipped of ${findings.length}`);
}
//# sourceMappingURL=walkthrough.js.map