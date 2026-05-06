// Run with: node tests/unit/mcp-viewer-runtime-script.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const SRC = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');
assert.ok(fs.existsSync(SRC), 'Source file not found: src/features/mcp-viewer/html.ts');

const sourceTs = fs.readFileSync(SRC, 'utf8');

const transpiled = ts.transpileModule(sourceTs, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleCtx = { module: { exports: {} }, exports: {}, require, console };
vm.runInNewContext(transpiled, moduleCtx, { filename: 'mcp-viewer-html.transpiled.js' });

const buildViewerHtml = moduleCtx.module.exports.buildViewerHtml || moduleCtx.exports.buildViewerHtml;
assert.strictEqual(typeof buildViewerHtml, 'function', 'buildViewerHtml export not found after transpile');

const generatedHtml = buildViewerHtml(4321, 19);
const match = generatedHtml.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'Could not extract <script> block from generated viewer HTML');

const scriptText = match[1];

try {
  // Critical runtime guard: if this throws, the browser page stays stuck at
  // "Loading list_projects..." because no script executes.
  // eslint-disable-next-line no-new-func
  new Function(scriptText);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  assert.fail(`MCP viewer page script is not valid JavaScript: ${msg}`);
}

console.log('PASS: MCP viewer page script parses as valid JavaScript.');
