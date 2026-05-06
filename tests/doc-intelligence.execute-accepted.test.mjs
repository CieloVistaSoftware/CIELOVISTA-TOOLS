// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Test: Execute Accepted in Doc Intelligence

import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── vscode mock (engine.js has no vscode dep, but load guard) ────────────────
const Module = require('module');
const vscodeMock = { window: {}, workspace: {}, commands: {}, Uri: {} };
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
    if (req === 'vscode') {
        const tmp = path.join(ROOT, '.fake-vscode-engine.js');
        require('fs').writeFileSync(tmp, 'module.exports = ' + JSON.stringify(vscodeMock) + ';', 'utf8');
        return tmp;
    }
    return _origResolve.call(this, req, parent, ...rest);
};

const engine = require(path.join(ROOT, 'out', 'features', 'doc-intelligence', 'engine.js'));
const { executeAcceptedFindings, getFindings, clearFindings, addFinding } = engine;

// ── Minimal test shims ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function describe(_l, fn) { fn(); }
function beforeEach(fn) { _beforeEachFn = fn; }
let _beforeEachFn = null;
async function it(label, fn) {
    if (_beforeEachFn) { _beforeEachFn(); }
    try { await fn(); console.log('  PASS  ' + label); passed++; }
    catch (e) { console.error('  FAIL  ' + label + '\n         → ' + e.message); failed++; }
}

// Mock finding with a create action
const finding = {
  id: 'test-1',
  kind: 'missing-readme',
  severity: 'red',
  title: 'Missing README: test-app',
  reason: 'No README.md in test-app',
  recommendation: 'Create README.md',
  action: 'create',
  paths: [],
  decision: 'accepted',
};

console.log('\nDoc Intelligence: Execute Accepted\n' + '\u2500'.repeat(50));

describe('Doc Intelligence: Execute Accepted', async function() {
  beforeEach(() => { clearFindings(); });

  await it('should execute all accepted findings', async function() {
    addFinding({ ...finding });
    const before = getFindings().filter(f => f.decision === 'accepted').length;
    assert.strictEqual(before, 1, 'Should have 1 accepted finding before execution');
    await executeAcceptedFindings();
    const after = getFindings().filter(f => f.decision === 'accepted').length;
    assert.strictEqual(after, 0, 'Should have 0 accepted findings after execution');
  });
});

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }

