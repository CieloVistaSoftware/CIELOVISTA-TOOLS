// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-127: shipped source must not hardcode a Windows user-profile path (#685).
//
// Root cause: REGISTRY_PATH and the other CieloVistaStandards / repo-self paths
// were literal strings beginning with C:\Users\jwpmi\... duplicated across ~20
// shipped files. On any machine whose Windows account is not "jwpmi" the
// registry, doc-auditor, command-launcher READMEs and license-sync all resolved
// to a path that does not exist — the last real gate on distributing CVT.
//
// Fix (PR #675 + follow-up): every such literal became
// path.join(os.homedir(), ...). This test is the guard: it fails the build if a
// hardcoded C:\Users\<name>\ path is reintroduced anywhere under src/ or
// mcp-server/src/, in code OR in a comment (comments become copy-paste sources).

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT     = path.join(__dirname, '..', '..');
const SCAN_DIRS = [
    path.join(ROOT, 'src'),
    path.join(ROOT, 'mcp-server', 'src'),
];

// Matches C:\Users\someone or C:/Users/someone, single- or double-escaped.
const USER_PROFILE_RE = /[A-Za-z]:(\\\\|\\|\/)Users(\\\\|\\|\/)[A-Za-z0-9][A-Za-z0-9._-]*/;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

function collect(dir, out) {
    if (!fs.existsSync(dir)) { return out; }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'out') { continue; }
            collect(full, out);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

console.log('REG-127: no hardcoded C:\\Users\\<name> paths in shipped source (#685)');
console.log('-'.repeat(70));

test('src/ and mcp-server/src/ contain no hardcoded user-profile path', () => {
    const files = SCAN_DIRS.reduce((acc, dir) => collect(dir, acc), []);
    assert.ok(files.length > 0, 'no source files found to scan — check SCAN_DIRS');

    const offenders = [];
    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            if (USER_PROFILE_RE.test(line)) {
                offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
            }
        });
    }

    assert.strictEqual(
        offenders.length, 0,
        `hardcoded user-profile path(s) found — use path.join(os.homedir(), ...) instead:\n       ` +
        offenders.join('\n       ')
    );
});

test('the canonical registry path is derived from os.homedir()', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'registry.ts'), 'utf8');
    assert.ok(
        /REGISTRY_PATH\s*=\s*path\.join\(\s*os\.homedir\(\)/.test(src),
        'src/shared/registry.ts REGISTRY_PATH must be built with path.join(os.homedir(), ...)'
    );
});

console.log('-'.repeat(70));
console.log(`REG-127: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
