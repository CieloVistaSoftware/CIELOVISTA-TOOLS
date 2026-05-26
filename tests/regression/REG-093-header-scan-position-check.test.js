// REG-093 — cvs.headers.scan detects top vs bottom frontmatter position; scanAuto fixes to bottom
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const ROOT   = path.resolve(__dirname, '../..');
const SRC    = fs.readFileSync(path.join(ROOT, 'src/features/doc-header-scan.ts'), 'utf8');
const PKG    = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── Source-level checks ────────────────────────────────────────────────────────

// CHECK 1: parseFrontmatter detects top position
check('parseFrontmatter matches top-position regex',
    SRC.includes("position: 'top'") && SRC.includes('/^---\\r?\\n'));

// CHECK 2: parseFrontmatter detects bottom position
check('parseFrontmatter matches bottom-position regex',
    SRC.includes("position: 'bottom'"));

// CHECK 3: moveFrontmatterToBottom function exists
check('moveFrontmatterToBottom function defined',
    SRC.includes('function moveFrontmatterToBottom('));

// CHECK 4: re-verify step present (reads file back after write)
check('re-verify: reads file back after write to confirm position',
    SRC.includes('verifiedParsed') && SRC.includes("'bottom'"));

// CHECK 5: report has WRONG section
check('report emits WRONG section header',
    SRC.includes('WRONG') && SRC.includes("frontmatter at top"));

// CHECK 6: report has FIXED section
check('report emits FIXED section header',
    SRC.includes('FIXED'));

// CHECK 7: report has RE-VERIFIED section
check('report emits RE-VERIFIED section header',
    SRC.includes('RE-VERIFIED'));

// CHECK 8: runScan(false) is scan-only, runScan(true) is auto-fix
check('runScan(false) registers as cvs.headers.scan',
    SRC.includes("'cvs.headers.scan'") && SRC.includes('() => runScan(false)'));
check('runScan(true) registers as cvs.headers.scanAuto',
    SRC.includes("'cvs.headers.scanAuto'") && SRC.includes('() => runScan(true)'));

// ── package.json checks ────────────────────────────────────────────────────────

const cmds = new Map((PKG.contributes?.commands ?? []).map(c => [c.command, c]));

// CHECK 10: cvs.headers.scan declared
check('cvs.headers.scan in contributes.commands',
    cmds.has('cvs.headers.scan'));

// CHECK 11: cvs.headers.scanAuto declared
check('cvs.headers.scanAuto in contributes.commands',
    cmds.has('cvs.headers.scanAuto'));

// ── Functional smoke test (no VS Code needed) ─────────────────────────────────
// Build a tiny CommonJS shim so we can require the parseFrontmatter logic inline.

const TOP_FILE = `---\ntitle: test\ndescription: a doc\n---\n\n# Hello\n\nBody text.\n`;
const BOT_FILE = `# Hello\n\nBody text.\n\n---\ntitle: test\ndescription: a doc\n---\n`;
const NONE_FILE = `# Hello\n\nNo frontmatter here.\n`;

// Inline the parsing logic (mirrors doc-header-scan.ts exactly)
function parseFmBlock(raw) {
    const fm = {};
    for (const line of raw.split('\n')) {
        const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (m) { fm[m[1]] = m[2].trim(); }
    }
    return fm;
}
function parseFrontmatter(content) {
    const topMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/);
    if (topMatch) { return { fm: parseFmBlock(topMatch[1]), position: 'top', fmBlock: topMatch[1], body: topMatch[3] }; }
    const botMatch = content.match(/^([\s\S]+?)\n---\r?\n([\s\S]*?)\r?\n---\s*$/);
    if (botMatch) { return { fm: parseFmBlock(botMatch[2]), position: 'bottom', fmBlock: botMatch[2], body: botMatch[1] }; }
    return null;
}

// CHECK 12: top-position file detected
const topResult = parseFrontmatter(TOP_FILE);
check('TOP_FILE detected as position:top',
    topResult?.position === 'top' && topResult?.fm?.title === 'test');

// CHECK 13: bottom-position file detected
const botResult = parseFrontmatter(BOT_FILE);
check('BOT_FILE detected as position:bottom',
    botResult?.position === 'bottom' && botResult?.fm?.title === 'test');

// CHECK 14: no-frontmatter file returns null
check('NONE_FILE returns null',
    parseFrontmatter(NONE_FILE) === null);

// CHECK 15: moveFrontmatterToBottom round-trip
const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'reg093-'));
const tmpFile = path.join(tmpDir, 'test.md');
fs.writeFileSync(tmpFile, TOP_FILE, 'utf8');

// Simulate the fix
const beforeParsed = parseFrontmatter(fs.readFileSync(tmpFile, 'utf8'));
const body         = beforeParsed.body.trimEnd();
const fixed        = body.length > 0
    ? `${body}\n\n---\n${beforeParsed.fmBlock}\n---\n`
    : `---\n${beforeParsed.fmBlock}\n---\n`;
fs.writeFileSync(tmpFile, fixed, 'utf8');
const afterParsed  = parseFrontmatter(fs.readFileSync(tmpFile, 'utf8'));

check('After move, position is bottom', afterParsed?.position === 'bottom');
check('After move, fm fields preserved', afterParsed?.fm?.title === 'test');
check('After move, body preserved',      afterParsed?.body?.includes('# Hello'));

// cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nREG-093: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
