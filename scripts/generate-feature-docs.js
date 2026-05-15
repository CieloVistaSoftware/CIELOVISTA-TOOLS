// Copyright (c) CieloVista Software. All rights reserved.
// scripts/generate-feature-docs.js
//
// Generates .README.md for every feature that lacks one.
// Extracts real content from source — never fabricates descriptions.
// Run: node scripts/generate-feature-docs.js
// Wire: called as part of npm run rebuild via npm run docs:generate

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const FEATURES = path.join(ROOT, 'src', 'features');
const TODAY    = new Date().toISOString().slice(0, 10);

// ── helpers ──────────────────────────────────────────────────────────────────

function slug(name) {
    return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function titleCase(str) {
    return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Extract all 'cvs.*' command IDs from registerCommand calls */
function extractCommands(src) {
    const re = /registerCommand\(\s*['"`](cvs\.[^'"`]+)['"`]/g;
    const ids = [];
    let m;
    while ((m = re.exec(src)) !== null) {
        if (!ids.includes(m[1])) { ids.push(m[1]); }
    }
    // Also catch const COMMAND_* = 'cvs...' pattern
    const constRe = /const\s+COMMAND_\w+\s*=\s*['"`](cvs\.[^'"`]+)['"`]/g;
    while ((m = constRe.exec(src)) !== null) {
        if (!ids.includes(m[1])) { ids.push(m[1]); }
    }
    return ids;
}

/** Extract exported function names */
function extractExports(src) {
    const fns = [];
    const re = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let m;
    while ((m = re.exec(src)) !== null) { fns.push(m[1]); }
    return fns;
}

/** Extract top-level function names (for architecture) */
function extractFunctions(src) {
    const fns = [];
    const re = /^(?:async\s+)?function\s+(\w+)/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        if (!['activate', 'deactivate'].includes(m[1])) { fns.push(m[1]); }
    }
    return fns;
}

/** Extract the FEATURE constant value */
function extractFeatureName(src) {
    const m = src.match(/const\s+FEATURE\s*=\s*['"`]([^'"`]+)['"`]/);
    return m ? m[1] : null;
}

/** Derive human-readable command title from its ID */
function commandTitle(id) {
    // cvs.audit.testCoverage.refresh → "Test Coverage: Refresh"
    const parts = id.split('.').slice(1); // drop 'cvs'
    return parts.map(titleCase).join(': ');
}

/** Generate test steps from command IDs */
function testSteps(commands, featureTitle) {
    if (!commands.length) {
        return `1. Open a workspace with the CieloVista Tools extension active.\n2. Verify ${featureTitle} activates without errors in the Output channel.`;
    }
    return commands.map((id, i) => {
        const title = commandTitle(id);
        return `${i + 1}. Open the Command Palette and run **${title}** (\`${id}\`).\n   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.`;
    }).join('\n');
}

/** Build architecture section from internal functions */
function architectureSection(commands, fns, featureName) {
    const cmdList = commands.map(id => `  └── ${commandTitle(id)} → ${id}`).join('\n');
    const fnList  = fns.length
        ? '\n\n**Key internal functions:**\n' + fns.map(f => `- \`${f}()\``).join('\n')
        : '';
    return `\`\`\`
activate(context)
  └── registers ${commands.length || 0} command(s)
${cmdList}
\`\`\`${fnList}`;
}

/** Generate the full README content */
function generate(featureFile, relativePath) {
    const src         = fs.readFileSync(featureFile, 'utf8');
    // For subdirectory features (index.ts / feature.ts), use the directory name as the slug
    const dirName     = path.basename(path.dirname(featureFile));
    const isSubdir    = ['index', 'feature'].includes(path.basename(featureFile, '.ts'));
    const baseName    = isSubdir ? dirName : path.basename(featureFile, '.ts');
    const featureName = extractFeatureName(src) || baseName;
    const title       = titleCase(featureName.replace(/[._]/g, '-'));
    // Subdirectory READMEs get a '-dir' suffix on the docid to avoid colliding
    // with a same-named direct feature file (e.g. readme-compliance.ts vs readme-compliance/).
    const docSlug     = isSubdir ? `${slug(baseName)}-dir` : slug(baseName);
    const id          = `feature-${slug(baseName)}`;
    const commands    = extractCommands(src);
    const exports     = extractExports(src);
    const fns         = extractFunctions(src);
    const hasActivate = exports.includes('activate');

    const commandRows = commands.length
        ? commands.map(id => `| [\`${id}\`](command:${id}) | ${commandTitle(id)} |`).join('\n')
        : '_No commands registered — utility/shared module._';

    return `---
docid: auto.${docSlug}
id: ${id}
title: "Feature: ${title}"
project: cielovista-tools
description: "${title} — ${commands.length} command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [${featureName.split(/[-.]/).slice(0, 3).join(', ')}]
category: 150.1 — Components / Features
created: ${TODAY}
updated: ${TODAY}
version: 1.0.0
author: CieloVista Software
relativepath: ${relativePath}
---
# Feature: ${title}

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
${commandRows}

---

## Internal architecture

${architectureSection(commands, fns, featureName)}

---

## Manual test

${testSteps(commands, title)}
`;
}

// ── scan ─────────────────────────────────────────────────────────────────────

let generated = 0;
let skipped   = 0;
let errors    = 0;

function processFile(tsFile, readmePath, relPath) {
    if (fs.existsSync(readmePath)) { skipped++; return; }
    try {
        const content = generate(tsFile, relPath);
        fs.writeFileSync(readmePath, content, 'utf8');
        console.log(`  + ${path.relative(ROOT, readmePath)}`);
        generated++;
    } catch (err) {
        console.error(`  ! ${path.relative(ROOT, tsFile)}: ${err.message}`);
        errors++;
    }
}

console.log('\nCieloVista Tools — Feature Doc Generator');
console.log('─'.repeat(50));

// Direct feature files: src/features/*.ts
const directFiles = fs.readdirSync(FEATURES, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .filter(e => !e.name.includes('types') && !e.name.includes('-types'))
    .map(e => e.name);

for (const file of directFiles) {
    const tsFile    = path.join(FEATURES, file);
    const base      = path.basename(file, '.ts');
    const readmePath = path.join(FEATURES, `${base}.README.md`);
    const relPath   = `src/features/${base}.README.md`;
    processFile(tsFile, readmePath, relPath);
}

// Subdirectory feature files: src/features/*/index.ts
const subdirs = fs.readdirSync(FEATURES, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

for (const dir of subdirs) {
    const indexFile  = path.join(FEATURES, dir, 'index.ts');
    const featureFile = path.join(FEATURES, dir, 'feature.ts');
    const tsFile     = fs.existsSync(indexFile) ? indexFile : fs.existsSync(featureFile) ? featureFile : null;
    if (!tsFile) { continue; }

    const readmePath = path.join(FEATURES, dir, 'README.md');
    const relPath    = `src/features/${dir}/README.md`;
    processFile(tsFile, readmePath, relPath);
}

console.log('─'.repeat(50));
console.log(`✓ Generated: ${generated}  Skipped (already exists): ${skipped}  Errors: ${errors}\n`);
if (errors > 0) { process.exit(1); }
