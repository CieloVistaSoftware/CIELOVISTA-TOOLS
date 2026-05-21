'use strict';
/**
 * REG-089 — Component Registry Viewer: cvs.registry.showComponents
 *
 * Issue #456: Command Registry (issue #455) was command-centric; needed a
 * complementary component-centric view showing every feature with its owned
 * commands.
 *
 * Fix:
 *   - src/features/command-registry-viewer.ts gains cvs.registry.showComponents
 *   - explorer-copy-path-to-chat.README.md fixed (was wrapped in a code block)
 *   - package.json contributes cvs.registry.showComponents
 *
 * Checks:
 *  1. Viewer registers cvs.registry.showComponents
 *  2. deactivate() disposes activeCompPanel
 *  3. package.json contributes cvs.registry.showComponents
 *  4. scan-commands.js --json produces a components array
 *  5. components array has 52 entries
 *  6. Each component has componentId, featureTitle, featureFile, sourceFile
 *  7. Each component has commandCount (number) and commandIds (array)
 *  8. explorer-copy-path-to-chat component is present (README was fixed)
 *  9. explorer-copy-path-to-chat has at least 1 linked command
 * 10. buildComponentHtml logic: viewer source contains 'showComponents'
 * 11. viewer source contains 'activeCompPanel'
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT   = path.join(__dirname, '..', '..');
const VIEWER = path.join(ROOT, 'src', 'features', 'command-registry-viewer.ts');
const PKG    = path.join(ROOT, 'package.json');
const SCRIPT = path.join(ROOT, 'scripts', 'scan-commands.js');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-089: Component Registry Viewer — showComponents + README fix');
console.log('');

const viewerSrc = fs.existsSync(VIEWER) ? fs.readFileSync(VIEWER, 'utf8') : '';

// 1. Command registered in viewer source
check("Viewer registers 'cvs.registry.showComponents'", viewerSrc.includes('cvs.registry.showComponents'));

// 2. deactivate disposes activeCompPanel
check('deactivate() disposes activeCompPanel',           viewerSrc.includes('activeCompPanel?.dispose()'));

// 3. package.json contributes the command
const pkg     = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const pkgCmds = (pkg.contributes?.commands ?? []).map(c => c.command);
check('package.json contributes cvs.registry.showComponents', pkgCmds.includes('cvs.registry.showComponents'));

// 4-9. Run scan-commands.js --json and inspect components
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
    check('scan-commands.js produces a components array',
        Array.isArray(registry.components) && registry.components.length > 0);

    check('components array has 52 entries',
        registry.components.length === 52);

    check('Each component has required fields',
        registry.components.every(c =>
            typeof c.componentId  === 'string' &&
            typeof c.featureTitle === 'string' &&
            typeof c.featureFile  === 'string' &&
            typeof c.sourceFile   === 'string'
        ));

    check('Each component has commandCount (number) and commandIds (array)',
        registry.components.every(c =>
            typeof c.commandCount === 'number' && Array.isArray(c.commandIds)
        ));

    const explorerComp = registry.components.find(c => c.componentId === 'explorer-copy-path-to-chat');
    check('explorer-copy-path-to-chat component is present (README fixed)',
        explorerComp !== undefined);

    check('explorer-copy-path-to-chat has at least 1 linked command',
        explorerComp !== undefined && explorerComp.commandCount >= 1);
} else {
    for (let i = 0; i < 6; i++) { console.error(`  ✗ (skipped — JSON parse failed)`); failed++; }
}

// 10-11. Source-text checks on viewer
check("Viewer source contains 'showComponents'",   viewerSrc.includes('showComponents'));
check("Viewer source contains 'activeCompPanel'",  viewerSrc.includes('activeCompPanel'));

console.log('');
if (failed > 0) {
    console.error(`REG-089 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-089 passed (${passed} checks)`);
}
