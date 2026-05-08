// Copyright (c) CieloVista Software. All rights reserved.
// REG-028: Issues #296 #297 — Doc Catalog "Folder" button and Rebuilt panel project rows
// must open VS Code on the target folder.
//
// Proves 4 fails before fix:
//   1. Rebuilt panel project rows have data-action attribute (open-project-vscode)
//   2. Rebuilt panel project rows have data-path attribute with the project path
//   3. Rebuilt panel JS has a click handler that dispatches open-project-vscode messages
//   4. rebuildPanel onDidReceiveMessage handles 'open-project-vscode'

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMANDS_SRC = fs.readFileSync(path.join(ROOT, 'src/features/doc-catalog/commands.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ─── 1. Rebuilt panel rows: data-action="open-project-vscode" ─────────────────

test('buildRebuildSummaryHtml: project rows have data-action="open-project-vscode"', () => {
  assert(
    COMMANDS_SRC.includes('data-action="open-project-vscode"') ||
    COMMANDS_SRC.includes("data-action='open-project-vscode'"),
    'buildRebuildSummaryHtml does not render data-action="open-project-vscode" on project rows'
  );
});

// ─── 2. Rebuilt panel rows: data-path with project path ───────────────────────

test('buildRebuildSummaryHtml: project rows have data-path with project path', () => {
  assert(
    COMMANDS_SRC.includes('data-path="${_rbEsc(p.path)}"') ||
    COMMANDS_SRC.includes("data-path='${_rbEsc(p.path)}'"),
    'buildRebuildSummaryHtml project rows do not include data-path="${_rbEsc(p.path)}" — project path not passed to row'
  );
});

// ─── 3. Rebuilt panel JS: click handler dispatches open-project-vscode ────────

test('buildRebuildSummaryHtml: JS click handler dispatches open-project-vscode', () => {
  assert(
    COMMANDS_SRC.includes("open-project-vscode"),
    'buildRebuildSummaryHtml JS does not dispatch open-project-vscode message'
  );
  // Verify it's in the JS section (inside the script tag, not just the HTML)
  const scriptIdx = COMMANDS_SRC.indexOf("acquireVsCodeApi");
  const openProjIdx = COMMANDS_SRC.lastIndexOf("open-project-vscode");
  assert(
    openProjIdx > scriptIdx,
    'open-project-vscode message is not inside the webview JS (must appear after acquireVsCodeApi in the script)'
  );
});

// ─── 4. onDidReceiveMessage for rebuild panel handles open-project-vscode ─────

test('rebuildPanel.webview.onDidReceiveMessage handles open-project-vscode command', () => {
  // The rebuild panel's message handler must handle 'open-project-vscode'
  const rebuildListenerIdx = COMMANDS_SRC.indexOf("_rebuildPanel.webview.onDidReceiveMessage");
  assert(rebuildListenerIdx !== -1, '_rebuildPanel.webview.onDidReceiveMessage not found in commands.ts');

  // The handler block runs from that index to the next });
  // Grab the ~300 chars after it and verify open-project-vscode is there
  const handlerBlock = COMMANDS_SRC.slice(rebuildListenerIdx, rebuildListenerIdx + 500);
  assert(
    handlerBlock.includes('open-project-vscode'),
    '_rebuildPanel.webview.onDidReceiveMessage does not handle open-project-vscode — only open-catalog and rebuild-again are handled'
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('REG-028: Doc Catalog open-folder actions (#296 #297)');
console.log('─'.repeat(50));
if (failed === 0) {
  console.log(`✓ REG-028 passed (${passed} checks).`);
  process.exit(0);
} else {
  console.error(`✗ REG-028 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
