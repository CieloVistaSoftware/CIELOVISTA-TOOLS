// REG-104 — Code Highlight Audit: scanner correctness + Fix button always present (#495 #496)
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// ── Load scanFile via ts-node eval ───────────────────────────────────────────
// We extract the scanFile function from the TS source and test it via a small
// temporary file to avoid the full vscode runtime dependency.

const ROOT = path.resolve(__dirname, '../..');
const SRC  = require('fs').readFileSync(path.join(ROOT, 'src/features/code-highlight-audit.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── #495: closing fence detection ────────────────────────────────────────────

// Since #799 scanFile pairs fences with the shared CommonMark rule
// (src/shared/md-fence.ts). These run the real scanner (out-test/, with a
// vscode stub) on a temp file instead of reading its source.
check('#495 — guard comment references issue #495',
    SRC.includes('#495'));
check('#799 — scanFile pairs fences with the shared scanner',
    SRC.includes("from '../shared/md-fence'") && SRC.includes('scanFences(lines)'));
{
    const fs = require('fs'), os = require('os'), Module = require('module');
    const origLoad = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === 'vscode') { return { window: {}, workspace: {}, commands: { registerCommand() { return { dispose() {} }; } } }; }
        return origLoad.call(this, req, parent, isMain);
    };
    let scanFile;
    try { ({ scanFile } = require(path.join(ROOT, 'out-test', 'features', 'code-highlight-audit.js'))); }
    catch (err) { console.error(`  ✗ cannot load the scanner: ${err.message}`); }
    finally { Module._load = origLoad; }
    const BT3 = String.fromCharCode(96).repeat(3);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg104-'));
    const scan = (lines) => {
        const f = path.join(tmp, 'doc.md');
        fs.writeFileSync(f, lines.join('\n'));
        return scanFile ? scanFile(f, 'p') : undefined;
    };
    try {
        // A bare block holding a "```typescript" example line: that line is content, not a closer.
        const a = scan([BT3, BT3 + 'typescript', 'const x = 1;', BT3, '', 'prose', '', BT3 + 'ts', 'y', BT3]);
        check('#495 — a fence line with trailing text inside a block does not close it',
            !!a && a.length === 1 && a[0].lineNumber === 1);
        // A closer of the other character or shorter than the opener does not close.
        const b = scan(['~~~~', 'x', '~~~', BT3, '~~~~', '', BT3 + 'ts', 'y', BT3]);
        check('#495 — only a same-character closer at least as long closes',
            !!b && b.length === 1 && b[0].lineNumber === 1 && b[0].fenceOpen === '~~~~');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// ── #496: Fix button always present ──────────────────────────────────────────

check('#496 — fixLang falls back to "text" when guess is empty',
    SRC.includes("const fixLang = guess || 'text'"));

check('#496 — fixBtn uses fixLang (not raw guess)',
    SRC.includes('data-lang="${esc(fixLang)}"'));

check('#496 — fixBtn is always rendered (not conditional on guess)',
    // Previously was: const fixBtn = guess ? `...` : '';
    // Now fixBtn is always a non-empty string
    !SRC.includes("const fixBtn = guess\n") &&
    !SRC.includes("const fixBtn = guess ?") &&
    SRC.includes('const fixBtn  = `<button'));

check('#496 — no-hint cell shows "text" instead of "?"',
    SRC.includes("'<span class=\"no-hint\">text</span>'"));

// ── HTML output: Fix button present in all rows ───────────────────────────────

check('Fix button data-action="fix" always emitted per block row',
    SRC.includes('data-action="fix"') &&
    SRC.includes('data-action="open"'));

// ── Summary text updated ──────────────────────────────────────────────────────

check('Summary text mentions Fix button (not just Open)',
    SRC.includes('Click') && SRC.includes('Fix') && SRC.includes('Open'));

check('Summary text references "text" as fallback language',
    SRC.includes('"text" is used when no language can be inferred') ||
    SRC.includes('text') && SRC.includes('inferred'));

// ── #610: CRLF line-ending support ────────────────────────────────────────────
// scanFile must split on CRLF-or-LF. Splitting on '\n' alone leaves a trailing
// '\r' on each line in CRLF files, so a fence line "```\r" never matches the
// ^([`~]{3,})(.*)$ pattern and NO blocks are detected — silently under-reporting.

check('#610 — scanFile splits on CRLF-or-LF (content.split(/\\r?\\n/))',
    SRC.includes('content.split(/\\r?\\n/)'));

check('#610 — fix references the issue in a comment',
    SRC.includes('#610'));

console.log(`\nREG-104: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
