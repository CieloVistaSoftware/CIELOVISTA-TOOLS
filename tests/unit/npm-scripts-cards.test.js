// Deep inspection of the compiled shell and what actually gets sent at runtime
const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label, value, detail) {
    if (value) { console.log(`  PASS: ${label}${detail ? ' — ' + detail : ''}`); pass++; }
    else        { console.log(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}
function info(msg) { console.log(`  INFO: ${msg}`); }

console.log('\n-- NPM Scripts DEEP Diagnostic --\n');

// 1. Extract the actual HTML that gets sent to the webview
const shellJs = require('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\out\\shared\\project-card-shell.js');
const html = shellJs.PROJECT_CARD_SHELL_HTML;

ok('HTML is a non-empty string', typeof html === 'string' && html.length > 100, html.length + ' chars');

// Check the message handler
const hasInitHandler   = html.includes("m.type === 'init'");
const hasRenderCall    = html.includes('render(m.cards');
const hasStatusHandler = html.includes("m.type === 'status'");
const hasReadyMsg      = html.includes("command: 'ready'");
const hasCfgRegistry   = html.includes("m.type === 'cfg-registry'");

ok("HTML has init handler:  m.type === 'init'",  hasInitHandler,   hasInitHandler ? 'YES' : '*** MISSING - this is the bug ***');
ok("HTML calls render(m.cards)",                 hasRenderCall,    hasRenderCall  ? 'YES' : '*** MISSING - init handler does nothing ***');
ok("HTML has status handler",                    hasStatusHandler, hasStatusHandler ? 'YES' : 'missing');
ok("HTML sends ready message",                   hasReadyMsg,      hasReadyMsg ? 'YES' : 'MISSING');
ok("HTML has cfg-registry handler",              hasCfgRegistry,   hasCfgRegistry ? 'YES' : 'MISSING');

// Show the actual message handler section
const msgListenerIdx = html.indexOf("window.addEventListener('message'");
if (msgListenerIdx >= 0) {
    info('Message listener section (first 600 chars):');
    console.log('    ' + html.slice(msgListenerIdx, msgListenerIdx + 600).replace(/\n/g, '\n    '));
} else {
    fail('window.addEventListener(\'message\') not found in HTML');
    fail++;
}

// 2. Check the INSTALLED version
const installedShell = 'C:\\Users\\jwpmi\\.vscode-insiders\\extensions\\cielovistasoftware.cielovista-tools-1.0.0\\out\\shared\\project-card-shell.js';
if (fs.existsSync(installedShell)) {
    const installed = require(installedShell);
    const iHtml = installed.PROJECT_CARD_SHELL_HTML;
    const iHasInit   = iHtml.includes("m.type === 'init'");
    const iHasRender = iHtml.includes('render(m.cards');
    ok("INSTALLED has init handler",  iHasInit,   iHasInit   ? 'YES' : '*** INSTALLED IS STALE — needs rebuild ***');
    ok("INSTALLED calls render(m.cards)", iHasRender, iHasRender ? 'YES' : '*** INSTALLED IS STALE ***');
    if (iHasInit) {
        const iIdx = iHtml.indexOf("window.addEventListener('message'");
        if (iIdx >= 0) {
            info('INSTALLED message listener (first 400 chars):');
            console.log('    ' + iHtml.slice(iIdx, iIdx + 400).replace(/\n/g, '\n    '));
        }
    }
} else {
    ok('Installed shell exists', false, installedShell);
}

// 3. Simulate what sendInit sends and what render would receive
const { buildCardFromPackageDir } = require('C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\out\\shared\\project-card-builder.js');
const registry = JSON.parse(fs.readFileSync('C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json', 'utf8'));

const cards = [];
for (const p of registry.projects) {
    if (!fs.existsSync(p.path)) { continue; }
    const pkgPath = path.join(p.path, 'package.json');
    if (!fs.existsSync(pkgPath)) { continue; }
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const scr = pkg.scripts ?? {};
        if (Object.keys(scr).length > 0) {
            cards.push(buildCardFromPackageDir(path.basename(p.path), p.path, scr, (cards.length + 1) * 100));
        }
    } catch { /* skip */ }
}

ok('cards array has entries', cards.length > 0, cards.length + ' cards');
if (cards.length > 0) {
    const c = cards[0];
    ok('Card[0].name exists',     !!c.name,             c.name);
    ok('Card[0].type exists',     !!c.type,             c.type);
    ok('Card[0].typeIcon exists', !!c.typeIcon,         c.typeIcon);
    ok('Card[0].rootPath exists', !!c.rootPath,         c.rootPath);
    ok('Card[0].dewey exists',    !!c.dewey,            c.dewey);
    ok('Card[0].scripts array',   Array.isArray(c.scripts) && c.scripts.length > 0, c.scripts.length + ' scripts');
    info('Sample init message: ' + JSON.stringify({ type: 'init', title: '📦 NPM Scripts', cards: [{...c, scripts: c.scripts.slice(0,1)}] }).slice(0, 200));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('\n*** ROOT CAUSE FOUND — see FAIL lines above ***'); process.exit(1); }
else          { console.log('\n*** ALL PASS ***'); process.exit(0); }
