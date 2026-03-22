/**
 * catalog-integrity.test.js
 *
 * Validates that catalog.ts declarations match reality across three layers:
 *
 *  LAYER 1 - Catalog structure
 *   1.  No duplicate IDs
 *   2.  No duplicate Dewey numbers
 *   3.  All scopes are known values
 *   4.  All actions are known values
 *   5.  Catalog has entries
 *
 *  LAYER 2 - Command registration
 *   6.  Every catalog ID has a registerCommand in the codebase
 *   7.  Every package.json contributes command is in the catalog
 *
 *  LAYER 3 - Project launcher accuracy
 *   8.  No cd /d syntax
 *   9.  SnapIt/DiskCleanUp paths exist
 *  10.  Scripts map to real npm scripts or dotnet targets
 *  11.  Launcher IDs are registered
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const SRC         = path.join(ROOT, 'src');
const TOOLS       = path.join(ROOT, 'src', 'features', 'cvs-command-launcher');

const catalogSrc   = fs.readFileSync(path.join(TOOLS, 'catalog.ts'), 'utf8');
const extensionSrc = fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8');
const launcherSrc  = fs.readFileSync(path.join(SRC, 'features', 'project-launcher.ts'), 'utf8');
const packageJson  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// ── Parse catalog ─────────────────────────────────────────────────────────────
const idRe      = /\bid:\s*'([^']+)'/g;
const deweyRe   = /\bdewey:\s*'([^']+)'/g;
const scopeRe   = /\bscope:\s*'([^']+)'/g;
const actionRe  = /\baction:\s*'([^']+)'/g;

const catalogIds    = [...catalogSrc.matchAll(idRe)].map(m => m[1]);
const catalogDeweys = [...catalogSrc.matchAll(deweyRe)].map(m => m[1]);
const catalogScopes = [...catalogSrc.matchAll(scopeRe)].map(m => m[1]);
const catalogActions= [...catalogSrc.matchAll(actionRe)].map(m => m[1]);

// ── Parse project-launcher ────────────────────────────────────────────────────
const regFixedRe  = /registerFixed\([^,]+,\s*'([^']+)',\s*'[^']+',\s*'([^']+)',\s*\w+\)/g;
const launcherCmds = [...launcherSrc.matchAll(regFixedRe)].map(m => ({ id: m[1], cmd: m[2] }));

const snapitPathMatch    = launcherSrc.match(/const SNAPIT\s*=\s*'([^']+)'/);
const diskcleanPathMatch = launcherSrc.match(/const DISKCLEAN\s*=\s*'([^']+)'/);
const snapitPath    = snapitPathMatch    ? snapitPathMatch[1]    : '';
const diskcleanPath = diskcleanPathMatch ? diskcleanPathMatch[1] : '';

function getScripts(projPath) {
    const pkgPath = path.join(projPath, 'package.json');
    if (!fs.existsSync(pkgPath)) { return {}; }
    try { return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {}; } catch { return {}; }
}

function hasSln(projPath) {
    if (!fs.existsSync(projPath)) { return false; }
    return fs.readdirSync(projPath).some(function(f) { return /\.(sln|slnx)$/i.test(f); });
}

const snapitScripts    = getScripts(snapitPath);
const diskcleanScripts = getScripts(diskcleanPath);

// ── Build full set of registered command IDs ──────────────────────────────────
function getAllRegisteredCommands() {
    var cmds = new Set();

    function extractFromSrc(src) {
        // Pattern 1: registerCommand('cvs.foo', ...)  -- string literal
        var litRe = /registerCommand\(['"]([^'"]+)['"]/g;
        var m;
        while ((m = litRe.exec(src)) !== null) { cmds.add(m[1]); }

        // Pattern 2: const SOME_CONST = 'cvs.foo'  -- const-based ID
        var constRe = /const\s+\w+\s*=\s*'(cvs\.[^']+)'/g;
        while ((m = constRe.exec(src)) !== null) { cmds.add(m[1]); }
    }

    extractFromSrc(extensionSrc);

    function walk(dir) {
        var entries = fs.readdirSync(dir, { withFileTypes: true });
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var full  = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.name.endsWith('.ts')) {
                extractFromSrc(fs.readFileSync(full, 'utf8'));
            }
        }
    }
    walk(path.join(SRC, 'features'));

    // registerFixed wraps registerCommand using a variable — add launcher IDs directly
    for (var i = 0; i < launcherCmds.length; i++) { cmds.add(launcherCmds[i].id); }

    return cmds;
}

const allRegistered = getAllRegisteredCommands();
const pkgCmds = (packageJson.contributes && packageJson.contributes.commands
    ? packageJson.contributes.commands : []).map(function(c) { return c.command; });

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0;
var failed = 0;

function test(name, fn) {
    try { fn(); console.log('  PASS:', name); passed++; }
    catch (e) { console.error('  FAIL:', name, '\n        ', e.message); failed++; }
}

function assert(condition, msg) { if (!condition) { throw new Error(msg); } }

// ── LAYER 1 ───────────────────────────────────────────────────────────────────
console.log('\n-- Layer 1: Catalog structure --\n');

test('No duplicate command IDs', function() {
    var seen = new Set(); var dupes = [];
    for (var i = 0; i < catalogIds.length; i++) {
        if (seen.has(catalogIds[i])) { dupes.push(catalogIds[i]); }
        seen.add(catalogIds[i]);
    }
    assert(dupes.length === 0, 'Duplicate IDs: ' + dupes.join(', '));
});

test('No duplicate Dewey numbers', function() {
    var seen = new Set(); var dupes = [];
    for (var i = 0; i < catalogDeweys.length; i++) {
        if (seen.has(catalogDeweys[i])) { dupes.push(catalogDeweys[i]); }
        seen.add(catalogDeweys[i]);
    }
    assert(dupes.length === 0, 'Duplicate Dewey: ' + dupes.join(', '));
});

test('All scopes are valid (global|workspace|diskcleanup|tools)', function() {
    var VALID = new Set(['global', 'workspace', 'diskcleanup', 'tools']);
    var bad = catalogScopes.filter(function(s) { return !VALID.has(s); });
    assert(bad.length === 0, 'Invalid scopes: ' + [...new Set(bad)].join(', '));
});

test('All actions are valid (read|run)', function() {
    var VALID = new Set(['read', 'run']);
    var bad = catalogActions.filter(function(a) { return !VALID.has(a); });
    assert(bad.length === 0, 'Invalid actions: ' + [...new Set(bad)].join(', '));
});

test('Catalog has entries', function() {
    assert(catalogIds.length > 0, 'No IDs found — parse may have failed');
    console.log('        (' + catalogIds.length + ' entries found)');
});

// ── LAYER 2 ───────────────────────────────────────────────────────────────────
console.log('\n-- Layer 2: Command registration --\n');

test('Every catalog ID has a registerCommand in the codebase', function() {
    var unregistered = catalogIds.filter(function(id) { return !allRegistered.has(id); });
    assert(unregistered.length === 0,
        'In catalog but never registered:\n         ' + unregistered.join('\n         '));
});

test('Every package.json command is in the catalog', function() {
    // Commands that are legitimately internal / context-menu-only, not in launcher catalog
    var EXEMPT = new Set([
        'cvs.commands.showAll',
        'cvs.commands.quickRun',
        'cvs.npm.addScriptDescription',
        'cvs.project.openHome',          // project home opener - internal
        'cvs.htmlTemplates.download',    // context menu only
        'cvs.htmlTemplates.openClipboardPath',
        'cvs.headers.fixAll',            // doc header commands - not yet in launcher
        'cvs.headers.fixOne',
        'cvs.headers.fixFile',
        'cvs.headers.viewStandard',
        'cvs.config.edit'                // internal config editor
    ]);
    var missing = pkgCmds.filter(function(id) { return !EXEMPT.has(id) && !catalogIds.includes(id); });
    assert(missing.length === 0,
        'In package.json but missing from catalog:\n         ' + missing.join('\n         '));
});

// ── LAYER 3 ───────────────────────────────────────────────────────────────────
console.log('\n-- Layer 3: Project launcher accuracy --\n');

test('No launcher command uses cmd.exe "cd /d" syntax', function() {
    var hits = launcherSrc.match(/cd\s*\/d/g) || [];
    assert(hits.length === 0, 'Found "cd /d" -- use plain cd for PowerShell');
});

test('SnapIt path exists on disk', function() {
    assert(snapitPath.length > 0, 'Could not parse SNAPIT constant');
    assert(fs.existsSync(snapitPath), 'SnapIt path not found: ' + snapitPath);
});

test('DiskCleanUp path exists on disk', function() {
    assert(diskcleanPath.length > 0, 'Could not parse DISKCLEAN constant');
    assert(fs.existsSync(diskcleanPath), 'DiskCleanUp path not found: ' + diskcleanPath);
});

test('SnapIt launcher commands map to real scripts', function() {
    var errors = [];
    launcherCmds.filter(function(c) { return c.id.includes('snapit'); }).forEach(function(c) {
        if (c.cmd.startsWith('npm run ')) {
            var s = c.cmd.slice(8);
            if (!(s in snapitScripts)) { errors.push(c.id + ': "npm run ' + s + '" not in SnapIt package.json'); }
        } else if (c.cmd === 'npm start' && !('start' in snapitScripts)) {
            errors.push(c.id + ': "npm start" -- no start script in SnapIt');
        }
    });
    assert(errors.length === 0, errors.join('\n         '));
});

test('DiskCleanUp launcher commands map to real scripts or dotnet', function() {
    var errors = [];
    launcherCmds.filter(function(c) { return c.id.includes('diskcleanup'); }).forEach(function(c) {
        if (c.cmd.startsWith('npm run ')) {
            var s = c.cmd.slice(8);
            if (!(s in diskcleanScripts)) { errors.push(c.id + ': "npm run ' + s + '" not in DiskCleanUp package.json'); }
        } else if (c.cmd === 'npm start' && !('start' in diskcleanScripts)) {
            errors.push(c.id + ': "npm start" -- no start script');
        } else if (c.cmd.startsWith('dotnet ') && !hasSln(diskcleanPath)) {
            errors.push(c.id + ': uses dotnet but no .sln found in ' + diskcleanPath);
        }
        // npx kill-port is always valid
    });
    assert(errors.length === 0, errors.join('\n         '));
});

test('All launcher command IDs are registered in the codebase', function() {
    var unregistered = launcherCmds.map(function(c) { return c.id; })
        .filter(function(id) { return !allRegistered.has(id); });
    assert(unregistered.length === 0,
        'Launcher commands not registered:\n         ' + unregistered.join('\n         '));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log((passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');

if (failed > 0) {
    console.error('CATALOG INTEGRITY FAILED -- fix before shipping');
    process.exit(1);
} else {
    console.log('CATALOG INTEGRITY PASSED -- all declarations match reality');
    process.exit(0);
}
