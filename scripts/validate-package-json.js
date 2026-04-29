/**
 * scripts/validate-package-json.js
 *
 * Standalone validator for package.json that catches the kind of corruption
 * issue #67 documents: silently-broken JSON (open brace nested inside a
 * closed object, missing commas, malformed array entries) that slips
 * through rebuild because it happens *after* test:catalog runs.
 *
 * Detects:
 *   - JSON.parse failures (the obvious case from #67)
 *   - Missing or non-array contributes.commands
 *   - Command entries missing required fields (command, title, category)
 *   - Duplicate command IDs
 *   - Command IDs that violate the cvs.* / workbench.* prefix convention
 *   - Suspiciously low command count (< 50) — sentinel for accidental wholesale deletion
 *
 * Exit code:
 *   0 on success
 *   1 on validation failure (with detailed reason on stderr)
 *
 * Run:
 *   node scripts/validate-package-json.js
 *
 * Recommended wire-up (when package.json is no longer in flux):
 *   "validate:package-json": "node scripts/validate-package-json.js"
 *   "postrebuild":           "npm run validate:package-json"
 *
 * Either of those is enough to make corruption fail the next rebuild loudly
 * instead of leaving a silently-broken file on disk.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PKG_PATH      = path.resolve(__dirname, '..', 'package.json');
const MIN_COMMANDS  = 50;       // sentinel for accidental wholesale deletion
const ID_PATTERN    = /^(cvs\.|workbench\.)[\w.]+$/;

let problems = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); problems++; };
const ok   = (msg) => { console.log('OK:   ' + msg); };

// ── Stage 1: file exists ──────────────────────────────────────────────────
if (!fs.existsSync(PKG_PATH)) {
    fail('package.json not found at ' + PKG_PATH);
    process.exit(1);
}
ok('package.json exists');

// ── Stage 2: parses as JSON ───────────────────────────────────────────────
let raw, pkg;
try {
    raw = fs.readFileSync(PKG_PATH, 'utf8');
} catch (err) {
    fail('Could not read package.json: ' + err.message);
    process.exit(1);
}
try {
    pkg = JSON.parse(raw);
} catch (err) {
    fail('package.json is NOT valid JSON: ' + err.message);
    fail('This is the issue #67 failure mode — corruption introduced after test:catalog ran.');
    process.exit(1);
}
ok('package.json parses as valid JSON');

// ── Stage 3: top-level shape ──────────────────────────────────────────────
if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    fail('package.json is not an object');
    process.exit(1);
}
if (!pkg.contributes || typeof pkg.contributes !== 'object') {
    fail('pkg.contributes is missing or not an object');
} else {
    ok('pkg.contributes is an object');
}

// ── Stage 4: commands array shape ─────────────────────────────────────────
const commands = pkg.contributes && pkg.contributes.commands;
if (!Array.isArray(commands)) {
    fail('pkg.contributes.commands is missing or not an array');
    process.exit(1);
}
ok(`pkg.contributes.commands is an array (${commands.length} entries)`);

if (commands.length < MIN_COMMANDS) {
    fail(`Suspiciously few commands: ${commands.length} (expected at least ${MIN_COMMANDS})`);
}

// ── Stage 5: per-entry shape, ID convention, no duplicates ────────────────
const seenIds        = new Map(); // id → array of indices
const missingFields  = [];
const badIds         = [];

for (let i = 0; i < commands.length; i++) {
    const c = commands[i];
    if (!c || typeof c !== 'object') {
        fail(`commands[${i}] is not an object: ${JSON.stringify(c)}`);
        continue;
    }
    if (!c.command || typeof c.command !== 'string' || !c.command.trim()) {
        missingFields.push(`commands[${i}].command`);
    } else {
        const idxList = seenIds.get(c.command) || [];
        idxList.push(i);
        seenIds.set(c.command, idxList);
        if (!ID_PATTERN.test(c.command)) {
            badIds.push(c.command);
        }
    }
    if (!c.title || typeof c.title !== 'string' || !c.title.trim()) {
        missingFields.push(`commands[${i}].title (id=${c.command || '?'})`);
    }
    if (!c.category || typeof c.category !== 'string' || !c.category.trim()) {
        missingFields.push(`commands[${i}].category (id=${c.command || '?'})`);
    }
}

if (missingFields.length === 0) {
    ok('every command entry has command, title, and category');
} else {
    fail('Command entries missing required fields:');
    for (const m of missingFields) { console.error('       - ' + m); }
}

if (badIds.length === 0) {
    ok('every command id matches cvs.* or workbench.* convention');
} else {
    fail('Command ids violating convention:');
    for (const id of badIds) { console.error('       - ' + id); }
}

const dupIds = Array.from(seenIds.entries()).filter(([, idxs]) => idxs.length > 1);
if (dupIds.length === 0) {
    ok('no duplicate command ids');
} else {
    fail('Duplicate command ids found:');
    for (const [id, idxs] of dupIds) {
        console.error(`       - "${id}" appears at indices ${idxs.join(', ')}`);
    }
}

// ── Stage 6: byte-level sanity (catches sneaky cases JSON.parse may miss) ─
// The issue #67 corruption pattern is "object opened where string expected".
// JSON.parse already catches that, but we also flag CRLF/LF inconsistency
// because the auto-injection bug confuses line-ending detection.
const hasCrlf = raw.includes('\r\n');
const hasLfOnly = /[^\r]\n/.test(raw);
if (hasCrlf && hasLfOnly) {
    // Mixed endings — not strictly a bug, but worth noting
    console.warn('WARN: package.json has mixed line endings (some CRLF, some LF). Auto-injection scripts may produce inconsistent edits.');
}

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
if (problems === 0) {
    console.log(`PACKAGE.JSON VALIDATION PASSED — ${commands.length} commands, all well-formed`);
    process.exit(0);
} else {
    console.error(`PACKAGE.JSON VALIDATION FAILED — ${problems} problem${problems > 1 ? 's' : ''} detected`);
    process.exit(1);
}
