#!/usr/bin/env node
'use strict';
/**
 * scan-commands.js
 *
 * Builds data/commands-registry.json — the single source of truth for all
 * CVS command IDs, cross-referenced with the feature component that owns them.
 *
 * Sources scanned:
 *   1. package.json → contributes.commands  (authoritative ID/title/category/description)
 *   2. src/features/*.README.md             (componentId "id:" + ## Commands tables)
 *
 * Output: data/commands-registry.json
 *
 * Usage:
 *   node scripts/scan-commands.js           → write data/commands-registry.json
 *   node scripts/scan-commands.js --json    → print JSON to stdout (no write)
 *   node scripts/scan-commands.js --summary → print summary only
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const FEAT_DIR = path.join(ROOT, 'src', 'features');
const OUT_PATH = path.join(ROOT, 'data', 'commands-registry.json');

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const SUMMARY   = args.includes('--summary');

// ─── 1. Read package.json commands ──────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const pkgCommands = new Map(); // commandId → {title, category, description}

for (const cmd of (pkg.contributes?.commands ?? [])) {
    pkgCommands.set(cmd.command, {
        id:          cmd.command,
        title:       cmd.title        ?? '',
        category:    cmd.category     ?? '',
        description: cmd.description  ?? '',
    });
}

// ─── 2. Parse feature READMEs ────────────────────────────────────────────────

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) { return {}; }
    const result = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (kv) {
            result[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
        }
    }
    return result;
}

function parseCommandsTable(content) {
    // Find ## Commands section
    const sectionMatch = content.match(/##\s+Commands[\s\S]*?(?=\n##\s|\n---|\n```|$)/);
    if (!sectionMatch) { return []; }

    const section = sectionMatch[0];
    const ids = [];

    // Extract command IDs — match any `cvs.xxx` pattern (camelCase IDs like runningTasks)
    const cmdRegex = /`(cvs\.[a-zA-Z0-9.]+)`/g;
    let m;
    while ((m = cmdRegex.exec(section)) !== null) {
        const id = m[1];
        if (id !== 'cvs.' && id.length > 4) { ids.push(id); }
    }
    return [...new Set(ids)];
}

// componentId → { componentId, featureTitle, featureFile, commandIds[] }
const componentMap = new Map();
// commandId → componentId (for cross-reference)
const cmdToComponent = new Map();

for (const filename of fs.readdirSync(FEAT_DIR).filter(f => f.endsWith('.README.md'))) {
    const fullPath = path.join(FEAT_DIR, filename);
    const content  = fs.readFileSync(fullPath, 'utf8');
    const fm       = parseFrontmatter(content);

    const componentId  = fm.id    ?? filename.replace('.README.md', '');
    const featureTitle = fm.title ?? componentId;
    const tsFile       = filename.replace('.README.md', '.ts');

    const commandIds = parseCommandsTable(content);

    componentMap.set(componentId, {
        componentId,
        featureTitle,
        featureFile:  `src/features/${filename}`,
        sourceFile:   `src/features/${tsFile}`,
        commandIds,
    });

    for (const cmdId of commandIds) {
        cmdToComponent.set(cmdId, componentId);
    }
}

// ─── 3. Build unified registry ───────────────────────────────────────────────

const commands = [];
const linked   = new Set();
const unlinked = [];

for (const [cmdId, meta] of pkgCommands) {
    const componentId = cmdToComponent.get(cmdId) ?? null;
    const component   = componentId ? componentMap.get(componentId) : null;

    commands.push({
        id:          cmdId,
        title:       meta.title,
        category:    meta.category,
        description: meta.description,
        componentId: componentId,
        featureTitle: component?.featureTitle ?? null,
        featureFile:  component?.featureFile  ?? null,
    });

    if (componentId) { linked.add(cmdId); }
    else             { unlinked.push(cmdId); }
}

// Sort: by category then by id
commands.sort((a, b) => {
    const cat = (a.category ?? '').localeCompare(b.category ?? '');
    return cat !== 0 ? cat : a.id.localeCompare(b.id);
});

const components = [...componentMap.values()].map(c => ({
    componentId:  c.componentId,
    featureTitle: c.featureTitle,
    featureFile:  c.featureFile,
    sourceFile:   c.sourceFile,
    commandCount: c.commandIds.length,
    commandIds:   c.commandIds,
})).sort((a, b) => a.componentId.localeCompare(b.componentId));

const registry = {
    generated:     new Date().toISOString(),
    totalCommands: commands.length,
    linked:        linked.size,
    unlinked:      unlinked.length,
    totalComponents: components.length,
    commands,
    components,
    unlinkedCommands: unlinked,
};

// ─── 4. Output ───────────────────────────────────────────────────────────────

if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(registry, null, 2));
    process.exit(0);
}

if (SUMMARY) {
    console.log(`Commands:    ${registry.totalCommands} total, ${registry.linked} linked, ${registry.unlinked} unlinked`);
    console.log(`Components:  ${registry.totalComponents}`);
    if (unlinked.length > 0) {
        console.log(`Unlinked:    ${unlinked.slice(0, 5).join(', ')}${unlinked.length > 5 ? ` … +${unlinked.length - 5} more` : ''}`);
    }
    process.exit(0);
}

// Write to data/
const dataDir = path.join(ROOT, 'data');
if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir, { recursive: true }); }
fs.writeFileSync(OUT_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8');

console.log(`✓ data/commands-registry.json written`);
console.log(`  ${registry.totalCommands} commands, ${registry.linked} linked to ${registry.totalComponents} components, ${registry.unlinked} unlinked`);
