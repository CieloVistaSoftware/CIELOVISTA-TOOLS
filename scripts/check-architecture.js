// check-architecture.js
// Enforces cielovista-tools architecture rules.
//
// Real rules enforced here:
//   1. shared/ files must NOT call vscode.commands.registerCommand — only feature files register commands
//   2. No duplicate command IDs across all feature files
//   3. No duplicate Dewey numbers in catalog.ts
//
// NOT enforced (intentional design choices, not violations):
//   - extension.ts wires everything — it is allowed to call registerCommand if needed
//   - Feature files may register multiple related commands (e.g. catalog.open, catalog.rebuild)
//   - Shared utilities may use vscode.window.* (output channels, webviews, etc.)

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC_DIR      = path.join(__dirname, '../src');
const FEATURE_DIR  = path.join(SRC_DIR, 'features');
const SHARED_DIR   = path.join(SRC_DIR, 'shared');

const errors = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllTsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { results.push(...getAllTsFiles(full)); }
        else if (entry.isFile() && full.endsWith('.ts')) { results.push(full); }
    }
    return results;
}

function relPath(file) {
    return path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

// ── Check 1: No registerCommand in shared/ ────────────────────────────────────
// shared/ files are pure utilities — command registration belongs in features/ only.

function checkNoRegisterCommandInShared() {
    for (const file of getAllTsFiles(SHARED_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        if (/vscode\.commands\.registerCommand\s*\(/.test(src)) {
            errors.push(`registerCommand in shared/ (move to a feature file): ${relPath(file)}`);
        }
    }
}

// ── Check 2: No duplicate command IDs across feature files ────────────────────
// Two feature files must not register the same command string.

function checkNoDuplicateCommandIds() {
    const seen = new Map(); // commandId → first file
    for (const file of getAllTsFiles(FEATURE_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/vscode\.commands\.registerCommand\s*\(\s*['"`](cvs\.[^'"`]+)['"`]/g)) {
            const cmd = m[1];
            if (seen.has(cmd)) {
                if (seen.get(cmd) !== file) {   // same file registering twice is caught separately
                    errors.push(`Duplicate command ID '${cmd}': ${relPath(seen.get(cmd))} and ${relPath(file)}`);
                }
            } else {
                seen.set(cmd, file);
            }
        }
    }
}

// ── Check 3: No duplicate Dewey numbers in catalog.ts ────────────────────────

function checkNoDuplicateDeweyNumbers() {
    const catalogPath = path.join(FEATURE_DIR, 'cvs-command-launcher', 'catalog.ts');
    if (!fs.existsSync(catalogPath)) { return; }
    const src  = fs.readFileSync(catalogPath, 'utf8');
    const seen = new Map();
    for (const m of src.matchAll(/dewey\s*:\s*['"](\d{3}\.[0-9]{3})['"]/g)) {
        const dewey = m[1];
        if (seen.has(dewey)) {
            errors.push(`Duplicate Dewey number ${dewey} in catalog.ts`);
        } else {
            seen.set(dewey, true);
        }
    }
}

// ── Run ───────────────────────────────────────────────────────────────────────

checkNoRegisterCommandInShared();
checkNoDuplicateCommandIds();
checkNoDuplicateDeweyNumbers();

if (errors.length === 0) {
    console.log('✅ Architecture checks passed.');
    process.exit(0);
} else {
    console.error('❌ Architecture violations found:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
}
