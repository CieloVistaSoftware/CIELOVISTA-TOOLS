/**
 * REG-140-registry-promote-mcp-tool.test.js
 *
 * Regression test for #696 — MCP could read the project registry but not write it.
 *
 * Every registry-facing MCP tool was read-only: list_projects, find_project,
 * project_status, list_old_dewey, lookup_dewey. Promotion existed only as the
 * interactive VS Code command cvs.registry.promote, so an agent could see the
 * registry through five tools and add to it through none. Registering a project
 * meant hand-editing project-registry.json and then re-deriving CLAUDE.md and
 * README.md by hand from code that already knew how to write them.
 *
 * Checks 1-3 are behavioural: they run the real promoteFolder() against a
 * throwaway registry in a temp directory. Check 4 is structural, and it is the
 * one that matters most over time — the whole point of #696 is that there is
 * ONE promotion implementation, shared by the MCP tool and the VS Code command.
 * Two copies would pass every behavioural test here and still drift.
 *
 * Nothing in this test writes inside the repository (REG-130 invariant 1): the
 * fixture registry lives in fs.mkdtempSync(os.tmpdir()) and the core is pointed
 * at it by loading the compiled module with HOME/USERPROFILE redirected there.
 *
 * Checks:
 *   1. promoting an unregistered folder adds it and scaffolds both files
 *   2. existing CLAUDE.md / README.md are never overwritten
 *   3. dryRun writes nothing at all
 *   4. the VS Code command delegates to the shared core, not its own copy
 *   5. both write tools are registered on the MCP server
 *
 * Run: node tests/regression/REG-140-registry-promote-mcp-tool.test.js
 */
'use strict';

const cp     = require('child_process');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ROOT     = path.resolve(__dirname, '..', '..');
const CORE_TS  = path.join(ROOT, 'mcp-server', 'src', 'shared', 'registry-promote-core.ts');
const TOOLS_TS = path.join(ROOT, 'mcp-server', 'src', 'tools', 'index.ts');
const FEAT_TS  = path.join(ROOT, 'src', 'features', 'registry-promote.ts');

let passed = 0;
let failed = 0;
const fail = (msg) => { console.error('  FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('  PASS: ' + msg); passed++; };

console.log('\nREG-140: the registry can be written through MCP, by one implementation (#696)\n');

// ─── Fixture: a throwaway HOME with its own registry ─────────────────────────

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg140-'));
const realHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

function withSandboxHome(fn) {
    process.env.HOME = sandbox;
    process.env.USERPROFILE = sandbox;
    try { return fn(); }
    finally {
        if (realHome.HOME === undefined) { delete process.env.HOME; }
        else { process.env.HOME = realHome.HOME; }
        if (realHome.USERPROFILE === undefined) { delete process.env.USERPROFILE; }
        else { process.env.USERPROFILE = realHome.USERPROFILE; }
    }
}

try {
    // A test owns its environment, and it does not borrow the repo's.
    //
    // mcp-server/dist/ is NOT usable here: the shipped build is an esbuild
    // bundle, one 800KB dist/index.js with no separate shared/ module to
    // require. Running `tsc` in mcp-server/ to get one replaces that bundle
    // with unbundled output and breaks the packaging check ("dist/index.js
    // > 100 KB") for every later test in the run.
    //
    // So compile the core into the sandbox and require it from there. Nothing
    // in the repository is written or read-modified (REG-130 invariant 1), and
    // the test works in a fresh worktree that has never been built.
    const tscCandidates = [
        path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
        path.join(ROOT, 'mcp-server', 'node_modules', 'typescript', 'bin', 'tsc'),
    ];
    const tsc = tscCandidates.find(p => fs.existsSync(p));
    if (!tsc) {
        console.error('FATAL: typescript not found — run npm install.');
        console.error('       looked in:\n         ' + tscCandidates.join('\n         '));
        process.exit(1);
    }

    const buildDir = path.join(sandbox, 'build');
    const build = cp.spawnSync(process.execPath, [
        tsc,
        CORE_TS,
        '--outDir', buildDir,
        '--rootDir', path.join(ROOT, 'mcp-server', 'src'),
        '--module', 'commonjs',
        '--moduleResolution', 'node',
        '--target', 'ES2020',
        '--skipLibCheck',
    ], { encoding: 'utf8' });

    const CORE_BUILT = path.join(buildDir, 'shared', 'registry-promote-core.js');
    if (!fs.existsSync(CORE_BUILT)) {
        console.error('FATAL: could not compile the shared core into the sandbox.');
        console.error((build.stdout || '') + (build.stderr || ''));
        process.exit(1);
    }

    const registryDir = path.join(sandbox, 'Downloads', 'CieloVistaStandards');
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(
        path.join(registryDir, 'project-registry.json'),
        JSON.stringify({ globalDocsPath: registryDir, projects: [] }, null, 2),
        'utf8');

    // os.homedir() is read when the module computes REGISTRY_PATH at import
    // time, so the redirect has to be in place before require().
    const core = withSandboxHome(() => require(CORE_BUILT));

    const readRegistry = () => JSON.parse(
        fs.readFileSync(path.join(registryDir, 'project-registry.json'), 'utf8'));

    // ─── 1: an unregistered folder is added and scaffolded ───────────────────

    const projA = path.join(sandbox, 'projects', 'alpha');
    fs.mkdirSync(projA, { recursive: true });

    const r1 = withSandboxHome(() =>
        core.promoteFolder(projA, 'alpha', 'library', 'A test project.'));

    if (!r1.ok) {
        fail(`promoteFolder returned not-ok: ${r1.message}`);
    } else {
        const reg = readRegistry();
        const entry = reg.projects.find(p => p.name === 'alpha');
        const claude = fs.existsSync(path.join(projA, 'CLAUDE.md'));
        const readme = fs.existsSync(path.join(projA, 'README.md'));
        if (!entry) {
            fail('promoteFolder reported ok but wrote no registry entry');
        } else if (entry.status !== 'product') {
            fail(`registry entry has status="${entry.status}", expected "product"`);
        } else if (!claude || !readme) {
            fail(`scaffolding incomplete — CLAUDE.md:${claude} README.md:${readme}`);
        } else {
            ok('promoting an unregistered folder adds it as product and scaffolds both files');
        }
    }

    // ─── 2: existing files are never overwritten ─────────────────────────────

    const projB = path.join(sandbox, 'projects', 'beta');
    fs.mkdirSync(projB, { recursive: true });
    const SENTINEL = '# DO NOT CLOBBER\n';
    fs.writeFileSync(path.join(projB, 'README.md'), SENTINEL, 'utf8');

    const r2 = withSandboxHome(() =>
        core.promoteFolder(projB, 'beta', 'cli', 'Another test project.'));

    const readmeAfter = fs.readFileSync(path.join(projB, 'README.md'), 'utf8');
    if (readmeAfter !== SENTINEL) {
        fail('an existing README.md was overwritten — promotion must never destroy content');
    } else if (r2.readmeWritten) {
        fail('readmeWritten was reported true for a file that already existed');
    } else if (!fs.existsSync(path.join(projB, 'CLAUDE.md'))) {
        fail('the missing CLAUDE.md was not created alongside the preserved README.md');
    } else {
        ok('an existing README.md is preserved while the missing CLAUDE.md is still created');
    }

    // ─── 3: dryRun writes nothing ────────────────────────────────────────────

    const projC = path.join(sandbox, 'projects', 'gamma');
    fs.mkdirSync(projC, { recursive: true });
    const beforeCount = readRegistry().projects.length;

    const r3 = withSandboxHome(() =>
        core.promoteFolder(projC, 'gamma', 'web-app', 'Dry run target.', true));

    const afterCount = readRegistry().projects.length;
    const wroteFiles = fs.existsSync(path.join(projC, 'CLAUDE.md'))
                    || fs.existsSync(path.join(projC, 'README.md'));

    if (!r3.ok) {
        fail(`dryRun returned not-ok: ${r3.message}`);
    } else if (afterCount !== beforeCount) {
        fail(`dryRun added a registry entry — ${beforeCount} projects became ${afterCount}`);
    } else if (wroteFiles) {
        fail('dryRun created files on disk');
    } else if (!/dry run/i.test(r3.message)) {
        fail(`dryRun message does not say so: "${r3.message}"`);
    } else {
        ok('dryRun reports the plan and writes nothing');
    }

    // ─── 4: one implementation, not two ──────────────────────────────────────

    // The failure this guards against is silent: a second copy of promoteFolder
    // in the feature file would satisfy every check above and still diverge from
    // the MCP tool the first time either is edited.
    const featSrc = fs.readFileSync(FEAT_TS, 'utf8');
    const importsCore = /from\s+['"][^'"]*registry-promote-core['"]/.test(featSrc);
    // A real implementation writes the registry; a delegating wrapper does not.
    const hasOwnImpl = /\bsaveRegistry\s*\(/.test(featSrc)
                    || /fs\.writeFileSync\s*\(\s*claudePath/.test(featSrc);

    if (!fs.existsSync(CORE_TS)) {
        fail('mcp-server/src/shared/registry-promote-core.ts is missing — there is no shared core (#696)');
    } else if (/from\s+['"]vscode['"]/.test(fs.readFileSync(CORE_TS, 'utf8'))) {
        fail('the shared core imports vscode — it would be unreachable from the MCP server, ' +
             'which is the entire problem #696 describes');
    } else if (!importsCore) {
        fail('registry-promote.ts does not import the shared core — the VS Code command and ' +
             'the MCP tool have separate implementations and will drift (#696)');
    } else if (hasOwnImpl) {
        fail('registry-promote.ts still writes the registry itself — it must delegate to the ' +
             'shared core, not keep a second copy (#696)');
    } else {
        ok('the VS Code command delegates to the shared core; no vscode import in it');
    }

    // ─── 5: both write tools are registered ──────────────────────────────────

    const toolsSrc = fs.readFileSync(TOOLS_TS, 'utf8');
    const missing = ['registry_promote', 'registry_set_status']
        .filter(name => !new RegExp(`server\\.tool\\(\\s*["']${name}["']`).test(toolsSrc));

    if (missing.length > 0) {
        fail(`MCP tool(s) not registered: ${missing.join(', ')} — the registry stays read-only (#696)`);
    } else {
        ok('registry_promote and registry_set_status are registered on the MCP server');
    }

} finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log(`✓ All ${passed} REG-140 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-140 test(s) FAILED\n`);
    process.exit(1);
}
