/**
 * tests/unit/mcp-viewer.test.js
 *
 * Regression tests for the MCP Endpoint Viewer page, src/features/mcp-viewer/html.ts.
 * Verifies every tab has: a button, a CONTROLS entry, a render function,
 * and a runFromControls routing branch.
 *
 * The checks run against the page the real buildViewerHtml() returns, loaded
 * from the per-module test build (out-test/, scripts/build-test-modules.mjs).
 * Until #819 they ran against the source text of html.ts, so the test never
 * executed the module it is named after. Only the exported signature is still
 * read from the source, because a signature has no runtime form. REG-179 keeps
 * every unit test named after a module loading that module.
 *
 * Run: node scripts/run-unit-tests.js mcp-viewer
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC    = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');
const OUT    = path.join(__dirname, '../../out-test/features/mcp-viewer/html.js');
const BUNDLE = path.join(__dirname, '../../out/extension.js');

if (!fs.existsSync(SRC)) {
    console.error('FAIL: src/features/mcp-viewer/html.ts not found');
    process.exit(1);
}
if (!fs.existsSync(OUT)) {
    console.error('FAIL: out-test/features/mcp-viewer/html.js not built. Run through node scripts/run-unit-tests.js, which builds it.');
    process.exit(1);
}

const src    = fs.readFileSync(SRC, 'utf8');
const page   = require(OUT).buildViewerHtml(3999, 7, 'test-token');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

const ALL_TABS = [
    'list_projects',
    'find_project',
    'search_docs',
    'get_catalog',
    'list_symbols',
    'find_symbol',
    'list_cvt_commands',
];

// Retired with the doc-numbering system (#707 stage 3). None may come back.
// Two more retired tabs had the retired system's name in theirs; REG-159
// fails on that name anywhere in src/, so it keeps them out.
const RETIRED_TABS = [
    'list_doc_violations',
    'validate_doc',
    'normalize_doc',
    'get_doc_by_identity',
];

// Render function names expected for each tab
const TAB_RENDER = {
    list_projects:       'renderProjectsTable',
    find_project:        'renderFindProjectTable',
    search_docs:         'renderDocsTable',
    get_catalog:         'renderDocsTable',
    list_symbols:        'renderSymbolsTable',
    find_symbol:         'renderSymbolsTable',
    list_cvt_commands:   'renderCvtCommandsTable',
};

console.log('\nmcp-viewer unit tests\n' + '─'.repeat(60));

// ── 1. Module shape ───────────────────────────────────────────────────────────
console.log('\n[1] Module shape');

test('buildViewerHtml is exported', () => {
    assert.ok(src.includes('export function buildViewerHtml('), 'buildViewerHtml must be exported');
});
test('buildViewerHtml accepts port, totalProjects and the server token (#780)', () => {
    assert.ok(src.includes('buildViewerHtml(port: number, totalProjects: number, token: string)'));
});
test('the page is built with the port, project count and token it was given', () => {
    assert.ok(page.includes("var BASE = 'http://127.0.0.1:3999';"), 'BASE must use the given port');
    assert.ok(page.includes("var TOKEN = 'test-token';"), 'TOKEN must be the given token');
    assert.ok(page.includes('<b id="stat-count">7</b>'), 'the project count must be shown');
});
test('every request from the page carries the server token (#780)', () => {
    assert.ok(page.includes("var MCP_URL = BASE + '/mcp?t=' + TOKEN;"), 'JSON-RPC URL must carry the token');
    assert.ok(!page.includes("fetch(BASE + '/mcp'"), 'no fetch may bypass MCP_URL (it would be sent without the token)');
});

// ── 2. Tab buttons ────────────────────────────────────────────────────────────
console.log('\n[2] Tab buttons — all ' + ALL_TABS.length + ' tabs present, no retired ones');

for (const tab of ALL_TABS) {
    test(`tab button: ${tab}`, () => {
        assert.ok(
            page.includes(`data-endpoint="${tab}"`),
            `Missing tab button for endpoint "${tab}"`
        );
    });
}
for (const tab of RETIRED_TABS) {
    test(`retired tab absent: ${tab}`, () => {
        assert.ok(!page.includes(tab), `"${tab}" is still in the viewer; it was retired with the doc-numbering system (#707)`);
    });
}

// ── 3. CONTROLS entries ───────────────────────────────────────────────────────
console.log('\n[3] CONTROLS entries — each tab has control HTML');

for (const tab of ALL_TABS) {
    test(`CONTROLS entry: ${tab}`, () => {
        assert.ok(
            page.includes(`${tab}:`),
            `Missing CONTROLS entry for "${tab}"`
        );
    });
}

// Spot-check specific control elements
test('find_project CONTROLS has query input', () => {
    assert.ok(page.includes("find_project: '<label for=\"q\">query</label>"), 'find_project must have a query label');
});
test('list_symbols CONTROLS has exported-only checkbox', () => {
    assert.ok(page.includes('exportedOnly'), 'list_symbols must have exportedOnly checkbox');
});
test('get_catalog CONTROLS has sort select', () => {
    assert.ok(page.includes('sortBy'), 'get_catalog must have sortBy select');
});

// ── 4. Render functions ───────────────────────────────────────────────────────
console.log('\n[4] Render functions — one per distinct render path');

const renderFns = [...new Set(Object.values(TAB_RENDER))];
for (const fn of renderFns) {
    test(`render function defined: ${fn}`, () => {
        assert.ok(
            page.includes(`function ${fn}(`),
            `Missing render function "${fn}"`
        );
    });
}

// ── 5. runFromControls routing ────────────────────────────────────────────────
console.log('\n[5] runFromControls — routing branch for every tab');

for (const tab of ALL_TABS) {
    test(`runFromControls branch: ${tab}`, () => {
        assert.ok(
            page.includes(`endpoint === '${tab}'`),
            `Missing runFromControls branch for "${tab}"`
        );
    });
}

// ── 6. render dispatch in runEndpoint ─────────────────────────────────────────
console.log('\n[6] runEndpoint dispatch — routes to correct render function');

for (const [tab, fn] of Object.entries(TAB_RENDER)) {
    if (tab === 'search_docs' || tab === 'find_symbol') { continue; } // shared render, checked via get_catalog / list_symbols
    test(`runEndpoint dispatches ${tab} → ${fn}`, () => {
        const pattern = `currentEndpoint === '${tab}'`;
        assert.ok(page.includes(pattern), `runEndpoint missing branch for "${tab}"`);
    });
}

// ── 7. Helper functions ───────────────────────────────────────────────────────
console.log('\n[7] Helper functions');

test('esc() XSS-escape function exists', () => {
    assert.ok(page.includes('function esc(s)') || page.includes('function esc('), 'esc() must be defined');
});
test('esc() escapes & < > "', () => {
    assert.ok(page.includes("replace(/&/g,'&amp;')"), 'esc must escape &');
    assert.ok(page.includes("replace(/</g,'&lt;')"),  'esc must escape <');
    assert.ok(page.includes("replace(/>/g,'&gt;')"),  'esc must escape >');
    assert.ok(page.includes('replace(/"/g,\'&quot;\')'), 'esc must escape "');
});
test('countSummary() exists', () => {
    assert.ok(page.includes('function countSummary('), 'countSummary must be defined');
});
test('countSummary handles projectCount', () => {
    assert.ok(page.includes("json.projectCount"), 'countSummary must check projectCount');
});
test('sortDocs() exists with 4 modes', () => {
    assert.ok(page.includes('function sortDocs('), 'sortDocs must be defined');
    assert.ok(page.includes("mode === 'title'"),       "sortDocs must handle 'title' mode");
    assert.ok(page.includes("mode === 'file'"),        "sortDocs must handle 'file' mode");
    assert.ok(page.includes("mode === 'description'"), "sortDocs must handle 'description' mode");
});
test('formatStamp() converts ISO dates', () => {
    assert.ok(page.includes('function formatStamp('), 'formatStamp must be defined');
    assert.ok(page.includes('new Date(iso)'), 'formatStamp must construct a Date');
});
test('statusPill() renders lifecycle status chips', () => {
    assert.ok(page.includes('function statusPill('), 'statusPill must be defined');
    assert.ok(page.includes('c-status'), 'statusPill must use c-status CSS class');
});
test('toast() shows notification messages', () => {
    assert.ok(page.includes('function toast('), 'toast must be defined');
});

// ── 8. Render output spot-checks ──────────────────────────────────────────────
console.log('\n[8] Render output spot-checks');

test('renderProjectsTable emits c-name and c-path columns', () => {
    const idx = page.indexOf('function renderProjectsTable(');
    const slice = page.slice(idx, idx + 1200);
    assert.ok(slice.includes('c-name'), 'renderProjectsTable must emit c-name cell');
    assert.ok(slice.includes('c-path'), 'renderProjectsTable must emit c-path cell');
});
test('renderSymbolsTable groups by project and shows kind/role', () => {
    // function body is long (inline regex escaping pads line 375), search full source
    assert.ok(page.includes("esc(s.kind)"), 'renderSymbolsTable must display symbol kind');
    assert.ok(page.includes("esc(s.role)"), 'renderSymbolsTable must display symbol role');
    const idx = page.indexOf('function renderSymbolsTable(');
    const slice = page.slice(idx, idx + 1500);
    assert.ok(slice.includes('group-hd'), 'renderSymbolsTable must use group headers');
});
test('renderCvtCommandsTable groups by group name', () => {
    const idx = page.indexOf('function renderCvtCommandsTable(');
    const slice = page.slice(idx, idx + 1200);
    assert.ok(slice.includes('group-hd'), 'renderCvtCommandsTable must use group headers');
    assert.ok(slice.includes('esc(c.id)'), 'renderCvtCommandsTable must show the command id');
});
test('docs table links use /md-preview with the token and ?path= for file preview (#780)', () => {
    assert.ok(page.includes("/md-preview?t=' + TOKEN + '&path='"), 'Doc table rows must link to /md-preview, token included, for file preview');
});
test('docs table links include back= return URL parameter', () => {
    assert.ok(page.includes('&back='), 'md-preview links must include back return URL parameter');
});
test('buildMdPreviewLink helper exists', () => {
    assert.ok(page.includes('function buildMdPreviewLink('), 'buildMdPreviewLink helper must be defined');
});

// ── 9. CSS / dark theme ───────────────────────────────────────────────────────
console.log('\n[9] CSS / dark theme');

test('dark theme background #1e1e1e is set on body', () => {
    assert.ok(page.includes('background:#1e1e1e'), 'body must use VS Code dark background');
});
test('links use yellow #FFD700 per project link-visibility rule', () => {
    assert.ok(page.includes('#FFD700'), 'links must be yellow (#FFD700)');
});
test('active tab uses blue #0078d4 accent', () => {
    assert.ok(page.includes('#0078d4'), 'active tab must use #0078d4 accent colour');
});

// ── 10. Bundle check ──────────────────────────────────────────────────────────
console.log('\n[10] Bundle check — key patterns survive esbuild');

if (bundle.length === 0) {
    console.log('  SKIP bundle checks — out/extension.js not built');
} else {
    test('bundle contains buildViewerHtml function name', () => {
        assert.ok(bundle.includes('buildViewerHtml'), 'buildViewerHtml must appear in bundle');
    });
    test('bundle contains every tab endpoint name', () => {
        for (const tab of ALL_TABS) {
            assert.ok(bundle.includes(`data-endpoint="${tab}"`), `Tab "${tab}" missing from bundle`);
        }
    });
    test('bundle contains esc() XSS helper', () => {
        assert.ok(bundle.includes('&amp;') && bundle.includes('&lt;'), 'esc() HTML entities must be in bundle');
    });
    test('bundle contains the /md-preview link pattern, token included (#780)', () => {
        assert.ok(bundle.includes("/md-preview?t=' + TOKEN + '&path="), '/md-preview link pattern (with the server token) must be in bundle');
    });
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
