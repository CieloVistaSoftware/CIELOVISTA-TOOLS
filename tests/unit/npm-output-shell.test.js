// Smoke test for the NPM Output webview empty-state behavior.
// Renders the shell HTML in headless Chromium (no VS Code) and asserts
// that the panel is never empty: header is always visible, empty state
// shows from a cold start, and the has-jobs flow works end to end.
'use strict';

const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { chromium } = require('playwright');

(async () => {
  // Resolve repo root from this test file's location, regardless of cwd.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const srcPath  = path.join(repoRoot, 'src', 'features', 'npm-command-launcher.ts');

  const src = fs.readFileSync(srcPath, 'utf8');
  const m = src.match(/function buildOutputShellHtml\(\): string \{\s*return `([\s\S]*?)`;\s*\}/);
  if (!m) { console.error('FAIL: buildOutputShellHtml not found in source'); process.exit(1); }
  const html = m[1].replace(/\\\$/g, '$').replace(/\\`/g, '`');

  // Strip the CSP that blocks file:// in headless Chromium
  const renderable = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');

  // Stub out acquireVsCodeApi so the IIFE does not throw outside VS Code
  const stubbed = renderable.replace(
    'var vsc=acquireVsCodeApi();',
    'function acquireVsCodeApi(){return{postMessage:function(){}};}var vsc=acquireVsCodeApi();'
  );

  const tmp = path.join(os.tmpdir(), 'cvt-npm-output-shell-' + Date.now() + '.html');
  fs.writeFileSync(tmp, stubbed, 'utf8');

  const browser = await chromium.launch();
  const ctx     = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page    = await ctx.newPage();
  const errors  = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console',   c => { if (c.type() === 'error') errors.push('CONSOLE.ERROR: ' + c.text()); });

  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const cold = await page.evaluate(() => {
    const visible = sel => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    };
    const text = sel => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
    return {
      headerVisible:    visible('#cvt-header'),
      headerTitle:      text('#cvt-header .title'),
      hintText:         text('#cvt-header-hint'),
      hasClearBtn:      !!document.querySelector('#btn-clear'),
      clearBtnDisabled: !!(document.querySelector('#btn-clear') && document.querySelector('#btn-clear').disabled),
      emptyStateVis:    visible('#empty-state'),
      emptyStateMsg:    text('#empty-state .msg'),
      jobsRendered:     document.querySelectorAll('.job').length,
      logHasJobsClass:  document.getElementById('log').classList.contains('has-jobs'),
    };
  });

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'job-start', jobKey: 'test::compile', script: 'compile', folder: '/repo', time: '12:34:56'
    }}));
  });
  await page.waitForTimeout(50);

  const afterStart = await page.evaluate(() => {
    const visible = sel => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    };
    return {
      logHasJobsClass:  document.getElementById('log').classList.contains('has-jobs'),
      emptyStateVis:    visible('#empty-state'),
      jobsRendered:     document.querySelectorAll('.job').length,
      jobCmdText:       document.querySelector('.job-cmd') ? document.querySelector('.job-cmd').textContent.trim() : null,
      jobOutEmptyMark:  document.querySelector('.job-out') ? document.querySelector('.job-out').classList.contains('empty') : null,
      hintText:         document.getElementById('cvt-header-hint').textContent.trim(),
      clearBtnDisabled: document.getElementById('btn-clear').disabled,
    };
  });

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'output', jobKey: 'test::compile', text: 'building...\n'
    }}));
  });
  await page.waitForTimeout(50);

  const afterOutput = await page.evaluate(() => ({
    jobOutEmptyMark: document.querySelector('.job-out') ? document.querySelector('.job-out').classList.contains('empty') : null,
    jobOutText:      document.querySelector('.job-out') ? document.querySelector('.job-out').textContent.trim() : null,
  }));

  const fail = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
  fail(errors.length === 0,                              'no JS errors at load: ' + errors.join('; '));
  fail(cold.headerVisible,                               'header is visible at cold start');
  fail(/NPM Output/.test(cold.headerTitle || ''),        'header shows NPM Output title');
  fail(cold.hasClearBtn,                                 'Clear button exists');
  fail(cold.clearBtnDisabled === true,                   'Clear button is disabled when no jobs');
  fail(cold.emptyStateVis,                               'empty state is visible at cold start');
  fail(/no npm scripts/i.test(cold.emptyStateMsg || ''), 'empty state message matches');
  fail(cold.jobsRendered === 0,                          'no jobs rendered at cold start');
  fail(cold.logHasJobsClass === false,                   'log has no has-jobs class at cold start');
  fail(afterStart.logHasJobsClass === true,              'has-jobs class added on job-start');
  fail(afterStart.emptyStateVis === false,               'empty state hidden after job-start');
  fail(afterStart.jobsRendered === 1,                    'job rendered after job-start');
  fail(/compile/.test(afterStart.jobCmdText || ''),      'job command shown');
  fail(afterStart.jobOutEmptyMark === true,              'job-out has .empty class before any output');
  fail(/last started: compile/i.test(afterStart.hintText), 'header hint updated to last started');
  fail(afterStart.clearBtnDisabled === false,            'Clear button enabled after first job');
  fail(afterOutput.jobOutEmptyMark === false,            '.empty class dropped on first output');
  fail(/building/.test(afterOutput.jobOutText || ''),    'output text appended');

  console.log('PASS: NPM Output shell empty-state, header, Clear button, and job lifecycle (18/18 assertions)');
  fs.unlinkSync(tmp);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
