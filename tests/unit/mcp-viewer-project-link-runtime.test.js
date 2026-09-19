// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// Run with: node tests/unit/mcp-viewer-project-link-runtime.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// #780: the server refuses any request without its token, so the page must send it.
const TOKEN = 'abababababababababababababababababababababababababababababababab';
// The real page: buildViewerHtml() from the out-test build (#838). Until #838
// this test transpiled html.ts itself and ran the copy in a vm.
const OUT = path.join(__dirname, '../../out-test/features/mcp-viewer/html.js');
if (!fs.existsSync(OUT)) {
  // Not a skip: the runners build out-test/ first, so this is a real failure.
  console.error('FAIL: out-test build missing: ' + OUT);
  process.exit(1);
}
const { buildViewerHtml } = require(OUT);

// A page script that throws, or does not parse, fails the test (#838).
const pageErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.forwardTo(console, { jsdomErrors: 'none' });
virtualConsole.on('jsdomError', (e) => pageErrors.push((e.cause && e.cause.message) || e.message));

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async () => {
  const requests = [];

  const dom = new JSDOM(buildViewerHtml(4321, 19, TOKEN), {
    runScripts: 'dangerously',
    virtualConsole,
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
          const projectName = rpcParams.projectName || '(all)';
          result = {
            projectName,
            docCount: 1,
            docs: [{
              projectName,
              fileName: 'README.md',
              filePath: 'C:/' + projectName + '/README.md',
              title: 'Readme',
              description: 'Project doc',
              lastModified: '2026-05-06T00:00:00.000Z',
            }],
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

  assert.deepStrictEqual(pageErrors, [], 'the viewer page script failed');
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

  const matching = requests.find((r) => r.url.endsWith('/mcp?t=' + TOKEN) && r.method === 'get_catalog' && r.params && r.params.projectName === 'DiskCleanUp');
  assert.ok(matching, 'clicking a project name must fetch get_catalog filtered to that project');

  console.log('PASS: project links in list_projects open filtered get_catalog view at runtime.');
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
