'use strict';
/**
 * tests/home-recent-projects-send-path.test.js
 *
 * Regression guard for CVT Home "Recent Projects" Send Path to Chat action.
 *
 * Requirements locked by this test:
 *   1) Each recent project card emits a Send Path button with class rec-chat.
 *   2) Frontend posts sendPathToChat when Send Path is clicked.
 *   3) Click handler stops propagation so Send Path does not open the folder.
 *   4) Extension host handles sendPathToChat and opens chat with isPartialQuery.
 *   5) Compiled output contains the same wiring.
 *
 * Run: node tests/home-recent-projects-send-path.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'features', 'home-page.ts');
const OUT = path.join(__dirname, '..', 'out', 'features', 'home-page.js');

const src = fs.readFileSync(SRC, 'utf8');
const out = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

function mustContain(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}\nMissing: ${needle}`);
}

// Source checks
mustContain(src, 'class="rec-chat" data-path="${esc(r.fsPath)}"',
  'SOURCE: Recent project card must include Send Path button with per-project path');
mustContain(src, 'title="Send this folder path to Copilot Chat (text only; no files attached)."',
  'SOURCE: Send Path button must expose an explanatory hover tooltip');
mustContain(src, "type:'sendPathToChat'",
  'SOURCE: Frontend must post sendPathToChat message');
mustContain(src, 'e.stopPropagation();',
  'SOURCE: Send Path click must not trigger open-folder click');
mustContain(src, 'e.preventDefault();',
  'SOURCE: Send Path click should prevent default action');
mustContain(src, "msg.type === 'sendPathToChat' && msg.path",
  'SOURCE: Extension host must handle sendPathToChat messages');
mustContain(src, "workbench.action.chat.open",
  'SOURCE: Extension host must open Copilot Chat directly');
mustContain(src, 'query: folderPath',
  'SOURCE: Extension host must pass only the raw folder path as query text');
mustContain(src, 'isPartialQuery: true',
  'SOURCE: Extension host must prefill chat input without auto-send');

// Compiled checks
assert.ok(out.length > 0,
  'COMPILED: out/features/home-page.js not found. Run npm run compile or npm run rebuild.');
mustContain(out, 'class="rec-chat" data-path="',
  'COMPILED: Send Path button missing in compiled output');
mustContain(out, 'text only; no files attached',
  'COMPILED: Send Path tooltip text missing in compiled output');
mustContain(out, "type:'sendPathToChat'",
  'COMPILED: sendPathToChat postMessage missing in compiled output');
mustContain(out, "msg.type === 'sendPathToChat' && msg.path",
  'COMPILED: sendPathToChat host handler missing in compiled output');
mustContain(out, 'workbench.action.chat.open',
  'COMPILED: chat open command wiring missing in compiled output');
mustContain(out, 'query: folderPath',
  'COMPILED: raw folder path query wiring missing in compiled output');
mustContain(out, 'isPartialQuery: true',
  'COMPILED: isPartialQuery prefill flag missing in compiled output');

console.log('PASS: Home Recent Projects Send Path to Chat regression checks passed.');
