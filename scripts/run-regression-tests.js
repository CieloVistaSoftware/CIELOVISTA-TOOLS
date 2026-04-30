/**
 * run-regression-tests.js
 *
 * Zero-dependency regression tests that run BEFORE every build.
 * Build is aborted with non-zero exit if any test fails.
 *
 * Run directly:  node scripts/run-regression-tests.js
 * Run via npm:   npm run test:regression
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const failures = [];

function test(id, name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${id}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \u2717 ${id}: ${name}`);
    console.error(`    \u2192 ${err.message.split('\n')[0]}`);
    if (err.message.includes('\n')) {
      err.message.split('\n').slice(1, 8).forEach(l => console.error(`      ${l}`));
    }
    failed++;
    failures.push({ id, name, message: err.message });
  }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function walkTs(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      walkTs(full, results);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      results.push(full);
    }
  }
  return results;
}

function srcContents() {
  return walkTs(SRC).map(f => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }));
}

/** Strip template literal bodies so generated import strings don't cause false positives. */
function stripTemplateLiterals(src) {
  // Replace content between backticks with empty placeholder, handles escaped backticks
  return src.replace(/`(?:[^`\\]|\\.)*`/gs, '``');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nCieloVista Tools \u2014 Regression Test Suite');
console.log('\u2500'.repeat(50));

// REG-001a: Every package imported in extension host src/ must be in dependencies.
// If a package is imported in src/ but only in devDependencies, vsce will not bundle
// it and the extension crashes with "Cannot find module" on activation (REG-011).
test('REG-001a', 'Every package imported in src/ is listed in dependencies', () => {
  const BUILTINS = new Set([
    'fs','path','os','child_process','util','crypto','stream','events',
    'url','http','https','net','tls','zlib','buffer','assert','process',
    'querystring','readline','string_decoder','timers','vm',
  ]);
  const pkg  = readJson(path.join(ROOT, 'package.json'));
  const deps = new Set(Object.keys(pkg.dependencies ?? {}));
  const violations = [];

  for (const { file, src } of srcContents()) {
    if (file.includes('scripts') || file.includes('tests') || file.includes('mcp-server')) { continue; }
    // Strip template literal contents so generated import strings inside webview HTML
    // template literals don't produce false positives (e.g. playwright config generators)
    const stripped = stripTemplateLiterals(src);
    // Match ES import statements: import ... from 'pkg' or import 'pkg'
    const importRe = /^import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/gm;
    let m;
    while ((m = importRe.exec(stripped)) !== null) {
      const mod = m[1].split('/')[0];
      if (mod === 'vscode' || BUILTINS.has(mod) || mod.startsWith('@types/')) { continue; }
      if (!deps.has(mod)) {
        violations.push(`  ${file}\n    imports '${m[1]}' but '${mod}' is not in dependencies`);
      }
    }
  }

  assert(violations.length === 0,
    `Packages imported in src/ are MISSING from package.json "dependencies".\n` +
    `These will cause "Cannot find module" crash on activation (see REG-011):\n\n` +
    `${violations.join('\n')}\n\n` +
    `FIX for each package listed above:\n` +
    `  1. Move it from devDependencies to dependencies in package.json\n` +
    `  2. Add !node_modules/<pkg>/** ABOVE the node_modules/** line in .vscodeignore\n` +
    `  3. Run npm run rebuild and confirm the package appears under node_modules/ in the VSIX listing\n` +
    `  See REGRESSION-LOG.md REG-011 for full explanation.`);
});

// REG-001b: The "package" script must NOT contain --no-dependencies.
// That flag tells vsce to skip bundling node_modules entirely, which strips all
// runtime packages from the VSIX and causes "Cannot find module" crashes on activation.
test('REG-001b', 'vsce package script does not use --no-dependencies flag', () => {
  const pkg    = readJson(path.join(ROOT, 'package.json'));
  const script = pkg.scripts?.package ?? '';
  assert(!script.includes('--no-dependencies'),
    `The "package" npm script contains --no-dependencies:\n  "${script}"\n\n` +
    `This flag strips ALL node_modules from the VSIX, causing "Cannot find module" crashes.\n\n` +
    `FIX: Change the package script in package.json to:\n` +
    `  "package": "vsce package"\n` +
    `Runtime packages are included via .vscodeignore negation rules — see REG-011.`);
});

// REG-001c: No require() of external packages in extension host compiled output.
// Extension host code must use ES import (handled by TypeScript), not require().
// Any require() of an external package bypasses bundling and will fail at runtime.
test('REG-001c', 'No require() of external packages in extension host', () => {
  const BUILTINS = new Set([
    'fs','path','os','child_process','util','crypto','stream','events',
    'url','http','https','net','tls','zlib','buffer','assert','process',
    'querystring','readline','string_decoder','timers','vm',
  ]);
  const violations = [];
  for (const { file, src } of srcContents()) {
    if (file.includes('scripts') || file.includes('tests') || file.includes('mcp-server')) { continue; }
    const stripped = stripTemplateLiterals(src);
    const re = /require\(['"]([^'"./][^'"]*)['"]\)/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const mod = m[1].split('/')[0];
      if (!BUILTINS.has(mod) && mod !== 'vscode') {
        violations.push(`  ${file}: require('${m[1]}')`);
      }
    }
  }
  assert(violations.length === 0,
    `Extension host uses require() for external packages — these will crash on activation:\n\n` +
    `${violations.join('\n')}\n\n` +
    `FIX: Replace require() with ES import at the top of the file.\n` +
    `If the package is only used in a webview, load it via CDN in the HTML instead.`);
});

// REG-002: logError interface compliance — all callers must match their interface contract
// The error log is the only way to diagnose broken code in production.
// A wrong call silently swallows the stack trace or crashes with a type error.
test('REG-002', 'All logError callers match their interface contract', () => {
  const { execFileSync } = require('child_process');
  const script = path.join(ROOT, 'scripts', 'test-logerror-interface.js');
  let output = '', exitCode = 0;
  try {
    output = execSync(`node "${script}"`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    exitCode = e.status ?? 1;
    output = (e.stdout ?? '') + (e.stderr ?? '');
  }
  assert(exitCode === 0,
    `logError interface violations found — the error log will not work correctly.\n` +
    `Run: node scripts/test-logerror-interface.js\n\n` +
    output.slice(0, 1200));
});

// REG-003: TypeScript compiles clean
test('REG-003', 'TypeScript compiles with zero errors', () => {
  const tsc = path.join(ROOT, 'node_modules', '.bin', 'tsc');
  let exitCode = 0, output = '';
  try {
    execSync(`"${tsc}" --noEmit`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    exitCode = e.status ?? 1;
    output = (e.stdout ?? '') + (e.stderr ?? '');
  }
  assert(exitCode === 0, `TypeScript errors:\n${output.slice(0, 800)}`);
});

// REG-004: Every catalog command ID must be wired through an actual
// registerCommand() call (direct literal or const reference) — not just
// referenced as a string anywhere in src/. The previous loose check passed
// on any substring match, so a bare comment containing the ID was enough
// to satisfy it. Issue #65 surfaced 9 catalog IDs whose runtime behaviour
// drifted from this rule. The tightened check walks src/ for every
// registerCommand(...) invocation and resolves both literal-arg and
// const-reference patterns to a registered-id set; the catalog must be a
// subset of that set.
test('REG-004', 'Every catalog command ID is wired through a registerCommand() call', () => {
  const catalogPath = path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts');
  const catalogSrc  = fs.readFileSync(catalogPath, 'utf8');
  const catalogIds  = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);

  const registeredIds = new Set();
  for (const file of walkTs(SRC)) {
    if (file.endsWith('catalog.ts')) { continue; }
    const src = fs.readFileSync(file, 'utf8');
    // Pattern A: literal-arg form  registerCommand('cvs.foo.bar', fn)
    for (const m of src.matchAll(/registerCommand\s*\(\s*['"]([^'"]+)['"]/g)) {
      registeredIds.add(m[1]);
    }
    // Pattern B: const-reference form  const FOO_ID = 'cvs.foo'; ...registerCommand(FOO_ID, fn)
    // We resolve the variable inside the same file — that's where const command IDs live.
    for (const m of src.matchAll(/registerCommand\s*\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
      const varName = m[1];
      // Skip obvious non-identifiers — async/await/etc. won't ever be a const id.
      if (['async', 'await', 'function', 'return'].includes(varName)) { continue; }
      const declRe = new RegExp(`(?:const|let|var)\\s+${varName}\\b[^=;\\n]*=\\s*['"]([^'"]+)['"]`);
      const decl = declRe.exec(src);
      if (decl) { registeredIds.add(decl[1]); }
    }
    // Pattern C: helper-wrapper form  registerFixed(context, 'cvs.foo.bar', ...)
    // Some features centralize command registration in wrappers that call
    // vscode.commands.registerCommand internally.
    for (const m of src.matchAll(/registerFixed\s*\(\s*[^,]+,\s*['"]([^'"]+)['"]/g)) {
      registeredIds.add(m[1]);
    }
  }

  const missing = catalogIds.filter(id => !registeredIds.has(id));
  assert(missing.length === 0,
    `${missing.length} catalog ID(s) have NO matching registerCommand() call in src/:\n  ${missing.join('\n  ')}\n\n` +
    `Each catalog entry must be backed by a vscode.commands.registerCommand(<id>, fn) call —\n` +
    `either as a direct string literal or as a const reference declared in the same file.\n` +
    `Either add the registration, or remove the entry from catalog.ts.`);
});

// REG-005: No duplicate command IDs in catalog
test('REG-005', 'No duplicate command IDs in catalog.ts', () => {
  const catalogSrc = fs.readFileSync(path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts'), 'utf8');
  const ids = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  const seen = new Set(), dupes = [];
  for (const id of ids) { if (seen.has(id)) { dupes.push(id); } else { seen.add(id); } }
  assert(dupes.length === 0, `Duplicate command IDs in catalog: ${dupes.join(', ')}`);
});

// REG-006: package.json contributes.commands covers all catalog IDs
test('REG-006', 'package.json contributes.commands covers all catalog IDs', () => {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const contributed = new Set((pkg.contributes?.commands ?? []).map(c => c.command));
  const catalogSrc  = fs.readFileSync(path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts'), 'utf8');
  const catalogIds  = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  const missing = catalogIds.filter(id => !contributed.has(id));
  assert(missing.length === 0,
    `${missing.length} catalog ID(s) missing from package.json contributes.commands:\n  ${missing.join('\n  ')}\n` +
    `VS Code will not recognise these at startup.`);
});

// REG-007: extension.ts activates all feature modules
test('REG-007', 'extension.ts activates all feature modules', () => {
  const extSrc = fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8');

  // Extract every activate alias: "activate as foo" -> 'foo'  (exclude deactivate aliases)
  const imported = [...extSrc.matchAll(/(?<!de)activate\s+as\s+(\w+)/g)].map(m => m[1]);

  // Each imported activate alias must appear as a call: foo(context) or activateIfEnabled(..., foo, context)
  const missing = imported.filter(alias => {
    const called  = new RegExp('\\b' + alias + '\\s*\\(context\\)').test(extSrc);
    const enabled = new RegExp('activateIfEnabled\\([^)]+,\\s*' + alias + '\\s*,').test(extSrc);
    return !called && !enabled;
  });

  assert(missing.length === 0,
    missing.length + ' feature activate() functions imported but NEVER called in extension.ts:\n  ' +
    missing.join('\n  ') +
    '\nThese features are silently dead - commands will show as Could not run.' +
    '\nFIX: Add activateIfEnabled call for each one.');
});

// REG-008: No bare console.log (warning only, does not fail build)
test('REG-008', 'No bare console.log in extension host (warning)', () => {
  const violations = [];
  for (const { file, src } of srcContents()) {
    if (file.includes('scripts') || file.includes('tests') || file.includes('mcp-server')) { continue; }
    src.split('\n').forEach((line, i) => {
      if (/console\.(log|warn|error)\s*\(/.test(line) && !line.trim().startsWith('//')) {
        violations.push(`${file}:${i+1}`);
      }
    });
  }
  if (violations.length > 0) {
    console.warn(`    \u26a0  ${violations.length} console.log/warn/error in source (use log() from output-channel)`);
  }
  // Warning only — don't fail
});

// REG-009: data/ must be gitignored
test('REG-009', 'data/ is listed in .gitignore', () => {
  const gi = path.join(ROOT, '.gitignore');
  if (!fs.existsSync(gi)) { return; }
  const content = fs.readFileSync(gi, 'utf8');
  assert(content.includes('data/') || content.includes('/data'),
    'data/ is not in .gitignore — bg-health.json should not be committed.');
});

// REG-010: No dead dependencies — every package in dependencies is actually
// imported in src/ or mcp-server/src/. Both surfaces ship in the VSIX: src/ is
// the extension host, mcp-server/src/ is the MCP subprocess. A dep used by
// neither is truly dead and just bloats the VSIX.
// Packages only loaded via CDN in webview HTML should NOT be in dependencies.
test('REG-010', 'Every package in dependencies is imported somewhere in src/ or mcp-server/src/', () => {
  const pkg  = readJson(path.join(ROOT, 'package.json'));
  const deps = Object.keys(pkg.dependencies ?? {});
  if (deps.length === 0) { return; }

  // Extension-host sources: src/ files only (excludes scripts, tests, mcp-server).
  const extSrc = srcContents()
    .filter(({ file }) => !file.includes('scripts') && !file.includes('tests') && !file.includes('mcp-server'))
    .map(({ src }) => stripTemplateLiterals(src))
    .join('\n');

  // MCP server sources: walk mcp-server/src/ if present.
  let mcpSrc = '';
  const mcpRoot = path.join(ROOT, 'mcp-server', 'src');
  if (fs.existsSync(mcpRoot)) {
    const mcpFiles = walkTs(mcpRoot);
    mcpSrc = mcpFiles
      .map(f => stripTemplateLiterals(fs.readFileSync(f, 'utf8')))
      .join('\n');
  }

  const combined = extSrc + '\n' + mcpSrc;
  const unused = deps.filter(dep => {
    return !new RegExp(`from\\s+['"]${dep}|require\\(['"]${dep}`).test(combined);
  });
  assert(unused.length === 0,
    `These packages are in "dependencies" but never imported in src/ or mcp-server/src/:\n  ${unused.join('\n  ')}\n\n` +
    `If they are only loaded via CDN in webview HTML:\n` +
    `  1. Remove them from dependencies in package.json\n` +
    `  2. Remove their !node_modules/<pkg>/** line from .vscodeignore\n` +
    `  (CDN packages do not need to be in the VSIX at all)\n\n` +
    `If they ARE needed at runtime in the extension host or MCP subprocess:\n` +
    `  1. Add the import to the correct src/ or mcp-server/src/ file\n` +
    `Dead dependencies bloat the VSIX unnecessarily (REG-010).`);
});

// REG-011: Every package in dependencies must have a negation entry in .vscodeignore.
// .vscodeignore contains node_modules/** which strips all of node_modules from the VSIX.
// Runtime packages must be explicitly re-included with !node_modules/<pkg>/** ABOVE that line.
// Missing negation = package stripped from VSIX = "Cannot find module" crash on activation.
test('REG-011', 'Every runtime dependency has a !node_modules/<pkg>/** entry in .vscodeignore', () => {
  const pkg    = readJson(path.join(ROOT, 'package.json'));
  const deps   = Object.keys(pkg.dependencies ?? {});
  if (deps.length === 0) { return; }
  const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8');
  const missing = deps.filter(d => !ignore.includes(`!node_modules/${d}/`));
  assert(missing.length === 0,
    `These runtime dependencies are in package.json "dependencies" but NOT negation-included\n` +
    `in .vscodeignore. They will be stripped from the VSIX and crash activation:\n  ${missing.join('\n  ')}\n\n` +
    `FIX: Add the following lines to .vscodeignore ABOVE the node_modules/** line:\n` +
    `${missing.map(d => `  !node_modules/${d}/**`).join('\n')}\n` +
    `Order matters — negations must come before node_modules/**.`);
});

test('REG-012', 'Static HTML files are copied to out/ by copy-commandhelp.js', () => {
  const staticFiles = [
    'out/features/doc-catalog/catalog.html',
  ];
  const missing = staticFiles.filter(f => !fs.existsSync(path.join(ROOT, f)));
  assert(missing.length === 0,
    `These static HTML files are missing from out/ — run: node scripts/copy-commandhelp.js\n  ${missing.join('\n  ')}`);
});

test('REG-013', 'All run commands route through cvsJobResult output webview', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'scripts/test-run-output-webview.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `Run output webview test failed:\n${result.stdout}\n${result.stderr}`);
});

test('REG-014', 'Home Recent Runs shows immediate full-string hover tooltip', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/home-recent-runs-tooltip.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `Home Recent Runs tooltip regression failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-015: Issue #67 — package.json must round-trip through JSON.parse after every rebuild.
// Verifies (a) current package.json is valid, (b) #67-pattern corruption is detected, (c)
// dropping an untracked feature file does not mutate package.json, and (d) the validator
// script exits 0 — i.e. the rebuild gate that was just wired in is functional end-to-end.
test('REG-015', 'package.json round-trips through JSON.parse and validator gate works', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-015-package-json-round-trip.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-015 package.json round-trip test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-016: Issue #66 — NPM Output webview blank when running scripts.
// Verifies the source has (a) the immediate '[CVT] Launching:' echo after job-start,
// (b) the 2-second safety-net flush in setupOutputPanel, (c) the '(no output)'
// placeholder swap on done, (d) the listener-first pattern, and (e) the
// webview-side output-ready retry. Static-source check; the webview itself is
// not driven end-to-end here because that would require launching VS Code.
test('REG-016', 'npm output webview shows launched command and never goes blank', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-016-npm-output-webview.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-016 npm output webview test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-017: Issue #65 — launcher must filter catalog by live registered
// commands at render time. Static-source check that locks the runtime
// filter into place: getRegisteredCommandSet() exists in index.ts, all
// three call sites (showLauncherPanel, refreshLauncherPanel, deserializer)
// pass it to buildLauncherHtml, the signature accepts it, the body
// produces visibleCatalog, and every downstream consumer uses
// visibleCatalog instead of raw CATALOG. REG-004 (just tightened) is the
// complement that enforces the source-level rule that every catalog ID
// has a matching registerCommand call. Together they keep the
// dead-button class of bug from coming back.
test('REG-017', 'launcher filters catalog against vscode.commands.getCommands()', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-017-launcher-filter.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-017 launcher filter test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-018: Issues #59 / #60 / #63 / #64 — auto-filed APP_ERROR
// cluster (314 cumulative occurrences). Locks two source-level
// fixes in place: (a) mcp-server-status.ts filters SIGTERM/SIGINT
// and exit code 0 out of the logError + scheduleRetry path, so
// window reloads and clean shutdowns don't generate APP_ERROR
// noise, and (b) github-issue-filer.ts fileErrorAsIssue calls
// findOpenAutoFiledIssue before postIssue and comments on a
// match instead of opening a duplicate (this is what should have
// prevented #60 from being filed when #64 already had the
// identical title).
test('REG-018', 'MCP lifecycle filter + auto-filer dedup are in source', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-018-mcp-lifecycle-and-dedup.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-018 lifecycle + dedup test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-019: Issue #69 — FileList sortable file browser.
// Locks the FileList feature in source so a future refactor can't
// silently remove the command, the home-page button, the unit
// test, or the shared sort lib. Verifies cvs.tools.fileList is
// registered in file-list-viewer.ts, the sort lib exposes the
// expected exports + folders-first invariant, the unit test
// still has real coverage and imports from out/, the home page
// Quick Launch wires the button through OPEN_DIRECT, and the
// launcher catalog has the entry.
test('REG-019', 'FileList feature (#69) is fully wired in source', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-019-filelist-feature.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-019 FileList feature test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-020: Issue #2 — launcher read-action failures must be visible in UI.
// Static-source guard: in the read-action catch path, index.ts must post an
// explicit {type:'error'} message to the launcher webview so the red failure
// banner/status appears immediately instead of failing silently.
test('REG-020', 'launcher read-command failures post visible error message', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/regression/REG-020-launcher-read-error-visible.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `REG-020 launcher read error visibility test failed:\n${result.stdout}\n${result.stderr}`);
});

// REG-021: Home quick-launch Issue Viewer must stay wired to GitHub Issues.
// Guards against accidentally routing the button back to local TODO preview.
test('REG-021', 'Home Issue Viewer button opens GitHub Issues (not local TODO doc)', () => {
  const result = require('child_process').spawnSync(
    process.execPath, [path.join(ROOT, 'tests/home-todo-opens-github-issues.test.js')],
    { encoding: 'utf8' }
  );
  assert(result.status === 0,
    `Home Issue Viewer->GitHub Issues regression failed:\n${result.stdout}\n${result.stderr}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\u2500'.repeat(50));
if (failed === 0) {
  console.log(`\u2713 All ${passed} regression tests passed \u2014 proceeding with build.\n`);
  process.exit(0);
} else {
  console.error(`\n\u2717 ${failed} regression test(s) FAILED \u2014 build aborted.\n`);
  for (const f of failures) {
    console.error(`  ${f.id}: ${f.name}`);
    console.error(`    ${f.message.split('\n')[0]}`);
  }
  console.error('\nFix the above before rebuilding.\n');
  process.exit(1);
}
