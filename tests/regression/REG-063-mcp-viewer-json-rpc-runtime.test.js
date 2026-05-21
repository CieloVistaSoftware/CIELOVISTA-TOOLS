/**
 * tests/regression/REG-063-mcp-viewer-json-rpc-runtime.test.js
 *
 * Guards issue #390: the MCP viewer's active UI flows must use JSON-RPC
 * POST /mcp rather than legacy REST /api/... endpoints.
 */
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
          try { parsedBody = JSON.parse(options.body); } catch (error) {}
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
        } else if (rpcMethod === 'active_markdown') {
          result = {
            hasActiveMarkdown: true,
            filePath: 'C:/docs/README.md',
          };
        } else if (rpcMethod === 'list_markdown_paths') {
          result = {
            paths: [
              {
                projectName: 'cielovista-tools',
                fileName: 'README.md',
                filePath: 'C:/docs/README.md',
                lastModified: '2026-05-15T00:00:00.000Z',
              },
            ],
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

  const badApiCallsAfterLoad = requests.filter((r) => r.url.includes('/api/'));
  assert.strictEqual(badApiCallsAfterLoad.length, 0, 'initial MCP viewer load must not call legacy /api endpoints');
  assert.ok(requests.some((r) => r.url.endsWith('/mcp') && r.method === 'list_projects'), 'initial load must request list_projects via POST /mcp');

  const getCatalogTab = doc.querySelector('.tab[data-endpoint="get_catalog"]');
  assert.ok(getCatalogTab, 'get_catalog tab button not found');
  getCatalogTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();
  await flush();

  const projSelect = doc.getElementById('proj');
  assert.ok(projSelect, 'get_catalog project dropdown not found');
  projSelect.value = 'DiskCleanUp';
  projSelect.dispatchEvent(new win.Event('change', { bubbles: true }));

  await flush();
  await flush();

  assert.ok(requests.some((r) => r.url.endsWith('/mcp') && r.method === 'get_catalog' && r.params && r.params.projectName === 'DiskCleanUp'), 'get_catalog project selection must use JSON-RPC POST /mcp');

  const validateTab = doc.querySelector('.tab[data-endpoint="validate_doc"]');
  assert.ok(validateTab, 'validate_doc tab button not found');
  validateTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();
  await flush();

  const activeFileButton = doc.getElementById('btn-active-file');
  const filePathInput = doc.getElementById('filePath');
  assert.ok(activeFileButton, 'Use Active .md button not found');
  assert.ok(filePathInput, 'file path input not found');
  activeFileButton.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();

  assert.strictEqual(filePathInput.value, 'C:/docs/README.md', 'active markdown helper should populate the file path from JSON-RPC result');
  assert.ok(requests.some((r) => r.url.endsWith('/mcp') && r.method === 'active_markdown'), 'active markdown helper must use JSON-RPC POST /mcp');

  const badApiCalls = requests.filter((r) => r.url.includes('/api/'));
  assert.strictEqual(badApiCalls.length, 0, 'no tested MCP viewer flow should call legacy /api endpoints');

  console.log('PASS: MCP viewer active flows use JSON-RPC POST /mcp and avoid legacy /api routes.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});