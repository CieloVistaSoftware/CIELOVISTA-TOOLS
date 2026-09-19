// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * webview-pages.js — find every page the extension builds, render it from
 * the real out-test/ module, and check its scripts run (#846).
 *
 * A page script written inside a TypeScript template literal is not the
 * script the browser receives: the literal turns \\ into \ and \d into d.
 * That broke the doc preview (#841) and the MCP viewer's path links (#843)
 * for months while tests read the source text. So these helpers look only at
 * the delivered HTML.
 *
 *   discoverPageBuilders()      every function that builds a page, found in src/
 *   loadInternals(file, names)  those functions from the out-test/ build
 *   inlineScripts(html)         the inline scripts a browser would run
 *   checkPage(html, label)      [] when every script compiles and runs in jsdom
 *
 * Discovery reads src/ with the TypeScript parser. A page builder is:
 *   - a function holding a string or template literal with a <script> tag;
 *   - the function a `webview.html = …` assignment calls, directly, through a
 *     `const html = …` in the same function, or through a parameter (the
 *     calls of that function are followed);
 *   - the function holding such an assignment when the page, or a script
 *     handed to a shared page wrapper, is written inline there.
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const Module = require('module');
const ts     = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src');
const OUT  = path.join(ROOT, 'out-test');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full, out); }
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) { out.push(full); }
    }
    return out;
}

const rel = (file) => path.relative(SRC, file).split(path.sep).join('/');
const isTemplate = (n) => ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
const isText = (n) => isTemplate(n) || ts.isStringLiteral(n);

/** The innermost named function around `node`: { name, fn, topLevel }, or undefined. */
function enclosingFunction(node) {
    for (let p = node.parent; p; p = p.parent) {
        let name;
        if (ts.isFunctionDeclaration(p) && p.name) { name = p.name.text; }
        else if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) { name = p.parent.name.text; }
        else if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
            // An anonymous callback (a registerCommand handler): a page built
            // here can only be reached through its command.
            return { name: undefined, fn: p, topLevel: false };
        }
        if (name) {
            const decl = ts.isFunctionDeclaration(p) ? p : p.parent.parent; // VariableDeclarationList
            const stmt = ts.isFunctionDeclaration(p) ? p : decl.parent;     // VariableStatement
            return { name, fn: p, topLevel: Boolean(stmt && stmt.parent && ts.isSourceFile(stmt.parent)) };
        }
    }
    return undefined;
}

/** Top-level functions a file defines, and the names it imports (name -> src-relative module). */
function fileIndex(file, sf) {
    const defs = new Map();
    const imports = new Map();
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name) { defs.set(st.name.text, st); }
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
                    defs.set(d.name.text, d.initializer);
                }
            }
        }
        if (ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
            const spec = st.moduleSpecifier.text;
            if (!spec.startsWith('.')) { continue; }
            let target = path.resolve(path.dirname(file), spec);
            target = fs.existsSync(`${target}.ts`) ? `${target}.ts` : path.join(target, 'index.ts');
            for (const el of st.importClause.namedBindings.elements) {
                imports.set(el.name.text, { file: target, name: (el.propertyName || el.name).text });
            }
        }
    }
    return { defs, imports };
}

let _cache;
/**
 * Every page builder in src/, as [{ id: 'features/x.ts::buildHtml', file,
 * name, topLevel, line, why }]. `name` is undefined for a page built inline
 * in an anonymous callback; `topLevel` is false when the function is nested
 * and the out-test/ module cannot hand it out.
 */
function discoverPageBuilders() {
    if (_cache) { return _cache; }
    const parsed = new Map();
    const parse = (file) => {
        if (!parsed.has(file)) {
            const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            parsed.set(file, { sf, ...fileIndex(file, sf) });
        }
        return parsed.get(file);
    };
    const builders = new Map();
    const add = (file, fnInfo, node, why) => {
        const name = fnInfo && fnInfo.name;
        const { sf } = parse(file);
        const line = sf.getLineAndCharacterOfPosition((fnInfo ? fnInfo.fn : node).getStart()).line + 1;
        const id = `${rel(file)}::${name || `<callback at line ${line}>`}`;
        if (!builders.has(id)) {
            builders.set(id, { id, file: rel(file), name, topLevel: Boolean(fnInfo && fnInfo.topLevel), line, why: [] });
        }
        const b = builders.get(id);
        if (!b.why.includes(why)) { b.why.push(why); }
    };

    /** The function a call names, in this file or the file it is imported from. */
    const calleeTarget = (file, call) => {
        if (!ts.isIdentifier(call.expression)) { return undefined; }
        const n = call.expression.text;
        const { defs, imports } = parse(file);
        if (defs.has(n)) { return { file, name: n }; }
        if (imports.has(n)) {
            const imp = imports.get(n);
            if (fs.existsSync(imp.file) && parse(imp.file).defs.has(imp.name)) { return imp; }
        }
        return undefined;
    };
    const holdsTemplate = (node) => {
        let found = false;
        (function v(n) { if (found) { return; } if (isTemplate(n)) { found = true; return; } ts.forEachChild(n, v); })(node);
        return found;
    };

    /** Resolve the value set as a page, recording the builder behind it. */
    const resolve = (file, expr, site, depth = 0) => {
        if (depth > 4) { return; }
        while (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) { expr = expr.expression; }
        const where = enclosingFunction(site);
        if (ts.isCallExpression(expr)) {
            const target = calleeTarget(file, expr);
            if (target && !expr.arguments.some(holdsTemplate)) {
                const { defs } = parse(target.file);
                const def = defs.get(target.name);
                add(target.file, { name: target.name, fn: def, topLevel: true }, def, 'webview.html');
                return;
            }
            // A wrapper handed a page or script written right here.
            add(file, where, site, 'webview.html (inline)');
            return;
        }
        if (isText(expr)) { add(file, where, site, 'webview.html (inline)'); return; }
        if (ts.isIdentifier(expr) && where) {
            const n = expr.text;
            // const html = …; in the same function
            let init;
            (function v(node) {
                if (init) { return; }
                if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === n && node.initializer) { init = node.initializer; return; }
                ts.forEachChild(node, v);
            })(where.fn);
            if (init) { resolve(file, init, init, depth + 1); return; }
            // a parameter: follow the calls of this function in the file
            const idx = where.fn.parameters.findIndex(p => ts.isIdentifier(p.name) && p.name.text === n);
            if (idx >= 0 && where.name) {
                const { sf } = parse(file);
                let calls = 0;
                (function v(node) {
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === where.name && node.arguments[idx]) {
                        calls++;
                        resolve(file, node.arguments[idx], node, depth + 1);
                    }
                    ts.forEachChild(node, v);
                })(sf);
                if (calls) { return; }
            }
        }
        add(file, where, site, 'webview.html (unresolved)');
    };

    for (const file of walk(SRC)) {
        const { sf } = parse(file);
        (function visit(n) {
            if (isText(n) && /<script\b/i.test(n.getText())) { add(file, enclosingFunction(n), n, '<script>'); }
            if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken
                && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'html'
                && /(^|\.)webview$/.test(n.left.expression.getText().replace(/!/g, ''))) {
                resolve(file, n.right, n);
            }
            ts.forEachChild(n, visit);
        })(sf);
    }
    _cache = [...builders.values()].sort((a, b) => a.id.localeCompare(b.id));
    return _cache;
}

/**
 * The named top-level functions of a src module, taken from its out-test/
 * build. The build is compiled as the module itself, with one line added at
 * the end that hands out the functions it does not export, so a test runs the
 * real code and not a copy. `vscode` is whatever require('vscode') returns
 * (install a harness first).
 */
function loadInternals(srcRel, names) {
    const outFile = path.join(OUT, srcRel.replace(/\.ts$/, '.js'));
    if (!fs.existsSync(outFile)) { throw new Error(`${outFile} is not built: run node scripts/build-test-modules.mjs`); }
    return compileInternals(fs.readFileSync(outFile, 'utf8'), outFile, names);
}

/**
 * loadInternals() for built code held in memory, compiled as if it were
 * `outFile` so its relative requires resolve (the REG-186 self-check builds
 * an old page this way, without writing into out-test/).
 */
function compileInternals(code, outFile, names) {
    const expose = names.map(n => `${JSON.stringify(n)}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ');
    const m = new Module(outFile, module);
    m.filename = outFile;
    m.paths = Module._nodeModulePaths(path.dirname(outFile));
    m._compile(`${code}\n;module.exports.__pages846 = { ${expose} };\n`, outFile);
    const out = m.exports.__pages846;
    for (const n of names) {
        if (typeof out[n] !== 'function') { throw new Error(`${path.relative(OUT, outFile)} has no top-level function ${n} in its build`); }
    }
    return Object.assign(out, { exports: m.exports });
}

/** Inline scripts in `html` a browser runs: [{ index, code }]. */
function inlineScripts(html) {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m, i = 0;
    while ((m = re.exec(html))) {
        const attrs = m[1];
        const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
        if (/\bsrc\s*=/.test(attrs)) { i++; continue; }
        if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) { i++; continue; }
        out.push({ index: i++, code: m[2] });
    }
    return out;
}

/**
 * Problems with the page's scripts: each inline script compiles as
 * vm.Script, and the page loads in jsdom, scripts running, with
 * acquireVsCodeApi stubbed, without one throwing. [] when all is well.
 */
async function checkPage(html, label = 'page') {
    const problems = [];
    for (const s of inlineScripts(html)) {
        try { new vm.Script(s.code, { filename: `${label} <script> #${s.index}` }); }
        catch (e) { problems.push(`script #${s.index} does not compile: ${e.message}`); }
    }
    if (problems.length) { return problems; }
    const { JSDOM, VirtualConsole } = require('jsdom');
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push((e.cause && e.cause.message) || e.message));
    const noop = () => undefined;
    const posted = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://webview.harness/',
        beforeParse(w) {
            w.acquireVsCodeApi = () => ({ postMessage: (m) => { posted.push(m); }, getState: () => undefined, setState: noop });
            w.scrollTo = noop;
            w.HTMLElement.prototype.scrollIntoView = noop;
            // Served pages fetch from their server; nothing answers here.
            w.fetch = () => new Promise(noop);
        },
    });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    dom.window.close();
    for (const e of errors) { problems.push(`a script throws while the page loads: ${e}`); }
    return problems;
}

// ── Source rule: no backslash escapes in template-literal page scripts ─────

/**
 * A backslash the template literal rewrites before the page sees it. Allowed:
 * a lone \uXXXX (it becomes that character, which means the same inside a JS
 * string), and the \` and \$ a template needs to hold a backtick or ${.
 * Everything else, a doubled \\ included, is code whose meaning depends on
 * counting backslashes through two languages (#841, #843).
 */
const ESCAPE = /(?<!\\)\\(?!u[0-9a-fA-F]{4}|[`$\\])|\\\\/;

/** `raw` with each ${…} substitution blanked (newlines kept, so offsets and lines hold). */
function blankSubstitutions(node, raw) {
    if (!ts.isTemplateExpression(node)) { return raw; }
    const start = node.getStart();
    let out = raw;
    for (const span of node.templateSpans) {
        const a = span.expression.getFullStart() - start;
        const b = span.expression.getEnd() - start;
        out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, ' ') + out.slice(b);
    }
    return out;
}

/**
 * The page-script parts of a template literal, as [{ offset, code }]: the
 * text between <script> and </script>, or all of it when the template is the
 * value of a script:/scripts:/js: option handed to a page wrapper.
 */
function scriptRegions(node, text) {
    const p = node.parent;
    if (p && ts.isPropertyAssignment(p) && /^(script|scripts|js)$/.test(p.name.getText())) { return [{ offset: 0, code: text }]; }
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)(?:<\/script|$)/gi;
    let m;
    while ((m = re.exec(text))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        if (/\bsrc\s*=/.test(m[1])) { continue; }
        out.push({ offset: m.index + m[0].indexOf('>') + 1, code: m[2] });
    }
    return out;
}

/**
 * Lines of page script, inside plain (untagged) template literals in one
 * TypeScript file, that hold a backslash escape: ['file:line: code', …].
 * A String.raw template is exempt: what is written there is what the page
 * gets.
 */
function templateScriptEscapes(label, text) {
    const hits = [];
    const sf = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true);
    (function visit(n) {
        if (ts.isTaggedTemplateExpression(n)) { ts.forEachChild(n.template, c => ts.forEachChild(c, visit)); return; }
        if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
            const own = blankSubstitutions(n, n.getText());
            for (const { offset, code } of scriptRegions(n, own)) {
                code.split('\n').forEach((l, i) => {
                    if (!ESCAPE.test(l)) { return; }
                    const line = sf.getLineAndCharacterOfPosition(n.getStart() + offset).line + 1 + i;
                    hits.push(`${label}:${line}: ${l.trim().slice(0, 100)}`);
                });
            }
        }
        ts.forEachChild(n, visit);
    })(sf);
    return hits;
}

/** templateScriptEscapes() over every .ts file in src/. */
function srcTemplateScriptEscapes() {
    return walk(SRC).flatMap(f => templateScriptEscapes(rel(f), fs.readFileSync(f, 'utf8')));
}

module.exports = {
    discoverPageBuilders, loadInternals, compileInternals, inlineScripts, checkPage,
    templateScriptEscapes, srcTemplateScriptEscapes, SRC, OUT, ROOT,
};
