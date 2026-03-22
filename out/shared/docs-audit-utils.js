"use strict";
// Copyright (c) 2026 CieloVista Software. All rights reserved.
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
exports.collectDocs = collectDocs;
/**
 * docs-audit-utils.ts
 *
 * Shared pure functions for scanning, analyzing, and recommending actions
 * for documentation health across all CieloVista projects and the global standards folder.
 *
 * Used by the unified docs-manager audit/recommend/fix workflow.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ─── Doc Collection ───────────────────────────────────────────────────────────
/** Recursively collects all markdown docs under a directory (max 3 levels deep). */
function collectDocs(rootPath, projectName, maxDepth = 3) {
    const results = [];
    function walk(dir, depth) {
        if (depth > maxDepth)
            return;
        if (!fs.existsSync(dir))
            return;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (["node_modules", ".git", "out", "dist", ".vscode", "reports"].includes(entry.name))
                continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            }
            else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const normalized = content.toLowerCase().replace(/\s+/g, ' ').replace(/[#*`_\[\]()]/g, '').trim();
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
// More analysis and recommendation functions will be added here.
//# sourceMappingURL=docs-audit-utils.js.map