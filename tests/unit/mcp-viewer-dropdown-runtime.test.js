// Run with: node tests/unit/mcp-viewer-dropdown-runtime.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const ts = require('typescript');

const SRC = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');
assert.ok(fs.existsSync(SRC), 'Source file not found: src/features/mcp-viewer/html.ts');

function buildHtml() {
  const sourceTs = fs.readFileSync(SRC, 'utf8');
  const transpiled = ts.transpileModule(sourceTs, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const ctx = { module: { exports: {} }, exports: {}, require, console };
  vm.runInNewContext(transpiled, ctx, { filename: 'mcp-viewer-html.transpiled.js' });
  const buildViewerHtml = ctx.module.exports.buildViewerHtml || ctx.exports.buildViewerHtml;
  assert.strictEqual(typeof buildViewerHtml, 'function', 'buildViewerHtml export not found');
  return buildViewerHtml(4321, 19);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  const requests = [];

  const dom = new JSDOM(buildHtml(), {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://127.0.0.1:4321/',
    beforeParse(window) {
      window.fetch = (url, options) => {
        const href = String(url);
        let parsedBody = {};
        if (options && options.body) {
          try { parsedBody = JSON.parse(options.body); } catch (e) {}
        }
        const rpcMethod = parsedBody.method || '';
        const rpcParams = parsedBody.params || {};
        requests.push({ url: href, method: rpcMethod, params: rpcParams });
        let result = {};
        if (rpcMethod === 'list_projects') {
          result = {
            globalDocsPath: 'C:/docs',
            status: '(all)',
            projectCount: 2,
            projects: [
              { name: 'DiskCleanUp', path: 'C:/DiskCleanUp', type: 'product', description: 'Disk cleanup', status: 'product' },
              { name: 'cielovista-tools', path: 'C:/cielovista-tools', type: 'product', description: 'Tools', status: 'product' },
            ],
          };
        } else if (rpcMethod === 'get_catalog') {
          result = {
            projectName: rpcParams.projectName || '(all)',
            docCount: 0,
            docs: [],
          };
        }
        const body = { jsonrpc: '2.0', id: parsedBody.id, result };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
        });
      };
    },
  });

  const win = dom.window;
  const doc = win.document;

  await flush();
  await flush();

  const getCatalogTab = doc.querySelector('.tab[data-endpoint="get_catalog"]');
  assert.ok(getCatalogTab, 'get_catalog tab button not found');
  getCatalogTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();
  await flush();

  const projSelect = doc.getElementById('proj');
  assert.ok(projSelect, 'get_catalog project dropdown not found');
  assert.strictEqual(projSelect.tagName, 'SELECT', 'get_catalog project control must be a SELECT');

  const optionValues = Array.from(projSelect.querySelectorAll('option')).map((o) => o.value);
  assert.ok(optionValues.includes('DiskCleanUp'), 'project dropdown options should include DiskCleanUp');

  requests.length = 0;
  projSelect.value = 'DiskCleanUp';
  projSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  await flush();
  await flush();

  const matching = requests.find((r) => r.url.endsWith('/mcp') && r.method === 'get_catalog' && r.params && r.params.projectName === 'DiskCleanUp');
  assert.ok(matching, 'Changing get_catalog project dropdown must trigger JSON-RPC POST /mcp with method=get_catalog and projectName=DiskCleanUp');

  console.log('PASS: get_catalog project dropdown change triggers filtered fetch at runtime.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
