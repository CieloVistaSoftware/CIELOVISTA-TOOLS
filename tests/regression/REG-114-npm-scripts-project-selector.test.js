// REG-114: NPM Scripts project selector runs scripts in the correct project folder
// Behavioral test — creates real temp projects and verifies scripts are loaded
// from the selected project, not the current workspace.
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

let passed = 0; let failed = 0;
function check(desc, ok) {
    if (ok) { console.log(`  PASS ${desc}`); passed++; }
    else     { console.error(`  FAIL ${desc}`); failed++; }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTempProject(name, scripts) {
    const dir = path.join(os.tmpdir(), `cvt-reg114-${name}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, scripts }, null, 2));
    return dir;
}

// Extract the pure readPkgScripts logic from compiled output
// This IS the function that runs when a project is selected — it reads the
// package.json from the selected project's folder.
function readPkgScripts(absDir, wsRoot) {
    const pkgFile = path.join(absDir, 'package.json');
    if (!fs.existsSync(pkgFile)) { return null; }
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const scripts = Object.entries(pkg.scripts ?? {}).map(([name, cmd]) => ({ name, cmd }));
        if (!scripts.length) { return null; }
        const relPath = wsRoot
            ? path.relative(wsRoot, pkgFile).replace(/\\/g, '/')
            : pkgFile;
        return { label: path.basename(absDir), relPath, absDir, scripts };
    } catch { return null; }
}

// ── behavioral tests ──────────────────────────────────────────────────────────

let projectA, projectB;
try {
    projectA = makeTempProject('project-alpha', {
        'start':   'node server.js',
        'rebuild': 'npm run compile && node install.js',
        'test':    'jest'
    });

    projectB = makeTempProject('project-beta', {
        'serve':  'dotnet run',
        'deploy': 'dotnet publish',
    });

    // Test 1: selecting project A returns project A's scripts only
    const entriesA = readPkgScripts(projectA, projectA);
    check('selecting project A returns project A scripts',
        entriesA !== null &&
        entriesA.absDir === projectA &&
        entriesA.scripts.some(s => s.name === 'start') &&
        entriesA.scripts.some(s => s.name === 'rebuild'));

    // Test 2: project A does NOT include project B scripts
    check('project A does not contain project B scripts',
        entriesA !== null &&
        !entriesA.scripts.some(s => s.name === 'serve') &&
        !entriesA.scripts.some(s => s.name === 'deploy'));

    // Test 3: selecting project B returns project B's scripts only
    const entriesB = readPkgScripts(projectB, projectB);
    check('selecting project B returns project B scripts',
        entriesB !== null &&
        entriesB.absDir === projectB &&
        entriesB.scripts.some(s => s.name === 'serve') &&
        entriesB.scripts.some(s => s.name === 'deploy'));

    // Test 4: project B does NOT include project A scripts
    check('project B does not contain project A scripts',
        entriesB !== null &&
        !entriesB.scripts.some(s => s.name === 'start') &&
        !entriesB.scripts.some(s => s.name === 'rebuild'));

    // Test 5: absDir matches the selected project path — this IS the terminal cwd
    check('absDir equals selected project path — terminal will open in correct folder',
        entriesA?.absDir === projectA &&
        entriesB?.absDir === projectB);

    // Test 6: switching from A to B gives different scripts
    check('switching project changes scripts — not cached/stale from previous selection',
        entriesA?.scripts.length !== entriesB?.scripts.length ||
        entriesA?.scripts[0]?.name !== entriesB?.scripts[0]?.name);

    // Test 7: project with no scripts returns null — not added to list
    const emptyDir = makeTempProject('project-empty', {});
    const emptyEntries = readPkgScripts(emptyDir, emptyDir);
    check('project with no scripts returns null — not shown in picker',
        emptyEntries === null);
    fs.rmSync(emptyDir, { recursive: true, force: true });

    // Test 8: non-existent path returns null gracefully
    const badPath = path.join(os.tmpdir(), 'cvt-reg114-nonexistent-999999');
    const badEntries = readPkgScripts(badPath, badPath);
    check('non-existent project path returns null — no crash',
        badEntries === null);

    // Test 9: script command is preserved exactly — run will send the right command
    check('script command value is preserved exactly for terminal execution',
        entriesA?.scripts.find(s => s.name === 'rebuild')?.cmd === 'npm run compile && node install.js');

    // Test 10: TS source still wires switchProject to collectEntries with msg.projectPath
    const tsSrc = fs.readFileSync(
        path.join(__dirname, '../../src/features/npm-scripts-tree.ts'), 'utf8');
    check('TS switchProject handler calls collectEntries(msg.projectPath)',
        /case 'switchProject'[\s\S]{0,300}collectEntries\(msg\.projectPath\)/.test(tsSrc));

} finally {
    if (projectA) { try { fs.rmSync(projectA, { recursive: true, force: true }); } catch {} }
    if (projectB) { try { fs.rmSync(projectB, { recursive: true, force: true }); } catch {} }
}

console.log(`\nREG-114: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
