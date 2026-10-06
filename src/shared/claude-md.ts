// Copyright (c) 2025 CieloVista Software. All rights reserved.
// The one answer to "does this project have a CLAUDE.md?" (#862). Claude Code
// reads a project's instructions from CLAUDE.md at the root or from
// .claude/CLAUDE.md, so every check that reports a project as missing one goes
// through findClaudeMd() instead of looking at the root alone.
import * as fs from 'fs';
import * as path from 'path';

/** Where Claude Code looks for a project's CLAUDE.md, in the order checked. */
export const CLAUDE_MD_LOCATIONS: readonly string[] = ['CLAUDE.md', path.join('.claude', 'CLAUDE.md')];

/**
 * Full path of the project's CLAUDE.md, or undefined when it has none.
 * The root file wins when both exist.
 */
export function findClaudeMd(projectPath: string): string | undefined {
    for (const relative of CLAUDE_MD_LOCATIONS) {
        const candidate = path.join(projectPath, relative);
        if (fs.existsSync(candidate)) { return candidate; }
    }
    return undefined;
}
