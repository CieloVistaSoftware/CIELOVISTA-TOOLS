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
exports.isReadme = isReadme;
exports.detectType = detectType;
exports.collectReadmes = collectReadmes;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function isReadme(fileName) {
    return /^readme\.md$/i.test(fileName) || /\.readme\.md$/i.test(fileName);
}
function detectType(filePath, projectRootPath, projectName) {
    const fileName = path.basename(filePath).toLowerCase();
    const dir = path.dirname(filePath);
    if (/\.readme\.md$/i.test(fileName)) {
        return 'FEATURE';
    }
    if (projectName === 'global') {
        return 'STANDARD';
    }
    if (/[\\/]docs[\\/]/i.test(dir)) {
        return 'STANDARD';
    }
    const rel = path.relative(projectRootPath, dir);
    if (rel === '' || rel === '.') {
        return 'PROJECT';
    }
    return 'FEATURE';
}
const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'reports']);
function collectReadmes(rootPath, projectName, projectRoot, maxDepth = 4) {
    const results = [];
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
            if (SKIP.has(entry.name)) {
                continue;
            }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full, depth + 1);
            }
            else if (entry.isFile() && isReadme(entry.name)) {
                results.push({ filePath: full, projectName, projectRoot });
            }
        }
    }
    walk(rootPath, 0);
    return results;
}
//# sourceMappingURL=scanner.js.map