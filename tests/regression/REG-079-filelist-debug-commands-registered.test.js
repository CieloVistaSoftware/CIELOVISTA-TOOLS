'use strict';
/**
 * REG-079 — FileList debug commands are registered in file-list-viewer.ts
 *
 * Issue #448: The VS Code integration test suite (home-filelist-gui.test.js)
 * exercises three debug commands:
 *   - cvs.tools.fileList._debugState
 *   - cvs.tools.fileList._debugEntries
 *   - cvs.tools.fileList._debugOpenEntry
 *
 * These commands are required for integration tests to inspect the live panel
 * state without touching the DOM.  This test verifies that:
 *   1. All three command IDs are registered via registerCommand() in source
 *   2. _debugState handler returns an object with 'dir' and 'entryCount' fields
 *   3. _debugEntries handler maps entries to { name, isDir } shape
 *   4. _debugOpenEntry handler delegates to openEntryFromCurrentDir()
 *   5. The commands are registered inside activate() — not at module level —
 *      so they appear only after the extension is activated
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILE_LIST_SRC = path.join(ROOT, 'src', 'features', 'file-list-viewer.ts');

let passed = 0;
let failed = 0;

function check(desc, cond, detail) {
    if (cond) {
        console.log(`  ✓ ${desc}`);
        passed++;
    } else {
        console.error(`  ✗ ${desc}${detail ? ': ' + detail : ''}`);
        failed++;
    }
}

console.log('REG-079: FileList debug commands registered in file-list-viewer.ts');
console.log('');

// Read the source file
let src;
try {
    src = fs.readFileSync(FILE_LIST_SRC, 'utf8');
} catch (e) {
    console.error(`  ✗ Cannot read ${FILE_LIST_SRC}: ${e.message}`);
    process.exit(1);
}

// ── Check 1: _debugState is registered via registerCommand ────────────────────
check(
    "cvs.tools.fileList._debugState registered via registerCommand()",
    src.includes("registerCommand('cvs.tools.fileList._debugState'")
);

// ── Check 2: _debugEntries is registered via registerCommand ──────────────────
check(
    "cvs.tools.fileList._debugEntries registered via registerCommand()",
    src.includes("registerCommand('cvs.tools.fileList._debugEntries'")
);

// ── Check 3: _debugOpenEntry is registered via registerCommand ────────────────
check(
    "cvs.tools.fileList._debugOpenEntry registered via registerCommand()",
    src.includes("registerCommand('cvs.tools.fileList._debugOpenEntry'")
);

// ── Check 4: _debugState handler returns object with 'dir' field ──────────────
// The handler must include 'dir:' in its return literal so callers can read
// the current directory.  This is what the integration test asserts on:
//   assert.ok(state.dir, 'FileList start state unavailable')
const debugStateIdx = src.indexOf("registerCommand('cvs.tools.fileList._debugState'");
check(
    "_debugState handler includes 'dir:' in return object",
    debugStateIdx !== -1 && src.slice(debugStateIdx, debugStateIdx + 400).includes('dir:')
);

// ── Check 5: _debugState handler returns object with 'entryCount' field ───────
// Integration test: assert.ok(Number(debugState.entryCount || 0) > 0, ...)
check(
    "_debugState handler includes 'entryCount:' in return object",
    debugStateIdx !== -1 && src.slice(debugStateIdx, debugStateIdx + 400).includes('entryCount:')
);

// ── Check 6: _debugEntries handler maps to { name, isDir } ───────────────────
// Integration test uses:  entries.find(e => e && e.isDir && e.name)
const debugEntriesIdx = src.indexOf("registerCommand('cvs.tools.fileList._debugEntries'");
check(
    "_debugEntries handler maps entries to objects with 'name' and 'isDir' fields",
    debugEntriesIdx !== -1 &&
    src.slice(debugEntriesIdx, debugEntriesIdx + 300).includes('name') &&
    src.slice(debugEntriesIdx, debugEntriesIdx + 300).includes('isDir')
);

// ── Check 7: _debugOpenEntry delegates to openEntryFromCurrentDir ─────────────
// It must call openEntryFromCurrentDir so the live panel actually navigates.
const debugOpenIdx = src.indexOf("registerCommand('cvs.tools.fileList._debugOpenEntry'");
check(
    "_debugOpenEntry handler calls openEntryFromCurrentDir()",
    debugOpenIdx !== -1 && src.slice(debugOpenIdx, debugOpenIdx + 400).includes('openEntryFromCurrentDir')
);

// ── Check 8: All three commands are registered inside activate() ──────────────
// Find the activate() function body and verify all three IDs appear inside it.
const activateIdx = src.indexOf('export function activate(');
const deactivateIdx = src.indexOf('export function deactivate(');
check(
    "All three debug commands are registered inside export function activate()",
    activateIdx !== -1 &&
    deactivateIdx !== -1 &&
    activateIdx < deactivateIdx &&
    (function() {
        const activateBody = src.slice(activateIdx, deactivateIdx);
        return (
            activateBody.includes("'cvs.tools.fileList._debugState'") &&
            activateBody.includes("'cvs.tools.fileList._debugEntries'") &&
            activateBody.includes("'cvs.tools.fileList._debugOpenEntry'")
        );
    })()
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
    console.error(`REG-079 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-079 passed (${passed} checks)`);
}
