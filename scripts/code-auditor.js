// Copyright (c) CieloVista Software. All rights reserved.
// scripts/code-auditor.js
//
// V1 code duplication auditor (zero dependencies).
// Scans registered projects for duplicate TypeScript/JavaScript blocks.
//
// Usage:
//   node scripts/code-auditor.js
//   node scripts/code-auditor.js --json
//   node scripts/code-auditor.js --min-lines=6 --min-statements=3 --near-threshold=85

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
const DEFAULTS = {
    minLines: 5,
    minStatements: 3,
    nearThreshold: 85,
};

const SKIP_DIRS = new Set([
    '.git',
    '.svn',
    '.hg',
    'node_modules',
    'dist',
    'out',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
]);

function parseArgs(argv) {
    const opts = {
        json: false,
        minLines: DEFAULTS.minLines,
        minStatements: DEFAULTS.minStatements,
        nearThreshold: DEFAULTS.nearThreshold,
        registryPath: REGISTRY_PATH,
    };
    for (const arg of argv) {
        if (arg === '--json') {
            opts.json = true;
            continue;
        }
        if (arg.startsWith('--min-lines=')) {
            opts.minLines = Math.max(2, Number(arg.split('=')[1]) || DEFAULTS.minLines);
            continue;
        }
        if (arg.startsWith('--min-statements=')) {
            opts.minStatements = Math.max(1, Number(arg.split('=')[1]) || DEFAULTS.minStatements);
            continue;
        }
        if (arg.startsWith('--near-threshold=')) {
            opts.nearThreshold = Math.min(100, Math.max(50, Number(arg.split('=')[1]) || DEFAULTS.nearThreshold));
            continue;
        }
        if (arg.startsWith('--registry=')) {
            opts.registryPath = arg.split('=')[1] || REGISTRY_PATH;
        }
    }
    return opts;
}

function loadRegistry(registryPath) {
    const resolved = path.resolve(registryPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Registry not found: ${resolved}`);
    }
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const projects = Array.isArray(raw.projects) ? raw.projects : [];
    return {
        registryPath: resolved,
        projects: projects
            .filter((p) => p && typeof p.path === 'string' && p.path.trim().length > 0)
            .map((p) => ({
                name: String(p.name || path.basename(p.path)),
                path: String(p.path),
            })),
    };
}

function walkFiles(rootDir, outFiles) {
    if (!fs.existsSync(rootDir)) {
        return;
    }
    const stack = [path.resolve(rootDir)];
    while (stack.length > 0) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) {
                    stack.push(fullPath);
                }
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const lower = entry.name.toLowerCase();
            if (lower.endsWith('.ts') || lower.endsWith('.js')) {
                outFiles.push(fullPath);
            }
        }
    }
}

function collectTargetFiles(projects) {
    const files = [];
    for (const project of projects) {
        walkFiles(path.join(project.path, 'src'), files);
        walkFiles(path.join(project.path, 'scripts'), files);
        walkFiles(path.join(project.path, 'mcp-server', 'src'), files);
    }
    return [...new Set(files)].sort();
}

function buildLineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i += 1) {
        if (text.charCodeAt(i) === 10) {
            starts.push(i + 1);
        }
    }
    return starts;
}

function indexToLine(starts, index) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid] <= index) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return hi + 1;
}

function countStatements(blockText) {
    const semicolons = (blockText.match(/;/g) || []).length;
    const control = (blockText.match(/\b(if|for|while|switch|catch|return|throw)\b/g) || []).length;
    return semicolons + control;
}

function normalizeWhitespace(input) {
    return input
        .replace(/\r\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeBlock(input) {
    return input
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ' STR ')
        .replace(/\b\d+(?:\.\d+)?\b/g, ' NUM ')
        .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (word) => {
            if (/^(if|else|for|while|switch|case|break|continue|return|throw|try|catch|finally|function|class|const|let|var|new|await|async|import|export|from|in|of|typeof|instanceof)$/.test(word)) {
                return word;
            }
            return 'ID';
        })
        .replace(/\s+/g, ' ')
        .trim();
}

function hashText(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}

function inferSharedPath(blockText, filePath) {
    const lower = blockText.toLowerCase();
    if (lower.includes('replace(/&/g') && lower.includes('&amp;')) {
        if (filePath.includes(`${path.sep}mcp-server${path.sep}`)) {
            return 'mcp-server/src/shared/html-utils.ts';
        }
        return 'src/shared/html-utils.ts';
    }
    if (lower.includes('readdirsync') || lower.includes('withfiletypes')) {
        if (filePath.includes(`${path.sep}mcp-server${path.sep}`)) {
            return 'mcp-server/src/shared/fs-utils.ts';
        }
        return 'src/shared/fs-utils.ts';
    }
    if (lower.includes('frontmatter') || lower.includes('---')) {
        if (filePath.includes(`${path.sep}mcp-server${path.sep}`)) {
            return 'mcp-server/src/shared/frontmatter-utils.ts';
        }
        return 'src/shared/frontmatter-utils.ts';
    }
    if (filePath.includes(`${path.sep}mcp-server${path.sep}`)) {
        return 'mcp-server/src/shared/otop-utils.ts';
    }
    return 'src/shared/otop-utils.ts';
}

function extractBlocks(filePath, minLines, minStatements) {
    let text;
    try {
        text = fs.readFileSync(filePath, 'utf8');
    } catch {
        return [];
    }
    const lineStarts = buildLineIndex(text);
    const blocks = [];
    const stack = [];

    let inLineComment = false;
    let inBlockComment = false;
    let quote = '';
    let escape = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') {
                inLineComment = false;
            }
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i += 1;
            }
            continue;
        }
        if (quote) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === quote) {
                quote = '';
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i += 1;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i += 1;
            continue;
        }
        if (ch === '"' || ch === '\'' || ch === '`') {
            quote = ch;
            continue;
        }

        if (ch === '{') {
            stack.push(i);
            continue;
        }
        if (ch === '}' && stack.length > 0) {
            const startIndex = stack.pop();
            const endIndex = i;
            const startLine = indexToLine(lineStarts, startIndex);
            const endLine = indexToLine(lineStarts, endIndex);
            const lineCount = endLine - startLine + 1;
            if (lineCount < minLines) {
                continue;
            }
            const blockText = text.slice(startIndex, endIndex + 1);
            const statements = countStatements(blockText);
            if (statements < minStatements) {
                continue;
            }

            const wsNorm = normalizeWhitespace(blockText);
            const tokenNorm = tokenizeBlock(blockText);
            if (!tokenNorm) {
                continue;
            }

            blocks.push({
                filePath,
                startLine,
                endLine,
                lineCount,
                statements,
                raw: blockText,
                exactKey: hashText(wsNorm),
                tokenKey: hashText(tokenNorm),
                tokenNorm,
                sample: wsNorm.slice(0, 220),
                suggestedSharedPath: inferSharedPath(blockText, filePath),
            });
        }
    }

    return blocks;
}

function similarityScore(a, b) {
    const aTokens = a.tokenNorm.split(' ');
    const bTokens = b.tokenNorm.split(' ');
    if (aTokens.length === 0 || bTokens.length === 0) {
        return 0;
    }
    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);
    let common = 0;
    for (const token of aSet) {
        if (bSet.has(token)) {
            common += 1;
        }
    }
    const union = aSet.size + bSet.size - common;
    if (union <= 0) {
        return 0;
    }
    return Math.round((common / union) * 100);
}

function clusterExact(blocks) {
    const map = new Map();
    for (const block of blocks) {
        const arr = map.get(block.exactKey) || [];
        arr.push(block);
        map.set(block.exactKey, arr);
    }
    const clusters = [];
    for (const [, items] of map) {
        if (items.length < 2) {
            continue;
        }
        clusters.push({
            type: 'exact',
            similarity: 100,
            suggestedSharedPath: items[0].suggestedSharedPath,
            summary: items[0].sample,
            occurrences: items.map((item) => ({
                filePath: item.filePath,
                startLine: item.startLine,
                endLine: item.endLine,
            })),
            hasSharedVersion: fs.existsSync(path.resolve(items[0].suggestedSharedPath)),
        });
    }
    return clusters;
}

function clusterNear(blocks, nearThreshold) {
    const byToken = new Map();
    for (const block of blocks) {
        const arr = byToken.get(block.tokenKey) || [];
        arr.push(block);
        byToken.set(block.tokenKey, arr);
    }

    const near = [];
    for (const [, items] of byToken) {
        if (items.length < 2) {
            continue;
        }
        const exactKeys = new Set(items.map((i) => i.exactKey));
        if (exactKeys.size <= 1) {
            continue;
        }
        const base = items[0];
        const minScore = Math.min(...items.slice(1).map((it) => similarityScore(base, it)));
        if (minScore < nearThreshold) {
            continue;
        }
        near.push({
            type: 'near',
            similarity: Math.max(nearThreshold, minScore),
            suggestedSharedPath: base.suggestedSharedPath,
            summary: base.sample,
            occurrences: items.map((item) => ({
                filePath: item.filePath,
                startLine: item.startLine,
                endLine: item.endLine,
            })),
            hasSharedVersion: fs.existsSync(path.resolve(base.suggestedSharedPath)),
        });
    }
    return near;
}

function clusterPattern(blocks) {
    const bySuggestion = new Map();
    for (const block of blocks) {
        const key = block.suggestedSharedPath;
        const arr = bySuggestion.get(key) || [];
        arr.push(block);
        bySuggestion.set(key, arr);
    }
    const patterns = [];
    for (const [suggestedSharedPath, items] of bySuggestion) {
        if (items.length < 3) {
            continue;
        }
        const fileSet = new Set(items.map((i) => i.filePath));
        if (fileSet.size < 3) {
            continue;
        }
        const top = items.slice(0, 12);
        patterns.push({
            type: 'pattern',
            similarity: 88,
            suggestedSharedPath,
            summary: `Repeated multi-step pattern likely belongs in ${suggestedSharedPath}`,
            occurrences: top.map((item) => ({
                filePath: item.filePath,
                startLine: item.startLine,
                endLine: item.endLine,
            })),
            hasSharedVersion: fs.existsSync(path.resolve(suggestedSharedPath)),
        });
    }
    return patterns;
}

function findSharedExports(files) {
    const sharedNames = new Set();
    const sharedFiles = files.filter((f) => f.includes(`${path.sep}src${path.sep}shared${path.sep}`) || f.includes(`${path.sep}mcp-server${path.sep}src${path.sep}shared${path.sep}`));
    for (const filePath of sharedFiles) {
        let text;
        try {
            text = fs.readFileSync(filePath, 'utf8');
        } catch {
            continue;
        }
        const re = /export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
        let m;
        while ((m = re.exec(text))) {
            sharedNames.add(m[1]);
        }
    }
    return sharedNames;
}

function findImportDuplication(files, sharedNames) {
    const findings = [];
    for (const filePath of files) {
        if (filePath.includes(`${path.sep}shared${path.sep}`)) {
            continue;
        }
        let text;
        try {
            text = fs.readFileSync(filePath, 'utf8');
        } catch {
            continue;
        }
        for (const fnName of sharedNames) {
            const localDef = new RegExp(`\\bfunction\\s+${fnName}\\s*\\(`).test(text);
            const localConst = new RegExp(`\\b(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:async\\s*)?\\(`).test(text);
            const imported = new RegExp(`\\bimport\\s+[^\\n]*\\b${fnName}\\b`).test(text);
            if ((localDef || localConst) && !imported) {
                const line = (text.slice(0, text.indexOf(fnName)).match(/\n/g) || []).length + 1;
                findings.push({
                    type: 'import-duplication',
                    fnName,
                    filePath,
                    startLine: line,
                    endLine: line,
                    suggestedSharedPath: filePath.includes(`${path.sep}mcp-server${path.sep}`)
                        ? 'mcp-server/src/shared/'
                        : 'src/shared/',
                });
            }
        }
    }
    return findings;
}

function buildReport(opts) {
    const registry = loadRegistry(opts.registryPath);
    const files = collectTargetFiles(registry.projects);
    const blocks = [];
    for (const filePath of files) {
        const next = extractBlocks(filePath, opts.minLines, opts.minStatements);
        blocks.push(...next);
    }

    const exact = clusterExact(blocks);
    const near = clusterNear(blocks, opts.nearThreshold);
    const pattern = clusterPattern(blocks);
    const sharedNames = findSharedExports(files);
    const importDup = findImportDuplication(files, sharedNames);

    const clusters = [...exact, ...near, ...pattern];

    return {
        generatedAt: new Date().toISOString(),
        options: {
            minLines: opts.minLines,
            minStatements: opts.minStatements,
            nearThreshold: opts.nearThreshold,
            registryPath: registry.registryPath,
        },
        stats: {
            projectsScanned: registry.projects.length,
            filesScanned: files.length,
            blocksAnalyzed: blocks.length,
            clusters: clusters.length,
            exactClusters: exact.length,
            nearClusters: near.length,
            patternClusters: pattern.length,
            importDuplicationFindings: importDup.length,
        },
        clusters,
        importDuplication: importDup,
    };
}

function formatClusterLine(cluster, index) {
    const typeTag = cluster.type.toUpperCase();
    const count = cluster.occurrences.length;
    return `[${typeTag}] Cluster ${index + 1} (${count} occurrence${count === 1 ? '' : 's'}, ${cluster.similarity}% similar)`;
}

function toText(report) {
    const lines = [];
    lines.push('Code Auditor - One-Time-One-Place Report');
    lines.push('===========================================');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Projects scanned: ${report.stats.projectsScanned}`);
    lines.push(`Files scanned: ${report.stats.filesScanned}`);
    lines.push(`Blocks analyzed: ${report.stats.blocksAnalyzed}`);
    lines.push('');

    if (report.clusters.length === 0) {
        lines.push('No duplication clusters found.');
    } else {
        report.clusters.forEach((cluster, idx) => {
            lines.push(formatClusterLine(cluster, idx));
            for (const occ of cluster.occurrences) {
                lines.push(`  ${occ.filePath}:${occ.startLine}-${occ.endLine}`);
            }
            lines.push(`  -> Shared version exists: ${cluster.hasSharedVersion ? 'YES' : 'NO'}`);
            lines.push(`  -> Suggested abstraction: ${cluster.suggestedSharedPath}`);
            lines.push('');
        });
    }

    if (report.importDuplication.length > 0) {
        lines.push('Import Duplication Findings');
        lines.push('--------------------------');
        for (const item of report.importDuplication) {
            lines.push(`- ${item.fnName} at ${item.filePath}:${item.startLine}`);
            lines.push(`  -> Suggested: import from ${item.suggestedSharedPath}`);
        }
        lines.push('');
    }

    lines.push('Summary');
    lines.push('-------');
    lines.push(`Total clusters: ${report.stats.clusters}`);
    lines.push(`  Exact clusters: ${report.stats.exactClusters}`);
    lines.push(`  Near clusters: ${report.stats.nearClusters}`);
    lines.push(`  Pattern clusters: ${report.stats.patternClusters}`);
    lines.push(`Import-duplication findings: ${report.stats.importDuplicationFindings}`);

    return lines.join('\n');
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const report = buildReport(opts);
    if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2));
        return;
    }
    process.stdout.write(`${toText(report)}\n`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        const message = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
        process.stderr.write(`code-auditor failed: ${message}\n`);
        process.exit(1);
    }
}

module.exports = {
    parseArgs,
    buildReport,
    toText,
};
