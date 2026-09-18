// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
//
// help-utils.ts — Shared help tooltip logic for doc cards

/**
 * Extract help markdown from a doc's content: the lines after the first
 * H1 heading, up to 10 lines or the next H2, whichever comes first.
 */
export function extractHelpMarkdown(content: string): string {
    const lines = content.split('\n');
    const helpLines: string[] = [];
    let started = false;
    for (const line of lines) {
        if (/^# /.test(line)) { started = true; continue; }
        if (/^## /.test(line) && started) { break; }
        if (started && helpLines.length < 10) { helpLines.push(line); }
    }
    return helpLines.join('\n').trim();
}
