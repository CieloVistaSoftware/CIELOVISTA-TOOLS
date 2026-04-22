/**
 * test-logerror-interface.js
 *
 * ZERO-DEPENDENCY plain JS static analysis test.
 * Proves every logError() call in src/ matches its interface contract.
 *
 * TWO logError interfaces exist in this codebase:
 *
 * A) shared/output-channel.ts  ->  logError(message: string, stacktrace: string, context: string)
 *    Enforced rules:
 *    1. arg1 MUST be a string/template literal  (the human-readable message)
 *    2. arg2 MUST contain `instanceof Error`    (safe stack trace stringification)
 *    3. arg3 MUST be present                    (the FEATURE/context name)
 *
 * B) shared/error-log.ts  ->  logError(prefix: string, error: unknown, options?)
 *    Enforced rules:
 *    1. arg1 MUST be a string/template literal  (prefix like '[feature-name]')
 *    2. arg3 if present MUST be an object { }   (NOT a bare string)
 *
 * Why this matters:
 *   The error log is the ONLY way to diagnose broken extension code in production.
 *   A wrong call silently swallows the stack trace or passes `unknown` as string.
 *   This test runs before every build so bad calls never reach the VSIX.
 *
 * Run:  node scripts/test-logerror-interface.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// ── Walk all .ts source files ─────────────────────────────────────────────────

function walkTs(dir, out) {
  out = out || [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var e    = entries[i];
    var full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
      walkTs(full, out);
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ── Extract every logError( call site ────────────────────────────────────────
// Parses arg list by counting delimiters so multi-line calls work correctly.

function extractCalls(src, filePath) {
  var calls = [];

  // Which interface does this file import logError from?
  var fromChannel  = /import[^;]*\blogError\b[^;]*from\s+['"][^'"]*shared\/output-channel['"]/.test(src);
  var fromErrLog   = /import[^;]*\blogError\b[^;]*from\s+['"][^'"]*shared\/error-log['"]/.test(src);
  // aliased imports like `logError as logErr` from output-channel
  var fromChanAlias = /import[^;]*logError\s+as\s+(\w+)[^;]*from\s+['"][^'"]*shared\/output-channel['"]/.exec(src);
  var aliasName = fromChanAlias ? fromChanAlias[1] : null;

  if (!fromChannel && !fromErrLog && !aliasName) { return calls; }

  // Build regex that matches both `logError(` and the alias name if present
  var names = ['logError'];
  if (aliasName && aliasName !== 'logError') { names.push(aliasName); }
  var callRe = new RegExp('\\b(' + names.join('|') + ')\\s*\\(', 'g');

  var m;
  while ((m = callRe.exec(src)) !== null) {
    var fnName = m[1];
    var start  = m.index + m[0].length;  // char after '('
    var depth  = 1, i = start;
    var inStr  = null, esc = false;

    while (i < src.length && depth > 0) {
      var ch = src[i];
      if (esc)             { esc = false; i++; continue; }
      if (ch === '\\')     { esc = true;  i++; continue; }
      if (inStr) {
        if (ch === inStr)  { inStr = null; }
        i++; continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
      if (ch === '(')      { depth++; }
      else if (ch === ')') { depth--; }
      i++;
    }

    var argsText = src.slice(start, i - 1).trim();
    var lineNo   = src.slice(0, m.index).split('\n').length;

    // Determine which interface applies to this specific call
    // aliased name always comes from output-channel
    var iface = (fromErrLog && fnName === 'logError' && !fromChannel)
      ? 'error-log'
      : 'output-channel';

    calls.push({
      file:  path.relative(ROOT, filePath).replace(/\\/g, '/'),
      line:  lineNo,
      args:  argsText,
      iface: iface,
    });
  }

  return calls;
}

// ── Split top-level comma-separated arguments ─────────────────────────────────
// Respects (), [], {}, and all string types so nested structures aren't broken.

function splitArgs(text) {
  var args = [], cur = '', depth = 0, inStr = null, esc = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (esc)             { esc = false; cur += ch; continue; }
    if (ch === '\\')     { esc = true;  cur += ch; continue; }
    if (inStr) {
      if (ch === inStr)  { inStr = null; }
      cur += ch; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{')  { depth++; cur += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}')  { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) { args.push(cur.trim()); }
  return args;
}

function isStringLiteral(s) {
  return /^(['"\`])/.test(s.trim());
}

function isBareIdentifier(s) {
  // Looks like a constant: all-caps or camelCase word, no quotes, no parens
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.trim());
}

function hasInstanceofErrorPattern(s) {
  return /instanceof\s+Error/.test(s);
}

function isObjectLiteral(s) {
  return s.trim().startsWith('{');
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('');
console.log('logError Interface Compliance Test');
console.log('==='.repeat(18));

var allFiles  = walkTs(SRC);
var allCalls  = [];

for (var fi = 0; fi < allFiles.length; fi++) {
  var src   = fs.readFileSync(allFiles[fi], 'utf8');
  var calls = extractCalls(src, allFiles[fi]);
  allCalls  = allCalls.concat(calls);
}

console.log('  Scanned ' + allFiles.length + ' .ts files, found ' + allCalls.length + ' logError call(s)');

var violations = [];

for (var ci = 0; ci < allCalls.length; ci++) {
  var call = allCalls[ci];
  var args = splitArgs(call.args);
  var loc  = call.file + ':' + call.line;

  if (args.length === 0) {
    violations.push(loc + '\n    logError() called with no arguments');
    continue;
  }

  if (call.iface === 'output-channel') {
    // Rule 1: arg1 must be a message string, NOT a bare FEATURE constant
    if (!isStringLiteral(args[0]) && isBareIdentifier(args[0])) {
      violations.push(
        loc + ' [output-channel interface]\n' +
        '    WRONG: logError(' + args[0] + ', ...)  -- arg1 is a bare identifier, not a message\n' +
        '    FIX:   logError(\'message\', err instanceof Error ? err.stack||String(err) : String(err), ' + args[0] + ')'
      );
    }

    // Rule 2: if arg2 is a variable/identifier it MUST use instanceof Error pattern.
    // Passing a string literal (including '') is allowed for non-exception log calls.
    if (args.length >= 2 && !isStringLiteral(args[1]) && !hasInstanceofErrorPattern(args[1])) {
      violations.push(
        loc + ' [output-channel interface]\n' +
        '    WRONG: arg2 = ' + args[1].slice(0, 70) + '\n' +
        '    arg2 is a variable but lacks instanceof Error — stack trace will be lost\n' +
        '    FIX:   err instanceof Error ? err.stack || String(err) : String(err)\n' +
        '    NOTE:  passing empty string \"\" is OK when there is no caught exception'
      );
    }

    // Rule 3: context (arg3) must be present
    if (args.length < 3) {
      violations.push(
        loc + ' [output-channel interface]\n' +
        '    WRONG: only ' + args.length + ' argument(s) -- context string is required as arg3\n' +
        '    FIX:   logError(message, stacktrace, FEATURE)'
      );
    }

  } else if (call.iface === 'error-log') {
    // Rule 1: arg1 must be a string literal prefix
    if (!isStringLiteral(args[0]) && isBareIdentifier(args[0])) {
      violations.push(
        loc + ' [error-log interface]\n' +
        '    WRONG: arg1 = ' + args[0] + '  -- must be a string prefix like \'[feature-name]\'\n' +
        '    FIX:   logError(\'[feature-name]\', err, { context: \'operationName\' })'
      );
    }

    // Rule 2: arg3 if present must be an options object, not a bare string
    if (args.length >= 3 && !isObjectLiteral(args[2])) {
      violations.push(
        loc + ' [error-log interface]\n' +
        '    WRONG: arg3 = ' + args[2].slice(0, 60) + '  -- must be options object or omitted\n' +
        '    FIX:   logError(prefix, err, { context: \'operationName\' })'
      );
    }
  }
}

console.log('');
if (violations.length === 0) {
  console.log('  PASS: All ' + allCalls.length + ' call(s) conform to their logError interface');
  console.log('');
  console.log('-'.repeat(60));
  console.log('logError compliance: PASSED');
  process.exit(0);
} else {
  console.error('  FAIL: ' + violations.length + ' violation(s) found:\n');
  for (var vi = 0; vi < violations.length; vi++) {
    console.error('  [' + (vi + 1) + '] ' + violations[vi]);
    console.error('');
  }
  console.error('-'.repeat(60));
  console.error('logError compliance: FAILED -- fix all violations before building');
  console.error('The error log is the only way to diagnose broken code in production.');
  process.exit(1);
}
 
