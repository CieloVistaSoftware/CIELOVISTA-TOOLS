// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as fs   from 'fs';
import * as path from 'path';
import { STUBS } from './sections';
import type { ReadmeReport } from './types';

export function applyFix(report: ReadmeReport): string {
    let content = fs.readFileSync(report.filePath, 'utf8');
    const stubs = STUBS[report.readmeType];

    for (const issue of report.issues) {
        if (!issue.fixable) { continue; }

        if (issue.fixKey === 'first-heading') {
            if (!/^#\s/.test(content.split('\n')[0])) {
                const name = path.basename(report.filePath, '.md').replace(/\.README$/i, '');
                content = `# ${name}\n\n${content}`;
            }
        }

        if (issue.fixKey.startsWith('missing-section:')) {
            const sec  = issue.fixKey.replace('missing-section:', '');
            const stub = stubs[sec];
            if (stub && !content.toLowerCase().includes(`## ${sec}`)) {
                content = content.trimEnd() + '\n\n---\n\n' + stub;
            }
        }

        if (issue.fixKey === 'code-block-lang') {
            content = content.replace(/^```\s*$/gm, '```text');
        }

        if (issue.fixKey === 'feature-prefix') {
            content = content.replace(/^(#\s+)(.+)$/m, (_, hash, title) => {
                if (title.toLowerCase().startsWith('feature:')) { return `${hash}${title}`; }
                return `${hash}feature: ${title}`;
            });
        }

        if (issue.fixKey === 'standard-blockquote') {
            content = content.replace(/^(#\s+.+)$/m, (_, heading) =>
                `${heading}\n\n> _TODO: one-line summary of what this standard covers._`
            );
        }
    }

    return content;
}
