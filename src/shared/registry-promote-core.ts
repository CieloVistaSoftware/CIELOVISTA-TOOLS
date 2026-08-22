// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * registry-promote-core.ts
 *
 * The promotion logic behind BOTH `cvs.registry.promote` (the VS Code command)
 * and the `registry_promote` MCP tool. One authored file, two consumers.
 *
 * #696 -- John: "cvt does have a mcp". It does, and it could only READ the
 * registry: list_projects, find_project, project_status and the dewey tools are
 * all read-only, so an agent could see every project and register none.
 *
 * WHY THIS FILE IMPORTS NOTHING BUT NODE BUILTINS
 *
 * The extension and mcp-server are separate TypeScript programs and BOTH pin
 * `rootDir` to their own `src`, so neither can import across the boundary --
 * tsc rejects it with TS6059 even though esbuild would happily bundle it.
 * Widening either root is not free: mcp-server's `dist/index.js` entry is named
 * by its package.json main+bin, by mcp-server-status.ts and by the packaging
 * tests, and relocating it breaks all of them.
 *
 * So this file is authored HERE (src/shared/ is the documented home for shared
 * logic) and copied verbatim into mcp-server/src/shared/ by
 * scripts/sync-mcp-shared.js. Copying only works if the file is dependency-free
 * -- an import of ../shared/registry would not resolve on the other side --
 * hence the self-contained REGISTRY_PATH and registry I/O below.
 *
 * `npm run sync:mcp-shared -- --check` fails when the copy has drifted, so the
 * two cannot silently diverge the way a hand-copied pair would.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Canonical registry location.
 *
 * Recomputed rather than imported, for the reason in the header. It matches
 * shared/registry.ts and mcp-server/src/tools/catalog-helpers.ts, both of which
 * already derive it exactly this way.
 */
export const REGISTRY_PATH: string = path.join(
    os.homedir(), 'Downloads', 'CieloVistaStandards', 'project-registry.json',
);

const GLOBAL_DOCS_DIR: string = path.join(os.homedir(), 'Downloads', 'CieloVistaStandards');

export const PROJECT_TYPES: readonly string[] = [
    'vscode-extension',
    'dotnet-service',
    'component-library',
    'website',
    'app',
    'library',
    'other',
];

export interface CoreProjectEntry {
    name:        string;
    path:        string;
    type:        string;
    description: string;
    status?:     'product' | 'workbench' | 'generated' | 'archived';
    dewey?:      number;
    githubUrl?:  string;
}

export interface CoreRegistry {
    projects: CoreProjectEntry[];
    [key: string]: unknown;
}

export interface PromoteResult {
    ok:                boolean;
    registryEntry:     CoreProjectEntry;
    claudeWritten:     boolean;
    readmeWritten:     boolean;
    alreadyInRegistry: boolean;
    message:           string;
}

/** Builds a minimal CLAUDE.md tailored to the new project. */
export function buildClaudeMd(projectName: string, projectPath: string): string {
    return [
        '# CLAUDE.md — ' + projectName,
        '',
        '## Session Start',
        '',
        '1. Read this file',
        '2. Read docs/_today/CURRENT-STATUS.md if it exists',
        '3. Start working — no questions',
        '',
        '## Project',
        '',
        '**Name:** ' + projectName,
        '**Location:** ' + projectPath,
        '**Status:** product',
        '',
        '## Build',
        '',
        '```powershell',
        '# TODO: add build command',
        '```',
        '',
        '## Global Standards',
        '',
        'These apply to ALL CieloVista projects:',
        '',
        '| Document | Location |',
        '|---|---|',
        '| Copilot Rules | `' + path.join(GLOBAL_DOCS_DIR, 'copilot-rules.md') + '` |',
        '| JavaScript Standards | `' + path.join(GLOBAL_DOCS_DIR, 'javascript_standards.md') + '` |',
        '| Git Workflow | `' + path.join(GLOBAL_DOCS_DIR, 'git_workflow.md') + '` |',
        '| Project Registry | `' + REGISTRY_PATH + '` |',
        '',
    ].join('\n');
}

/** Builds a minimal README.md tailored to the new project. */
export function buildReadmeMd(projectName: string, type: string, description: string): string {
    const desc: string = description.trim() || '_Short description pending._';
    return [
        '# ' + projectName,
        '',
        desc,
        '',
        '## Type',
        '',
        '`' + type + '`',
        '',
        '## Status',
        '',
        'Product — registered in the CieloVista project registry.',
        '',
        '## Getting Started',
        '',
        '_TODO: describe install / build / run._',
        '',
        '## License',
        '',
        'Copyright (c) 2026 CieloVista Software. All rights reserved.',
        '',
    ].join('\n');
}

function readRegistry(): CoreRegistry | undefined {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) { return undefined; }
        const raw: string = fs.readFileSync(REGISTRY_PATH, 'utf8');
        const parsed: CoreRegistry = JSON.parse(raw) as CoreRegistry;
        if (!Array.isArray(parsed.projects)) { return undefined; }
        // Backfill missing status, matching loadRegistry()'s existing
        // backward-compatibility rule rather than inventing a second one.
        for (const p of parsed.projects) { if (!p.status) { p.status = 'product'; } }
        return parsed;
    } catch {
        return undefined;
    }
}

function writeRegistry(registry: CoreRegistry): void {
    // Serialise fully BEFORE opening the file for writing. Opening first and
    // reading after is what truncated wb-starter's package.json to zero bytes
    // across four releases.
    const text: string = JSON.stringify(registry, null, 2) + '\n';
    fs.writeFileSync(REGISTRY_PATH, text, 'utf8');
}

/**
 * Register a folder as a CieloVista product.
 *
 * Idempotent by design: a second call on the same folder reports
 * alreadyInRegistry and writes nothing. Matching is by name OR path,
 * case-insensitively, so re-registering under different capitalisation cannot
 * append a duplicate.
 */
export function promote(
    folderPath:  string,
    name:        string,
    type:        string,
    description: string,
): PromoteResult {
    const fallbackEntry: CoreProjectEntry = {
        name, path: folderPath, type, description, status: 'product',
    };

    const registry: CoreRegistry | undefined = readRegistry();
    if (!registry) {
        return {
            ok: false, claudeWritten: false, readmeWritten: false,
            alreadyInRegistry: false, registryEntry: fallbackEntry,
            message: 'Could not load registry at ' + REGISTRY_PATH + '.',
        };
    }

    // The VS Code command cannot reach this -- its folder comes from a
    // right-click on something that exists. An MCP caller passes a string, so
    // without the check a typo would register a project that is not there,
    // scaffold nothing, and report success anyway.
    if (!fs.existsSync(folderPath)) {
        return {
            ok: false, claudeWritten: false, readmeWritten: false,
            alreadyInRegistry: false, registryEntry: fallbackEntry,
            message: 'Folder does not exist: ' + folderPath,
        };
    }

    const existing: CoreProjectEntry | undefined = registry.projects.find(
        (p: CoreProjectEntry) =>
            p.name.toLowerCase() === name.toLowerCase()
            || p.path.toLowerCase() === folderPath.toLowerCase(),
    );
    const alreadyInRegistry: boolean = !!existing;
    const entry: CoreProjectEntry = existing ?? fallbackEntry;

    if (!existing) {
        registry.projects.push(entry);
        writeRegistry(registry);
    } else if (existing.status !== 'product') {
        /* Promote an existing entry that was workbench/generated/archived. */
        existing.status = 'product';
        writeRegistry(registry);
    }

    const claudePath: string = path.join(folderPath, 'CLAUDE.md');
    const readmePath: string = path.join(folderPath, 'README.md');

    let claudeWritten: boolean = false;
    if (!fs.existsSync(claudePath)) {
        fs.writeFileSync(claudePath, buildClaudeMd(name, folderPath), 'utf8');
        claudeWritten = true;
    }

    let readmeWritten: boolean = false;
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, buildReadmeMd(name, type, description), 'utf8');
        readmeWritten = true;
    }

    const bits: string[] = [];
    bits.push(alreadyInRegistry
        ? 'Updated "' + name + '" to status=product'
        : 'Registered "' + name + '" as product');
    if (claudeWritten) { bits.push('created CLAUDE.md'); }
    if (readmeWritten) { bits.push('created README.md'); }
    if (!claudeWritten && !readmeWritten) { bits.push('CLAUDE.md and README.md already present'); }

    return {
        ok: true, registryEntry: entry, claudeWritten, readmeWritten,
        alreadyInRegistry, message: bits.join('; ') + '.',
    };
}
