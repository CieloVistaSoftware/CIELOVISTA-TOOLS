// Run with: node tests/unit/interactive-result-chat-button.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/shared/show-interactive-result-webview.ts');
assert.ok(fs.existsSync(SRC), 'Source file not found: show-interactive-result-webview.ts');

const source = fs.readFileSync(SRC, 'utf8');

// Regression guard: "Copy to VS Code Chat" must be available in the result
// webview regardless of failed/success state.
assert.ok(
  source.includes('Copy to VS Code Chat'),
  'Missing "Copy to VS Code Chat" button label in result webview HTML.'
);

assert.ok(
  !source.includes("${opts.failed ? '<button id=\"chatBtn\"") &&
    !source.includes("${opts.failed ? \"document.getElementById('chatBtn')"),
  'Chat button wiring is still conditional on opts.failed; it must be always available.'
);

assert.ok(
  source.includes("document.getElementById('chatBtn').onclick") && source.includes("type: 'copy-to-chat'"),
  'Chat button is not wired to send a copy-to-chat message.'
);

console.log('PASS: Interactive result webview always exposes Copy to VS Code Chat.');
