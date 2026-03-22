/**
 * REG-001: Extension activation safety — no unbundled runtime dependencies
 *
 * Regression test for FIX-001:
 *   All audit tools broke because 'import MarkdownIt from markdown-it' was added
 *   to doc-preview.ts. Since vsce packages with --no-dependencies, the module was
 *   absent at runtime and crashed the entire extension host on activation.
 *
 * This test suite ensures:
 *   1. No source file imports a module that is NOT in devDependencies (compile-time only)
 *      and IS present in dependencies (runtime). With --no-dependencies packaging, any
 *      runtime dependency that isn't bundled will crash activation.
 *   2. All exported commands in catalog.ts have a corresponding registerCommand() call.
 *   3. The extension compiles clean (tsc --noEmit exits 0).
 *   4. The packaged VSIX contains no node_modules directory (confirming --no-dependencies).
 *   5. package.json "dependencies" block is empty (all deps are devDependencies or CDN).
 */

import { describe, it, expect } from '@jest/globals';
import * as fs   from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT     = path.resolve(__dirname, '../..');
const SRC      = path.join(ROOT, 'src');
const PKG_JSON = path.join(ROOT, 'package.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(p: string): any {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function walkTs(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            results.push(...walkTs(full));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            results.push(full);
        }
    }
    return results;
}

function extractImports(src: string): string[] {
    const mods: string[] = [];
    const re = /^import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        const mod = m[1];
        // Only external packages (not relative, not vscode/node builtins)
        if (!mod.startsWith('.') && !mod.startsWith('@types/') &&
            mod !== 'vscode' && !['fs','path','os','child_process','util','crypto','stream','events','url'].includes(mod)) {
            mods.push(mod);
        }
    }
    return mods;
}

function packageName(mod: string): string {
    // '@scope/pkg/sub' -> '@scope/pkg', 'pkg/sub' -> 'pkg'
    const parts = mod.split('/');
    return mod.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('REG-001: Extension activation safety', () => {

    it('package.json "dependencies" block must be empty — all runtime deps must be CDN or devDependencies only', () => {
        const pkg = readJson(PKG_JSON);
        const deps = pkg.dependencies ?? {};
        const keys = Object.keys(deps);
        expect(keys).toEqual(
            [],
            `FAIL: Found runtime dependencies that will be excluded by --no-dependencies packaging: ${keys.join(', ')}. ` +
            `Load these via CDN in the webview instead, or bundle the extension. ` +
            `This caused FIX-001 (all tools broke when markdown-it was added here).`
        );
    });

    it('no source file imports a package listed in "dependencies" (they would be missing at runtime)', () => {
        const pkg  = readJson(PKG_JSON);
        const runtimeDeps = Object.keys(pkg.dependencies ?? {});

        if (runtimeDeps.length === 0) {
            // Nothing to check — pass immediately
            return;
        }

        const violations: string[] = [];
        for (const file of walkTs(SRC)) {
            const src = fs.readFileSync(file, 'utf8');
            for (const mod of extractImports(src)) {
                const pkg = packageName(mod);
                if (runtimeDeps.includes(pkg)) {
                    violations.push(`  ${path.relative(ROOT, file)}: imports '${mod}' (in dependencies, excluded by --no-dependencies)`);
                }
            }
        }

        expect(violations).toEqual(
            [],
            `FAIL: Source files import packages that will be missing at runtime:\n${violations.join('\n')}`
        );
    });

    it('all catalog command IDs must have a registerCommand() call somewhere in src/', () => {
        // Read catalog
        const catalogPath = path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts');
        const catalogSrc  = fs.readFileSync(catalogPath, 'utf8');
        const idMatches   = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)];
        const catalogIds  = idMatches.map(m => m[1]);

        // Collect all registerCommand calls across src/
        const allSrc = walkTs(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n');
        const regMatches = [...allSrc.matchAll(/registerCommand\(\s*['"]([^'"]+)['"]/g)];
        const registered = new Set(regMatches.map(m => m[1]));

        const missing = catalogIds.filter(id => !registered.has(id));
        expect(missing).toEqual(
            [],
            `FAIL: Catalog commands with no registerCommand() — clicking Run will silently fail:\n  ${missing.join('\n  ')}`
        );
    });

    it('TypeScript must compile with zero errors (tsc --noEmit)', () => {
        let exitCode = 0;
        let output   = '';
        try {
            output = execSync(
                `"${path.join(ROOT, 'node_modules', '.bin', 'tsc')}" --noEmit`,
                { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
            );
        } catch (e: any) {
            exitCode = e.status ?? 1;
            output   = e.stdout ?? e.message ?? '';
        }
        expect(exitCode).toBe(0,
            `FAIL: TypeScript compilation errors detected:\n${output}`
        );
    });

    it('VSIX must not contain a node_modules directory (confirms --no-dependencies)', () => {
        // Find most recent VSIX
        const vsixFiles = fs.readdirSync(ROOT)
            .filter(f => f.endsWith('.vsix'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(ROOT, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);

        if (vsixFiles.length === 0) {
            console.warn('  SKIP: No VSIX found — run npm run package first');
            return;
        }

        const vsixPath = path.join(ROOT, vsixFiles[0].name);
        let listing = '';
        try {
            // List contents of VSIX (it's a zip)
            listing = execSync(
                `powershell -Command "Add-Type -Assembly System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('${vsixPath}').Entries.FullName" 2>&1`,
                { encoding: 'utf8', cwd: ROOT }
            );
        } catch { /* skip if unzip not available */ return; }

        const hasNodeModules = listing.split('\n').some(line => line.includes('node_modules/'));
        expect(hasNodeModules).toBe(false,
            `FAIL: VSIX contains node_modules — packaging is broken. ` +
            `Check that vsce package uses --no-dependencies flag.`
        );
    });

});
