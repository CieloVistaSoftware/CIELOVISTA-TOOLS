/**
 * REG-135-no-automatic-mcp-server-start.test.js
 *
 * Regression test for issue #716 — "The extension starts an MCP server on
 * activation and on every home-page open that nothing uses; only Claude should
 * run MCP".
 *
 * John, 2026-09-14: "only Claude should be using MCP". Claude Desktop runs its
 * own copy of the CVT MCP server over stdio (claude_desktop_config.json). The
 * copy the extension started on activation (src/extension.ts) and on every home
 * page open (src/features/home-page.ts) had no client: nothing listened on or
 * connected to its port, and it cost every VS Code window an idle node process.
 *
 * Invariants, checked on the TypeScript AST (not text), so a comment or a
 * string that merely mentions the function cannot satisfy or break them:
 *   1. Neither file calls startMcpServer() outside a user action. A user action
 *      is the home page's { type: 'startMcp' } message handler.
 *   2. That message handler still calls startMcpServer(), so the server can be
 *      started on demand.
 *   3. Both files still exist and parse (a guard that scans nothing passes nothing).
 *
 * Reads source only; the shared repo tree is never written to (REG-130 invariant 1).
 *
 * Run: node tests/regression/REG-135-no-automatic-mcp-server-start.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ts   = require('typescript');

const ROOT  = path.resolve(__dirname, '..', '..');
const FILES = ['src/extension.ts', 'src/features/home-page.ts'];

let passed = 0, failed = 0;
function check(name, ok, detail) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else    { failed++; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
}

/** Every call to startMcpServer() in a file, with whether it sits inside a user action. */
function startCalls(rel) {
    const file = path.join(ROOT, rel);
    const text = fs.readFileSync(file, 'utf8');
    const sf   = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls = [];
    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'startMcpServer') {
            let userAction = false;
            for (let p = node.parent; p; p = p.parent) {
                // The home page's message handler: if (msg.type === 'startMcp') { startMcpServer(); }
                if (ts.isIfStatement(p) && /\btype\s*===\s*['"]startMcp['"]/.test(p.expression.getText(sf))) {
                    userAction = true;
                    break;
                }
            }
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            calls.push({ line: line + 1, userAction });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return { sf, calls };
}

console.log('\nREG-135: no automatic MCP server start (#716)\n');

for (const rel of FILES) {
    const exists = fs.existsSync(path.join(ROOT, rel));
    check(`${rel} exists`, exists);
    if (!exists) continue;

    const { calls } = startCalls(rel);
    const automatic = calls.filter((c) => !c.userAction);
    check(`${rel}: no startMcpServer() call outside a user action`, automatic.length === 0,
        automatic.map((c) => `automatic call at ${rel}:${c.line}`).join('; '));

    if (rel.endsWith('home-page.ts')) {
        check(`${rel}: the 'startMcp' message still starts the server on demand`, calls.some((c) => c.userAction),
            'no startMcpServer() call inside the startMcp message handler');
    }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
