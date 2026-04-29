/**
 * REG-017-launcher-filter.test.js
 *
 * Regression test for issue #65 — Launcher advertises unregistered audit
 * and marketplace commands.
 *
 * The user-visible fix for #65 is a runtime filter inside the launcher: at
 * render time, the catalog is filtered against the live set of commands
 * registered with VS Code so dead entries never appear as clickable cards.
 * That mirrors what the home page already does for its quick-launch grid.
 *
 * The companion REG-004 test enforces the source-level rule (every catalog
 * ID must have a registerCommand call). REG-017 is the complement: it
 * locks the runtime filter in place so a future refactor cannot silently
 * strip it and reintroduce the dead-button regression.
 *
 * The test is static-source — it asserts that the structural patterns
 * required by the fix are present in cvs-command-launcher/index.ts and
 * cvs-command-launcher/html.ts. Driving the launcher webview end-to-end
 * would require launching VS Code; the static check is fast and catches
 * exactly the kind of refactor accident we want to prevent.
 *
 * Spawned via REG-017 inside scripts/run-regression-tests.js. Exits 0 on
 * pass, 1 on any failure.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..', '..');
const INDEX_TS  = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts');
const HTML_TS   = path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'html.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

for (const p of [INDEX_TS, HTML_TS]) {
    if (!fs.existsSync(p)) {
        console.error('FATAL: required source file missing: ' + p);
        process.exit(1);
    }
}
const indexSrc = fs.readFileSync(INDEX_TS, 'utf8');
const htmlSrc  = fs.readFileSync(HTML_TS,  'utf8');

// ─── Check 1: getRegisteredCommandSet helper exists in index.ts ───────────

(function checkHelperExists() {
    if (!/function\s+getRegisteredCommandSet\s*\(\s*\)/.test(indexSrc)) {
        fail('getRegisteredCommandSet() helper missing from cvs-command-launcher/index.ts — the launcher cannot get the live registered-commands list');
        return;
    }
    if (!/vscode\.commands\.getCommands\s*\(\s*false\s*\)/.test(indexSrc)) {
        fail('getRegisteredCommandSet() must call vscode.commands.getCommands(false) — the false flag is required so disabled commands are excluded');
        return;
    }
    if (!/new\s+Set\s*\(/.test(indexSrc.slice(indexSrc.indexOf('getRegisteredCommandSet')))) {
        fail('getRegisteredCommandSet() must return a Set so the html.ts side can do O(1) lookups');
        return;
    }
    ok('getRegisteredCommandSet() helper present and uses vscode.commands.getCommands(false) returning a Set');
})();

// ─── Check 2: all three call sites pass the registered set ────────────────

(function checkAllCallSitesPassRegisteredSet() {
    const callSites = [
        { name: 'showLauncherPanel',     anchor: 'async function showLauncherPanel(' },
        { name: 'refreshLauncherPanel',  anchor: 'async function refreshLauncherPanel(' },
        { name: 'deserializeWebviewPanel', anchor: 'deserializeWebviewPanel(' },
    ];
    for (const site of callSites) {
        const idx = indexSrc.indexOf(site.anchor);
        if (idx < 0) {
            fail(`${site.name}: anchor "${site.anchor}" not found in index.ts`);
            continue;
        }
        // Slice forward until the next top-level `function` or end of file
        const rest = indexSrc.slice(idx);
        const nextFn = rest.indexOf('\nfunction ', 1);
        const nextAsync = rest.indexOf('\nasync function ', 1);
        const slice = rest.slice(0, Math.min(
            nextFn  > 0 ? nextFn  : rest.length,
            nextAsync > 0 ? nextAsync : rest.length,
            5000
        ));
        if (!slice.includes('buildLauncherHtml(')) {
            fail(`${site.name}: does not call buildLauncherHtml — cannot verify it passes the registered set`);
            continue;
        }
        if (!/getRegisteredCommandSet\s*\(\s*\)/.test(slice)) {
            fail(`${site.name}: does not pass await getRegisteredCommandSet() to buildLauncherHtml — stale catalog will be rendered with dead entries`);
            continue;
        }
        ok(`${site.name}: passes await getRegisteredCommandSet() to buildLauncherHtml`);
    }
})();

// ─── Check 3: buildLauncherHtml signature accepts registeredCommands ──────

(function checkSignatureAcceptsRegisteredSet() {
    // The signature spans multiple lines. Capture from "export function buildLauncherHtml(" up to the closing "): string {".
    const sigStart = htmlSrc.indexOf('export function buildLauncherHtml(');
    if (sigStart < 0) { fail('buildLauncherHtml export not found in html.ts'); return; }
    const sigEnd = htmlSrc.indexOf('): string {', sigStart);
    if (sigEnd < 0) { fail('buildLauncherHtml signature is malformed — closing "): string {" not found'); return; }
    const signature = htmlSrc.slice(sigStart, sigEnd);
    if (!/registeredCommands\s*\?\s*:\s*Set\s*<\s*string\s*>/.test(signature)) {
        fail('buildLauncherHtml signature is missing the optional "registeredCommands?: Set<string>" parameter — the runtime filter cannot be applied');
        return;
    }
    ok('buildLauncherHtml signature includes the "registeredCommands?: Set<string>" parameter');
})();

// ─── Check 4: catalog is filtered into visibleCatalog before rendering ────

(function checkCatalogIsFiltered() {
    // The body of buildLauncherHtml must contain the filter line and use
    // the result (visibleCatalog) for ALL downstream catalog consumers
    // (byGroup, groupSections, groupBtns, topicCheckboxes, catalogJson, total).
    if (!/const\s+visibleCatalog\s*=\s*registeredCommands\s*\?\s*CATALOG\.filter/.test(htmlSrc)) {
        fail('buildLauncherHtml does not produce visibleCatalog from CATALOG.filter(...) — runtime filter is missing');
        return;
    }
    if (!/registeredCommands\.has\s*\(\s*c\.id\s*\)/.test(htmlSrc)) {
        fail('visibleCatalog filter does not check registeredCommands.has(c.id) — wrong filter predicate');
        return;
    }

    // None of the rendering pipeline may reference raw CATALOG. Anything
    // that should iterate the runtime-visible commands must use
    // visibleCatalog. Check the known consumer sites.
    const consumers = [
        { name: 'byGroup loop',         pattern: /for\s*\(\s*const\s+cmd\s+of\s+(visibleCatalog|CATALOG)\s*\)/ },
        { name: 'visibleGroups',        pattern: /visibleGroups\s*=\s*\[[^\]]*new\s+Set\s*\(\s*(visibleCatalog|CATALOG)\.map/ },
        { name: 'visibleTags',          pattern: /visibleTags\s*=\s*\[[^\]]*new\s+Set\s*\(\s*(visibleCatalog|CATALOG)\.flatMap/ },
        { name: 'testCmds filter',      pattern: /testCmds\s*=\s*(visibleCatalog|CATALOG)\.filter/ },
        { name: 'catalogJson stringify', pattern: /catalogJson\s*=\s*JSON\.stringify\(\s*(visibleCatalog|CATALOG)\s*\)/ },
        { name: 'total length',         pattern: /total\s*=\s*(visibleCatalog|CATALOG)\.length/ },
    ];
    let anyBroken = false;
    for (const consumer of consumers) {
        const m = consumer.pattern.exec(htmlSrc);
        if (!m) {
            fail(`${consumer.name}: pattern not found — refactor may have moved or removed it`);
            anyBroken = true;
            continue;
        }
        if (m[1] !== 'visibleCatalog') {
            fail(`${consumer.name}: uses raw CATALOG instead of visibleCatalog — runtime filter is bypassed`);
            anyBroken = true;
        }
    }
    if (!anyBroken) {
        ok('all rendering consumers (byGroup, visibleGroups, visibleTags, testCmds, catalogJson, total) use visibleCatalog');
    }
})();

// ─── Check 5: undefined registeredCommands falls back to full CATALOG ─────

(function checkFallbackForUndefined() {
    // When called without registeredCommands (e.g. legacy callers, or a
    // race during deserialization), the launcher should render the full
    // catalog rather than nothing — empty UI is worse than stale entries.
    if (!/registeredCommands\s*\?\s*CATALOG\.filter\([^)]+\)\s*:\s*CATALOG/.test(htmlSrc)) {
        fail('buildLauncherHtml does not fall back to full CATALOG when registeredCommands is undefined — empty launcher possible');
        return;
    }
    ok('fallback to full CATALOG when registeredCommands is undefined is preserved');
})();

// ─── Result ───────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('REG-017 PASSED — launcher filter for unregistered commands is in source');
    process.exit(0);
} else {
    console.error('REG-017 FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
