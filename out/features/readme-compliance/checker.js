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
exports.checkCompliance = checkCompliance;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sections_1 = require("./sections");
const scanner_1 = require("./scanner");
function normalizeHeading(h) {
    return h.toLowerCase().replace(/^#+\s*/, '').trim();
}
function extractHeadings(content) {
    return content.split('\n').filter(l => /^#{1,4}\s/.test(l)).map(normalizeHeading);
}
function checkCompliance(filePath, projectName, projectRoot) {
    const fileName = path.basename(filePath);
    const readmeType = (0, scanner_1.detectType)(filePath, projectRoot, projectName);
    const issues = [];
    let content = '';
    let lineCount = 0;
    try {
        content = fs.readFileSync(filePath, 'utf8');
        lineCount = content.split('\n').length;
    }
    catch {
        return { filePath, fileName, projectName, readmeType,
            score: 0, issues: [{ severity: 'error', message: 'Could not read file', fixable: false, fixKey: '' }],
            lineCount: 0, missingRequiredSections: [], outOfOrderSections: [] };
    }
    const headings = extractHeadings(content);
    const lines = content.split('\n');
    const required = sections_1.REQUIRED_SECTIONS[readmeType];
    const limit = sections_1.LINE_LIMITS[readmeType];
    // Check 1: first line is a # heading
    const firstNonBlank = lines.find(l => l.trim());
    if (!firstNonBlank || !/^#\s/.test(firstNonBlank)) {
        issues.push({ severity: 'error', message: 'First non-blank line is not a # heading', fixable: true, fixKey: 'first-heading' });
    }
    // Check 2: required sections present
    const missing = required.filter(sec => !headings.some(h => h.includes(sec)));
    missing.forEach(sec => issues.push({ severity: 'error', message: `Missing required section: "${sec}"`, fixable: true, fixKey: `missing-section:${sec}` }));
    // Check 3: section order
    const expectedOrder = sections_1.SECTION_ORDER[readmeType];
    const foundInOrder = expectedOrder.filter(sec => headings.some(h => h.includes(sec)));
    const actualOrder = headings.filter(h => expectedOrder.some(s => h.includes(s)));
    const outOfOrder = [];
    let lastIdx = -1;
    for (const h of actualOrder) {
        const sec = expectedOrder.find(s => h.includes(s));
        if (!sec) {
            continue;
        }
        const idx = foundInOrder.indexOf(sec);
        if (idx < lastIdx) {
            outOfOrder.push(sec);
        }
        else {
            lastIdx = idx;
        }
    }
    if (outOfOrder.length) {
        issues.push({ severity: 'warning', message: `Sections out of order: ${outOfOrder.join(', ')}`, fixable: false, fixKey: 'order' });
    }
    // Check 4: line limit
    if (lineCount > limit) {
        issues.push({ severity: 'warning', message: `File is ${lineCount} lines (limit: ${limit}). Extract details into docs/.`, fixable: false, fixKey: 'line-limit' });
    }
    // Check 5: duplicate headings
    const seen = new Set(), dupes = [];
    for (const h of headings) {
        if (seen.has(h)) {
            dupes.push(h);
        }
        else {
            seen.add(h);
        }
    }
    if (dupes.length) {
        issues.push({ severity: 'warning', message: `Duplicate headings: ${dupes.join(', ')}`, fixable: false, fixKey: 'dupe-headings' });
    }
    // Check 6: bare code blocks
    const bareCodeBlocks = (content.match(/^```\s*$/gm) ?? []).length;
    if (bareCodeBlocks > 0) {
        issues.push({ severity: 'warning', message: `${bareCodeBlocks} code block(s) missing language tag`, fixable: true, fixKey: 'code-block-lang' });
    }
    // Check 7: skipped heading levels
    let prevLevel = 0;
    for (const line of lines) {
        const m = line.match(/^(#{1,6})\s/);
        if (m) {
            const level = m[1].length;
            if (level > prevLevel + 1 && prevLevel > 0) {
                issues.push({ severity: 'warning', message: `Skipped heading level (h${prevLevel} → h${level})`, fixable: false, fixKey: 'heading-level' });
                break;
            }
            prevLevel = level;
        }
    }
    // Check 8: type-specific header format
    if (readmeType === 'FEATURE') {
        const h1 = headings[0] ?? '';
        if (!h1.includes('feature:') && !h1.includes('component:') && !h1.includes('module:')) {
            issues.push({ severity: 'info', message: 'Feature READMEs should start with "# feature:", "# component:", or "# module:"', fixable: true, fixKey: 'feature-prefix' });
        }
    }
    if (readmeType === 'STANDARD') {
        const titleLineIdx = lines.findIndex(l => /^#\s/.test(l));
        const hasBlockquote = lines.slice(titleLineIdx + 1, titleLineIdx + 5).some(l => l.startsWith('>'));
        if (!hasBlockquote) {
            issues.push({ severity: 'info', message: 'Standard docs should have a blockquote summary after the title', fixable: true, fixKey: 'standard-blockquote' });
        }
    }
    // Score
    let score = 100;
    if (issues.some(i => i.fixKey === 'first-heading')) {
        score -= 10;
    }
    if (required.length > 0) {
        score -= Math.round((missing.length / required.length) * 40);
    }
    if (outOfOrder.length) {
        score -= 10;
    }
    if (lineCount > limit) {
        score -= 10;
    }
    if (dupes.length) {
        score -= 5;
    }
    if (bareCodeBlocks > 0) {
        score -= 10;
    }
    if (issues.some(i => i.fixKey === 'heading-level')) {
        score -= 10;
    }
    return { filePath, fileName, projectName, readmeType,
        score: Math.max(0, Math.min(100, score)), issues, lineCount,
        missingRequiredSections: missing, outOfOrderSections: outOfOrder };
}
//# sourceMappingURL=checker.js.map