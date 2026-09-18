// Copyright (c) CieloVista Software. All rights reserved.
// REG-166: Issue #776 — cvs.readme.fillTodos fills README _TODO: stubs with AI,
// and writes nothing until the user approves the diff
//
// Run: node tests/regression/REG-166-readme-fill-todos-fills-after-review.test.js
//
// #776: "README: Fill README TODO Stubs (AI)" was contributed, catalogued and
// documented, but its handler only showed "Fill README TODO Stubs: not yet
// implemented." REG-034 checked that the command was registered, catalogued
// and contributed, so it passed on a command that did nothing.
//
// The fix reuses what readme-compliance already had: the _TODO: fill prompt
// from the per-file fix path (now buildTodoFillPrompt), callClaude, and the
// AI batch review panel (now showBatchReview), which shows a diff per file and
// writes only the files the user approves.
//
// This test runs the real handler from out-test/ with vscode, the registry,
// the output channel and callClaude mocked, over a temp project holding one
// README with a _TODO: stub and one without:
//   1. The handler never says "not yet implemented".
//   2. Declining the confirmation calls no AI and writes nothing.
//   3. Confirming calls the AI once, for the stubbed README only, with its
//      stub text in the prompt; opens a review panel holding the diff; and
//      leaves the file on disk unchanged.
//   4. Approving in that panel (the applyBatch message, built from the items
//      the panel itself carries) writes the AI content to that file only.
//   5. With no stubs anywhere it says so and calls no AI.

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

console.log('REG-166: cvs.readme.fillTodos fills stubs after review (#776)');
console.log('-'.repeat(64));

const OUT = path.join(ROOT, 'out-test', 'features', 'readme-compliance', 'feature.js');
if (!fs.existsSync(OUT)) {
    check('out-test/features/readme-compliance/feature.js is built (the runner builds out-test/ every run)', false, OUT);
    finish();
}

// ── Temp project ─────────────────────────────────────────────────────────────
const TMP      = fs.mkdtempSync(path.join(os.tmpdir(), 'reg166-'));
const GLOBAL   = path.join(TMP, 'global');
const PROJECT  = path.join(TMP, 'demo');
fs.mkdirSync(GLOBAL);
fs.mkdirSync(PROJECT);
const STUBBED  = path.join(PROJECT, 'README.md');
const CLEAN    = path.join(PROJECT, 'widget.README.md');
const STUB_TEXT = '_TODO: 2–5 sentences describing what problem this project solves and who uses it._';
const STUBBED_BEFORE = `# Demo\n\nA demo project.\n\n## What it does\n\n${STUB_TEXT}\n\n## License\n\nCopyright (c) 2026 CieloVista Software\n`;
const CLEAN_BEFORE   = '# feature: widget.ts\n\n## What it does\n\nRenders the widget.\n\n## Manual test\n\n1. Open it.\n';
const AI_FILLED      = STUBBED_BEFORE.replace(STUB_TEXT, 'Demo shows how a CieloVista project README reads once every section is written, for people evaluating the standard.');
function resetFiles() {
    fs.writeFileSync(STUBBED, STUBBED_BEFORE, 'utf8');
    fs.writeFileSync(CLEAN, CLEAN_BEFORE, 'utf8');
}

// ── Mocks ────────────────────────────────────────────────────────────────────
const state = {};
function resetState(confirm) {
    Object.assign(state, { confirm, prompts: [], info: [], warnings: [], panels: [] });
}
const handlers = {};
const vscodeMock = {
    ViewColumn: { One: 1, Beside: -2 },
    ProgressLocation: { Notification: 15 },
    commands: {
        registerCommand(id, fn) { handlers[id] = fn; return { dispose() {} }; },
        async executeCommand() {},
    },
    workspace: {
        getConfiguration() { return { get() { return undefined; } }; },
        async openTextDocument() { return {}; },
    },
    env: { clipboard: { async writeText() {} } },
    window: {
        registerWebviewPanelSerializer() { return { dispose() {} }; },
        showInformationMessage(msg) { state.info.push(msg); return Promise.resolve(undefined); },
        showErrorMessage(msg) { state.warnings.push(msg); return Promise.resolve(undefined); },
        showWarningMessage(msg, opts, ...buttons) {
            state.warnings.push(msg);
            return Promise.resolve(state.confirm && buttons.length ? buttons[0] : undefined);
        },
        async withProgress(_opts, fn) { return fn({ report() {} }, { isCancellationRequested: false }); },
        async showTextDocument() {},
        createWebviewPanel(viewType, title) {
            const panel = {
                viewType, title, html: '', listeners: [], disposed: false,
                webview: {
                    options: {},
                    set html(v) { panel.html = v; }, get html() { return panel.html; },
                    postMessage() { return Promise.resolve(true); },
                    onDidReceiveMessage(fn) { panel.listeners.push(fn); return { dispose() {} }; },
                },
                reveal() {},
                onDidDispose() { return { dispose() {} }; },
                dispose() { panel.disposed = true; },
            };
            state.panels.push(panel);
            return panel;
        },
    },
};
const registryMock = {
    loadRegistry: () => ({ globalDocsPath: GLOBAL, projects: [{ name: 'demo', path: PROJECT, type: 'app', description: 'demo' }] }),
};
const aiMock = { async callClaude(prompt) { state.prompts.push(prompt); return AI_FILLED; } };
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
const reviewPanels = () => state.panels.filter(p => p.viewType === 'readmeBatchFix');

(async () => {
    const run = handlers['cvs.readme.fillTodos'];
    check('cvs.readme.fillTodos is registered by activate()', typeof run === 'function');
    if (typeof run !== 'function') { return; }

    // 2 ── declined
    resetFiles(); resetState(false);
    await run();
    const said = [...state.info, ...state.warnings].join(' | ');
    check('it never says "not yet implemented"', !/not yet implemented/i.test(said), said);
    check('it asks for confirmation before calling the AI', state.warnings.some(w => /_TODO:/.test(w) && /1 README/.test(w)), said);
    check('declining calls no AI and opens no review', state.prompts.length === 0 && reviewPanels().length === 0,
        `${state.prompts.length} AI calls, ${reviewPanels().length} review panels`);
    check('declining writes nothing', read(STUBBED) === STUBBED_BEFORE && read(CLEAN) === CLEAN_BEFORE);

    // 3 ── confirmed: AI for the stubbed README only, shown as a diff, nothing written
    resetFiles(); resetState(true);
    await run();
    check('confirming calls the AI once, for the one README with stubs', state.prompts.length === 1, `${state.prompts.length} calls`);
    check('the prompt carries that README and its _TODO: stub', (state.prompts[0] || '').includes(STUB_TEXT) && (state.prompts[0] || '').includes('# Demo'));
    const panel = reviewPanels()[0];
    check('a review panel opens', !!panel, `${state.panels.length} panels: ${state.panels.map(p => p.viewType).join(', ')}`);
    const itemsMatch = panel && panel.html.match(/const ITEMS = (\[[\s\S]*?\]);\n/);
    const items = itemsMatch ? JSON.parse(itemsMatch[1]) : [];
    check('the review holds one item: the stubbed README, with its AI content and a diff',
        items.length === 1 && items[0].filePath === STUBBED && items[0].aiContent === AI_FILLED
            && /^-.*_TODO:/m.test(items[0].unifiedDiff) && /^\+Demo shows how/m.test(items[0].unifiedDiff),
        JSON.stringify(items.map(i => i.filePath)));
    check('the review offers Approve and Skip', !!panel && /Approve/.test(panel.html) && /Skip/.test(panel.html));
    check('nothing is written before approval', read(STUBBED) === STUBBED_BEFORE && read(CLEAN) === CLEAN_BEFORE);

    // 4 ── approved: exactly the approved file is written
    if (panel && items.length) {
        const approved = items.map(i => ({ filePath: i.filePath, content: i.aiContent }));
        for (const fn of panel.listeners) { await fn({ command: 'applyBatch', approved }); }
        check('approving writes the AI content to the stubbed README', read(STUBBED) === AI_FILLED);
        check('the README without stubs is untouched', read(CLEAN) === CLEAN_BEFORE);
    } else {
        check('approving writes the AI content to the stubbed README', false, 'no review panel to approve in');
    }

    // 5 ── nothing to fill
    fs.writeFileSync(STUBBED, AI_FILLED, 'utf8');
    resetState(true);
    await run();
    check('with no _TODO: stubs it says so and calls no AI',
        state.prompts.length === 0 && state.info.some(m => /no readme has _todo: stubs/i.test(m)),
        [...state.info, ...state.warnings].join(' | '));
})().catch(err => check('the handler ran', false, err && err.stack || String(err)))
    .finally(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } finish(); });

function finish() {
    console.log('-'.repeat(64));
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
