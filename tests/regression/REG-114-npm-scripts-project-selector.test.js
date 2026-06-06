// REG-114: NPM Scripts project selector loads scripts from the SELECTED project's folder.
//
// This test requires the REAL compiled module (out/shared/npm-scripts-reader.js) —
// the exact code that ships and runs when a project is picked. It is NOT a copy.
// If the production logic breaks, this test breaks.
//
// Behavior proven:
//   - Selecting project A returns A's scripts, never B's
//   - Selecting project B returns B's scripts, never A's
//   - The returned absDir is the selected project's folder (this IS the terminal cwd)
//   - Script commands are preserved verbatim for terminal execution
//   - Empty / missing projects are handled without crashing
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Require the ACTUAL compiled production function — never a copy.
// If the compiled output is missing or stale (source newer), recompile just this
// one module so the test always validates the CURRENT source, in any run mode.
const ROOT     = path.join(__dirname, '../..');
const srcFile  = path.join(ROOT, 'src/shared/npm-scripts-reader.ts');
const compiled = path.join(ROOT, 'out/shared/npm-scripts-reader.js');

function isStale() {
    if (!fs.existsSync(compiled)) { return true; }
    try { return fs.statSync(srcFile).mtimeMs > fs.statSync(compiled).mtimeMs; }
    catch { return true; }
}

if (isStale()) {
    const { spawnSync } = require('child_process');
    const res = spawnSync(process.execPath, [
        require.resolve('esbuild/bin/esbuild'),
        srcFile, '--bundle', '--platform=node', '--format=cjs',
        `--outfile=${compiled}`,
    ], { cwd: ROOT, stdio: 'pipe' });
    if (res.status !== 0 || !fs.existsSync(compiled)) {
        console.error(`  FAIL could not compile npm-scripts-reader: ${res.stderr || res.error}`);
        process.exit(1);
    }
}
const { readPkgScripts } = require(compiled);

let passed = 0; let failed = 0;
function check(desc, ok) {
    if (ok) { console.log(`  PASS ${desc}`); passed++; }
    else     { console.error(`  FAIL ${desc}`); failed++; }
}

function makeTempProject(name, scripts) {
    const dir = path.join(os.tmpdir(), `cvt-reg114-${name}-${process.pid}-${Math.floor(process.hrtime()[1])}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, scripts }, null, 2));
    return dir;
}

// 0. The compiled module actually exports the function
check('compiled module exports readPkgScripts', typeof readPkgScripts === 'function');

let projectA, projectB;
try {
    projectA = makeTempProject('project-alpha', {
        'start':   'node server.js',
        'rebuild': 'npm run compile && node install.js',
        'test':    'jest',
    });
    projectB = makeTempProject('project-beta', {
        'serve':  'dotnet run',
        'deploy': 'dotnet publish',
    });

    // Simulate selecting project A in the picker → switchProject → readPkgScripts(A)
    const a = readPkgScripts(projectA, projectA);
    // Simulate selecting project B in the picker → switchProject → readPkgScripts(B)
    const b = readPkgScripts(projectB, projectB);

    check('selecting project A returns A scripts',
        !!a && a.scripts.some(s => s.name === 'start') && a.scripts.some(s => s.name === 'rebuild'));

    check('project A result excludes B scripts',
        !!a && !a.scripts.some(s => s.name === 'serve') && !a.scripts.some(s => s.name === 'deploy'));

    check('selecting project B returns B scripts',
        !!b && b.scripts.some(s => s.name === 'serve') && b.scripts.some(s => s.name === 'deploy'));

    check('project B result excludes A scripts',
        !!b && !b.scripts.some(s => s.name === 'start') && !b.scripts.some(s => s.name === 'rebuild'));

    check('A.absDir is the selected project folder — terminal cwd will be project A',
        !!a && a.absDir === projectA);

    check('B.absDir is the selected project folder — terminal cwd will be project B',
        !!b && b.absDir === projectB);

    check('A and B yield different scripts — no stale/cached result on switch',
        !!a && !!b && a.scripts.map(s => s.name).join() !== b.scripts.map(s => s.name).join());

    check('rebuild command preserved verbatim for terminal execution',
        !!a && a.scripts.find(s => s.name === 'rebuild')?.cmd === 'npm run compile && node install.js');

    // Edge: project with no scripts → null (not shown in picker)
    const empty = makeTempProject('project-empty', {});
    check('project with no scripts returns null', readPkgScripts(empty, empty) === null);
    fs.rmSync(empty, { recursive: true, force: true });

    // Edge: non-existent path → null (no crash)
    check('non-existent project path returns null',
        readPkgScripts(path.join(os.tmpdir(), 'cvt-reg114-nope-000'), '') === null);

    // Wiring: switchProject routes msg.projectPath → sendInit → collectEntries(root)
    const tsSrc = fs.readFileSync(path.join(__dirname, '../../src/features/npm-scripts-tree.ts'), 'utf8');
    check('switchProject handler routes msg.projectPath through sendInit to collectEntries',
        /case 'switchProject'[\s\S]{0,200}sendInit\(_panel, msg\.projectPath/.test(tsSrc) &&
        /async function sendInit[\s\S]{0,200}collectEntries\(root\)/.test(tsSrc));

    // Wiring: run → runScript → acquireTerminal opens a terminal with cwd = project dir
    check('run handler opens terminal with cwd set to the project dir',
        /case 'run'[\s\S]{0,120}runScript\(_panel, msg\.dir/.test(tsSrc) &&
        /function acquireTerminal[\s\S]{0,400}cwd:\s*dir/.test(tsSrc));

} finally {
    if (projectA) { try { fs.rmSync(projectA, { recursive: true, force: true }); } catch {} }
    if (projectB) { try { fs.rmSync(projectB, { recursive: true, force: true }); } catch {} }
}

console.log(`\nREG-114: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
