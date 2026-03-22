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
exports.applyFix = applyFix;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sections_1 = require("./sections");
function applyFix(report) {
    let content = fs.readFileSync(report.filePath, 'utf8');
    const stubs = sections_1.STUBS[report.readmeType];
    for (const issue of report.issues) {
        if (!issue.fixable) {
            continue;
        }
        if (issue.fixKey === 'first-heading') {
            if (!/^#\s/.test(content.split('\n')[0])) {
                const name = path.basename(report.filePath, '.md').replace(/\.README$/i, '');
                content = `# ${name}\n\n${content}`;
            }
        }
        if (issue.fixKey.startsWith('missing-section:')) {
            const sec = issue.fixKey.replace('missing-section:', '');
            const stub = stubs[sec];
            if (stub && !content.toLowerCase().includes(`## ${sec}`)) {
                content = content.trimEnd() + '\n\n---\n\n' + stub;
            }
        }
        if (issue.fixKey === 'code-block-lang') {
            content = content.replace(/^```\s*$/gm, '```text');
        }
        if (issue.fixKey === 'feature-prefix') {
            content = content.replace(/^(#\s+)(.+)$/m, (_, hash, title) => {
                if (title.toLowerCase().startsWith('feature:')) {
                    return `${hash}${title}`;
                }
                return `${hash}feature: ${title}`;
            });
        }
        if (issue.fixKey === 'standard-blockquote') {
            content = content.replace(/^(#\s+.+)$/m, (_, heading) => `${heading}\n\n> _TODO: one-line summary of what this standard covers._`);
        }
    }
    return content;
}
//# sourceMappingURL=fixer.js.map