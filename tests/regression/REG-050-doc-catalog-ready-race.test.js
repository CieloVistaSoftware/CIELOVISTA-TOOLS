// Copyright (c) CieloVista Software. All rights reserved.
// REG-050: Doc Catalog ready/init race guard.
//
// Repro captured from user report:
// 1) Click action that calls cvs.catalog.open (for example from rebuild summary).
// 2) New Doc Catalog panel opens beside editor.
// 3) Panel shows no cards (blank body) because 'ready' was posted before
//    onDidReceiveMessage was attached in extension host.
//
// Guardrail:
// In openCatalog() new-panel branch, attachMessageHandler(_catalogPanel)
// MUST run before assigning _catalogPanel.webview.html.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_PATH = path.join(ROOT, 'src/features/doc-catalog/commands.ts');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const HTML_PATH = path.join(ROOT, 'src/features/doc-catalog/catalog.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name);
    console.error('       ' + err.message);
    failed++;
  }
}

console.log('REG-050: Doc Catalog ready/init race guard');
console.log('─'.repeat(56));

test('openCatalog new-panel branch attaches message handler before setting webview.html', () => {
  const elseIdx = SRC.indexOf('} else {\n        _catalogPanel = vscode.window.createWebviewPanel(');
  assert(elseIdx !== -1, 'openCatalog new-panel branch not found');

  const branch = SRC.slice(elseIdx, elseIdx + 700);
  const attachIdx = branch.indexOf('attachMessageHandler(_catalogPanel);');
  const htmlIdx = branch.indexOf('_catalogPanel.webview.html = html;');

  assert(attachIdx !== -1, 'attachMessageHandler(_catalogPanel) not found in new-panel branch');
  assert(htmlIdx !== -1, '_catalogPanel.webview.html = html not found in new-panel branch');
  assert(
    attachIdx < htmlIdx,
    'Race detected: webview.html is assigned before attachMessageHandler, so ready/init can be missed and panel appears blank'
  );
});

test('doc-catalog webview does not use timer-based ready retry fallback', () => {
  assert(
    !/setTimeout\(function\s*\(\)\s*\{\s*if\s*\(!_hasData\)\s*\{\s*vscode\.postMessage\(\{\s*command:\s*'ready'\s*\}\)/.test(HTML),
    'Timer-based ready retry fallback detected in catalog.html; startup must be reactive-only'
  );
});

test('doc-catalog host init is posted directly (no timer delay)', () => {
  const fnStart = SRC.indexOf('function sendCatalogInit(');
  assert(fnStart !== -1, 'sendCatalogInit function not found');

  let depth = 0;
  let i = fnStart;
  while (i < SRC.length) {
    if (SRC[i] === '{') { depth++; }
    else if (SRC[i] === '}') {
      depth--;
      if (depth === 0) { break; }
    }
    i++;
  }
  const fnBody = SRC.slice(fnStart, i + 1);

  assert(
    !/setTimeout\(/.test(fnBody),
    'Timer-delayed init detected in sendCatalogInit; host must post init reactively without delay'
  );
});

console.log('─'.repeat(56));
if (failed === 0) {
  console.log('✓ REG-050 passed (' + passed + ' checks).');
  process.exit(0);
} else {
  console.error('✗ REG-050 FAILED (' + failed + ' of ' + (passed + failed) + ' checks failed).');
  process.exit(1);
}
