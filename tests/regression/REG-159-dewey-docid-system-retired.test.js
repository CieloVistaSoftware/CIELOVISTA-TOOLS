/**
 * REG-159-dewey-docid-system-retired.test.js
 *
 * Regression test for #707 stage 3: the Dewey docid system is retired.
 *
 * Stage 1 moved every doc to the three-field contract (id, title, description
 * at the top), stage 2 regrouped the Doc Catalog by folder, and stage 3
 * deleted what was left: eight MCP tools that existed only to service Dewey
 * docids, the MCP Endpoint Viewer's Dewey tabs, CatalogCard.dewey, the Doc
 * Intelligence subject/category mismatch check, the doc-contract checker and
 * the scripts that wrote docids. This test keeps all of it gone.
 *
 * Checks:
 *   1. BEHAVIOURAL. The real MCP server (mcp-server/src/server.ts) is bundled
 *      into a temp sandbox, connected to a real MCP client over the SDK's
 *      in-memory transport, and asked for tools/list. None of the eight
 *      retired tools may be listed, and the tools that replaced nothing and
 *      must survive (get_catalog, search_docs, find_project, ...) must be.
 *   2. No file under src/ or mcp-server/src mentions dewey or docid, except
 *      the command launcher's own per-COMMAND numbering. That taxonomy is a
 *      separate system (see the issue filed from #707 stage 3); the files
 *      that surface it outside the launcher are capped at their current
 *      line count so nothing new can hide among them.
 *   3. The deleted files are gone, and package.json no longer runs them.
 *   4. No markdown file in the repository (outside docs/archive) declares a
 *      docid field.
 *
 * The sandbox bundle is how REG-140 compiles mcp-server code too: writing a
 * build into mcp-server/dist would replace the shipped bundle and break the
 * packaging size check for every later test (REG-130 invariant 1).
 *
 * Run: node tests/regression/REG-159-dewey-docid-system-retired.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const ok   = (msg) => { console.log('  PASS: ' + msg); passed++; };
const fail = (msg) => { console.error('  FAIL: ' + msg); failed++; };
const check = (cond, msg, detail) => { if (cond) { ok(msg); } else { fail(msg + (detail ? '\n        -> ' + detail : '')); } };

const RETIRED_TOOLS = [
    'lookup_dewey', 'migrate_dewey', 'list_old_dewey', 'refresh_doc_ledger',
    'validate_doc', 'list_doc_violations', 'normalize_doc', 'get_doc_by_identity',
];
const SURVIVING_TOOLS = [
    'get_catalog', 'search_docs', 'find_project', 'list_projects', 'project_status',
    'list_broken_refs', 'repair_broken_refs', 'list_symbols', 'find_symbol',
    'list_cvt_commands', 'registry_promote', 'registry_set_status',
];

// Files outside the command launcher that surface the launcher's per-command
// numbers. Line-count caps: a new dewey/docid line in any of them fails.
const COMMAND_TAXONOMY_ALLOWED = {
    'src/shared/help-panel.ts': 3,                   // help panel shows a command's number
    'src/features/mcp-viewer/symbol-index.ts': 2,    // reads catalog.ts command entries
    'src/features/mcp-viewer/html.ts': 3,            // list_cvt_commands number column + sort key
    'mcp-server/src/symbol-index.ts': 4,             // loadCvtCommands() command entries
    'mcp-server/src/tools/index.ts': 1,              // list_cvt_commands tool description
};
const LAUNCHER_DIR = 'src/features/cvs-command-launcher/';

const DELETED_FILES = [
    'tests/unit/doc-contract.test.ts',
    'tests/regression/REG-138-doc-contract-scans-this-repo-only.test.js',
    'tests/regression/REG-027-doc-catalog-no-collisions.test.js',
    'tests/regression/REG-111-md-frontmatter-at-bottom.test.js',
    'tests/dewey-lookup-mcp.test.js',
    'scripts/backfill-doc-contract.mjs',
    'scripts/fix-docid-collisions.js',
    'scripts/migrate-docid.js',
    'scripts/build-frontmatter-viewer.js',
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.claude', '.vscode-test']);

function walk(dir, exts, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, exts, out); }
        else if (exts.some((x) => e.name.endsWith(x))) { out.push(full); }
    }
    return out;
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function readOrNull(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

async function listToolsFromRealServer() {
    const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg159-'));
    try {
        const outfile = path.join(sandbox, 'server.mjs');
        await esbuild.build({
            entryPoints: [path.join(ROOT, 'mcp-server', 'src', 'server.ts')],
            outfile,
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node18',
            logLevel: 'error',
            // Some bundled CommonJS dependencies call require(); give the ESM
            // bundle one so they load.
            banner: { js: "import { createRequire as __reg159cr } from 'module'; const require = __reg159cr(import.meta.url);" },
        });
        const { createServer } = await import(pathToFileURL(outfile).href);
        const sdk = path.join(ROOT, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm');
        const { Client } = await import(pathToFileURL(path.join(sdk, 'client', 'index.js')).href);
        const { InMemoryTransport } = await import(pathToFileURL(path.join(sdk, 'inMemory.js')).href);

        const server = createServer();
        const client = new Client({ name: 'reg-159', version: '1.0.0' });
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
        await server.connect(serverSide);
        await client.connect(clientSide);
        const result = await client.listTools();
        await client.close();
        await server.close();
        return result.tools.map((t) => t.name);
    } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
    }
}

(async () => {
    console.log('\nREG-159: the Dewey docid system is retired (#707 stage 3)\n');

    // ── 1. The real MCP server does not list the retired tools ──────────────
    let names = null;
    try {
        names = await listToolsFromRealServer();
        ok(`MCP server started in a sandbox and listed ${names.length} tools over tools/list`);
    } catch (err) {
        fail('could not start the MCP server and list its tools: ' + (err && err.stack ? err.stack : String(err)));
    }
    if (names) {
        const stillThere = RETIRED_TOOLS.filter((t) => names.includes(t));
        check(stillThere.length === 0,
            'none of the 8 Dewey-only MCP tools is registered',
            `still registered: ${stillThere.join(', ')}`);
        const missing = SURVIVING_TOOLS.filter((t) => !names.includes(t));
        check(missing.length === 0,
            'every surviving catalog/registry/symbol tool is still registered',
            `missing: ${missing.join(', ')}`);
    }

    // ── 2. No dewey/docid in src/ or mcp-server/src outside the launcher ────
    const PATTERN = /dewey|docid/i;
    const offenders = [];
    const counts = {};
    let total = 0;
    for (const file of [...walk(path.join(ROOT, 'src'), ['.ts', '.js', '.md', '.html', '.json', '.css']),
                        ...walk(path.join(ROOT, 'mcp-server', 'src'), ['.ts', '.js', '.md', '.json'])]) {
        const r = rel(file);
        const text = readOrNull(file);
        if (text === null) { continue; }
        const lines = text.split(/\r?\n/).filter((l) => PATTERN.test(l));
        if (lines.length === 0) { continue; }
        total += lines.length;
        if (r.startsWith(LAUNCHER_DIR)) { continue; }
        counts[r] = lines.length;
        if (!(r in COMMAND_TAXONOMY_ALLOWED)) {
            offenders.push(`${r} (${lines.length}): ${lines[0].trim().slice(0, 120)}`);
        }
    }
    check(offenders.length === 0,
        'no file in src/ or mcp-server/src outside the command launcher mentions dewey or docid',
        `${offenders.length} file(s):\n          ` + offenders.join('\n          '));
    for (const [file, expected] of Object.entries(COMMAND_TAXONOMY_ALLOWED)) {
        const actual = counts[file] || 0;
        check(actual <= expected,
            `${file}: at most ${expected} command-taxonomy line(s), found ${actual}`,
            'a new dewey/docid line appeared in a file allowed only for the command launcher\'s own numbers');
    }
    console.log(`        (${total} dewey/docid lines in src/ + mcp-server/src in total)`);

    // ── 3. The deleted files stay deleted, and nothing runs them ────────────
    const back = DELETED_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
    check(back.length === 0, `all ${DELETED_FILES.length} retired Dewey files are gone`, `present again: ${back.join(', ')}`);

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts = pkg.scripts || {};
    check(!('test:doc-contract' in scripts), 'package.json has no test:doc-contract script');
    const runners = Object.entries(scripts).filter(([, v]) => /doc-contract|backfill-doc-contract|fix-docid|migrate-docid/.test(String(v)));
    check(runners.length === 0, 'no package.json script runs a retired Dewey check or script',
        runners.map(([k]) => k).join(', '));

    // ── 4. No markdown file declares a docid ────────────────────────────────
    const withDocid = walk(ROOT, ['.md'])
        .filter((f) => !rel(f).startsWith('docs/archive/'))
        .filter((f) => /^docid\s*:/m.test(readOrNull(f) || ''));
    check(withDocid.length === 0, 'no markdown file outside docs/archive declares a docid',
        withDocid.map(rel).join(', '));

    console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.error(`\n✗ REG-159 FAILED (${failed} of ${passed + failed} checks failed).`);
        process.exit(1);
    }
    console.log('✓ REG-159 passed');
    process.exit(0);
})().catch((err) => {
    console.error('✗ REG-159 FAILED: ' + (err && err.stack ? err.stack : String(err)));
    process.exit(1);
});
