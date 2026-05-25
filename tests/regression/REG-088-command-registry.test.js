'use strict';
/**
 * REG-088 — Command Registry: scan-commands.js + viewer wired correctly
 *
 * Issue #455: Commands were scattered across docs, extension.ts, package.json,
 * and npm scripts with no single source of truth.
 *
 * Fix:
 *   - scripts/scan-commands.js builds data/commands-registry.json
 *   - src/features/command-registry-viewer.ts renders a searchable webview
 *   - Two commands registered: cvs.registry.showCommands + cvs.registry.rebuild
 *
 * Checks:
 *  1. scripts/scan-commands.js exists
 *  2. Running scan-commands.js --json produces valid JSON
 *  3. Registry JSON has totalCommands > 0
 *  4. Registry JSON has a commands array
 *  5. Registry JSON has a components array
 *  6. Registry JSON has unlinkedCommands array (surfaces gaps)
 *  7. command-registry-viewer.ts exists
 *  8. Viewer registers cvs.registry.showCommands
 *  9. Viewer registers cvs.registry.rebuild
 * 10. package.json contributes cvs.registry.showCommands
 * 11. extension.ts imports command-registry-viewer
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT    = path.join(__dirname, '..', '..');
const SCRIPT  = path.join(ROOT, 'scripts', 'scan-commands.js');
const VIEWER  = path.join(ROOT, 'src', 'features', 'command-registry-viewer.ts');
const PKG     = path.join(ROOT, 'package.json');
const EXT     = path.join(ROOT, 'src', 'extension.ts');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-088: Command Registry — scanner + viewer (issue #455)');
console.log('');

// 1. Script exists
check('scripts/scan-commands.js exists', fs.existsSync(SCRIPT));

// 2-6. Script produces valid JSON with expected shape
let registry = null;
try {
    const json = execFileSync('node', [SCRIPT, '--json'], {
        cwd: ROOT, timeout: 15000, maxBuffer: 1024 * 1024,
    }).toString('utf8');
    registry = JSON.parse(json);
} catch (e) {
    console.error(`  ✗ scan-commands.js --json failed: ${e.message}`);
    failed++;
}

if (registry) {
    check('Registry totalCommands > 0',               typeof registry.totalCommands === 'number' && registry.totalCommands > 0);
    check('Registry has commands array',               Array.isArray(registry.commands) && registry.commands.length > 0);
    check('Registry has components array',             Array.isArray(registry.components) && registry.components.length > 0);
    check('Registry has unlinkedCommands array',       Array.isArray(registry.unlinkedCommands));
    check('Each command has id, title, category fields',
        registry.commands.every(c => c.id && typeof c.title === 'string' && typeof c.category === 'string'));
} else {
    // count 5 failures for skipped checks
    for (let i = 0; i < 5; i++) { console.error(`  ✗ (skipped — JSON parse failed)`); failed++; }
}

// 7. Viewer file exists
check('src/features/command-registry-viewer.ts exists', fs.existsSync(VIEWER));

const viewerSrc = fs.existsSync(VIEWER) ? fs.readFileSync(VIEWER, 'utf8') : '';

// 8-9. Commands registered
check("Viewer registers 'cvs.registry.showCommands'",  viewerSrc.includes('cvs.registry.showCommands'));
check("Viewer registers 'cvs.registry.rebuild'",       viewerSrc.includes('cvs.registry.rebuild'));

// 10. package.json contributes the command
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const pkgCmds = (pkg.contributes?.commands ?? []).map(c => c.command);
check('package.json contributes cvs.registry.showCommands', pkgCmds.includes('cvs.registry.showCommands'));

// 11. extension.ts imports the viewer
const extSrc = fs.readFileSync(EXT, 'utf8');
check('extension.ts imports command-registry-viewer',  extSrc.includes('command-registry-viewer'));

console.log('');
if (failed > 0) {
    console.error(`REG-088 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-088 passed (${passed} checks)`);
}
