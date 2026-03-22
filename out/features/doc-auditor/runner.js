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
exports.runAudit = runAudit;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const output_channel_1 = require("../../shared/output-channel");
const registry_1 = require("../../shared/registry");
const scanner_1 = require("./scanner");
const analyzer_1 = require("./analyzer");
const FEATURE = 'doc-auditor';
const STANDARD_CLAUDE_PATH = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\CLAUDE.md';
async function runAudit() {
    // Load the standard CLAUDE.md for drift-detection
    let standardClaude;
    if (fs.existsSync(STANDARD_CLAUDE_PATH)) {
        const content = fs.readFileSync(STANDARD_CLAUDE_PATH, 'utf8');
        standardClaude = {
            filePath: STANDARD_CLAUDE_PATH, fileName: 'CLAUDE.md', projectName: 'global',
            sizeBytes: Buffer.byteLength(content, 'utf8'), content,
            normalized: content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim(),
        };
    }
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return undefined;
    }
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Auditing CieloVista docs…', cancellable: false }, async (progress) => {
        progress.report({ message: 'Collecting global docs…' });
        const allDocs = (0, scanner_1.collectDocs)(registry.globalDocsPath, 'global');
        for (const project of registry.projects) {
            progress.report({ message: `Scanning ${project.name}…` });
            if (fs.existsSync(project.path)) {
                allDocs.push(...(0, scanner_1.collectDocs)(project.path, project.name));
            }
        }
        (0, output_channel_1.log)(FEATURE, `Collected ${allDocs.length} docs`);
        // 1 — duplicates
        const byName = new Map();
        for (const doc of allDocs) {
            const key = doc.fileName.toLowerCase();
            if (!byName.has(key)) {
                byName.set(key, []);
            }
            byName.get(key).push(doc);
        }
        const duplicates = [...byName.values()].filter(f => f.length > 1)
            .map(files => ({ fileName: files[0].fileName, files }));
        // 2 — similar content
        progress.report({ message: 'Checking for similar content…' });
        const similar = [];
        const compared = new Set();
        for (let i = 0; i < allDocs.length; i++) {
            for (let j = i + 1; j < allDocs.length; j++) {
                const a = allDocs[i], b = allDocs[j];
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
                const score = (0, analyzer_1.computeSimilarity)(a.normalized, b.normalized);
                if (score >= 0.65) {
                    similar.push({ similarity: score, fileA: a, fileB: b, reason: `${Math.round(score * 100)}% word overlap` });
                }
            }
        }
        similar.sort((a, b) => b.similarity - a.similarity);
        // 3 — move candidates + CLAUDE.md drift
        progress.report({ message: 'Checking for misplaced docs…' });
        const moveCandidates = [];
        const warningCandidates = [];
        for (const doc of allDocs) {
            if (doc.fileName.toLowerCase() === 'claude.md' && standardClaude && doc.projectName !== 'global') {
                if ((0, analyzer_1.computeSimilarity)(doc.normalized, standardClaude.normalized) < 0.95) {
                    warningCandidates.push({ file: doc, reason: '⚠️ This CLAUDE.md differs from the standard. You can overwrite it.' });
                    continue;
                }
            }
            const reason = (0, analyzer_1.isGlobalCandidate)(doc);
            if (reason) {
                moveCandidates.push({ file: doc, reason });
            }
        }
        // 4 — orphans
        progress.report({ message: 'Checking for orphaned docs…' });
        const orphans = allDocs
            .map(doc => ({ file: doc, reason: (0, analyzer_1.isOrphan)(doc, allDocs) }))
            .filter((o) => o.reason !== undefined);
        return {
            duplicates, similar, moveCandidates, orphans,
            totalDocsScanned: allDocs.length,
            projectsScanned: registry.projects.length + 1,
            warningCandidates,
        };
    });
}
//# sourceMappingURL=runner.js.map