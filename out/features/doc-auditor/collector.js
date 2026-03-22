"use strict";
// Copyright (c) Cielo Vista Software. All rights reserved.
// collector.ts — doc collection utilities for doc-auditor
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
exports.collectDocs = collectDocs;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
//# sourceMappingURL=collector.js.map