// REG-091 — runtime scripts must exist on disk (not excluded from VSIX)
//
// Verifies that scripts loaded at runtime by extension features are present
// in the source tree AND that .vscodeignore does not exclude scripts/**

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
let fail = 0;

function check(label, condition) {
    if (condition) { console.log(`  ✓ ${label}`); pass++; }
    else           { console.error(`  ✗ ${label}`); fail++; }
}

// ── 1. Runtime scripts exist on disk ────────────────────────────────────────

// js-error-audit.js lives in the DiskCleanUp project (root = findDiskCleanUpRoot()), not here
const RUNTIME_SCRIPTS = [
    'scripts/audit-test-coverage.js',
    'scripts/code-auditor.js',
];

for (const rel of RUNTIME_SCRIPTS) {
    const full = path.join(ROOT, rel);
    check(`${rel} exists on disk`, fs.existsSync(full));
}

// ── 2. .vscodeignore does NOT blanket-exclude scripts/** ─────────────────────

const ignoreFile = path.join(ROOT, '.vscodeignore');
check('.vscodeignore exists', fs.existsSync(ignoreFile));

if (fs.existsSync(ignoreFile)) {
    const lines = fs.readFileSync(ignoreFile, 'utf8').split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));

    const blanket = lines.some(l => l === 'scripts/**');
    check('.vscodeignore does not contain scripts/** (would break runtime scripts)', !blanket);
}

// ── 3. Features reference the expected paths ────────────────────────────────

const AUDITOR_SRC = path.join(ROOT, 'src', 'features', 'test-coverage-auditor.ts');
check('test-coverage-auditor.ts exists', fs.existsSync(AUDITOR_SRC));
if (fs.existsSync(AUDITOR_SRC)) {
    const src = fs.readFileSync(AUDITOR_SRC, 'utf8');
    check("test-coverage-auditor references scripts/audit-test-coverage.js",
        src.includes("'scripts', 'audit-test-coverage.js'"));
}

const CODE_AUDITOR_SRC = path.join(ROOT, 'src', 'features', 'code-auditor.ts');
check('code-auditor.ts exists', fs.existsSync(CODE_AUDITOR_SRC));
if (fs.existsSync(CODE_AUDITOR_SRC)) {
    const src = fs.readFileSync(CODE_AUDITOR_SRC, 'utf8');
    check("code-auditor references scripts/code-auditor.js",
        src.includes("'scripts', 'code-auditor.js'") || src.includes('"scripts", "code-auditor.js"'));
}

// Note: js-error-audit.js lives in the DiskCleanUp workspace root (findDiskCleanUpRoot),
// not in the extension scripts/ folder — no bundling check needed for that one.

// ── Result ───────────────────────────────────────────────────────────────────

console.log(`\nREG-091: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
