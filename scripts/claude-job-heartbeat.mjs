// Copyright (c) 2026 CieloVista Software. All rights reserved.

/**
 * claude-job-heartbeat.mjs  (issue #3)
 *
 * Claude Code PostToolUse hook. Keeps <workspace>/data/claude-job-status.json
 * "fresh" so the Issue Viewer's Current Job banner stays visible the whole time
 * Claude is active, and auto-hides (via staleness) a few minutes after it stops.
 *
 * - Reads the hook payload (JSON) on stdin to learn the cwd + current tool.
 * - If Claude has already written a rich status (title/steps/ETA), it ONLY
 *   refreshes updatedAt + detail, preserving the agent-authored fields.
 * - If no status exists yet, it writes a minimal "session active" placeholder.
 * - Never throws and always exits 0 — a hook must not break the session.
 */

import fs from 'fs';
import path from 'path';

/** Short, human description of the current activity from the tool name. */
function describe(tool) {
    const map = {
        Bash: 'running a command',
        Edit: 'editing files',
        Write: 'writing a file',
        Read: 'reading code',
        Grep: 'searching code',
        Glob: 'finding files',
        Task: 'running a sub-agent',
        Agent: 'running a sub-agent',
        WebFetch: 'fetching the web',
        WebSearch: 'searching the web',
    };
    return map[tool] || (tool ? `using ${tool}` : 'working');
}

async function readStdin() {
    return await new Promise((resolve) => {
        let buf = '';
        const t = setTimeout(() => resolve(buf), 500); // never block the session
        process.stdin.on('data', (d) => { buf += d; });
        process.stdin.on('end', () => { clearTimeout(t); resolve(buf); });
        process.stdin.on('error', () => { clearTimeout(t); resolve(buf); });
    });
}

function isRichStatus(obj) {
    return obj && typeof obj === 'object' && Array.isArray(obj.steps) && obj.steps.length > 0;
}

async function main() {
    let payload = {};
    try { payload = JSON.parse(await readStdin()) || {}; } catch { /* best effort */ }

    const base = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const file = path.join(base, 'data', 'claude-job-status.json');
    const now = new Date().toISOString();
    const detail = describe(payload.tool_name);

    let status = null;
    try { status = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }

    if (isRichStatus(status)) {
        // Preserve Claude's title/steps/ETA — just refresh the heartbeat.
        status.updatedAt = now;
        status.detail = detail;
    } else {
        status = {
            jobId: 'claude-session',
            title: 'Claude is working',
            startedAt: now,
            updatedAt: now,
            etaIso: null,
            steps: [{ name: 'Active session', status: 'active' }],
            detail,
        };
    }

    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(status, null, 2), 'utf8');
    } catch { /* ignore write failures — never break the session */ }
}

main().finally(() => process.exit(0));
