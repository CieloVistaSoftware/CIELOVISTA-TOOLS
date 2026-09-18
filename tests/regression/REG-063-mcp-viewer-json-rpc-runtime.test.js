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

// #780: the server refuses any request without its token, so the page must send it.
const TOKEN = 'abababababababababababababababababababababababababababababababab';
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
  return buildViewerHtml(4321, 19, TOKEN);
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
        } else if (rpcMethod === 'list_cvt_commands') {
          result = {
            group: '(all)',
            totalCommands: 1,
            matchCount: 1,
            commands: [
              { id: 'cvs.mcp.viewer.open', title: 'Mcp: Viewer: Open', description: 'Open the viewer', tags: [], group: 'MCP', scope: 'global' },
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
  assert.ok(requests.some((r) => r.url.endsWith('/mcp?t=' + TOKEN) && r.method === 'list_projects'), 'initial load must request list_projects via POST /mcp');

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

  assert.ok(requests.some((r) => r.url.endsWith('/mcp?t=' + TOKEN) && r.method === 'get_catalog' && r.params && r.params.projectName === 'DiskCleanUp'), 'get_catalog project selection must use JSON-RPC POST /mcp');

  const cmdTab = doc.querySelector('.tab[data-endpoint="list_cvt_commands"]');
  assert.ok(cmdTab, 'list_cvt_commands tab button not found');
  cmdTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();

  assert.ok(requests.some((r) => r.url.endsWith('/mcp?t=' + TOKEN) && r.method === 'list_cvt_commands'), 'list_cvt_commands must use JSON-RPC POST /mcp');

  const badApiCalls = requests.filter((r) => r.url.includes('/api/'));
  assert.strictEqual(badApiCalls.length, 0, 'no tested MCP viewer flow should call legacy /api endpoints');

  console.log('PASS: MCP viewer active flows use JSON-RPC POST /mcp and avoid legacy /api routes.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});