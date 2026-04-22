// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
//
// help-utils.ts — Shared Dewey number and help tooltip logic for all command/script cards

import * as fs from 'fs';
import * as path from 'path';


export interface DeweyHelp {
    dewey: string | undefined;
    helpMarkdown: string | undefined;
}

/**
 * Extract Dewey number and help markdown from a canonical .md file.
 * Returns Dewey number (from filename or frontmatter) and raw markdown for tooltip/popup.
 */
export function extractDeweyAndHelp(mdFilePath: string): DeweyHelp {
    if (!fs.existsSync(mdFilePath)) return { dewey: undefined, helpMarkdown: undefined };
    const md = fs.readFileSync(mdFilePath, 'utf8');
    // Dewey number: from filename (e.g. npm-catalog.200.101.md → 200.101)
    const m = mdFilePath.match(/([0-9]{3}\.[0-9]{3})\.md$/);
    const dewey = m ? m[1] : undefined;
    // Help markdown: strip first heading, use first 10 lines or until next heading
    const lines = md.split('\n');
    let helpLines: string[] = [];
    let started = false;
    for (const line of lines) {
        if (/^# /.test(line)) { started = true; continue; }
        if (/^## /.test(line) && started) break;
        if (started && helpLines.length < 10) helpLines.push(line);
    }
    const helpMarkdown = helpLines.join('\n').trim();
    return { dewey, helpMarkdown };
}
