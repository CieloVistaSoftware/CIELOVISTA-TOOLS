// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * tests/unit/symbol-index.test.js
 *
 * The MCP server's symbol index (mcp-server/src/symbol-index.ts), which backs
 * the list_symbols, find_symbol and list_cvt_commands tools.
 *
 * These are the SYM checks that lived in scripts/verify-symbol-index.mjs
 * (#803). That script could not run: it imported mcp-server/dist/symbol-index.js,
 * which esbuild stopped emitting when the server became one bundle, it handed
 * a raw C:/ path to import(), and it read the real project registry in the
 * user's home folder, so its counts depended on the machine. Nothing ran it,
 * so none of that showed.
 *
 * This test owns its environment instead:
 *   - It bundles symbol-index.ts into a temp sandbox with esbuild and imports
 *     it through pathToFileURL, the way REG-159 loads the server. It never
 *     writes mcp-server/dist (REG-130 invariant 1).
 *   - It points the home folder at a temp directory holding a two-project
 *     registry: this repo as cielovista-tools, and a fixture project that
 *     defines logError, so the cross-project checks have a known answer.
 *
 * Run: node scripts/run-unit-tests.js symbol-index
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;
function test(id, name, fn) {
    try { fn(); console.log(`  PASS ${id}: ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${id}: ${name}\n       ${err.message.split('\n')[0]}`); failed++; }
}
function assert(cond, message) { if (!cond) { throw new Error(message); } }

async function main() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-index-test-'));
    try {
        // ── Fixture: a home folder with a two-project registry ───────────────
        const home = path.join(sandbox, 'home');
        const standards = path.join(home, 'Downloads', 'CieloVistaStandards');
        fs.mkdirSync(standards, { recursive: true });
        const fixture = path.join(sandbox, 'fixture-project');
        fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
        fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(fixture, 'src', 'log.ts'), [
            '/** Writes an error to the log. */',
            'export function logError(message: string): void { console.error(message); }',
            'export function logErrorVerbose(message: string, detail: string): void { console.error(message, detail); }',
            'export class Logger {}',
            'export const LOG_LEVEL = 3;',
            '',
        ].join('\n'));
        fs.writeFileSync(path.join(fixture, 'scripts', 'helper.js'), 'function activateFixture() { return 1; }\nmodule.exports = { activateFixture };\n');
        fs.writeFileSync(path.join(standards, 'project-registry.json'), JSON.stringify({
            globalDocsPath: standards,
            projects: [
                { name: 'cielovista-tools', path: ROOT, type: 'vscode-extension', description: 'this repo' },
                { name: 'fixture-project', path: fixture, type: 'library', description: 'symbol-index fixture' },
            ],
        }, null, 2));
        // catalog-helpers reads os.homedir() when the module loads, so this
        // must be set before the import below.
        process.env.HOME = home;
        process.env.USERPROFILE = home;

        // ── Bundle the real module into the sandbox ──────────────────────────
        const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
        const outfile = path.join(sandbox, 'symbol-index.mjs');
        await esbuild.build({
            entryPoints: [path.join(ROOT, 'mcp-server', 'src', 'symbol-index.ts')],
            outfile,
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node18',
            logLevel: 'error',
        });
        const { getSymbolIndex, filterSymbols, findSymbolByName, invalidateSymbolIndex, loadCvtCommands } =
            await import(pathToFileURL(outfile).href);

        invalidateSymbolIndex();
        const allSymbols = getSymbolIndex('all');

        console.log('symbol-index — list_symbols (index build)');
        test('SYM-001', 'index returns symbols', () => {
            assert(allSymbols.length >= 100, `expected >= 100 symbols from this repo plus the fixture, got ${allSymbols.length}`);
        });
        test('SYM-003', 'every entry has the required fields', () => {
            const required = ['name', 'kind', 'signature', 'sourceFile', 'projectName', 'role', 'exported', 'line', 'modulePath'];
            const bad = allSymbols.filter(s => required.some(k => s[k] === undefined || s[k] === null));
            assert(bad.length === 0, `${bad.length} missing fields; first: ${JSON.stringify(bad[0] ?? {})}`);
        });
        test('SYM-004', 'symbols come from both registered projects', () => {
            const projects = new Set(allSymbols.map(s => s.projectName));
            assert(projects.has('cielovista-tools') && projects.has('fixture-project'), `projects: ${[...projects].join(', ')}`);
        });
        test('SYM-005', 'kind values are valid', () => {
            const VALID = new Set(['function', 'class', 'interface', 'type', 'const', 'let', 'var', 'enum', 'namespace', 'export']);
            const bad = allSymbols.filter(s => !VALID.has(s.kind));
            assert(bad.length === 0, `first bad: ${bad[0]?.name} kind=${bad[0]?.kind}`);
        });
        test('SYM-006', 'role values are valid', () => {
            const VALID = new Set(['src', 'script', 'test', 'declaration']);
            const bad = allSymbols.filter(s => !VALID.has(s.role));
            assert(bad.length === 0, `first bad: ${bad[0]?.name} role=${bad[0]?.role}`);
        });
        test('SYM-007', 'line numbers are positive integers', () => {
            const bad = allSymbols.filter(s => !Number.isInteger(s.line) || s.line < 1);
            assert(bad.length === 0, `first bad: ${JSON.stringify(bad[0] ?? {})}`);
        });
        test('SYM-008', 'modulePath uses forward slashes only', () => {
            const bad = allSymbols.filter(s => s.modulePath.includes('\\'));
            assert(bad.length === 0, `first bad: ${bad[0]?.modulePath}`);
        });
        test('SYM-008b', 'the fixture symbols are indexed with the right kind, role and line', () => {
            const fx = allSymbols.filter(s => s.projectName === 'fixture-project');
            const logError = fx.find(s => s.name === 'logError');
            assert(logError, `logError not indexed; fixture symbols: ${fx.map(s => s.name).join(', ')}`);
            assert(logError.kind === 'function' && logError.role === 'src' && logError.exported && logError.line === 2,
                `logError indexed as ${JSON.stringify(logError)}`);
            assert(logError.modulePath === 'src/log', `modulePath ${logError.modulePath}`);
            const helper = fx.find(s => s.name === 'activateFixture');
            assert(helper && helper.role === 'script', `activateFixture: ${JSON.stringify(helper)}`);
        });

        console.log('symbol-index — filterSymbols');
        test('SYM-009', 'filter by kind returns only that kind', () => {
            const r = filterSymbols(allSymbols, { kind: 'function' });
            assert(r.length > 0 && r.every(s => s.kind === 'function'), `${r.length} results`);
        });
        test('SYM-010', 'exportedOnly returns only exported symbols', () => {
            const r = filterSymbols(allSymbols, { exportedOnly: true });
            assert(r.length > 0 && r.every(s => s.exported), `${r.length} results`);
        });
        test('SYM-011', 'limit is respected', () => {
            assert(filterSymbols(allSymbols, { limit: 5 }).length === 5, 'expected exactly 5');
        });
        test('SYM-012', 'query matches name, signature or doc comment', () => {
            const r = filterSymbols(allSymbols, { query: 'activate' });
            assert(r.length > 0, 'no results for "activate"');
            assert(r.every(s => `${s.name} ${s.signature} ${s.docComment}`.toLowerCase().includes('activate')), 'a result does not contain the query');
        });
        test('SYM-013', 'projectName returns only that project', () => {
            const r = filterSymbols(allSymbols, { projectName: 'fixture-project' });
            assert(r.length >= 5 && r.every(s => s.projectName === 'fixture-project'), `${r.length} results`);
        });

        console.log('symbol-index — find_symbol');
        const hits = findSymbolByName(allSymbols, 'logError', 999);
        test('SYM-020', 'findSymbolByName("logError") finds the fixture definition', () => {
            assert(hits.some(s => s.projectName === 'fixture-project' && s.name === 'logError'), `${hits.length} hits`);
        });
        test('SYM-021', 'exact-name hits come before prefix hits', () => {
            const lastExact = hits.findLastIndex(s => s.name.toLowerCase() === 'logerror');
            const firstPrefix = hits.findIndex(s => s.name.toLowerCase() !== 'logerror');
            assert(firstPrefix !== -1, 'fixture defines logErrorVerbose, so there must be a prefix hit');
            assert(lastExact < firstPrefix, `last exact ${lastExact}, first prefix ${firstPrefix}`);
        });
        test('SYM-022', 'default limit is 10', () => {
            assert(findSymbolByName(allSymbols, 'a').length === 10, 'expected 10 for a one-letter prefix');
        });
        test('SYM-023', 'a custom limit is respected', () => {
            assert(findSymbolByName(allSymbols, 'logError', 1).length === 1, 'expected 1');
        });

        console.log('symbol-index — list_cvt_commands');
        const commands = loadCvtCommands();
        test('SYM-030', 'the command catalog loads', () => {
            assert(commands.length >= 84, `expected >= 84 commands, got ${commands.length}`);
        });
        test('SYM-032', 'every command has id, title and group', () => {
            const bad = commands.filter(c => !c.id || !c.title || !c.group);
            assert(bad.length === 0, `first bad: ${JSON.stringify(bad[0] ?? {})}`);
        });
        test('SYM-033', 'every command id starts with cvs.', () => {
            const bad = commands.filter(c => !c.id.startsWith('cvs.'));
            assert(bad.length === 0, `first bad: ${bad[0]?.id}`);
        });
        test('SYM-035', 'commands span at least 3 groups', () => {
            const groups = new Set(commands.map(c => c.group));
            assert(groups.size >= 3, `groups: ${[...groups].join(', ')}`);
        });
    } finally {
        fs.rmSync(sandbox, { recursive: true, force: true });
    }

    console.log(`symbol-index: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error('symbol-index test crashed:', err); process.exit(1); });
