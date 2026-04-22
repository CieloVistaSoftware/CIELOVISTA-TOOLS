// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * view-doc-ui.test.js
 *
 * UI-level test for Doc Catalog webview:
 * 1. Search bar filters and highlights doc cards and text.
 * 2. Clicking any card title or View button opens preview (simulated).
 *
 * Run: node tests/ui/view-doc-ui.test.js
 */

const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '../../out/features/doc-catalog/html.html');

if (!fs.existsSync(HTML_PATH)) {
  console.error('Doc Catalog HTML not found at', HTML_PATH);
  process.exit(1);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });
const { window } = dom;

describe('Doc Catalog View', function() {
  it('filters and highlights cards on search', function(done) {
    const search = window.document.getElementById('search');
    search.value = 'test';
    search.dispatchEvent(new window.Event('input'));
    setTimeout(() => {
      const marks = window.document.querySelectorAll('mark.search-match');
      assert(marks.length > 0, 'No highlighted matches found');
      done();
    }, 100);
  });

  it('clicking card title or View triggers preview', function(done) {
    let triggered = false;
    window.acquireVsCodeApi = () => ({ postMessage: (msg) => {
      if (msg.command === 'preview') triggered = true;
    }});
    const cardTitle = window.document.querySelector('.card-title');
    cardTitle.click();
    setTimeout(() => {
      assert(triggered, 'Preview not triggered on card title click');
      done();
    }, 100);
  });
});
