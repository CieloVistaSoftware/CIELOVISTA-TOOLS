// Run with: node tests/dewey-lookup-mcp.test.js

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
  assert.strictEqual(typeof mod.lookupDocsByDewey, 'function', 'Expected lookupDocsByDewey export from MCP helpers.');

  const tmp = path.join(os.tmpdir(), `cvt-dewey-lookup-${Date.now()}`);
  const globalDocs = path.join(tmp, 'global');
  const projA = path.join(tmp, 'proj-a');
  const projB = path.join(tmp, 'proj-b');

  fs.mkdirSync(globalDocs, { recursive: true });
  fs.mkdirSync(path.join(projA, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projB, 'docs'), { recursive: true });

  // A doc's Dewey number comes from its front-matter docid, never from its
  // file name: c6601b2 ("One-time-one-place identity: catalog dewey comes from
  // frontmatter docid only"). The fixtures used to rely on the file name and
  // every lookup came back empty (#736). The Dewey tools themselves are being
  // retired in stages under #707; until stage 3 removes lookup_dewey, this
  // test checks what it does today.
  const doc = (docid, title) => `---\ndocid: ${docid}\n---\n# ${title}\n\nitem\n`;
  fs.writeFileSync(path.join(globalDocs, 'global.md'), doc('100.001', 'Global'), 'utf8');
  fs.writeFileSync(path.join(projA, 'docs', 'a.md'), doc('1400.005', 'A'), 'utf8');
  fs.writeFileSync(path.join(projB, 'docs', 'b.md'), doc('1400.150', 'B'), 'utf8');

  const registry = {
    globalDocsPath: globalDocs,
    projects: [
      { name: 'ProjA', path: projA, type: 'product', description: 'A', status: 'product' },
      { name: 'ProjB', path: projB, type: 'product', description: 'B', status: 'product' }
    ]
  };

  const docs = mod.scanAllDocs(registry);

  const exact = mod.lookupDocsByDewey(docs, '1400.005', 10);
  assert.ok(exact.some((d) => d.dewey === '1400.005'), 'Expected exact Dewey match.');

  const partialProject = mod.lookupDocsByDewey(docs, '1400', 10);
  assert.ok(partialProject.length >= 2, 'Expected partial project Dewey match to return multiple docs.');

  const partialLeaf = mod.lookupDocsByDewey(docs, '005', 10);
  assert.ok(partialLeaf.some((d) => d.dewey === '1400.005'), 'Expected partial leaf Dewey match.');

  rmrf(tmp);
  console.log('PASS: Dewey lookup returns exact and partial matches from catalog docs.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
