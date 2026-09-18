// Copyright (c) 2026 CieloVista Software. All rights reserved.
// markdown-walkers.js -- find the functions that walk a directory tree for markdown.
//
// Used by REG-176 (#812), which holds every markdown walk in src/,
// mcp-server/src/ and scripts/ to the one walker in
// mcp-server/src/shared/doc-walk.ts. Moved here from REG-174 (#802), which
// checked src/ only.
//
// A walker is recognised from the TypeScript AST, not by text: a function
// that reads a directory (readdir/readdirSync, or a module-level helper that
// wraps one, like listDir) and walks down (calls itself, passes
// { recursive: true }, or reads directories in a while loop off a work
// list), together with a markdown test -- a literal naming .md, md or
// README, in the function, the function enclosing it, or a module-level
// const/function it uses. Code inside a string, such as the test Frontmatter
// Viewer generates, is not a call. .js files are parsed as JavaScript.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ts   = require(path.join(ROOT, 'node_modules', 'typescript'));

// ".md", "README", and "md" as a word, so /\.(md|html)$/ and ext === 'md' count.
const MARKDOWN_LITERAL = /\.md\b|\bmd\b|readme/i;
const READDIR = /^readdir(Sync)?$/;

/** Every .ts/.js/.mjs/.cjs source file under dir (no .d.ts), skipping node_modules. */
function sourceFiles(dir, acc = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        if (e.name === 'node_modules') { continue; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { sourceFiles(full, acc); }
        else if (/\.(ts|js|mjs|cjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) { acc.push(full); }
    }
    return acc;
}

function isFunctionLike(node) {
    return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}

function calleeName(call) {
    const e = call.expression;
    if (ts.isIdentifier(e)) { return e.text; }
    if (ts.isPropertyAccessExpression(e)) { return e.name.text; }
    return '';
}

function functionName(node) {
    if (node.name) { return node.name.getText(); }
    if (node.parent && ts.isVariableDeclaration(node.parent)) { return node.parent.name.getText(); }
    return '';
}

function isMarkdownLiteral(node) {
    return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || node.kind === ts.SyntaxKind.RegularExpressionLiteral)
        && MARKDOWN_LITERAL.test(node.getText());
}

function inWhileLoop(node, root) {
    for (let p = node.parent; p && p !== root; p = p.parent) {
        if (ts.isWhileStatement(p) || ts.isDoStatement(p)) { return true; }
    }
    return false;
}

/**
 * Facts about one function: does it read a directory, walk down (call itself,
 * pass { recursive: true }, or read directories off a work list in a while
 * loop), test for markdown? readdirNames are module-level helpers that wrap
 * readdir, such as listDir(): calling one is reading a directory.
 */
function facts(root, markdownNames, readdirNames) {
    const self = functionName(root);
    const f = { readdir: false, recurses: false, markdown: false };
    (function visit(node) {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node);
            const wrapped = ts.isIdentifier(node.expression) && readdirNames.has(name) && name !== self;
            if (READDIR.test(name) || wrapped) {
                f.readdir = true;
                if (inWhileLoop(node, root)) { f.recurses = true; }
                for (const arg of node.arguments) {
                    if (ts.isObjectLiteralExpression(arg) && arg.properties.some((p) =>
                        p.name && p.name.getText() === 'recursive' && p.initializer && p.initializer.kind === ts.SyntaxKind.TrueKeyword)) {
                        f.recurses = true;
                    }
                }
            }
            if (self && ts.isIdentifier(node.expression) && node.expression.text === self) { f.recurses = true; }
        }
        if (isMarkdownLiteral(node)) { f.markdown = true; }
        if (ts.isIdentifier(node) && markdownNames.has(node.text)) { f.markdown = true; }
        ts.forEachChild(node, visit);
    })(root);
    return f;
}

/** The functions in one file that walk a tree for markdown, as "rel/path:line name". */
function walkersIn(file) {
    const text = fs.readFileSync(file, 'utf8');
    const kind = /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sf   = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    // Module-level consts and functions that hold a markdown test, followed
    // through one another (isMarkdownDoc uses MARKDOWN) until nothing changes.
    const topLevel = new Map();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) { topLevel.set(st.name.text, st); }
        if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) { topLevel.set(d.name.getText(), d); } }
    }
    const markdownNames = new Set();
    for (let grew = true; grew;) {
        grew = false;
        for (const [name, decl] of topLevel) {
            if (markdownNames.has(name)) { continue; }
            let hit = false;
            (function visit(n) {
                if (hit) { return; }
                if (isMarkdownLiteral(n) || (ts.isIdentifier(n) && n.text !== name && markdownNames.has(n.text))) { hit = true; return; }
                ts.forEachChild(n, visit);
            })(decl);
            if (hit) { markdownNames.add(name); grew = true; }
        }
    }
    // Module-level wrappers that return a readdir result, like docs-sync's
    // listDir(). Only "return readdir(...)" counts: a function that merely
    // reads one directory somewhere (a report list) is not a stand-in for readdir.
    const readdirNames = new Set();
    for (const [name, decl] of topLevel) {
        let hit = false;
        (function visit(n) {
            if (hit) { return; }
            if (ts.isReturnStatement(n) && n.expression && ts.isCallExpression(n.expression)
                && READDIR.test(calleeName(n.expression))) { hit = true; return; }
            ts.forEachChild(n, visit);
        })(decl);
        if (hit) { readdirNames.add(name); }
    }

    const found = [];
    (function visit(node) {
        if (isFunctionLike(node)) {
            // The function and the one enclosing it: a nested walk() often
            // takes its markdown test from its parent.
            let scope = node;
            for (let p = node.parent; p; p = p.parent) { if (isFunctionLike(p)) { scope = p; break; } }
            const own = facts(node, markdownNames, readdirNames);
            const wide = scope === node ? own : facts(scope, markdownNames, readdirNames);
            if (own.readdir && own.recurses && (own.markdown || wide.markdown)) {
                const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                const name = functionName(node) || '(anonymous)';
                found.push(`${path.relative(ROOT, file).split(path.sep).join('/')}:${line} ${name}`);
                return;   // report the outermost walking function once
            }
        }
        ts.forEachChild(node, visit);
    })(sf);
    return found;
}

module.exports = { ROOT, sourceFiles, walkersIn };
