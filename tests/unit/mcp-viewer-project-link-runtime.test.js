// Run with: node tests/unit/mcp-viewer-project-link-runtime.test.js

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
      window.fetch = (url, init) => {
        const href = String(url);
        let rpcMethod = '';
        let rpcParams = {};
        if (init && init.body) {
          try {
            const rpc = JSON.parse(init.body);
            rpcMethod = rpc.method || '';
            rpcParams = rpc.params || {};
          } catch (e) { /* ignore */ }
        }
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
          const projectName = rpcParams.projectName || '(all)';
          result = {
            projectName,
            docCount: 1,
            docs: [{
              projectName,
              fileName: 'README.md',
              filePath: 'C:/'+projectName+'/README.md',
              title: 'Readme',
              description: 'Project doc',
              lastModified: '2026-05-06T00:00:00.000Z',
            }],
          };
        }
        const responseBody = JSON.stringify({ jsonrpc: '2.0', id: 1, result });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
          text: () => Promise.resolve(responseBody),
        });
      };
    },
  });

  const win = dom.window;
  const doc = win.document;

  await flush();
  await flush();
  await flush();

  const clickableProject = doc.querySelector('[data-action="open-project-catalog"][data-project="DiskCleanUp"]');
  assert.ok(clickableProject, 'list_projects project names should render as clickable open-project-catalog controls');

  requests.length = 0;
  clickableProject.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  await flush();
  await flush();
  await flush();
  await flush();

  const activeTab = doc.querySelector('.tab.active');
  assert.ok(activeTab, 'there should be an active tab after clicking a project name');
  assert.strictEqual(activeTab.getAttribute('data-endpoint'), 'get_catalog', 'clicking a project name should switch to get_catalog tab');

  const matching = requests.find((r) => r.url.includes('/mcp') && r.method === 'get_catalog' && r.params.projectName === 'DiskCleanUp');
  assert.ok(matching, 'clicking a project name must trigger POST /mcp with method=get_catalog and params.projectName=DiskCleanUp');

  console.log('PASS: project links in list_projects open filtered get_catalog view at runtime.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
