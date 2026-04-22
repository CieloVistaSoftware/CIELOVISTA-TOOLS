// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Runtime test: doc-catalog projects module behavior.

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectsJs = path.join(__dirname, '..', 'out', 'features', 'doc-catalog', 'projects.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS:', name);
    passed++;
  } catch (error) {
    console.error('  FAIL:', name, '-', error.message);
    failed++;
  }
}

console.log('\nRunning Doc Catalog Projects Tests...\n');

test('compiled projects.js exists', () => {
  assert.ok(fs.existsSync(projectsJs), `Compiled module missing: ${projectsJs}`);
});

const mod = require(projectsJs);

test('projects module exports expected API', () => {
  assert.strictEqual(typeof mod.loadProjectInfo, 'function', 'loadProjectInfo export missing');
  assert.strictEqual(typeof mod.buildProjectsSectionHtml, 'function', 'buildProjectsSectionHtml export missing');
  assert.ok(Array.isArray(mod.PROJECT_TYPES), 'PROJECT_TYPES export missing');
});

test('loadProjectInfo reads README and detects npm/dotnet', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-doc-catalog-'));
  try {
    fs.writeFileSync(path.join(tmpRoot, 'README.md'), '# Sample\n\nRuntime description from readme.\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({
      scripts: {
        a: 'echo a', b: 'echo b', c: 'echo c', d: 'echo d',
        e: 'echo e', f: 'echo f', g: 'echo g', h: 'echo h', i: 'echo i',
      },
    }), 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'Sample.sln'), 'Microsoft Visual Studio Solution File', 'utf8');

    const info = mod.loadProjectInfo({
      name: 'sample',
      path: tmpRoot,
      type: 'app',
      description: 'fallback description',
    });

    assert.strictEqual(info.description, 'Runtime description from readme.');
    assert.strictEqual(info.hasNpm, true);
    assert.strictEqual(info.hasDotnet, true);
    assert.ok(Object.keys(info.scripts).length <= 8, 'scripts should be capped at 8');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('buildProjectsSectionHtml includes NPM launch action', () => {
  const html = mod.buildProjectsSectionHtml([
    { name: 'alpha', rootPath: 'C:/alpha', type: 'app', description: 'alpha', scripts: {}, hasNpm: true, hasDotnet: false },
  ]);

  assert.ok(html.includes('data-action="open-npm-scripts"'), 'missing open-npm-scripts action');
  assert.ok(html.includes('Open NPM Scripts'), 'missing launch button label');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
