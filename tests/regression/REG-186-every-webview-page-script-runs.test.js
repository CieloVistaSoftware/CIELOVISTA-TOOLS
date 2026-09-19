// Copyright (c) 2026 CieloVista Software. All rights reserved.
// REG-186: Issue #846 — every webview page's delivered scripts compile and run
//
// Run: node tests/regression/REG-186-every-webview-page-script-runs.test.js
//
// A page script written inside a TypeScript template literal is not the
// script the browser gets: the literal turns \\ into \ and drops the \ of \d.
// The doc preview's script stopped parsing (#841) and the MCP viewer's path
// pattern stopped matching (#843), and both stayed broken for months, because
// every test read the source text.
//
// Guards:
//   1. Discovery (tests/utils/webview-pages.js) finds every function in src/
//      that builds a page: one holding a <script> literal, one a
//      `webview.html = …` assignment calls, or one that writes a page inline.
//      Each is rendered from its out-test/ build, with the harness's vscode
//      stub and the fixtures below. A builder that cannot be rendered fails:
//      a new page needs a fixture here, or it is not covered.
//   2. Every inline <script> in each delivered page compiles (vm.Script),
//      and the page loads in jsdom, scripts running with acquireVsCodeApi
//      stubbed, without a script throwing.
//   3. Source rule: no page script inside a plain template literal in src/
//      holds a backslash escape (a lone \uXXXX aside). Regex and escape
//      code goes in a String.raw template, the codebase's pattern for it
//      (md-renderer.ts), where what is written is what the page gets.
//   4. Self-check: builders of the #841 and #843 shape, built with esbuild
//      as out-test/ is, fail the checks, and their String.raw forms pass.
//   5. The four page tests #846 moved off source text (doc-preview-toolbar,
//      mcp-markdown-preview-back, md-preview-no-cdn, REG-063) load the page
//      from out-test/ and read no src/ text.
//   6. #847: a test that loads a served page ends by setting
//      process.exitCode, never process.exit() while the server closes.
//
// Pages this found broken when it was written (#846): the Codebase Auditor
// (script did not parse: '\n' inside a string became a line break), the Test
// Coverage dashboard (same), File List's extension patterns (\. became .),
// Copilot Rules (its script wired Enable/Disable buttons the page never had),
// and the two diff pages, whose script died when the diff2html CDN was out
// of reach.

'use strict';

const fs   = require('fs');
const path = require('path');

const { createWebviewHarness } = require('../utils/webview-harness');
const { useRegistryHome }      = require('../utils/registry-fixture');
const pages = require('../utils/webview-pages');

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Keyed by builder id. `args` returns the arguments; `show` calls a function
// that opens a panel itself, and the page is what it set on the panel. A
// builder with no entry is called with no arguments.

const fx = useRegistryHome({ 'proj-a': { 'README.md': '# A\n', 'docs/guide.md': '# Guide\n' } });
const proj = { name: 'proj-a', path: fx.root('proj-a'), type: 'app', description: 'proj-a fixture' };
const registry = { globalDocsPath: fx.global, projects: [proj] };
const docFile = fx.file('proj-a', 'docs/guide.md');
const card = {
    id: 'c1', fileName: 'guide.md', title: 'Guide', description: 'A guide', filePath: docFile,
    projectName: 'proj-a', projectPath: proj.path, category: 'docs', folder: 'docs',
    sizeBytes: 10, lastModified: new Date(0).toISOString(), tags: ['guide'],
};
const webview = { cspSource: 'vscode-webview://harness', asWebviewUri: (u) => ({ toString: () => `vscode-webview://harness/${u.fsPath}` }) };

const FIXTURES = {
    'features/background-health-runner.ts::buildFixBugsHtml': { args: () => [{ lastRun: '', totalChecks: 0, bugs: [], checkIndex: 0 }] },
    'features/claude-process-monitor.ts::buildHtml': { args: () => [{ processes: [], ports: [], scannedAt: new Date(0).toISOString(), warnings: [] }] },
    'features/code-auditor.ts::buildHtml': { args: () => [{ generatedAt: new Date(0).toISOString(), stats: { projectsScanned: 1, filesScanned: 1, blocksAnalyzed: 1, clusters: 0, exactClusters: 0, nearClusters: 0, patternClusters: 0, importDuplicationFindings: 0 }, clusters: [] }] },
    'features/code-highlight-audit.ts::buildHtml': { args: () => [[{ filePath: docFile, project: 'proj-a', lineNumber: 1, preview: 'const a = 1;', fenceOpen: '```' }], 1] },
    'features/codebase-auditor.ts::buildAuditHtml': { args: () => [[], 1, 10] },
    'features/command-registry-viewer.ts::wrapCompHtml': { args: () => ['', '<p>x</p>', 'void 0;'] },
    'features/command-registry-viewer.ts::wrapHtml': { args: () => ['', '<p>x</p>', 'void 0;'] },
    'features/command-validator.ts::buildTagSyncHtml': { args: () => [[], proj.path, true] },
    'features/command-validator.ts::buildValidationHtml': { args: () => [[], proj.path] },
    'features/copilot-rules-enforcer.ts::openOrRefreshPanel': { show: (fn) => fn('# Rules\n') },
    'features/doc-auditor/html.ts::buildAuditHtml': { args: () => [{ duplicates: [], similar: [], moveCandidates: [], orphans: [], totalDocsScanned: 0, projectsScanned: 0, warningCandidates: [] }] },
    'features/doc-auditor/walkthrough.ts::buildWalkthroughHtml': { args: () => [[]] },
    'features/doc-catalog/commands.ts::buildDocPageHtml': { args: () => [docFile, '<h1>Guide</h1>', 5000, ''] },
    'features/doc-catalog/commands.ts::buildRebuildSummaryHtml': { args: () => [[card], 12, [{ name: 'proj-a', count: 1, path: proj.path }], '00:00'] },
    'features/doc-catalog/commands.ts::buildViewDocBrowserHtml': { args: () => [[card], 5000, 'tok'] },
    'features/doc-consolidator/feature.ts::buildGroupPickerHtml': { args: () => [[]] },
    'features/doc-consolidator/plan-webview.ts::showConsolidationPlanWebview': { show: (fn) => fn([{ type: 'keep', filePath: docFile, checked: true }], () => undefined) },
    'features/doc-header/feature.ts::buildReportHtml': { args: () => [[], registry] },
    'features/doc-intelligence/html.ts::buildDashboardHtml': { args: () => [{ scannedAt: new Date(0).toISOString(), durationMs: 1, totalDocs: 0, projects: 0, findings: [], wastedBytes: 0, summary: { red: 0, yellow: 0, info: 0, total: 0 } }] },
    'features/docs-broken-refs.ts::buildViewerHtml': { args: () => [[], 0, []] },
    'features/docs-broken-refs.ts::buildScanningHtml': { args: () => [1] },
    'features/docs-manager.ts::buildSyncHtml': { args: () => [[], registry] },
    'features/error-log-viewer.ts::buildHtml': { args: () => [[]] },
    'features/feature-toggle.ts::getFeatureToggleHtml': { args: (h) => [h.context] },
    'features/frontmatter-viewer.ts::buildViewerHtml': { args: () => [{ generatedAt: new Date(0).toISOString(), root: proj.path, summary: { total: 1, withFrontmatter: 0, withoutFrontmatter: 1, errors: 0, duplicateFilenames: 0, duplicateFilenameDetails: [] }, files: [] }, new Map()] },
    'features/home-page.ts::buildBrowseAllHtml': { args: () => [{ 'cvs.docs:': [{ title: 'Docs: Open', command: 'cvs.docs.open' }] }, 1] },
    'features/home-page.ts::buildDashboardHtml': { args: () => ['proj-a', proj.path, false, [], [], { 'cvs.docs:': [{ title: 'Docs: Open', command: 'cvs.docs.open' }] }, [], new Set(['cvs.docs.open']), false, '0.0.0'] },
    'features/image-reader.ts::getWebviewContent': { args: (h) => [h.context, webview] },
    'features/js-error-audit.ts::buildAuditHtml': { args: () => [{ violations: [], warnings: [], clean: [], scannedAt: new Date(0).toISOString() }, { entries: [], lastSeen: '' }, proj.path] },
    'features/license-sync.ts::buildHtml': { args: () => [[], 'LICENSE TEXT'] },
    'features/link-integrity-checker.ts::buildReportHtml': { args: () => [[], [proj.path]] },
    'features/marketplace-compliance/html.ts::buildComplianceHtml': { args: () => [[]] },
    'features/marketplace-compliance/html.ts::buildSummaryHtml': { args: () => [[], 0, 0] },
    'features/mcp-viewer/index.ts::buildMarkdownPreviewHtml': { args: () => [docFile, '# Guide\n\nSee C:\\Users\\x\\docs\\a.md', 'tok', '/'] },
    'features/openai-chat.ts::showResultPanel': { show: (fn) => fn('Result', 'body text') },
    'features/playwright-check.ts::buildHtml': { args: () => [[]] },
    'features/readme-compliance/feature.ts::buildDiffHtml': { args: () => ['README.md', fx.file('proj-a', 'README.md'), '# A\n', '# A\n\nfixed\n', '@@ -1 +1,3 @@', []] },
    'features/readme-compliance/feature.ts::buildReportHtml': { args: () => [[]] },
    'features/readme-generator.ts::buildScanReportHtml': { args: () => [[], [proj]] },
    'features/regression-log-viewer.ts::buildHtml': { args: () => [[]] },
    'features/running-tasks.ts::buildHtml': { args: () => [{ tasks: [], totalMemoryGb: 16, scannedAt: new Date(0).toISOString(), trends: {} }] },
    'features/session-activity.ts::buildErrorHtml': { args: () => [{ owner: 'o', name: 'r' }, 'failed'] },
    'features/session-activity.ts::buildHtml': { args: () => [{ fetchedAt: 0, repo: { owner: 'o', name: 'r' }, currentFocus: null, currentBatch: [], deployBranch: 'main', pushes: [], pushesError: null, ciRuns: [], ciError: null, openIssues: [], openIssuesError: null }] },
    'features/session-activity.ts::buildLoadingHtml': { args: () => [{ owner: 'o', name: 'r' }] },
    'features/session-activity.ts::wrapPage': { args: () => ['Title', '<p>x</p>'] },
    'features/test-coverage-auditor.ts::getWebviewHtml': { args: () => [webview, { timestamp: new Date(0).toISOString(), totalTestFiles: 0, totalTestCases: 0, featuresCovered: 0, featuresTotal: 0, coveragePercent: 0, tiers: [], tierDetails: {}, features: [], gaps: [], gapItems: [], recommendations: [], bugsUntested: 0, bugsTotal: 0 }, '# Report\n'] },
    'shared/content-viewer.ts::buildHtml': { args: () => ['Title', '<p>x</p>'] },
    'shared/doc-preview.ts::buildPreviewHtml': { args: () => ['Guide', docFile, '<h1>Guide</h1>', [], true, webview.cspSource] },
    'shared/file-review.ts::buildFileReviewHtml': { args: () => [[{ fileName: 'README.md', filePath: fx.file('proj-a', 'README.md'), aiContent: '# A\n', unifiedDiff: '@@ -1 +1 @@' }], 'Review'] },
    'shared/help-panel.ts::buildHelpPanelHtml': { args: () => ['# Help\n\nRun `cvs.docs.open`.', [{ id: 'cvs.docs.open', title: 'Docs: Open', description: 'Open docs' }], 'Docs'] },
    'shared/show-interactive-result-webview.ts::showInteractiveResultWebview': { show: (fn) => fn({ title: 'Result', action: 'cvs.x', output: 'done', durationMs: 5 }) },
    'shared/show-result-webview.ts::buildHtml': { args: () => ['Result', [{ label: 'x', output: 'done', at: new Date(0).toISOString() }]] },
    'shared/webview-utils.ts::cvsPage': { args: () => [{ title: 'T', body: '<p>x</p>', script: 'void 0;' }] },
};

/** Render one builder: its page HTML. Throws when it cannot. */
async function render(h, b) {
    if (!b.name || !b.topLevel) { throw new Error(`${b.id} is not a named top-level function, so no test can reach it; move the page into one`); }
    const fn = pages.loadInternals(b.file, [b.name])[b.name];
    const f = FIXTURES[b.id];
    if (f && f.show) {
        const before = h.panels.length;
        await f.show(fn, h);
        await h.settle();
        const panel = h.panels[h.panels.length - 1];
        if (h.panels.length === before || !panel.webview.html) { throw new Error('it opened no panel with a page'); }
        return panel.webview.html;
    }
    const html = await fn(...(f ? f.args(h) : []));
    if (typeof html !== 'string' || !html.trim()) { throw new Error(`it returned ${typeof html}, not a page`); }
    return html;
}

(async () => {
    console.log('\nREG-186: every webview page script compiles and runs (#846)\n' + '-'.repeat(60));
    const h = createWebviewHarness();
    h.install();

    // ── 1 + 2: discover, render, run ────────────────────────────────────────
    const builders = pages.discoverPageBuilders();
    check(`discovery finds the page builders (${builders.length})`, builders.length >= 40,
        `only ${builders.length}: discovery stopped matching`);
    for (const known of ['shared/doc-preview.ts::buildPreviewHtml', 'features/mcp-viewer/index.ts::buildMarkdownPreviewHtml', 'features/mcp-viewer/html.ts::buildViewerHtml', 'shared/webview-utils.ts::cvsPage']) {
        check(`discovery finds ${known}`, builders.some(b => b.id === known));
    }
    const stale = Object.keys(FIXTURES).filter(id => !builders.some(b => b.id === id));
    check('every fixture names a discovered builder', !stale.length, `no such builder: ${stale.join(', ')}`);

    for (const b of builders) {
        let html;
        try { html = await render(h, b); }
        catch (e) { check(`${b.id} renders`, false, `cannot render it (${e.message.split('\n')[0]}); give it a fixture in REG-186`); continue; }
        const problems = await pages.checkPage(html, b.id);
        const n = pages.inlineScripts(html).length;
        check(`${b.id}: ${n} inline script(s) compile and run`, !problems.length, problems.join('\n       '));
    }

    // ── 3: no escape-heavy code in template-literal page scripts ────────────
    const hits = pages.srcTemplateScriptEscapes();
    check('no template-literal page script holds a backslash (use a .js asset or String.raw)', !hits.length,
        `${hits.length} line(s):\n       ${hits.slice(0, 20).join('\n       ')}`);

    // ── 5: the page tests #846 moved off source text stay off it ────────────
    const TESTS = path.join(pages.ROOT, 'tests');
    const MOVED = ['unit/doc-preview-toolbar.test.js', 'unit/mcp-markdown-preview-back.test.js',
        'unit/md-preview-no-cdn.test.js', 'regression/REG-063-mcp-viewer-json-rpc-runtime.test.js'];
    for (const rel of MOVED) {
        const text = fs.readFileSync(path.join(TESTS, ...rel.split('/')), 'utf8');
        check(`${rel} loads the page from out-test/ and reads no src/ text`,
            /['"]out-test['"]/.test(text) && !/path\.(?:join|resolve)\([^)]*['"]src['"]/.test(text) && !/\.\.\/\.\.\/src\//.test(text) && !/transpileModule/.test(text));
    }

    // ── 6: tests that start a served page end without process.exit (#847) ──
    // process.exit() while the server's keep-alive sockets close trips a libuv
    // assertion on Windows: exit 127 after every check passed.
    const served = fs.readdirSync(path.join(TESTS, 'unit')).map(f => `unit/${f}`)
        .concat(fs.readdirSync(path.join(TESTS, 'regression')).map(f => `regression/${f}`))
        .filter(rel => rel.endsWith('.test.js'))
        .filter(rel => /\bloadServedPage\(/.test(fs.readFileSync(path.join(TESTS, ...rel.split('/')), 'utf8')));
    check(`the served-page tests are found (${served.length})`, served.length >= 5);
    for (const rel of served) {
        const text = fs.readFileSync(path.join(TESTS, ...rel.split('/')), 'utf8');
        check(`${rel} ends with process.exitCode, not process.exit() under a closing server (#847)`,
            /process\.exitCode\s*=/.test(text) && !/process\.exit\(\s*failed/.test(text));
    }

    // ── 4: self-check against the #841 and #843 shapes ──────────────────────
    await selfCheck();

    h.close();
    fx.dispose();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// ── Self-check ───────────────────────────────────────────────────────────────
// Page builders of the #841 and #843 shape, built with esbuild as out-test/ is
// and run through the same checks. The #841 line is the one doc-preview.ts
// held before #845.
const BT = String.fromCharCode(96);
const builder = (tag, script) => `export function page(): string {\n    return ${tag}${BT}<script>${script}</script>${BT};\n}\n`;
const LINE_841 = String.raw`
    var decoded = 'a"b';
    var escaped = decoded.replace(/(["\\])/g, '\\$1');
    document.documentElement.setAttribute('data-x', escaped);
`;
const LINE_843 = String.raw`
    var pathRe = /[A-Za-z]:\\[^\s<>'"\\|*?]+/g;
    document.documentElement.setAttribute('data-x', String(pathRe.test('C:\\x')));
`;

async function runBuilder(src) {
    const code = require('esbuild').transformSync(src, { loader: 'ts', format: 'cjs', target: 'node18' }).code;
    const fn = pages.compileInternals(code, path.join(pages.OUT, 'shared', 'reg186-self-check.js'), ['page']).page;
    return pages.checkPage(fn(), 'self-check');
}

async function selfCheck() {
    const p841 = await runBuilder(builder('', LINE_841));
    check('self-check: the #841 page (plain template) does not compile', p841.some(p => /does not compile/.test(p)), `got: ${p841.join('; ') || 'no problem'}`);
    const pRaw = await runBuilder(builder('String.raw', LINE_841));
    check('self-check: the same script in String.raw compiles and runs', !pRaw.length, pRaw.join('; '));
    check('self-check: the source rule flags the #841 line', pages.templateScriptEscapes('a.ts', builder('', LINE_841)).length > 0);
    check('self-check: the source rule flags the #843 path pattern', pages.templateScriptEscapes('a.ts', builder('', LINE_843)).length > 0);
    check('self-check: the source rule passes String.raw', !pages.templateScriptEscapes('a.ts', builder('String.raw', LINE_843)).length);
    check('self-check: the source rule passes a \\uXXXX escape',
        !pages.templateScriptEscapes('a.ts', builder('', String.raw`var a = '\u2026';`)).length);
}

