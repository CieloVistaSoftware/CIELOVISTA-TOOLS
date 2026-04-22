/**
 * command-validation.test.js
 *
 * Tests EVERY command in catalog.ts. For every check, prints PASS or FAIL
 * with full detail — what was checked, what was found, why it passed or failed.
 *
 * After all checks:
 *   1. Writes data/command-errors.json  (all failures, wb-core error format)
 *   2. Auto-fixes what can be fixed
 *   3. Appends each fix to data/fixes.json (wb-core fix format)
 *
 * Run:  node tests/command-validation.test.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const SRC           = path.join(ROOT, 'src');
const DATA          = path.join(ROOT, 'data');
const CATALOG_FILE  = path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts');
const LAUNCHER_FILE = path.join(SRC, 'features', 'project-launcher.ts');
const EXT_FILE      = path.join(SRC, 'extension.ts');
const PKG_FILE      = path.join(ROOT, 'package.json');
const ERRORS_FILE   = path.join(DATA, 'command-errors.json');
const FIXES_FILE    = path.join(DATA, 'fixes.json');

const TODAY   = new Date().toISOString().slice(0, 10);
const SESSION = `command-validation.test.js — ${TODAY}`;

// ── Load sources ──────────────────────────────────────────────────────────────
const catalogSrc  = fs.readFileSync(CATALOG_FILE,  'utf8');
const launcherSrc = fs.readFileSync(LAUNCHER_FILE, 'utf8');
const extSrc      = fs.readFileSync(EXT_FILE,      'utf8');
const pkg         = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));

// ── Parse catalog into per-entry objects ──────────────────────────────────────
// Pull each { id, title, description, dewey, scope, action?, nextAction? } from source
const ENTRIES = [];
const ENTRY_RE = /\{[^{}]*?\bid:\s*'([^']+)'[^{}]*?\}/gs;
let em;
while ((em = ENTRY_RE.exec(catalogSrc)) !== null) {
    const block = em[0];
    const get   = (key) => { const m = block.match(new RegExp(`\\b${key}:\\s*'([^']+)'`)); return m ? m[1] : null; };
    const getTags = () => {
        const m = block.match(/\btags:\s*\[([^\]]*)\]/);
        if (!m) return [];
        return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    };
    ENTRIES.push({
        id:          get('id'),
        title:       get('title'),
        description: get('description'),
        dewey:       get('dewey'),
        scope:       get('scope'),
        action:      get('action'),
        nextAction:  get('nextAction'),
        group:       get('group'),
        tags:        getTags(),
    });
}

// ── Parse project-launcher registerFixed calls ────────────────────────────────
const launcherCmds = [...launcherSrc.matchAll(
    /registerFixed\([^,]+,\s*'([^']+)',\s*'[^']+',\s*'([^']+)',\s*(\w+)\)/g
)].map(m => ({ id: m[1], cmd: m[2], pathVar: m[3] }));

const snapitPath    = (launcherSrc.match(/const SNAPIT\s*=\s*'([^']+)'/)    || [])[1] || '';
const diskcleanPath = (launcherSrc.match(/const DISKCLEAN\s*=\s*'([^']+)'/) || [])[1] || '';

function getScripts(p) {
    const pp = path.join(p, 'package.json');
    if (!fs.existsSync(pp)) return {};
    try { return JSON.parse(fs.readFileSync(pp, 'utf8')).scripts || {}; } catch { return {}; }
}
function hasSln(p) {
    if (!fs.existsSync(p)) return false;
    return fs.readdirSync(p).some(f => /\.(sln|slnx)$/i.test(f));
}
const snapitScripts    = getScripts(snapitPath);
const diskcleanScripts = getScripts(diskcleanPath);

// ── Build registered commands set ─────────────────────────────────────────────
function getAllRegistered() {
    const cmds = new Set();
    const extract = src => {
        for (const m of src.matchAll(/registerCommand\(['"]([^'"]+)['"]/g)) cmds.add(m[1]);
        for (const m of src.matchAll(/const\s+\w+\s*=\s*'(cvs\.[^']+)'/g)) cmds.add(m[1]);
    };
    extract(extSrc);
    const walk = dir => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith('.ts')) extract(fs.readFileSync(full, 'utf8'));
        }
    };
    walk(path.join(SRC, 'features'));
    for (const c of launcherCmds) cmds.add(c.id);
    return cmds;
}
const allRegistered = getAllRegistered();
const pkgCmds = (pkg.contributes?.commands || []).map(c => c.command);

// ── Logging helpers ───────────────────────────────────────────────────────────
const ERRORS = [];
let passed = 0; let failed = 0; let errorSeq = 1;

function pass(checkName, detail) {
    passed++;
    console.log(`  ✅ PASS  ${checkName}`);
    if (detail) console.log(`         ${detail}`);
}

function fail(checkName, detail, errorOpts) {
    failed++;
    const id = `CMD-ERR-${String(errorSeq++).padStart(3, '0')}`;
    const sev = errorOpts.severity || 'high';
    const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : '🟡';
    console.error(`  ${icon} FAIL  ${checkName}`);
    console.error(`         ${detail}`);
    ERRORS.push({
        id,
        title:        checkName,
        category:     errorOpts.category || 'catalog-integrity',
        severity:     sev,
        detectedDate: TODAY,
        file:         errorOpts.file || 'catalog.ts',
        description:  detail,
        autoFixable:  errorOpts.autoFixable || false,
        fixHint:      errorOpts.fixHint || null,
        commandId:    errorOpts.commandId || null,
    });
    return id;
}

function section(title) {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${title}`);
    console.log('─'.repeat(64));
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Catalog structure (per-entry)
// ══════════════════════════════════════════════════════════════════════════════
section(`SUITE 1 — Catalog structure  (${ENTRIES.length} entries)`);

// 1a: Required fields
console.log('\n  [1a] Required fields on every entry');
const REQUIRED = ['id', 'title', 'description', 'dewey', 'scope', 'group'];
for (const e of ENTRIES) {
    const missing = REQUIRED.filter(f => !e[f]);
    if (missing.length) {
        fail(`Missing fields on ${e.id}`, `Fields missing: ${missing.join(', ')}`, {
            category: 'catalog-integrity', severity: 'critical', commandId: e.id,
            fixHint: `Add the missing field(s) to the entry for '${e.id}' in catalog.ts.`,
        });
    } else {
        pass(`${e.id} — required fields`, `id, title, description, dewey, scope, group all present`);
    }
}

// 1b: Duplicate IDs
console.log('\n  [1b] Duplicate command IDs');
const seenIds = new Map();
for (const e of ENTRIES) {
    if (seenIds.has(e.id)) {
        fail(`Duplicate ID: ${e.id}`, `'${e.id}' appears more than once — only first registration is active`, {
            category: 'catalog-integrity', severity: 'critical', commandId: e.id,
            fixHint: 'Remove or rename the duplicate entry in catalog.ts.',
        });
    } else {
        pass(`${e.id} — unique ID`, `No duplicate found`);
        seenIds.set(e.id, true);
    }
}

// 1c: Duplicate Dewey numbers
console.log('\n  [1c] Duplicate Dewey numbers');
const seenDewey = new Map();
for (const e of ENTRIES) {
    if (!e.dewey) continue;
    if (seenDewey.has(e.dewey)) {
        fail(`Duplicate Dewey ${e.dewey} on ${e.id}`,
            `Dewey '${e.dewey}' already used by '${seenDewey.get(e.dewey)}' — each command needs a unique number`, {
            category: 'catalog-integrity', severity: 'high', commandId: e.id,
            autoFixable: false,
            fixHint: `Assign a new unique Dewey number to '${e.id}' in catalog.ts.`,
        });
    } else {
        pass(`${e.id} — Dewey ${e.dewey}`, `Unique`);
        seenDewey.set(e.dewey, e.id);
    }
}

// 1d: Valid scope values
console.log('\n  [1d] Valid scope values');
const VALID_SCOPES = new Set(['global', 'workspace', 'diskcleanup', 'tools']);
for (const e of ENTRIES) {
    if (!e.scope) continue;
    if (!VALID_SCOPES.has(e.scope)) {
        fail(`Invalid scope on ${e.id}`, `scope='${e.scope}' — must be one of: global, workspace, diskcleanup, tools`, {
            category: 'catalog-integrity', severity: 'high', commandId: e.id,
            fixHint: `Change scope to one of the valid values in catalog.ts entry for '${e.id}'.`,
        });
    } else {
        pass(`${e.id} — scope '${e.scope}'`, `Valid`);
    }
}

// 1e: Valid action values
console.log('\n  [1e] Valid action values (only if present)');
const VALID_ACTIONS = new Set(['read', 'run']);
for (const e of ENTRIES) {
    if (!e.action) {
        pass(`${e.id} — action`, `No action field (defaults to Run — OK)`);
    } else if (!VALID_ACTIONS.has(e.action)) {
        fail(`Invalid action on ${e.id}`, `action='${e.action}' — must be 'read' or 'run'`, {
            category: 'catalog-integrity', severity: 'high', commandId: e.id,
            fixHint: `Set action to 'read' or 'run' in catalog.ts for '${e.id}'.`,
        });
    } else {
        pass(`${e.id} — action '${e.action}'`, `Valid`);
    }
}

// 1f: nextAction points to a real ID (if present)
console.log('\n  [1f] nextAction references valid ID (if present)');
const allIds = new Set(ENTRIES.map(e => e.id));
for (const e of ENTRIES) {
    if (!e.nextAction) {
        pass(`${e.id} — nextAction`, `Not set (OK)`);
    } else if (!allIds.has(e.nextAction)) {
        fail(`Bad nextAction on ${e.id}`, `nextAction='${e.nextAction}' does not match any catalog ID`, {
            category: 'catalog-integrity', severity: 'high', commandId: e.id,
            fixHint: `Fix the nextAction value in catalog.ts for '${e.id}' to point to a real command ID.`,
        });
    } else {
        pass(`${e.id} — nextAction '${e.nextAction}'`, `Points to a valid command`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — Registration (per-entry)
// ══════════════════════════════════════════════════════════════════════════════
section(`SUITE 2 — Command registration  (${ENTRIES.length} entries)`);

const EXEMPT = new Set([
    'cvs.commands.showAll', 'cvs.commands.quickRun', 'cvs.npm.addScriptDescription',
    'cvs.project.openHome', 'cvs.htmlTemplates.download', 'cvs.htmlTemplates.openClipboardPath',
    'cvs.headers.fixAll', 'cvs.headers.fixOne', 'cvs.headers.fixFile', 'cvs.headers.viewStandard',
    'cvs.config.edit',
    'cvs.audit.jsErrors',   // JS Error Audit — surfaced via Fix Bugs panel, not the launcher catalog
]);

console.log('\n  [2a] Every catalog ID has a registerCommand in the codebase');
for (const e of ENTRIES) {
    if (!allRegistered.has(e.id)) {
        fail(`Unregistered: ${e.id}`,
            `"${e.title}" is in catalog.ts but no registerCommand('${e.id}') found anywhere — clicking will silently fail`, {
            category: 'registration', severity: 'critical', commandId: e.id,
            fixHint: `Add registerCommand('${e.id}', handler) in the appropriate feature file.`,
        });
    } else {
        pass(`${e.id} — registered`, `registerCommand found in codebase`);
    }
}

console.log('\n  [2b] Every package.json command in catalog or exempt list');
for (const id of pkgCmds) {
    if (EXEMPT.has(id)) {
        pass(`${id} — package.json`, `Exempt (intentionally omitted from launcher catalog)`);
    } else if (allIds.has(id)) {
        pass(`${id} — package.json`, `Present in catalog.ts`);
    } else {
        fail(`${id} — in package.json but not in catalog`,
            `'${id}' is contributed in package.json (visible in command palette) but absent from catalog.ts — users cannot find it via the launcher`, {
            category: 'registration', severity: 'high',
            fixHint: `Add an entry for '${id}' to CATALOG in catalog.ts, or add it to the EXEMPT set in this test if intentionally omitted.`,
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — Project launcher command accuracy
// ══════════════════════════════════════════════════════════════════════════════
section(`SUITE 3 — Project launcher accuracy  (${launcherCmds.length} fixed commands)`);

console.log('\n  [3a] No cmd.exe "cd /d" syntax in project-launcher.ts');
const cdHits = [...launcherSrc.matchAll(/cd\s*\/d/g)];
if (cdHits.length) {
    fail('project-launcher.ts uses "cd /d" (cmd.exe only)',
        `Found ${cdHits.length} occurrence(s) of "cd /d" — VS Code terminals use PowerShell which does not support this flag, causing a red error every time a terminal is reused`, {
        category: 'runtime-error', severity: 'critical', file: 'project-launcher.ts',
        autoFixable: true,
        fixHint: 'Replace `cd /d "${cwd}"` with `cd "${cwd}"` in runInTerminal().',
    });
} else {
    pass('project-launcher.ts — no "cd /d"', 'PowerShell-safe cd syntax confirmed');
}

console.log('\n  [3b] Project paths exist on disk');
if (!snapitPath) {
    fail('SNAPIT constant missing from project-launcher.ts', 'Could not parse the SNAPIT path constant', {
        category: 'configuration', severity: 'critical', file: 'project-launcher.ts',
    });
} else if (!fs.existsSync(snapitPath)) {
    fail(`SnapIt path not found on disk: ${snapitPath}`, `The hardcoded SNAPIT path does not exist — all SnapIt launcher commands will fail`, {
        category: 'configuration', severity: 'critical', file: 'project-launcher.ts',
        fixHint: `Update the SNAPIT constant in project-launcher.ts to the correct path.`,
    });
} else {
    pass(`SNAPIT path exists`, snapitPath);
}

if (!diskcleanPath) {
    fail('DISKCLEAN constant missing from project-launcher.ts', 'Could not parse the DISKCLEAN path constant', {
        category: 'configuration', severity: 'critical', file: 'project-launcher.ts',
    });
} else if (!fs.existsSync(diskcleanPath)) {
    fail(`DiskCleanUp path not found on disk: ${diskcleanPath}`, `The hardcoded DISKCLEAN path does not exist — all DiskCleanUp launcher commands will fail`, {
        category: 'configuration', severity: 'critical', file: 'project-launcher.ts',
        fixHint: `Update the DISKCLEAN constant in project-launcher.ts to the correct path.`,
    });
} else {
    pass(`DISKCLEAN path exists`, diskcleanPath);
}

console.log('\n  [3c] Each registerFixed command maps to a real script or dotnet target');
for (const { id, cmd } of launcherCmds) {
    const isSnapit     = id.includes('snapit');
    const isDiskclean  = id.includes('diskcleanup');
    const scripts      = isSnapit ? snapitScripts : isDiskclean ? diskcleanScripts : {};
    const projPath     = isSnapit ? snapitPath    : isDiskclean ? diskcleanPath    : '';
    const projName     = isSnapit ? 'SnapIt'      : isDiskclean ? 'DiskCleanUp'   : '?';

    if (cmd.startsWith('npm run ')) {
        const scriptName = cmd.slice(8).trim();
        if (!(scriptName in scripts)) {
            fail(`${id} — "npm run ${scriptName}" not in ${projName} package.json`,
                `The script '${scriptName}' does not exist in ${projPath}/package.json. Available: ${Object.keys(scripts).join(', ')}`, {
                category: 'runtime-error', severity: 'critical', file: 'project-launcher.ts',
                commandId: id, autoFixable: false,
                fixHint: `Change the command for '${id}' in project-launcher.ts to a script that exists in ${projName}'s package.json.`,
            });
        } else {
            pass(`${id} — "npm run ${scriptName}"`, `Script '${scriptName}' confirmed in ${projName} package.json`);
        }
    } else if (cmd === 'npm start') {
        if (!('start' in scripts)) {
            fail(`${id} — "npm start" not in ${projName} package.json`,
                `No 'start' script in ${projPath}/package.json`, {
                category: 'runtime-error', severity: 'critical', file: 'project-launcher.ts',
                commandId: id,
            });
        } else {
            pass(`${id} — "npm start"`, `'start' script confirmed in ${projName} package.json`);
        }
    } else if (cmd.startsWith('dotnet ')) {
        if (!hasSln(projPath)) {
            fail(`${id} — uses dotnet but no .sln found in ${projPath}`,
                `The command runs dotnet but no solution file exists at the project path`, {
                category: 'configuration', severity: 'critical', file: 'project-launcher.ts', commandId: id,
            });
        } else {
            pass(`${id} — "${cmd}"`, `.sln file confirmed in ${projName} project folder`);
        }
    } else if (cmd.startsWith('npx kill-port')) {
        pass(`${id} — "${cmd}"`, `npx kill-port is always valid`);
    } else {
        pass(`${id} — "${cmd}"`, `Non-npm/dotnet command — assumed valid`);
    }
}

console.log('\n  [3d] All launcher IDs registered in codebase');
for (const { id } of launcherCmds) {
    if (!allRegistered.has(id)) {
        fail(`Launcher ID not registered: ${id}`,
            `registerFixed uses '${id}' but no registerCommand found — the command will be inaccessible`, {
            category: 'registration', severity: 'critical', file: 'project-launcher.ts', commandId: id,
        });
    } else {
        pass(`${id} — registered`, `Found in codebase`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — Content quality (per-entry spot checks)
// ══════════════════════════════════════════════════════════════════════════════
section(`SUITE 4 — Content quality  (${ENTRIES.length} entries)`);

console.log('\n  [4a] Description length (must be 10–200 chars)');
for (const e of ENTRIES) {
    const len = (e.description || '').length;
    if (len < 10) {
        fail(`${e.id} — description too short`, `"${e.description}" (${len} chars) — descriptions should be at least 10 characters`, {
            category: 'content-quality', severity: 'low', commandId: e.id,
        });
    } else if (len > 200) {
        fail(`${e.id} — description too long`, `${len} chars — keep descriptions under 200 characters for clean UI display`, {
            category: 'content-quality', severity: 'low', commandId: e.id,
        });
    } else {
        pass(`${e.id} — description length`, `${len} chars — OK`);
    }
}

console.log('\n  [4b] Tags array not empty');
for (const e of ENTRIES) {
    if (!e.tags || e.tags.length === 0) {
        fail(`${e.id} — no tags`, `Entry has no tags — command won't appear in topic filter`, {
            category: 'content-quality', severity: 'low', commandId: e.id,
            fixHint: `Add at least one descriptive tag to '${e.id}' in catalog.ts.`,
        });
    } else {
        pass(`${e.id} — tags`, `${e.tags.length} tag(s): ${e.tags.slice(0, 3).join(', ')}${e.tags.length > 3 ? '…' : ''}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  RESULTS SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
const total = passed + failed;
console.log('\n' + '═'.repeat(64));
console.log(`  RESULTS: ${total} checks — ${passed} passed, ${failed} failed`);
if (ERRORS.length) {
    const crit = ERRORS.filter(e => e.severity === 'critical').length;
    const high = ERRORS.filter(e => e.severity === 'high').length;
    const low  = ERRORS.filter(e => e.severity === 'low').length;
    console.log(`  ERRORS:  ${crit} critical  ${high} high  ${low} low`);
    const autoFixable = ERRORS.filter(e => e.autoFixable);
    console.log(`  AUTO-FIXABLE: ${autoFixable.length} of ${ERRORS.length}`);
}
console.log('═'.repeat(64) + '\n');

// ══════════════════════════════════════════════════════════════════════════════
//  WRITE ERROR LOG
// ══════════════════════════════════════════════════════════════════════════════
if (!fs.existsSync(DATA)) { fs.mkdirSync(DATA, { recursive: true }); }

if (ERRORS.length) {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(ERRORS, null, 2));
    console.log(`📋 Error log written → data/command-errors.json  (${ERRORS.length} errors)`);
} else {
    // Clear any stale error file
    if (fs.existsSync(ERRORS_FILE)) { fs.unlinkSync(ERRORS_FILE); }
    console.log('✅ No errors — data/command-errors.json cleared');
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTO-FIX PHASE
// ══════════════════════════════════════════════════════════════════════════════
const autoFixable = ERRORS.filter(e => e.autoFixable);
if (!autoFixable.length) {
    console.log('\n🔧 No auto-fixable issues found.\n');
    process.exit(failed > 0 ? 1 : 0);
}

console.log(`\n🔧 Auto-fixing ${autoFixable.length} issue(s)...\n`);

const FIXES_ADDED = [];
let   fixSeq      = 1;

// Load existing fixes to get next ID
let existingFixes = [];
if (fs.existsSync(FIXES_FILE)) {
    try { existingFixes = JSON.parse(fs.readFileSync(FIXES_FILE, 'utf8')); } catch { existingFixes = []; }
    const maxNum = existingFixes.reduce((max, f) => {
        const n = parseInt((f.id || '').replace('FIX-', ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    fixSeq = maxNum + 1;
}

function applyFix(errId, fixTitle, fixDescription, filesChanged, applyFn) {
    try {
        applyFn();
        const fixId = `FIX-${String(fixSeq++).padStart(3, '0')}`;
        const fix = {
            id:           fixId,
            title:        fixTitle,
            category:     'auto-fix',
            severity:     'resolved',
            completedDate: TODAY,
            session:      SESSION,
            description:  fixDescription,
            resolvedErrorId: errId,
            filesChanged,
        };
        FIXES_ADDED.push(fix);
        console.log(`  ✅ FIXED [${fixId}] ${fixTitle}`);
        return true;
    } catch (e) {
        console.error(`  ❌ FIX FAILED: ${fixTitle}`);
        console.error(`     ${e.message}`);
        return false;
    }
}

// ── Fix: cd /d in project-launcher.ts ────────────────────────────────────────
const cdErr = autoFixable.find(e => e.title.includes('cd /d'));
if (cdErr) {
    let src = fs.readFileSync(LAUNCHER_FILE, 'utf8');
    const original = src;
    src = src.replace(/cd\s*\/d\s*"\$\{cwd\}"/g, 'cd "${cwd}"');
    if (src !== original) {
        applyFix(
            cdErr.id,
            'Fix: remove cmd.exe "cd /d" from project-launcher.ts',
            'Replaced `cd /d "${cwd}"` with `cd "${cwd}"` in runInTerminal(). The /d flag is cmd.exe-only syntax — PowerShell does not support it and throws a visible red error every time a reused terminal changes directory.',
            ['src/features/project-launcher.ts — replaced cd /d with plain cd'],
            () => fs.writeFileSync(LAUNCHER_FILE, src)
        );
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  WRITE FIXES TO fixes.json
// ══════════════════════════════════════════════════════════════════════════════
if (FIXES_ADDED.length) {
    const allFixes = [...existingFixes, ...FIXES_ADDED];
    fs.writeFileSync(FIXES_FILE, JSON.stringify(allFixes, null, 2));
    console.log(`\n📋 ${FIXES_ADDED.length} fix(es) appended → data/fixes.json`);
    for (const f of FIXES_ADDED) {
        console.log(`   [${f.id}] ${f.title}`);
    }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
