// Verify every relative require() in out/*.js resolves to an existing file.
// Run after tsc, before vsce package. Exits non-zero on any unresolved import.
//
// This is the gate that catches "shipped a VSIX that imports a file that
// doesn't exist" — the failure mode that broke the 1.0.2 install today.
//
// KNOWN LIMITATION — regex, not an AST parser:
//   The pattern /require\s*\(\s*["']([^"']+)["']\s*\)/g matches the common
//   case (CommonJS emit from tsc). It will NOT correctly handle:
//     - require() calls inside string literals or block comments (false positives)
//     - ES-module import statements (if tsconfig.json ever sets "module":"ESNext")
//     - Dynamic await import("...") calls
//   For the current CommonJS output this is acceptable. If the tsconfig target
//   changes, swap this regex walk for an acorn or @typescript-eslint/parser
//   AST walk before relying on this gate.
//
// Usage:
//   node scripts/verify-imports.js                  — checks out/
//   node scripts/verify-imports.js /path/to/dir     — checks that dir instead

'use strict';

const fs   = require('fs');
const path = require('path');

// Accept an optional root directory as the first CLI argument (used by
// rebuild.ps1 to verify VSIX contents against extension/out/ inside the
// unpacked archive). Fall back to out/ in the project root.
const argRoot = process.argv[2];
const OUT_DIR = argRoot ? path.resolve(argRoot) : path.resolve(__dirname, '..', 'out');
if (!fs.existsSync(OUT_DIR)) {
    console.error(`!! Directory does not exist: ${OUT_DIR}`);
    process.exit(1);
}

// Collect every .js file under out/
const jsFiles = [];
(function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full); }
        else if (name.endsWith('.js')) { jsFiles.push(full); }
    }
})(OUT_DIR);

console.log(`Verifying imports in ${jsFiles.length} compiled .js files under ${path.relative(process.cwd(), OUT_DIR) || OUT_DIR}...`);

const problems = [];

for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    // tsc emits CommonJS by default. Match require("...") and require('...').
    // Also catch dynamic-import-as-emitted: __importStar(require("..."))
    // and re-export forms: tslib/__exportStar(require("..."), exports)
    const re = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const spec = m[1];

        // Skip non-relative specifiers — node_modules and built-ins are
        // resolved by Node at runtime, not by us. We only care about
        // intra-package relative imports (the class of failure that
        // shipped today: ../shared/github-issues-view).
        if (!spec.startsWith('.')) { continue; }

        const fromDir = path.dirname(file);
        const candidates = [
            path.resolve(fromDir, spec),
            path.resolve(fromDir, spec) + '.js',
            path.resolve(fromDir, spec, 'index.js'),
        ];

        const found = candidates.some(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!found) {
            problems.push({
                file: path.relative(OUT_DIR, file),
                spec,
                tried: candidates.map(p => path.relative(OUT_DIR, p)),
            });
        }
    }
}

if (problems.length === 0) {
    console.log(`OK  All relative imports resolve.`);
    process.exit(0);
}

console.error('');
console.error(`!! ${problems.length} unresolved import(s):`);
console.error('');
for (const p of problems) {
    console.error(`   ${p.file}`);
    console.error(`     imports: ${p.spec}`);
    console.error(`     tried:   ${p.tried.join(', ')}`);
}
console.error('');
console.error('!! REFUSING to package a VSIX with broken imports.');
process.exit(1);
