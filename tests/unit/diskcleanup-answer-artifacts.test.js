'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const SRC = path.join(__dirname, '../../src/shared/diskcleanup-answer-artifacts.ts');
assert.ok(fs.existsSync(SRC), `Source not found: ${SRC}`);

const sourceTs = fs.readFileSync(SRC, 'utf8');
const transpiled = ts.transpileModule(sourceTs, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleCtx = {
  module: { exports: {} },
  exports: {},
  require,
  console,
  process,
  Buffer,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(transpiled, moduleCtx, { filename: 'diskcleanup-answer-artifacts.transpiled.js' });

const mod = moduleCtx.module.exports.refreshDiskCleanupAnswerArtifacts
  ? moduleCtx.module.exports
  : moduleCtx.exports;
assert.strictEqual(typeof mod.refreshDiskCleanupAnswerArtifacts, 'function', 'refreshDiskCleanupAnswerArtifacts export missing');
assert.strictEqual(typeof mod.readDiskCleanupAnswerManifest, 'function', 'readDiskCleanupAnswerManifest export missing');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dcup-answers-test-'));
process.env.DISKCLEANUP_PROGRAMDATA = tempRoot;

const scanCache = {
  updatedAt: '2026-05-17T00:00:00.000Z',
  items: [
    { section: 'Large Files', id: 'a1', bytes: 123 },
    { section: 'Large Files', id: 'a2', bytes: 456 },
    { section: 'Temp Files', id: 'b1', bytes: 78 },
  ],
};

const manifest = mod.refreshDiskCleanupAnswerArtifacts(scanCache);
assert.strictEqual(manifest.status, 'ok');
assert.strictEqual(manifest.totalSections, 2);
assert.strictEqual(manifest.totalItems, 3);
assert.ok(fs.existsSync(manifest.manifestPath), 'manifest should exist');

const largeFilesRow = manifest.sections.find((s) => s.section === 'Large Files');
assert.ok(largeFilesRow, 'Large Files section row missing');
assert.ok(fs.existsSync(largeFilesRow.filePath), 'Large Files artifact missing');
const largePayload = JSON.parse(fs.readFileSync(largeFilesRow.filePath, 'utf8'));
assert.strictEqual(largePayload.count, 2);
assert.strictEqual(Array.isArray(largePayload.items), true);

const readBack = mod.readDiskCleanupAnswerManifest();
assert.strictEqual(readBack.status, 'ok');
assert.strictEqual(readBack.totalSections, 2);
assert.strictEqual(readBack.totalItems, 3);

const answerDir = mod._test.answersDir();
const lingeringTemps = fs.readdirSync(answerDir).filter((name) => name.endsWith('.tmp'));
assert.deepStrictEqual(lingeringTemps, [], 'atomic writes should not leave .tmp files behind');

console.log('PASS: diskcleanup answer artifacts generate manifest + section files with atomic writes');
