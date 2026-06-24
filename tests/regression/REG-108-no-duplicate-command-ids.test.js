/**
 * tests/regression/REG-108-no-duplicate-command-ids.test.js
 *
 * Regression test for issue #522:
 *   "Feature activation failed: CVS Command Launcher — command 'cvs.launch.pick' already exists"
 *
 * Root cause: project-launcher.ts and cvs-command-launcher/index.ts both registered
 * cvs.launch.pick and all cvs.launch.* commands; when both features activated, the
 * second registration threw "command already exists".
 *
 * This test scans every .ts file under src/ for registerCommand('...') calls and
 * asserts that no command ID appears more than once across the codebase.
 *
 * Run: node tests/regression/REG-108-no-duplicate-command-ids.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'src');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    → ${err.message.split('\n')[0]}`);
        err.message.split('\n').slice(1, 10).forEach(l => console.error(`      ${l}`));
        failed++;
    }
}

function assert(cond, msg) { if (!cond) { throw new Error(msg); } }

function walkTs(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            walkTs(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            results.push(full);
        }
    }
    return results;
}

console.log('\nREG-108: No duplicate registerCommand() IDs across src/\n' + '─'.repeat(50));

test('No command ID is passed to registerCommand() more than once across all src/ .ts files', () => {
    const seen = new Map(); // commandId -> [filePath, ...]

    for (const file of walkTs(SRC)) {
        const src = fs.readFileSync(file, 'utf8');
        const re  = /registerCommand\(\s*['"]([^'"]+)['"]/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            const id = m[1];
            if (!seen.has(id)) { seen.set(id, []); }
            seen.get(id).push(path.relative(ROOT, file));
        }
    }

    const dupes = [...seen.entries()].filter(([, files]) => files.length > 1);
    assert(
        dupes.length === 0,
        `${dupes.length} command ID(s) registered in multiple files:\n` +
        dupes.map(([id, files]) => `  '${id}'\n    ${files.join('\n    ')}`).join('\n')
    );
});

console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ All ${passed} REG-108 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} test(s) FAILED\n`);
    process.exit(1);
}
