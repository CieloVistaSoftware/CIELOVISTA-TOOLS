// Run with: node tests/broken-refs-mcp.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function rmrf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

(async () => {
  const modPath = path.join(__dirname, '..', 'mcp-server', 'dist', 'tools', 'catalog-helpers.js');
  assert.ok(fs.existsSync(modPath), 'COMPILED: mcp-server/dist/tools/catalog-helpers.js not found. Run npm run mcp:build first.');

  const mod = await import(pathToFileURL(modPath).href);
  assert.strictEqual(typeof mod.listBrokenRefs, 'function', 'Expected listBrokenRefs export from MCP helpers.');

  const tmp = path.join(os.tmpdir(), `cvt-broken-refs-${Date.now()}`);
  const globalDocs = path.join(tmp, 'global');
  const projA = path.join(tmp, 'proj-a');
  const projB = path.join(tmp, 'proj-b');

  fs.mkdirSync(path.join(globalDocs), { recursive: true });
  fs.mkdirSync(path.join(projA, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projA, 'assets', 'diagrams'), { recursive: true });
  fs.mkdirSync(path.join(projB, 'docs'), { recursive: true });

  fs.writeFileSync(path.join(globalDocs, 'README.md'), '# Global\n\nok\n', 'utf8');
  fs.writeFileSync(
    path.join(projA, 'docs', 'guide.md'),
    '# Guide\n\n![Flow](./missing-flow.svg)\n\n[Open Doc](./missing-doc.md)\n\n![Placeholder](./new-diagram.svg)\n',
    'utf8'
  );
  fs.writeFileSync(path.join(projA, 'assets', 'diagrams', 'missing-flow.svg'), '<svg></svg>', 'utf8');
  fs.writeFileSync(path.join(projB, 'docs', 'missing-doc.md'), '# Found in B\n', 'utf8');

  const registry = {
    globalDocsPath: globalDocs,
    projects: [
      { name: 'ProjA', path: projA, type: 'product', description: 'A', status: 'product' },
      { name: 'ProjB', path: projB, type: 'product', description: 'B', status: 'product' }
    ]
  };

  const report = mod.listBrokenRefs(registry, undefined, true);
  assert.ok(report.totalDocsScanned >= 3, 'Expected docs to be scanned across registry.');
  assert.ok(report.totalBroken >= 2, 'Expected at least two broken references.');

  const flowFinding = report.findings.find((f) => String(f.target).includes('missing-flow.svg'));
  assert.ok(flowFinding, 'Expected missing-flow.svg finding.');
  assert.ok(Array.isArray(flowFinding.candidates) && flowFinding.candidates.length >= 1, 'Expected candidate paths for missing-flow.svg.');

  const docFinding = report.findings.find((f) => String(f.target).includes('missing-doc.md'));
  assert.ok(docFinding, 'Expected missing-doc.md finding.');
  assert.ok(Array.isArray(docFinding.candidates) && docFinding.candidates.length >= 1, 'Expected candidate paths for missing-doc.md.');

  const placeholderPath = path.join(projA, 'docs', 'new-diagram.svg');
  assert.ok(fs.existsSync(placeholderPath), 'Expected placeholder SVG to be created when enabled.');
  assert.ok(report.placeholdersCreated >= 1, 'Expected placeholder counter to increment.');

  rmrf(tmp);
  console.log('PASS: MCP broken refs scanner detects missing refs, suggests candidates, and creates SVG placeholders.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
