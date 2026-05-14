// Copyright (c) CieloVista Software. All rights reserved.
// REG-049: FileList webview basic render path smoke test.
//
// Ensures FileList still has the minimum runtime path required to show files:
//  1) tbody exists in HTML
//  2) update message writes state and calls render()
//  3) render() loops state.entries and appends rows
//  4) ready message is posted so host can push initial data
//  5) pushUpdate() includes entries in posted state
//
// Run: node tests/regression/REG-049-filelist-webview-basic-render.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'file-list-viewer.ts'),
    'utf8'
);

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`PASS: ${msg}`); passed += 1; }
function fail(msg) { console.error(`FAIL: ${msg}`); failed += 1; }

(function checkTbodyExists() {
    if (SRC.includes('id="tbody"')) {
        pass('webview HTML contains tbody target');
    } else {
        fail('missing id="tbody" in webview HTML');
    }
})();

(function checkUpdateMessageCallsRender() {
    const hasUpdateType = SRC.includes("ev.data.type === 'update'");
    const hasStateSet = SRC.includes('state = ev.data.state;');
    const hasRenderCall = SRC.includes('render();');
    if (hasUpdateType && hasStateSet && hasRenderCall) {
        pass('update message writes state and calls render()');
    } else {
        fail(`update/render path incomplete: updateType=${hasUpdateType} stateSet=${hasStateSet} render=${hasRenderCall}`);
    }
})();

(function checkRenderAppendsRows() {
    const hasLoop = SRC.includes('for (const e of state.entries)');
    const hasCreate = SRC.includes("document.createElement('tr')");
    const hasAppend = SRC.includes('tbody.appendChild(tr);');
    if (hasLoop && hasCreate && hasAppend) {
        pass('render() loops entries and appends table rows');
    } else {
        fail(`render row path incomplete: loop=${hasLoop} create=${hasCreate} append=${hasAppend}`);
    }
})();

(function checkReadyHandshake() {
    if (SRC.includes("vsc.postMessage({ command: 'ready' })")) {
        pass('webview sends ready handshake');
    } else {
        fail('missing ready handshake message');
    }
})();

(function checkPushUpdateIncludesEntries() {
    const hasPushUpdate = SRC.includes('function pushUpdate(): void');
    const hasEntries = SRC.includes('entries,');
    const hasUpdateType = SRC.includes("type: 'update'");
    if (hasPushUpdate && hasEntries && hasUpdateType) {
        pass('pushUpdate() posts update state with entries');
    } else {
        fail(`pushUpdate payload incomplete: fn=${hasPushUpdate} entries=${hasEntries} type=${hasUpdateType}`);
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
