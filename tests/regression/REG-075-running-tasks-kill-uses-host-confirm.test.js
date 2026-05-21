'use strict';
/**
 * REG-075 — Kill Selected uses VS Code host confirmation, not browser confirm()
 *
 * VS Code webviews block browser confirm()/alert()/prompt(). Kill Selected was
 * broken because the webview called confirm() which always returned false,
 * aborting the kill.
 *
 * Fix: webview sends 'kill-confirm' to the extension host, which shows a
 * vscode.window.showWarningMessage dialog, then kills on confirmation.
 *
 * Checks:
 *  1. Webview JS does NOT call confirm() for kill
 *  2. Webview JS sends 'kill-confirm' command (not 'kill') on button click
 *  3. Extension host handler 'kill-confirm' exists (not 'kill')
 *  4. Extension host shows showWarningMessage before calling killPids
 *  5. 'kill-cancelled' message is sent back to webview on cancel
 *  6. Webview listens for 'kill-cancelled' to restore pause state
 */

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/features/running-tasks.ts');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-075: running-tasks kill uses host confirmation');

// 1. No browser confirm() for kill
check(
    'Webview JS does not call confirm() for the kill flow',
    !src.includes("confirm('Kill") && !src.includes('confirm("Kill')
);

// 2. Webview sends 'kill-confirm' to extension host
check(
    "Webview postMessage sends command 'kill-confirm'",
    src.includes("command: 'kill-confirm'")
);

// 3. Extension host handles 'kill-confirm', not bare 'kill'
check(
    "Extension host switch handles 'kill-confirm' case",
    src.includes("case 'kill-confirm':")
);

// 4. showWarningMessage called before killPids in kill-confirm handler
const killConfirmBlock = src.slice(src.indexOf("case 'kill-confirm':"));
const warnIdx  = killConfirmBlock.indexOf('showWarningMessage');
const killIdx  = killConfirmBlock.indexOf('killPids(');
check(
    'showWarningMessage called before killPids in kill-confirm handler',
    warnIdx > 0 && killIdx > 0 && warnIdx < killIdx
);

// 5. kill-cancelled sent back to webview on cancel
check(
    "Extension host sends 'kill-cancelled' back to webview when user cancels",
    src.includes("command: 'kill-cancelled'")
);

// 6. Webview listens for 'kill-cancelled'
check(
    "Webview message listener handles 'kill-cancelled'",
    src.includes("msg.command === 'kill-cancelled'")
);

console.log('');
if (failed > 0) {
    console.error(`REG-075 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-075 passed (${passed} checks)`);
}
