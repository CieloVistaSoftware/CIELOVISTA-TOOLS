/**
 * REG-159-dewey-docid-system-retired.test.js
 *
 * Regression test for #707 stage 3 and #787: every Dewey number is retired,
 * the doc docids and the command launcher's per-command numbers alike.
 *
 * History (this file is the one place in tests/ and scripts/ that may name
 * the retired system; the rules below keep every other file free of it):
 *   #707 stage 1 moved every doc to the three-field contract (id, title,
 *   description at the top), stage 2 regrouped the Doc Catalog by folder, and
 *   stage 3 deleted what was left: eight MCP tools that existed only to
 *   service Dewey docids, the MCP Endpoint Viewer's Dewey tabs,
 *   CatalogCard.dewey, the Doc Intelligence subject/category mismatch check,
 *   the doc-contract checker and the scripts that wrote docids.
 *   #787 then retired the launcher's per-command numbers (catalog.ts "dewey"
 *   fields). They were hand-assigned, required and checked for uniqueness by
 *   four separate checks, but only ever displayed: the launcher card badge,
 *   the card and F1 tooltips, the help panel badge, the list_cvt_commands
 *   output and the MCP Endpoint Viewer column. The command id and its group
 *   already identify and group every command. The numbers, every display,
 *   the checks that only enforced them and the helper scripts built on them
 *   are gone. Stage 3 left allowances here for those five files; #787 removed
 *   the allowances.
 *
 * Checks:
 *   1. BEHAVIOURAL. The real MCP server (mcp-server/src/server.ts) is bundled
 *      into a temp sandbox, connected to a real MCP client over the SDK's
 *      in-memory transport, and asked for tools/list. None of the eight
 *      retired tools may be listed, and the tools that replaced nothing and
 *      must survive (get_catalog, search_docs, find_project, ...) must be.
 *   2. No file under src/ or mcp-server/src mentions dewey or docid. No
 *      exceptions: the command launcher is covered too (#787).
 *   3. No file under tests/ or scripts/ mentions dewey, except this one.
 *   4. The deleted files are gone, and package.json no longer runs them.
 *   5. No markdown file in the repository (outside docs/archive) declares a
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
    // #787: the per-command number checks and helpers
    'tests/catalog-dewey-uniqueness.test.js',
    'tests/regression/REG-033-no-dewey-field-in-src-docs.test.js',
    'scripts/patch-help-docs.js',
    'scripts/print-npm-deweys.js',
    'scripts/create-github-issues.ps1',
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

// The one file in tests/ and scripts/ allowed to name the retired system.
const SELF = rel(__filename);

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
    console.log('\nREG-159: every Dewey number is retired, docs (#707) and commands (#787)\n');

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

    // ── 2. No dewey/docid anywhere in src/ or mcp-server/src (#787: no exceptions)
    const PATTERN = /dewey|docid/i;
    const offenders = [];
    let total = 0;
    for (const file of [...walk(path.join(ROOT, 'src'), ['.ts', '.js', '.md', '.html', '.json', '.css']),
                        ...walk(path.join(ROOT, 'mcp-server', 'src'), ['.ts', '.js', '.md', '.json'])]) {
        const text = readOrNull(file);
        if (text === null) { continue; }
        const lines = text.split(/\r?\n/).filter((l) => PATTERN.test(l));
        if (lines.length === 0) { continue; }
        total += lines.length;
        offenders.push(`${rel(file)} (${lines.length}): ${lines[0].trim().slice(0, 120)}`);
    }
    check(offenders.length === 0,
        'no file in src/ or mcp-server/src mentions dewey or docid, the command launcher included',
        `${total} line(s) in ${offenders.length} file(s):\n          ` + offenders.join('\n          '));

    // ── 3. No dewey in tests/ or scripts/, except this file's history ───────
    const DEWEY = /dewey/i;
    const testOffenders = [];
    let testTotal = 0;
    for (const file of [...walk(path.join(ROOT, 'tests'), ['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.html']),
                        ...walk(path.join(ROOT, 'scripts'), ['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.html', '.ps1', '.sh', '.bat'])]) {
        const r = rel(file);
        if (r === SELF) { continue; }
        const text = readOrNull(file);
        if (text === null) { continue; }
        const lines = text.split(/\r?\n/).filter((l) => DEWEY.test(l));
        if (lines.length === 0) { continue; }
        testTotal += lines.length;
        testOffenders.push(`${r} (${lines.length}): ${lines[0].trim().slice(0, 120)}`);
    }
    check(testOffenders.length === 0,
        `no file in tests/ or scripts/ other than ${SELF} mentions dewey`,
        `${testTotal} line(s) in ${testOffenders.length} file(s):\n          ` + testOffenders.join('\n          '));

    // ── 4. The deleted files stay deleted, and nothing runs them ────────────
    const back = DELETED_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
    check(back.length === 0, `all ${DELETED_FILES.length} retired Dewey files (docs #707, commands #787) are gone`, `present again: ${back.join(', ')}`);

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const scripts = pkg.scripts || {};
    check(!('test:doc-contract' in scripts), 'package.json has no test:doc-contract script');
    const runners = Object.entries(scripts).filter(([, v]) => /doc-contract|backfill-doc-contract|fix-docid|migrate-docid|dewey|patch-help-docs|create-github-issues/i.test(String(v)));
    check(runners.length === 0, 'no package.json script runs a retired Dewey check or script',
        runners.map(([k]) => k).join(', '));

    // ── 5. No markdown file declares a docid ────────────────────────────────
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
