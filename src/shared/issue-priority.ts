// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * issue-priority.ts
 *
 * An issue has ONE priority: its priority:N label (N = 1..5). John,
 * 2026-10-02, on the Issue Viewer: "Too many priority fields. we only want
 * one." Pure helpers, no vscode dependency, so REG-187 can test them through
 * out/shared/issue-priority.js.
 */

export const PRIORITY_LABEL = /^priority:([1-5])$/;

/** The issue's priority from its priority:N label, or null when unrated. */
export function priorityFromLabels(labels: ReadonlyArray<{ name: string }>): number | null {
    for (const l of labels) {
        const m = PRIORITY_LABEL.exec(l.name);
        if (m) { return Number(m[1]); }
    }
    return null;
}

/**
 * gh args that make `priority` the issue's ONLY priority label: every other
 * priority:N is removed in the same edit (wb-starter Law 15: exactly one).
 */
export function priorityEditArgs(number: number, priority: number, current: ReadonlyArray<string>, repo: string): string[] {
    const args: string[] = ['issue', 'edit', String(number)];
    for (const name of current) {
        if (PRIORITY_LABEL.test(name) && name !== `priority:${priority}`) { args.push('--remove-label', name); }
    }
    args.push('--add-label', `priority:${priority}`, '--repo', repo);
    return args;
}
