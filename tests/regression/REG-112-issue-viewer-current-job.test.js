/**
 * tests/regression/REG-112-issue-viewer-current-job.test.js
 *
 * Guards issue #3: the Issue Viewer shows a live "Current Job" status panel for
 * the running Claude batch job (steps, progress, elapsed, ETA).
 *
 * Source-level reads against the TypeScript files — no compilation or network.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const VIEW = path.join(__dirname, '../../src/shared/github-issues-view.ts');
const RDR  = path.join(__dirname, '../../src/shared/job-status-reader.ts');
const view = fs.readFileSync(VIEW, 'utf8');

let passed = 0;
let failed = 0;
function check(label, condition) {
    if (condition) { console.log(`  PASS - ${label}`); passed++; }
    else           { console.log(`  FAIL - ${label}`); failed++; }
}

console.log('\nREG-112: Issue Viewer — Current Job status panel (issue #3)\n' + '─'.repeat(60));

// ── The pure reader module exists and is vscode-free ──────────────────────────
check('job-status-reader.ts exists', fs.existsSync(RDR));
const rdr = fs.existsSync(RDR) ? fs.readFileSync(RDR, 'utf8') : '';
check('reader is pure (no vscode import)', rdr.length > 0 && !/from ['"]vscode['"]/.test(rdr));
check('reader exports readJobStatus', /export function readJobStatus/.test(rdr));
check('reader exports summarizeJob', /export function summarizeJob/.test(rdr));

// ── Issue Viewer integrates the reader ────────────────────────────────────────
check('view imports the job-status reader',
    /from ['"]\.\/job-status-reader['"]/.test(view));

// ── Banner is rendered in the webview HTML ────────────────────────────────────
check('view renders a current-job banner container',
    view.includes('current-job') || view.includes('currentJob'));
check('banner shows a progress bar', view.includes('job-progress'));
check('banner lists the steps', view.includes('job-step'));

// ── Live polling for the job panel (separate from the 60s issue refetch) ──────
check('webview posts a jobPoll message', view.includes('jobPoll'));
check('host handles jobPoll and posts jobStatus back',
    view.includes("'jobPoll'") && view.includes('jobStatus'));
check('a poll interval drives the live update', /setInterval/.test(view));

// ── Auto-writer: heartbeat hook keeps the status file fresh ────────────────────
const HB = path.join(__dirname, '../../scripts/claude-job-heartbeat.mjs');
check('heartbeat hook script exists', fs.existsSync(HB));
const hb = fs.existsSync(HB) ? fs.readFileSync(HB, 'utf8') : '';
check('heartbeat preserves rich (agent-authored) status', hb.includes('isRichStatus'));
check('heartbeat refreshes updatedAt', /updatedAt\s*=\s*now/.test(hb));
check('heartbeat never breaks the session (exits 0)', hb.includes('process.exit(0)'));

const SETTINGS = path.join(__dirname, '../../.claude/settings.json');
check('.claude/settings.json wires a PostToolUse hook', fs.existsSync(SETTINGS));
if (fs.existsSync(SETTINGS)) {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    const cmds = JSON.stringify(s.hooks && s.hooks.PostToolUse || []);
    check('PostToolUse hook invokes the heartbeat script', cmds.includes('claude-job-heartbeat.mjs'));
}

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
