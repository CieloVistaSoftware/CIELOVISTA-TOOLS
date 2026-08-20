// Copyright (c) 2026 CieloVista Software. All rights reserved.
// parse-path-const.js -- resolve a path constant out of TypeScript source.
//
// Test files verify that constants like _SNAPIT_ROOT point at something real on
// disk. Those constants used to be plain string literals, but portable paths
// (#685) rewrote them as path.join(os.homedir(), ...), which broke every regex
// that only understood the literal form (#687). This helper understands both.

'use strict';

const os   = require('os');
const path = require('path');

/**
 * Resolve `const <name> = ...` from TypeScript/JavaScript source text.
 * Supports:
 *   const NAME = 'C:\\some\\path';
 *   const NAME = path.join(os.homedir(), 'a', 'b');
 *   const NAME = path.join(OTHER_CONST, 'sub');   // OTHER_CONST resolved recursively
 * Returns '' when the constant is absent or in a form we cannot resolve.
 */
function parsePathConst(src, name, _seen) {
    const seen = _seen || new Set();
    if (seen.has(name)) { return ''; }
    seen.add(name);

    const decl = new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);');
    const m = src.match(decl);
    if (!m) { return ''; }
    const expr = m[1].trim();

    // Plain string literal -- source escapes each backslash, so collapse them.
    const literal = expr.match(/^'([^']+)'$/);
    if (literal) { return literal[1].replace(/\\\\/g, '\\'); }

    // path.join(...) -- resolve each argument.
    const join = expr.match(/^path\.join\(([\s\S]*)\)$/);
    if (!join) { return ''; }

    const parts = [];
    for (const rawArg of splitArgs(join[1])) {
        const arg = rawArg.trim();
        if (/^os\.homedir\(\)$/.test(arg)) { parts.push(os.homedir()); continue; }
        const argLiteral = arg.match(/^'([^']*)'$/);
        if (argLiteral) { parts.push(argLiteral[1]); continue; }
        if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
            const nested = parsePathConst(src, arg, seen);
            if (!nested) { return ''; }
            parts.push(nested);
            continue;
        }
        return '';   // unsupported argument form
    }
    return parts.length ? path.join(...parts) : '';
}

/** Split a call's argument list on top-level commas. */
function splitArgs(text) {
    const args = [];
    let depth = 0, current = '', quote = null;
    for (const ch of text) {
        if (quote) {
            current += ch;
            if (ch === quote) { quote = null; }
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; }
        if (ch === ',' && depth === 0) { args.push(current); current = ''; continue; }
        current += ch;
    }
    if (current.trim()) { args.push(current); }
    return args;
}

module.exports = { parsePathConst };
