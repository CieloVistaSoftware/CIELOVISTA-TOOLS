// Copyright (c) 2025 CieloVista Software. All rights reserved.
/** Required sections, ordering, line limits, and stub templates for README compliance. */
import type { ReadmeType } from './types';

export const REQUIRED_SECTIONS: Record<ReadmeType, string[]> = {
    PROJECT:  ['what it does', 'quick start', 'architecture', 'project structure', 'common commands', 'prerequisites', 'license'],
    FEATURE:  ['what it does', 'internal architecture', 'manual test'],
    STANDARD: ['purpose', 'rules', 'changelog'],
};

export const SECTION_ORDER: Record<ReadmeType, string[]> = {
    PROJECT:  ['what it does', 'quick start', 'architecture', 'project structure', 'common commands', 'prerequisites', 'license'],
    FEATURE:  ['what it does', 'commands', 'settings', 'internal architecture', 'manual test'],
    STANDARD: ['purpose', 'rules', 'examples', 'related documents', 'changelog'],
};

export const LINE_LIMITS: Record<ReadmeType, number> = { PROJECT: 300, FEATURE: 150, STANDARD: 400 };

const GLOBAL_DOCS = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards';

export const STUBS: Record<ReadmeType, Record<string, string>> = {
    PROJECT: {
        'what it does':      `## What it does\n\n_TODO: 2–5 sentences._\n`,
        'quick start':       `## Quick Start\n\n\`\`\`powershell\n# TODO: minimum commands\n\`\`\`\n`,
        'architecture':      `## Architecture\n\n_TODO: high-level tech stack._\n`,
        'project structure': `## Project Structure\n\n\`\`\`\n# TODO: directory tree\n\`\`\`\n`,
        'common commands':   `## Common Commands\n\n\`\`\`powershell\n# TODO\n\`\`\`\n`,
        'prerequisites':     `## Prerequisites\n\n- Node.js LTS\n`,
        'license':           `## License\n\nCopyright (c) ${new Date().getFullYear()} CieloVista Software\n`,
    },
    FEATURE: {
        'what it does':          `## What it does\n\n_TODO: single responsibility description._\n`,
        'commands':              `## Commands\n\n| Command ID | Title |\n|---|---|\n| \`cvs.TODO\` | TODO |\n`,
        'settings':              `## Settings\n\n| Key | Type | Default |\n|---|---|---|\n| \`TODO\` | boolean | \`false\` |\n`,
        'internal architecture': `## Internal architecture\n\n\`\`\`\nactivate() └── TODO\n\`\`\`\n`,
        'manual test':           `## Manual test\n\n1. TODO step\n2. TODO expected\n`,
    },
    STANDARD: {
        'purpose':           `## Purpose\n\n_TODO: why this standard exists._\n`,
        'rules':             `## Rules\n\n1. Rule one.\n2. Rule two.\n`,
        'examples':          `## Examples\n\n\`\`\`typescript\n// ✅ Good\n// TODO\n\`\`\`\n`,
        'related documents': `## Related Documents\n\n- [README Standard](${GLOBAL_DOCS}\\README-STANDARD.md)\n`,
        'changelog':         `## Changelog\n\n- v1.0.0 (${new Date().toISOString().slice(0, 10)}): Initial version\n`,
    },
};
