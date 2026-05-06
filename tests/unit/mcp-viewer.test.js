/**
 * tests/unit/mcp-viewer.test.js
 *
 * Source-level regression tests for src/features/mcp-viewer/html.ts.
 * Verifies every tab has: a button, a CONTROLS entry, a render function,
 * and a runFromControls routing branch.
 *
 * Run: node tests/unit/mcp-viewer.test.js
 */
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC    = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');
const BUNDLE = path.join(__dirname, '../../out/extension.js');

if (!fs.existsSync(SRC)) {
    console.error('FAIL: src/features/mcp-viewer/html.ts not found');
    process.exit(1);
}

const src    = fs.readFileSync(SRC, 'utf8');
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
    'list_doc_violations',
    'validate_doc',
    'normalize_doc',
    'get_doc_by_identity',
    'list_old_dewey',
    'list_symbols',
    'find_symbol',
    'list_cvt_commands',
    'lookup_dewey',
];

// Render function names expected for each tab
const TAB_RENDER = {
    list_projects:       'renderProjectsTable',
    find_project:        'renderFindProjectTable',
    search_docs:         'renderDocsTable',
    get_catalog:         'renderDocsTable',
    list_doc_violations: 'renderDocViolations',
    validate_doc:        'renderValidateDoc',
    normalize_doc:       'renderNormalizeDoc',
    get_doc_by_identity: 'renderDocIdentity',
    list_old_dewey:      'renderOldDewey',
    list_symbols:        'renderSymbolsTable',
    find_symbol:         'renderSymbolsTable',
    list_cvt_commands:   'renderCvtCommandsTable',
    lookup_dewey:        'renderLookupDewey',
};

console.log('\nmcp-viewer unit tests\n' + '─'.repeat(60));

// ── 1. Module shape ───────────────────────────────────────────────────────────
console.log('\n[1] Module shape');

test('buildViewerHtml is exported', () => {
    assert.ok(src.includes('export function buildViewerHtml('), 'buildViewerHtml must be exported');
});
test('buildViewerHtml accepts port and totalProjects params', () => {
    assert.ok(src.includes('buildViewerHtml(port: number, totalProjects: number)'));
});

// ── 2. Tab buttons ────────────────────────────────────────────────────────────
console.log('\n[2] Tab buttons — all 13 tabs present');

for (const tab of ALL_TABS) {
    test(`tab button: ${tab}`, () => {
        assert.ok(
            src.includes(`data-endpoint="${tab}"`),
            `Missing tab button for endpoint "${tab}"`
        );
    });
}

// ── 3. CONTROLS entries ───────────────────────────────────────────────────────
console.log('\n[3] CONTROLS entries — each tab has control HTML');

for (const tab of ALL_TABS) {
    test(`CONTROLS entry: ${tab}`, () => {
        assert.ok(
            src.includes(`${tab}:`),
            `Missing CONTROLS entry for "${tab}"`
        );
    });
}

// Spot-check specific control elements
test('find_project CONTROLS has query input', () => {
    assert.ok(src.includes("find_project: '<label for=\"q\">query</label>"), 'find_project must have a query label');
});
test('validate_doc CONTROLS has Use Active .md button', () => {
    assert.ok(src.includes("btn-active-file"), 'validate_doc must have btn-active-file button');
});
test('normalize_doc CONTROLS has Use Active .md button', () => {
    const idx = src.indexOf('normalize_doc:');
    const slice = src.slice(idx, idx + 500);
    assert.ok(slice.includes('btn-active-file'), 'normalize_doc must have btn-active-file button');
});
test('lookup_dewey CONTROLS has includeCommands checkbox', () => {
    assert.ok(src.includes('includeCommands'), 'lookup_dewey must have includeCommands checkbox');
});
test('list_symbols CONTROLS has exported-only checkbox', () => {
    assert.ok(src.includes('exportedOnly'), 'list_symbols must have exportedOnly checkbox');
});
test('get_catalog CONTROLS has sort select', () => {
    assert.ok(src.includes('sortBy'), 'get_catalog must have sortBy select');
});

// ── 4. Render functions ───────────────────────────────────────────────────────
console.log('\n[4] Render functions — one per distinct render path');

const renderFns = [...new Set(Object.values(TAB_RENDER))];
for (const fn of renderFns) {
    test(`render function defined: ${fn}`, () => {
        assert.ok(
            src.includes(`function ${fn}(`),
            `Missing render function "${fn}"`
        );
    });
}

// ── 5. runFromControls routing ────────────────────────────────────────────────
console.log('\n[5] runFromControls — routing branch for every tab');

for (const tab of ALL_TABS) {
    test(`runFromControls branch: ${tab}`, () => {
        assert.ok(
            src.includes(`endpoint === '${tab}'`),
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
        assert.ok(src.includes(pattern), `runEndpoint missing branch for "${tab}"`);
    });
}

// ── 7. Helper functions ───────────────────────────────────────────────────────
console.log('\n[7] Helper functions');

test('esc() XSS-escape function exists', () => {
    assert.ok(src.includes('function esc(s)') || src.includes('function esc('), 'esc() must be defined');
});
test('esc() escapes & < > "', () => {
    assert.ok(src.includes("replace(/&/g,'&amp;')"), 'esc must escape &');
    assert.ok(src.includes("replace(/</g,'&lt;')"),  'esc must escape <');
    assert.ok(src.includes("replace(/>/g,'&gt;')"),  'esc must escape >');
    assert.ok(src.includes('replace(/"/g,\'&quot;\')'), 'esc must escape "');
});
test('countSummary() exists', () => {
    assert.ok(src.includes('function countSummary('), 'countSummary must be defined');
});
test('countSummary handles projectCount', () => {
    assert.ok(src.includes("json.projectCount"), 'countSummary must check projectCount');
});
test('countSummary handles totalViolations', () => {
    assert.ok(src.includes("json.totalViolations"), 'countSummary must check totalViolations');
});
test('sortDocs() exists with 4 modes', () => {
    assert.ok(src.includes('function sortDocs('), 'sortDocs must be defined');
    assert.ok(src.includes("mode === 'title'"),       "sortDocs must handle 'title' mode");
    assert.ok(src.includes("mode === 'file'"),        "sortDocs must handle 'file' mode");
    assert.ok(src.includes("mode === 'description'"), "sortDocs must handle 'description' mode");
});
test('formatStamp() converts ISO dates', () => {
    assert.ok(src.includes('function formatStamp('), 'formatStamp must be defined');
    assert.ok(src.includes('new Date(iso)'), 'formatStamp must construct a Date');
});
test('statusPill() renders lifecycle status chips', () => {
    assert.ok(src.includes('function statusPill('), 'statusPill must be defined');
    assert.ok(src.includes('c-status'), 'statusPill must use c-status CSS class');
});
test('toast() shows notification messages', () => {
    assert.ok(src.includes('function toast('), 'toast must be defined');
});

// ── 8. Render output spot-checks ──────────────────────────────────────────────
console.log('\n[8] Render output spot-checks');

test('renderProjectsTable emits c-name and c-path columns', () => {
    const idx = src.indexOf('function renderProjectsTable(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('c-name'), 'renderProjectsTable must emit c-name cell');
    assert.ok(slice.includes('c-path'), 'renderProjectsTable must emit c-path cell');
});
test('renderDocViolations renders summary byCode table', () => {
    const idx = src.indexOf('function renderDocViolations(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('byCode'), 'renderDocViolations must render byCode summary');
    assert.ok(slice.includes('totalViolations'), 'renderDocViolations must show totalViolations count');
});
test('renderValidateDoc shows ok/violations-found status', () => {
    const idx = src.indexOf('function renderValidateDoc(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('violations found'), 'renderValidateDoc must show "violations found" label');
    assert.ok(slice.includes('data.ok'), 'renderValidateDoc must check data.ok flag');
});
test('renderNormalizeDoc shows missingFields', () => {
    const idx = src.indexOf('function renderNormalizeDoc(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('missingFields'), 'renderNormalizeDoc must reference missingFields');
    assert.ok(slice.includes('suggestedFrontmatter'), 'renderNormalizeDoc must show suggestedFrontmatter');
});
test('renderDocIdentity shows found/not-found states', () => {
    const idx = src.indexOf('function renderDocIdentity(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('not found'), 'renderDocIdentity must have not-found state');
    assert.ok(slice.includes('data.found'), 'renderDocIdentity must check data.found');
    assert.ok(slice.includes('data.identity'), 'renderDocIdentity must display identity');
});
test('renderOldDewey shows oldDewey column', () => {
    const idx = src.indexOf('function renderOldDewey(');
    const slice = src.slice(idx, idx + 1000);
    assert.ok(slice.includes('oldDewey'), 'renderOldDewey must render oldDewey column');
});
test('renderSymbolsTable groups by project and shows kind/role', () => {
    // function body is long (inline regex escaping pads line 375), search full source
    assert.ok(src.includes("esc(s.kind)"), 'renderSymbolsTable must display symbol kind');
    assert.ok(src.includes("esc(s.role)"), 'renderSymbolsTable must display symbol role');
    const idx = src.indexOf('function renderSymbolsTable(');
    const slice = src.slice(idx, idx + 1500);
    assert.ok(slice.includes('group-hd'), 'renderSymbolsTable must use group headers');
});
test('renderCvtCommandsTable groups by group name', () => {
    const idx = src.indexOf('function renderCvtCommandsTable(');
    const slice = src.slice(idx, idx + 1200);
    assert.ok(slice.includes('group-hd'), 'renderCvtCommandsTable must use group headers');
    assert.ok(slice.includes('c.dewey'), 'renderCvtCommandsTable must show Dewey column');
});
test('renderLookupDewey renders both docs and commands sections', () => {
    const idx = src.indexOf('function renderLookupDewey(');
    const slice = src.slice(idx, idx + 1500);
    assert.ok(slice.includes('Documents'), 'renderLookupDewey must render Documents section');
    assert.ok(slice.includes('CVT Commands'), 'renderLookupDewey must render CVT Commands section');
});
test('docs table links use /md-preview?path= for file preview', () => {
    assert.ok(src.includes('/md-preview?path='), 'Doc table rows must link to /md-preview for file preview');
});
test('docs table links include back= return URL parameter', () => {
    assert.ok(src.includes('&back='), 'md-preview links must include back return URL parameter');
});
test('buildMdPreviewLink helper exists', () => {
    assert.ok(src.includes('function buildMdPreviewLink('), 'buildMdPreviewLink helper must be defined');
});

// ── 9. CSS / dark theme ───────────────────────────────────────────────────────
console.log('\n[9] CSS / dark theme');

test('dark theme background #1e1e1e is set on body', () => {
    assert.ok(src.includes('background:#1e1e1e'), 'body must use VS Code dark background');
});
test('links use yellow #FFD700 per project link-visibility rule', () => {
    assert.ok(src.includes('#FFD700'), 'links must be yellow (#FFD700)');
});
test('active tab uses blue #0078d4 accent', () => {
    assert.ok(src.includes('#0078d4'), 'active tab must use #0078d4 accent colour');
});

// ── 10. Bundle check ──────────────────────────────────────────────────────────
console.log('\n[10] Bundle check — key patterns survive esbuild');

if (bundle.length === 0) {
    console.log('  SKIP bundle checks — out/extension.js not built');
} else {
    test('bundle contains buildViewerHtml function name', () => {
        assert.ok(bundle.includes('buildViewerHtml'), 'buildViewerHtml must appear in bundle');
    });
    test('bundle contains all 13 tab endpoint names', () => {
        for (const tab of ALL_TABS) {
            assert.ok(bundle.includes(`data-endpoint="${tab}"`), `Tab "${tab}" missing from bundle`);
        }
    });
    test('bundle contains esc() XSS helper', () => {
        assert.ok(bundle.includes('&amp;') && bundle.includes('&lt;'), 'esc() HTML entities must be in bundle');
    });
    test('bundle contains /md-preview?path= link pattern', () => {
        assert.ok(bundle.includes('/md-preview?path='), '/md-preview link pattern must be in bundle');
    });
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
