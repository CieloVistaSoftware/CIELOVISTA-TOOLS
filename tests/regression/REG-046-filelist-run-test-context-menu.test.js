/**
 * REG-046-filelist-run-test-context-menu.test.js
 *
 * Regression test for issue #353 — FileList: right-click on a test file in
 * tests/ shows a "Run Test" context menu option that runs the file with node.
 *
 * Checks (source-level):
 *   1. Context menu HTML element (#ctx-menu) exists in buildHtml()
 *   2. contextmenu event handler guards on .js/.ts + tests/ path
 *   3. run-test postMessage is sent on menu click
 *   4. Extension-side onDidReceiveMessage handles 'run-test' command and
 *      spawns the file with process.execPath
 *   5. Webview template uses escaped backslash regex literal (/\\\\/g)
 *      so script parsing does not break in generated HTML
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const FEATURE = path.join(__dirname, '..', '..', 'src', 'features', 'file-list-viewer.ts');

let passed = 0, failed = 0;

function pass(msg) { console.log(`PASS: ${msg}`); passed++; }
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }

const src = fs.readFileSync(FEATURE, 'utf8');

// 1. Context menu HTML is present
(function checkContextMenuHtml() {
    if (src.includes('id="ctx-menu"') && src.includes('id="ctx-run-test"')) {
        pass('#ctx-menu and #ctx-run-test elements exist in buildHtml()');
    } else {
        fail('#ctx-menu or #ctx-run-test missing from file-list-viewer.ts HTML');
    }
})();

// 2. contextmenu guard: only shows for .js/.ts files under tests/
(function checkContextMenuGuard() {
    const hasJsTsRule = src.includes('/\\.(js|ts)$/i.test(name || \'\')');
    const hasTestsCheck = src.includes("includes('/tests')");
    if (hasJsTsRule && hasTestsCheck) {
        pass('contextmenu guard checks .js/.ts extension and /tests path');
    } else {
        fail(`contextmenu guard missing: jsTsRule=${hasJsTsRule} includes('/tests')=${hasTestsCheck}`);
    }
})();

// 3. run-test postMessage is sent on menu click
(function checkRunTestPostMessage() {
    if (src.includes("command: 'run-test'") && src.includes('names: _ctxNames')) {
        pass("vsc.postMessage({ command: 'run-test', names: _ctxNames }) wired to ctx-run-test button");
    } else {
        fail("run-test postMessage not found in file-list-viewer.ts");
    }
})();

// 4. Extension-side handler spawns node with the test file
(function checkExtensionHandler() {
    const hasCase = src.includes("msg.command === 'run-test'");
    const hasSpawn = src.includes('spawn(process.execPath');
    const hasChildProcess = src.includes("from 'child_process'");
    const hasMultiNames = src.includes('Array.isArray(msg.names)');
    if (hasCase && hasSpawn && hasChildProcess && hasMultiNames) {
        pass("onDidReceiveMessage handles run-test names[] and spawns with process.execPath");
    } else {
        fail(`run-test handler incomplete: hasCase=${hasCase} hasSpawn=${hasSpawn} hasChildProcess=${hasChildProcess} hasMultiNames=${hasMultiNames}`);
    }
})();

// 5. Runnable test helper keeps tests-dir normalization in one place
(function checkRunnableHelperPathNormalization() {
    const hasHelper = src.includes('function isRunnableTestFile(name)');
    // Accept either replace(/\\/g,'/') or split('\\').join('/') — both normalize Windows paths.
    // In the template literal source, backslashes are doubled, so the on-disk forms are
    // replace(/\\\\/g,'/') or split('\\\\').join('/') (4 backslashes each).
    const hasDirNormalize = src.includes("includes('/tests')") && (
        src.includes("replace(/\\\\/g, '/').includes('/tests')") ||
        src.includes("split('\\\\\\\\').join('/').includes('/tests')")
    );
    if (hasHelper && hasDirNormalize) {
        pass('isRunnableTestFile helper normalizes path and gates to /tests');
    } else {
        fail(`runnable helper missing expected normalization: hasHelper=${hasHelper} hasDirNormalize=${hasDirNormalize}`);
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
