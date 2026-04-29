// Test the validator against a corrupted package.json (simulating #67)
'use strict';
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC      = path.resolve(__dirname, '..', '..', 'package.json');
const BACKUP   = SRC + '.bak.test';
const VALIDATOR = path.resolve(__dirname, '..', '..', 'scripts', 'validate-package-json.js');

let originalContent;
try {
    originalContent = fs.readFileSync(SRC, 'utf8');
    fs.copyFileSync(SRC, BACKUP);
} catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
}

function runValidator() {
    try {
        const out = execFileSync('node', [VALIDATOR], { encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, stdout: out, stderr: '' };
    } catch (err) {
        return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
    }
}

function restoreOriginal() {
    fs.writeFileSync(SRC, originalContent, 'utf8');
}

let passed = 0, failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log('PASS:', name);
        passed++;
    } catch (err) {
        console.error('FAIL:', name, '\n      ', err.message);
        failed++;
    } finally {
        restoreOriginal();
    }
}

// ── Test 1: Pristine file passes ──────────────────────────────────────────
test('pristine package.json validates OK (exit 0)', () => {
    const r = runValidator();
    if (r.code !== 0) throw new Error('expected exit 0, got ' + r.code + '\nstderr: ' + r.stderr);
});

// ── Test 2: Issue #67 corruption pattern fails ───────────────────────────
test('issue #67 corruption (nested brace) fails (exit 1)', () => {
    // Inject the exact pattern observed in the original corruption
    const corrupted = originalContent.replace(
        /"description":\s*"Open the error log viewer for CieloVista Tools\."\s*\n\s*\}/,
        match => match.replace(
            'CieloVista Tools."',
            'CieloVista Tools."\n            {\n              "command": "cvs.tools.regressionLog",\n              "title": "Tools: Regression Log"\n            },'
        )
    );
    if (corrupted === originalContent) throw new Error('could not inject corruption — anchor not found');
    fs.writeFileSync(SRC, corrupted, 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1 but validator passed');
    if (!/NOT valid JSON/.test(r.stderr) && !/NOT valid JSON/.test(r.stdout)) {
        throw new Error('expected "NOT valid JSON" in output\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    }
});

// ── Test 3: Truncated file fails ─────────────────────────────────────────
test('truncated package.json fails (exit 1)', () => {
    fs.writeFileSync(SRC, originalContent.slice(0, 200), 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1, got 0');
});

// ── Test 4: Empty array fails (sentinel) ─────────────────────────────────
test('contributes.commands = [] fails (sentinel for wholesale deletion)', () => {
    const obj = JSON.parse(originalContent);
    obj.contributes.commands = [];
    fs.writeFileSync(SRC, JSON.stringify(obj, null, 2), 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1, got 0');
    if (!/Suspiciously few/.test(r.stderr)) throw new Error('expected "Suspiciously few" in stderr');
});

// ── Test 5: Duplicate command id fails ───────────────────────────────────
test('duplicate command id fails (exit 1)', () => {
    const obj = JSON.parse(originalContent);
    const first = obj.contributes.commands[0];
    obj.contributes.commands.push({ ...first });
    fs.writeFileSync(SRC, JSON.stringify(obj, null, 2), 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1, got 0');
    if (!/Duplicate command ids/.test(r.stderr)) throw new Error('expected "Duplicate command ids" in stderr');
});

// ── Test 6: Missing title fails ──────────────────────────────────────────
test('missing title field fails (exit 1)', () => {
    const obj = JSON.parse(originalContent);
    delete obj.contributes.commands[0].title;
    fs.writeFileSync(SRC, JSON.stringify(obj, null, 2), 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1, got 0');
    if (!/missing required fields/.test(r.stderr)) throw new Error('expected "missing required fields" in stderr');
});

// ── Test 7: Bad ID prefix fails ──────────────────────────────────────────
test('command id violating cvs.* / workbench.* convention fails (exit 1)', () => {
    const obj = JSON.parse(originalContent);
    obj.contributes.commands[0].command = 'random.bad.id';
    fs.writeFileSync(SRC, JSON.stringify(obj, null, 2), 'utf8');
    const r = runValidator();
    if (r.code === 0) throw new Error('expected exit 1, got 0');
    if (!/violating convention/.test(r.stderr)) throw new Error('expected "violating convention" in stderr');
});

// ── Cleanup backup ───────────────────────────────────────────────────────
try { fs.unlinkSync(BACKUP); } catch { /* ok */ }

console.log('\n' + '─'.repeat(60));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
