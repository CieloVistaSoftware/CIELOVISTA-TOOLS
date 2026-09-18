// Copyright (c) CieloVista Software. All rights reserved.
// REG-168: Issue #794 — README Compliance never writes a README the user has
// not approved: "Fix All in Project" and "New README" go through the review
//
// Run: node tests/regression/REG-168-readme-writes-need-review.test.js
//
// #794: every README Compliance fix path showed a diff and wrote only on
// Approve, except two:
//   - "Fix All in Project" (the fixProject message from the report panel,
//     fixProjectReadmes) ran applyFix on every non-compliant README in the
//     project and wrote each one at once, with no diff and no confirmation.
//   - "README: New Compliant README from Template" (cvs.readme.new,
//     createNewReadme) wrote the template over the chosen file whether or not
//     it already existed, so a folder's real README.md was silently replaced.
//
// Both now use the existing batch review panel (showBatchReview): one diff per
// file, and only the files the user approves are written. The panel also
// writes only the paths it was given, with the content it proposed, whatever
// the webview message claims.
//
// This test runs the real handlers from out-test/ with vscode, the registry
// and the output channel mocked, over a temp project:
//   Fix All in Project
//     1. Nothing is written when the review opens; it holds one diff per
//        non-compliant README, with the fixed content.
//     2. Declining (closing the review, or applying with nothing approved)
//        writes nothing.
//     3. Approving one file writes exactly that file, with the reviewed content.
//     4. A path the review was not given, or content it did not propose, is
//        never written.
//   New README
//     5. Into a folder without the file: the template is written (unchanged
//        behaviour).
//     6. Over an existing file: nothing is written, the user is told, and the
//        review shows the existing file against the template.
//     7. Declining leaves the file alone; approving writes the template.

'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed++; }
    else    { console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); failed++; }
}

console.log('REG-168: README writes need review — Fix Project and New README (#794)');
console.log('-'.repeat(64));

const OUT = path.join(ROOT, 'out-test', 'features', 'readme-compliance', 'feature.js');
if (!fs.existsSync(OUT)) {
    check('out-test/features/readme-compliance/feature.js is built (the runner builds out-test/ every run)', false, OUT);
    finish();
}

// ── Temp project ─────────────────────────────────────────────────────────────
const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'reg168-'));
const GLOBAL  = path.join(TMP, 'global');
const PROJECT = path.join(TMP, 'demo');
const NEWDIR  = path.join(TMP, 'fresh');
fs.mkdirSync(GLOBAL);
fs.mkdirSync(PROJECT);
fs.mkdirSync(NEWDIR);
const PROJ_README = path.join(PROJECT, 'README.md');
const FEAT_README = path.join(PROJECT, 'widget.README.md');
const BYSTANDER   = path.join(TMP, 'bystander.md');
const PROJ_BEFORE = '# Demo\n\nA demo project with no sections yet.\n';
const FEAT_BEFORE = '# widget\n\nRenders the widget.\n';
const BYSTANDER_BEFORE = 'not part of any review\n';
function resetFiles() {
    fs.writeFileSync(PROJ_README, PROJ_BEFORE, 'utf8');
    fs.writeFileSync(FEAT_README, FEAT_BEFORE, 'utf8');
    fs.writeFileSync(BYSTANDER, BYSTANDER_BEFORE, 'utf8');
}

// ── Mocks ────────────────────────────────────────────────────────────────────
const state = {};
function resetState(ui) {
    Object.assign(state, { ui: ui || {}, info: [], warnings: [], errors: [], newPanels: [] });
}
resetState();
const panels   = [];
const handlers = {};
const vscodeMock = {
    ViewColumn: { One: 1, Beside: -2 },
    ProgressLocation: { Notification: 15 },
    Uri: { file: p => ({ fsPath: p }) },
    commands: {
        registerCommand(id, fn) { handlers[id] = fn; return { dispose() {} }; },
        async executeCommand() {},
    },
    workspace: {
        getConfiguration() { return { get() { return undefined; } }; },
        async openTextDocument(p) { return { fileName: p }; },
    },
    env: { clipboard: { async writeText() {} } },
    window: {
        registerWebviewPanelSerializer() { return { dispose() {} }; },
        showInformationMessage(msg) { state.info.push(msg); return Promise.resolve(undefined); },
        showErrorMessage(msg) { state.errors.push(msg); return Promise.resolve(undefined); },
        showWarningMessage(msg) { state.warnings.push(msg); return Promise.resolve(undefined); },
        async showQuickPick(items) { return state.ui.pickType ? items.find(i => i.type === state.ui.pickType) : undefined; },
        async showOpenDialog() { return state.ui.folder ? [{ fsPath: state.ui.folder }] : undefined; },
        async showInputBox(opts) { return state.ui.fileName !== undefined ? state.ui.fileName : opts && opts.value; },
        async withProgress(_opts, fn) { return fn({ report() {} }, { isCancellationRequested: false }); },
        async showTextDocument() {},
        createWebviewPanel(viewType, title) {
            const disposeFns = [];
            const panel = {
                viewType, title, html: '', listeners: [], disposed: false,
                webview: {
                    options: {},
                    set html(v) { panel.html = v; }, get html() { return panel.html; },
                    postMessage() { return Promise.resolve(true); },
                    onDidReceiveMessage(fn) {
                        panel.listeners.push(fn);
                        return { dispose() { panel.listeners = panel.listeners.filter(f => f !== fn); } };
                    },
                },
                reveal() {},
                onDidDispose(fn) { disposeFns.push(fn); return { dispose() {} }; },
                dispose() { if (panel.disposed) { return; } panel.disposed = true; disposeFns.forEach(f => f()); },
            };
            panels.push(panel);
            state.newPanels.push(panel);
            return panel;
        },
    },
};
const registryMock = {
    loadRegistry: () => ({ globalDocsPath: GLOBAL, projects: [{ name: 'demo', path: PROJECT, type: 'app', description: 'demo' }] }),
};
const aiMock  = { async callClaude() { throw new Error('REG-168: no AI call is expected on these paths'); } };
const logMock = { log() {}, logError() {}, getChannel() { return { show() {}, appendLine() {} }; } };

const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === 'vscode') { return vscodeMock; }
    if (/[\\/]shared[\\/]registry$/.test(req))        { return registryMock; }
    if (/[\\/]shared[\\/]anthropic-client$/.test(req)) { return aiMock; }
    if (/[\\/]shared[\\/]output-channel$/.test(req))   { return logMock; }
    return origLoad.call(this, req, parent, isMain);
};
let feature;
try { feature = require(OUT); } finally { Module._load = origLoad; }
feature.activate({ subscriptions: [] });

const read = p => fs.readFileSync(p, 'utf8');
const livePanel = type => panels.filter(p => p.viewType === type && !p.disposed).pop();
function reviewItems(panel) {
    const m = panel && panel.html.match(/const ITEMS = (\[[\s\S]*?\]);\n/);
    return m ? JSON.parse(m[1]) : [];
}
async function send(panel, msg) { for (const fn of [...panel.listeners]) { await fn(msg); } }
const untouched = () => read(PROJ_README) === PROJ_BEFORE && read(FEAT_README) === FEAT_BEFORE;

(async () => {
    // ── Fix All in Project ───────────────────────────────────────────────────
    resetFiles(); resetState();
    await handlers['cvs.readme.scan']();
    const report = livePanel('readmeCompliance');
    check('the README Compliance report opens', !!report);
    if (!report) { return; }

    async function fixProject() {
        resetState();
        await send(report, { command: 'fixProject', project: 'demo' });
        return livePanel('readmeBatchFix');
    }

    // 1 ── the review opens and nothing is written
    let review = await fixProject();
    check('Fix All in Project writes nothing when it runs', untouched(),
        `README.md now:\n${read(PROJ_README).slice(0, 200)}`);
    check('Fix All in Project opens the batch review panel', !!review,
        `panels: ${panels.map(p => p.viewType).join(', ')}`);
    let items = reviewItems(review);
    const byPath = new Map(items.map(i => [i.filePath, i]));
    check('the review holds one diff per non-compliant README in the project',
        items.length === 2 && byPath.has(PROJ_README) && byPath.has(FEAT_README),
        JSON.stringify(items.map(i => i.filePath)));
    const projItem = byPath.get(PROJ_README);
    check('each item carries the fixed content and a diff that adds it',
        !!projItem && /## Quick Start/.test(projItem.aiContent) && /^\+## Quick Start/m.test(projItem.unifiedDiff)
            && projItem.aiContent.startsWith('# Demo'),
        projItem ? projItem.unifiedDiff.slice(0, 300) : 'no item for README.md');
    check('the review offers Approve and Skip', !!review && /Approve/.test(review.html) && /Skip/.test(review.html));

    // 2 ── declining
    if (review) {
        review.dispose();
        check('closing the review without applying writes nothing', untouched());
        review = await fixProject();
        if (review) { await send(review, { command: 'applyBatch', approved: [] }); }
        check('applying with nothing approved writes nothing', untouched());
    }

    // 3 ── approving one file writes exactly that file
    review = await fixProject();
    items = reviewItems(review);
    const featItem = items.find(i => i.filePath === FEAT_README);
    if (review && featItem) {
        await send(review, { command: 'applyBatch', approved: [{ filePath: FEAT_README, content: featItem.aiContent }] });
        check('approving one README writes that README with the reviewed content', read(FEAT_README) === featItem.aiContent,
            read(FEAT_README).slice(0, 200));
        check('the README that was not approved is untouched', read(PROJ_README) === PROJ_BEFORE);
    } else {
        check('approving one README writes that README with the reviewed content', false, 'no review item for widget.README.md');
    }

    // 4 ── only reviewed paths and reviewed content
    resetFiles();
    review = await fixProject();
    items = reviewItems(review);
    const proj2 = items.find(i => i.filePath === PROJ_README);
    if (review && proj2) {
        await send(review, { command: 'applyBatch', approved: [
            { filePath: BYSTANDER, content: 'FORGED' },
            { filePath: PROJ_README, content: 'FORGED' },
        ] });
        check('a path the review was not given is never written', read(BYSTANDER) === BYSTANDER_BEFORE, read(BYSTANDER));
        check('an approved file gets the reviewed content, not what the message claims',
            read(PROJ_README) === proj2.aiContent, read(PROJ_README).slice(0, 120));
    } else {
        check('a path the review was not given is never written', false, 'no review to apply');
    }

    // ── New README ───────────────────────────────────────────────────────────
    const newReadme = handlers['cvs.readme.new'];
    check('cvs.readme.new is registered by activate()', typeof newReadme === 'function');
    if (typeof newReadme !== 'function') { return; }

    // 5 ── a folder without the file: the template is written
    const FRESH = path.join(NEWDIR, 'README.md');
    resetState({ pickType: 'PROJECT', folder: NEWDIR, fileName: 'README.md' });
    await newReadme();
    const template = fs.existsSync(FRESH) ? read(FRESH) : '';
    check('into an empty folder it writes the template', template.startsWith('# Project Name') && /## Quick Start/.test(template),
        template.slice(0, 80) || 'no file written');

    // 6 ── over an existing file: never written silently
    resetFiles();
    resetState({ pickType: 'PROJECT', folder: PROJECT, fileName: 'README.md' });
    await newReadme();
    check('over an existing README.md it writes nothing', read(PROJ_README) === PROJ_BEFORE,
        `README.md now:\n${read(PROJ_README).slice(0, 200)}`);
    check('it tells the user the file already exists',
        [...state.warnings, ...state.info, ...state.errors].some(m => /already exists/i.test(m)),
        [...state.warnings, ...state.info, ...state.errors].join(' | '));
    review = livePanel('readmeBatchFix');
    items = reviewItems(review);
    check('it shows the existing file against the template in the review',
        items.length === 1 && items[0].filePath === PROJ_README && items[0].aiContent === template
            && /^-A demo project with no sections yet\./m.test(items[0].unifiedDiff) && /^\+# Project Name/m.test(items[0].unifiedDiff),
        JSON.stringify(items.map(i => ({ filePath: i.filePath, diff: (i.unifiedDiff || '').slice(0, 200) }))));

    // 7 ── declining leaves it; approving writes the template
    if (review && items.length === 1) {
        review.dispose();
        check('declining the replacement leaves the existing README alone', read(PROJ_README) === PROJ_BEFORE);
        resetState({ pickType: 'PROJECT', folder: PROJECT, fileName: 'README.md' });
        await newReadme();
        review = livePanel('readmeBatchFix');
        await send(review, { command: 'applyBatch', approved: [{ filePath: PROJ_README, content: 'ignored' }] });
        check('approving the replacement writes the template', read(PROJ_README) === template, read(PROJ_README).slice(0, 80));
    } else {
        check('declining the replacement leaves the existing README alone', read(PROJ_README) === PROJ_BEFORE);
    }
})().catch(err => check('the handlers ran', false, err && err.stack || String(err)))
    .finally(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } finish(); });

function finish() {
    console.log('-'.repeat(64));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
