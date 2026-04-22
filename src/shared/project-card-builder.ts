// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * project-card-builder.ts
 *
 * Builds ProjectCardData[] from either:
 *   - A ProjectInfo[] (Doc Catalog)
 *   - NpmScriptEntry[] grouped by folder (NPM Scripts panel)
 *
 * Zero HTML. Pure data transformation.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { ProjectCardData, ScriptEntry, ScriptDoc } from './project-card-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
    'vscode-extension':  '\u{1F4E6}',
    'component-library': '\u{1F3A8}',
    'dotnet-service':    '\u2699\uFE0F',
    'app':               '\u{1F680}',
    'library':           '\u{1F4DA}',
    'tool':              '\u{1F527}',
    'other':             '\u{1F4C1}',
};

const PROMINENT = ['start', 'build', 'rebuild', 'test', 'watch', 'tray', 'tray:rebuild', 'service'];

// ─── Script doc synthesis ─────────────────────────────────────────────────────

const KNOWN_DOCS: Record<string, Omit<ScriptDoc, 'docFile' | 'where' | 'sourceLabel'>> = {
    'build':           { what:'Compiles TypeScript source to JavaScript.',        when:'Before testing, packaging, or deploying.',      how:'tsc -p ./',                              why:'Produces runnable JS from TS source.' },
    'rebuild':         { what:'Full pipeline: test, compile, package, install.',  when:'After any code change to ship a new version.',  how:'catalog \u2192 regression \u2192 compile \u2192 install', why:'One command guarantees a clean, tested, live build.' },
    'compile':         { what:'TypeScript compile only, no install.',             when:'Quick syntax check during development.',         how:'tsc -p ./',                              why:'Fast feedback without full rebuild overhead.' },
    'watch':           { what:'Watches source files and recompiles on save.',     when:'Active development session.',                   how:'tsc --watch -p ./',                      why:'Instant feedback on every file save.' },
    'test':            { what:'Runs the full test suite.',                        when:'Before committing or shipping.',                 how:'Playwright or node test runner.',        why:'Catches regressions before they reach production.' },
    'test:headed':     { what:'Playwright tests in a visible browser.',           when:'Debugging a failing UI test.',                  how:'playwright test --headed',               why:'See exactly what the browser renders.' },
    'test:catalog':    { what:'Validates catalog integrity.',                     when:'After adding or changing catalog entries.',      how:'node tests/catalog-integrity.test.js',   why:'Ensures every command is registered once.' },
    'test:regression': { what:'Runs all regression guard tests.',                 when:'Before every build.',                           how:'node scripts/run-regression-tests.js',   why:'Prevents known breakage from re-entering the codebase.' },
    'start':           { what:'Starts the application or dev server.',            when:'Beginning a development session.',              how:'npm run rebuild (alias).',               why:'Convenience alias for the primary entry point.' },
    'package':         { what:'Packages the extension into a .vsix file.',        when:'Before distribution or manual install.',         how:'vsce package',                           why:'Creates the installable artifact.' },
    'tray':            { what:'Launches the app in system tray mode.',            when:'Running as a background tray process.',          how:'Node tray entry point.',                 why:'Keeps the app accessible without a main window.' },
    'tray:rebuild':    { what:'Rebuilds and relaunches the tray process.',        when:'After code changes to the tray app.',           how:'Runs build then restarts tray.',         why:'Ensures the tray is running the latest code.' },
    'service':         { what:'Starts the app as a background Windows service.',  when:'Production deployment.',                        how:'Windows service entry point.',           why:'Runs persistently without a logged-in user session.' },
    'mcp:build':       { what:'Compiles the MCP server sub-project.',            when:'After changes to mcp-server source.',           how:'cd mcp-server && npm run build',         why:'MCP server must be compiled before Claude can connect.' },
    'mcp:start':       { what:'Starts the MCP server for Claude Desktop.',       when:'Starting a Claude development session.',         how:'node mcp-server/dist/index.js',          why:'Exposes file system and tool APIs to Claude.' },
    'mcp:dev':         { what:'MCP server in watch/dev mode.',                   when:'Actively developing MCP tools.',                how:'cd mcp-server && tsc --watch',           why:'Recompiles MCP server on every save.' },
};

function synthesizeDoc(cmd: string): Omit<ScriptDoc, 'docFile' | 'where' | 'sourceLabel'> {
    const v = cmd.toLowerCase();
    if (v.includes('tsc'))                                                        { return { what:'Compiles TypeScript source.', when:'Before running.', how:cmd, why:'Produces JavaScript from TypeScript.' }; }
    if (v.includes('jest')||v.includes('playwright')||v.includes('mocha'))       { return { what:'Runs the test suite.',        when:'Before committing.',how:cmd, why:'Catches regressions.' }; }
    if (v.includes('webpack')||v.includes('rollup')||v.includes('esbuild'))      { return { what:'Bundles source files.',       when:'Before deployment.',how:cmd, why:'Creates optimised output bundles.' }; }
    if (v.includes('eslint')||v.includes('tslint'))                               { return { what:'Lints the source code.',      when:'Before committing.',how:cmd, why:'Enforces code style.' }; }
    if (v.includes('dotnet'))                                                     { return { what:'Runs a .NET CLI command.',    when:'Building .NET.',    how:cmd, why:'Compiles or launches .NET code.' }; }
    if (v.includes('node '))                                                      { return { what:'Runs a Node.js script.',      when:'On demand.',        how:cmd, why:'Executes a standalone script.' }; }
    const disp = cmd.length > 80 ? cmd.slice(0, 77) + '\u2026' : cmd;
    return { what:`Runs: ${disp}`, when:'On demand.', how:cmd, why:'Custom script.' };
}

function formatDocSourceLabel(docPath: string, projectPath: string): string {
    const relPath = path.relative(projectPath, docPath).replace(/\\/g, '/');
    return `\uD83D\uDCC4 ${relPath || path.basename(docPath)}`;
}

function loadScriptDoc(scriptName: string, scriptCmd: string, projectPath: string): ScriptDoc {
    const candidates = [
        path.join(projectPath, 'docs', 'scripts', `${scriptName}.md`),
        path.join(projectPath, 'docs', `${scriptName}.md`),
        path.join(projectPath, '.vscode', 'scripts', `${scriptName}.md`),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                const txt = fs.readFileSync(p, 'utf8');
                const what = txt.split('\n').filter(l => l.trim() && !l.startsWith('#'))[0]?.trim() ?? scriptName;
                const whenM = txt.match(/^#{1,3}\s+when[^\n]*\n([\s\S]*?)(?=^#{1,3}|\s*$)/im);
                const howM  = txt.match(/^#{1,3}\s+how[^\n]*\n([\s\S]*?)(?=^#{1,3}|\s*$)/im);
                const whyM  = txt.match(/^#{1,3}\s+why[^\n]*\n([\s\S]*?)(?=^#{1,3}|\s*$)/im);
                return {
                    what,
                    where: projectPath,
                    docFile: true,
                    sourceLabel: formatDocSourceLabel(p, projectPath),
                    when: whenM?.[1]?.trim().slice(0, 150) ?? 'On demand.',
                    how:  howM?.[1]?.trim().slice(0, 150)  ?? scriptCmd,
                    why:  whyM?.[1]?.trim().slice(0, 150)  ?? 'See doc file.',
                };
            } catch { /* fall through */ }
        }
    }
    const known = KNOWN_DOCS[scriptName.toLowerCase()];
    if (known) {
        return { ...known, where: projectPath, docFile: false, sourceLabel: '\u26A1 Synthesized' };
    }
    return { ...synthesizeDoc(scriptCmd), where: projectPath, docFile: false, sourceLabel: '\u26A1 Synthesized' };
}

// ─── Test detection ───────────────────────────────────────────────────────────

function hasRealTests(rootPath: string): boolean {
    const testsDir = path.join(rootPath, 'tests');
    if (!fs.existsSync(testsDir)) { return false; }
    try {
        return fs.readdirSync(testsDir)
            .filter(f => /\.(spec|test)\.(ts|js)$/.test(f))
            .some(f => {
                const src = fs.readFileSync(path.join(testsDir, f), 'utf8');
                return /\btest\s*\(/.test(src) && !src.includes('placeholder test');
            });
    } catch { return false; }
}

// ─── Public builders ─────────────────────────────────────────────────────────

/**
 * Build card data from a ProjectInfo (used by Doc Catalog).
 */
export function buildCardFromProjectInfo(
    name: string,
    type: string,
    description: string,
    rootPath: string,
    scripts: Record<string, string>,
    deweyNum: number,
    hasDotnet: boolean
): ProjectCardData {
    const deweyLabel = deweyNum.toString().padStart(3, '0');
    const allScripts = Object.keys(scripts);
    const prominent  = PROMINENT.filter(s => scripts[s]);
    const others     = allScripts.filter(s => !PROMINENT.includes(s)).slice(0, 6);
    const ordered    = [...prominent, ...others];

    const scriptEntries: ScriptEntry[] = ordered.map((s, i) => ({
        name:    s,
        command: scripts[s],
        dewey:   `${deweyLabel}.${String(i + 1).padStart(3, '0')}`,
        primary: s === 'start' || s === 'rebuild',
        doc:     loadScriptDoc(s, scripts[s], rootPath),
    }));

    if (hasDotnet && allScripts.length === 0) {
        scriptEntries.push({
            name: 'dotnet:build', command: 'dotnet build',
            dewey: `${deweyLabel}.001`, primary: true,
            doc: { what:'Compiles the .NET project.', when:'Before running or publishing.', where: rootPath, how:'dotnet build', why:'Produces compiled binaries.', docFile: false, sourceLabel: '\u26A1 Synthesized' },
        });
    }

    const hasTest    = allScripts.includes('test');
    const claudePath = path.join(rootPath, 'CLAUDE.md');

    return {
        dewey:        deweyLabel,
        name,
        type,
        typeIcon:     TYPE_ICONS[type] ?? '\u{1F4C1}',
        description:  description || 'No description.',
        rootPath,
        scripts:      scriptEntries,
        needsTests:   !hasTest || !hasRealTests(rootPath),
        claudeMdPath: fs.existsSync(claudePath) ? claudePath : null,
    };
}

/**
 * Build card data from raw package.json scripts (used by NPM Scripts panel).
 */
export function buildCardFromPackageDir(
    folderName: string,
    packageDir: string,
    scripts: Record<string, string>,
    deweyBase: number
): ProjectCardData {
    const deweyLabel = deweyBase.toString().padStart(3, '0');
    const allScripts = Object.keys(scripts);
    const prominent  = PROMINENT.filter(s => scripts[s]);
    const others     = allScripts.filter(s => !PROMINENT.includes(s));
    const ordered    = [...prominent, ...others];

    // Detect type from package.json
    let type = 'app';
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
        type = pkg.engines?.vscode ? 'vscode-extension' : 'app';
    } catch { /* keep 'app' */ }

    const scriptEntries: ScriptEntry[] = ordered.map((s, i) => ({
        name:    s,
        command: scripts[s],
        dewey:   `${deweyLabel}.${String(i + 1).padStart(3, '0')}`,
        primary: s === 'start' || s === 'rebuild',
        doc:     loadScriptDoc(s, scripts[s], packageDir),
    }));

    const claudePath = path.join(packageDir, 'CLAUDE.md');

    return {
        dewey:        deweyLabel,
        name:         folderName,
        type,
        typeIcon:     TYPE_ICONS[type] ?? '\u{1F4C1}',
        description:  '',
        rootPath:     packageDir,
        scripts:      scriptEntries,
        needsTests:   false,
        claudeMdPath: fs.existsSync(claudePath) ? claudePath : null,
    };
}
