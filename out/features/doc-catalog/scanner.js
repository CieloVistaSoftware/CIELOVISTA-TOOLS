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
exports.resetCardCounter = resetCardCounter;
exports.scanForCards = scanForCards;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const content_1 = require("./content");
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.vscode', 'reports']);
const SKIP_FILES = new Set(['.gitignore', '.gitattributes']);
let _cardIdCounter = 0;
function resetCardCounter() { _cardIdCounter = 0; }
function scanForCards(rootPath, projectName, projectRootPath, projectDeweyNum, // e.g. 300 for DiskCleanUp
maxDepth = 3) {
    const cards = [];
    function walk(dir, depth) {
        if (depth > maxDepth || !fs.existsSync(dir)) {
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
            if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath, depth + 1);
            }
            else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const stat = fs.statSync(fullPath);
                    cards.push({
                        id: `card-${++_cardIdCounter}`,
                        fileName: entry.name,
                        title: (0, content_1.extractTitle)(content, entry.name),
                        description: (0, content_1.extractDescription)(content),
                        filePath: fullPath,
                        projectName,
                        projectPath: projectRootPath,
                        category: projectName, // section heading = project name
                        categoryNum: projectDeweyNum,
                        sizeBytes: Buffer.byteLength(content, 'utf8'),
                        lastModified: stat.mtime.toISOString().slice(0, 10),
                        tags: (0, content_1.extractTags)(content, entry.name),
                    });
                }
                catch { /* skip unreadable */ }
            }
        }
    }
    walk(rootPath, 0);
    return cards;
}
//# sourceMappingURL=scanner.js.map