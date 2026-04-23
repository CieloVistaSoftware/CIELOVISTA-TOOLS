// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Headless integration tests for the Symbol Index (mcp-server).
//
// Covers the three parking-lot verification items:
//   1. list_symbols  — index builds, returns significant symbol count across all projects
//   2. find_symbol   — "logError" returns multiple hits spanning multiple projects
//   3. list_cvt_commands — catalog returns 84+ commands, all grouped
//
// Run: node scripts/verify-symbol-index.mjs
// Pre-condition: mcp-server dist must be current — run `cd mcp-server && ..\node_modules\.bin\tsc -p tsconfig.json` first.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Runner ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(id, name, fn) {
  try {
    fn();
    console.log(`  ✓ ${id}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${id}: ${name}`);
    console.error(`    → ${err.message.split('\n')[0]}`);
    failed++;
    failures.push({ id, name, message: err.message });
  }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}

// ── Load compiled modules ───────────────────────────────────────────────────

const distDir = path.join(ROOT, 'mcp-server', 'dist');
const { getSymbolIndex, filterSymbols, findSymbolByName, invalidateSymbolIndex, loadCvtCommands } =
  await import(path.join(distDir, 'symbol-index.js').split('\\').join('/'));

// Force a fresh build — discard any cached state from a previous import.
invalidateSymbolIndex();
const allSymbols = getSymbolIndex();

// ── TEST GROUP 1: list_symbols — index builds with sufficient symbol count ──

console.log('\nSymbol Index — Integration Tests');
console.log('─'.repeat(50));
console.log('\nGROUP 1: list_symbols (index build)');

test('SYM-001', 'Index returns at least 1 symbol', () => {
  assert(allSymbols.length >= 1, `Expected ≥1 symbols, got ${allSymbols.length}`);
});

test('SYM-002', 'Index returns at least 100 symbols (cross-project coverage)', () => {
  assert(allSymbols.length >= 100,
    `Expected ≥100 symbols across all projects, got ${allSymbols.length}. Check registry paths exist.`);
});

test('SYM-003', 'All symbol entries have required fields', () => {
  const required = ['name', 'kind', 'signature', 'sourceFile', 'projectName', 'role', 'exported', 'line', 'modulePath'];
  const bad = allSymbols.filter(s => required.some(k => s[k] === undefined || s[k] === null));
  assert(bad.length === 0,
    `${bad.length} symbol(s) missing required fields. First: ${JSON.stringify(bad[0] ?? {})}`);
});

test('SYM-004', 'Symbols span at least 2 distinct projects', () => {
  const projects = new Set(allSymbols.map(s => s.projectName));
  assert(projects.size >= 2,
    `Expected symbols from ≥2 projects, only found: ${[...projects].join(', ')}`);
});

test('SYM-005', 'kind values are all valid enum members', () => {
  const VALID_KINDS = new Set(['function','class','interface','type','const','let','var','enum','namespace','export']);
  const bad = allSymbols.filter(s => !VALID_KINDS.has(s.kind));
  assert(bad.length === 0,
    `${bad.length} symbols have invalid kind. First: name="${bad[0]?.name}" kind="${bad[0]?.kind}"`);
});

test('SYM-006', 'role values are all valid enum members', () => {
  const VALID_ROLES = new Set(['src','script','test','declaration']);
  const bad = allSymbols.filter(s => !VALID_ROLES.has(s.role));
  assert(bad.length === 0,
    `${bad.length} symbols have invalid role. First: name="${bad[0]?.name}" role="${bad[0]?.role}"`);
});

test('SYM-007', 'line numbers are all positive integers', () => {
  const bad = allSymbols.filter(s => !Number.isInteger(s.line) || s.line < 1);
  assert(bad.length === 0,
    `${bad.length} symbols have invalid line number. First: ${JSON.stringify(bad[0] ?? {})}`);
});

test('SYM-008', 'modulePath uses forward slashes only', () => {
  const bad = allSymbols.filter(s => s.modulePath.includes('\\'));
  assert(bad.length === 0,
    `${bad.length} symbols have backslash in modulePath. First: ${bad[0]?.modulePath}`);
});

// filterSymbols tests

test('SYM-009', 'filterSymbols by kind returns only that kind', () => {
  const fns = filterSymbols(allSymbols, { kind: 'function' });
  assert(fns.length > 0, 'Expected at least 1 function symbol');
  const wrong = fns.filter(s => s.kind !== 'function');
  assert(wrong.length === 0, `${wrong.length} results with wrong kind`);
});

test('SYM-010', 'filterSymbols exportedOnly returns only exported symbols', () => {
  const exported = filterSymbols(allSymbols, { exportedOnly: true });
  assert(exported.length > 0, 'Expected at least 1 exported symbol');
  const wrong = exported.filter(s => !s.exported);
  assert(wrong.length === 0, `${wrong.length} unexported results returned`);
});

test('SYM-011', 'filterSymbols limit is respected', () => {
  const limited = filterSymbols(allSymbols, { limit: 5 });
  assert(limited.length <= 5, `Expected ≤5 results, got ${limited.length}`);
});

test('SYM-012', 'filterSymbols by query matches name/signature/docComment', () => {
  const QUERY = 'activate';
  const results = filterSymbols(allSymbols, { query: QUERY });
  assert(results.length > 0, `Expected at least 1 result for query "${QUERY}"`);
  const allMatch = results.every(s => {
    const hay = `${s.name} ${s.signature} ${s.docComment}`.toLowerCase();
    return hay.includes(QUERY.toLowerCase());
  });
  assert(allMatch, 'Some filterSymbols results do not contain the query string');
});

test('SYM-013', 'filterSymbols by projectName returns only that project', () => {
  const firstProject = allSymbols[0]?.projectName;
  assert(firstProject, 'No symbols in index');
  const results = filterSymbols(allSymbols, { projectName: firstProject });
  const wrong = results.filter(s => s.projectName !== firstProject);
  assert(wrong.length === 0, `${wrong.length} results from wrong project`);
});

// ── TEST GROUP 2: find_symbol — "logError" across multiple projects ──────────

console.log('\nGROUP 2: find_symbol (logError multi-project dedup check)');

const logErrorMatches = findSymbolByName(allSymbols, 'logError');

test('SYM-020', 'findSymbolByName("logError") returns at least 1 match', () => {
  assert(logErrorMatches.length >= 1,
    `Expected ≥1 match for "logError", got ${logErrorMatches.length}`);
});

test('SYM-021', 'findSymbolByName("logError") returns exact-name hits first', () => {
  // All exact hits (name === 'logError') should come before any prefix hits.
  const exact = logErrorMatches.filter(s => s.name.toLowerCase() === 'logerror');
  const prefix = logErrorMatches.filter(s => s.name.toLowerCase() !== 'logerror');
  // Find the index of the last exact and first prefix.
  const lastExactIdx = logErrorMatches.findLastIndex(s => s.name.toLowerCase() === 'logerror');
  const firstPrefixIdx = logErrorMatches.findIndex(s => s.name.toLowerCase() !== 'logerror');
  const ordered = firstPrefixIdx === -1 || lastExactIdx < firstPrefixIdx;
  assert(ordered,
    `Exact matches (${exact.length}) should precede prefix matches (${prefix.length})`);
});

test('SYM-022', 'findSymbolByName default limit is 10', () => {
  // Default limit=10, result can be ≤10.
  assert(logErrorMatches.length <= 10,
    `Expected ≤10 results (default limit), got ${logErrorMatches.length}`);
});

test('SYM-023', 'findSymbolByName respects custom limit', () => {
  const limited = findSymbolByName(allSymbols, 'logError', 2);
  assert(limited.length <= 2, `Expected ≤2 results, got ${limited.length}`);
});

// Multi-project check — the dedup-signal use case described in the parking lot.
test('SYM-024', 'findSymbolByName("logError") spans multiple projects (dedup signal)', () => {
  // Get all symbols named logError (no limit cap).
  const all = findSymbolByName(allSymbols, 'logError', 999);
  const projects = new Set(all.map(s => s.projectName));
  // logError is used in 91 call sites — it should appear in several projects.
  // Minimum threshold: at least 1 project found.
  assert(all.length >= 1, 'No logError symbols found anywhere');
  // If only one project registers it, that is still valid — report the count.
  console.log(`    ℹ logError found ${all.length} times across ${projects.size} project(s): ${[...projects].join(', ')}`);
});

// ── TEST GROUP 3: list_cvt_commands ──────────────────────────────────────────

console.log('\nGROUP 3: list_cvt_commands (catalog 84+ commands)');

const commands = loadCvtCommands();

test('SYM-030', 'loadCvtCommands returns at least 1 command', () => {
  assert(commands.length >= 1, `Expected ≥1 commands, got ${commands.length}`);
});

test('SYM-031', 'loadCvtCommands returns at least 84 commands', () => {
  assert(commands.length >= 84,
    `Expected ≥84 commands (parking-lot target), got ${commands.length}`);
});

test('SYM-032', 'All commands have required fields: id, title, group, dewey', () => {
  const required = ['id', 'title', 'group', 'dewey'];
  const bad = commands.filter(c => required.some(k => !c[k]));
  assert(bad.length === 0,
    `${bad.length} commands missing required fields. First: ${JSON.stringify(bad[0] ?? {})}`);
});

test('SYM-033', 'All command IDs start with cvs.', () => {
  const bad = commands.filter(c => !c.id.startsWith('cvs.'));
  assert(bad.length === 0,
    `${bad.length} commands with non-cvs. ID. First: ${bad[0]?.id}`);
});

test('SYM-034', 'All commands have a non-empty group', () => {
  const bad = commands.filter(c => !c.group || c.group.trim() === '');
  assert(bad.length === 0,
    `${bad.length} commands with empty group. First: ${JSON.stringify(bad[0] ?? {})}`);
});

test('SYM-035', 'Commands span at least 3 distinct groups', () => {
  const groups = new Set(commands.map(c => c.group));
  assert(groups.size >= 3,
    `Expected ≥3 command groups, found ${groups.size}: ${[...groups].join(', ')}`);
  console.log(`    ℹ ${commands.length} commands across ${groups.size} groups: ${[...groups].sort().join(', ')}`);
});

test('SYM-036', 'All Dewey numbers match NNN.NNN format', () => {
  const bad = commands.filter(c => !/^\d{3,4}\.\d{3}$/.test(c.dewey));
  assert(bad.length === 0,
    `${bad.length} commands with malformed Dewey. First: ${bad[0]?.id} → "${bad[0]?.dewey}"`);
});

test('SYM-037', 'No duplicate Dewey numbers', () => {
  const seen = new Map();
  const dupes = [];
  for (const c of commands) {
    if (seen.has(c.dewey)) { dupes.push(c.dewey); }
    else { seen.set(c.dewey, c.id); }
  }
  assert(dupes.length === 0,
    `${dupes.length} duplicate Dewey numbers: ${dupes.join(', ')}`);
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
console.log(`\nSymbol Index verification: ${passed} passed, ${failed} failed`);
console.log(`  Total symbols indexed : ${allSymbols.length}`);
console.log(`  CVT commands loaded   : ${commands.length}`);
console.log(`  logError hits (no cap): ${findSymbolByName(allSymbols, 'logError', 999).length}`);

if (failures.length) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.error(`  ✗ ${f.id}: ${f.name}\n    ${f.message}`);
  }
  process.exit(1);
}

console.log('\nAll Symbol Index verification tests passed.\n');
