// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * mcp-server-status.ts
 *
 * Event-driven MCP server process manager for CieloVista Tools.
 *
 * Design goals:
 *   1) Keep MCP lifecycle logic in one place (single source of truth).
 *   2) Drive status updates by actual runtime events, not polling.
 *   3) Make failures visible in a normal VS Code terminal so users can see
 *      stdout/stderr, exit behavior, and retry attempts.
 *   4) Retry unexpected shutdowns with bounded exponential backoff.
 *   5) Never auto-restart after an intentional user stop.
 *
 * Runtime model:
 *   - The manager runs MCP in a dedicated terminal named "CieloVista MCP".
 *   - Status is optimistic-up once launch is issued, then corrected to down on
 *     terminal shell execution end/error events.
 *   - Unexpected down transitions schedule retries using RETRY_BACKOFF_MS.
 *   - A stable uptime window resets retryAttempt so intermittent failures do
 *     not permanently exhaust the retry budget.
 *
 * Important behavior contract:
 *   - startMcpServer() is idempotent while status is up.
 *   - stopMcpServer() is authoritative and cancels all pending retries.
 *   - If activation did not call initMcpServerPath(), this module auto-resolves
 *     mcp-server/dist/index.js from __dirname as a fallback.
 *
 * Rules:
 *   - Call initMcpServerPath(context.extensionPath) once during extension activation.
 *   - startMcpServer() is idempotent — safe to call every time the home page shows.
 *   - No polling: status is driven entirely by process lifecycle events.
 *
 * Exports:
 *   initMcpServerPath, startMcpServer, stopMcpServer,
 *   getMcpServerStatus, onMcpServerStatusChange, offMcpServerStatusChange
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs   from 'fs';
import * as os   from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { log, logError } from '../shared/output-channel';

let mcpDistPath     = '';
let mcpStatus: 'up' | 'down' = 'down';
const statusListeners: ((status: 'up' | 'down') => void)[] = [];
const FEATURE = 'mcp-server-status';
const MCP_TERMINAL_NAME = 'CieloVista MCP';

/** Port the MCP HTTP server listens on. Override with CVT_MCP_PORT env var. */
export const MCP_HTTP_PORT = parseInt(process.env['CVT_MCP_PORT'] ?? '3333', 10);

/** Full URL Claude Desktop should point to. */
export function getMcpServerUrl(): string {
    return `http://127.0.0.1:${MCP_HTTP_PORT}/mcp`;
}

const RETRY_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
const RETRY_STEADY_MS  = 30000;
const STABLE_UPTIME_MS = 15000;
const DIAG_ESCALATION_ATTEMPT = 3;
const DIAG_TAIL_MAX_CHARS = 120_000;
const MCP_DIAG_DIR = path.join(os.tmpdir(), 'cielovista-tools', 'mcp-diagnostics');

// Retry / lifecycle state.
let retryTimer: NodeJS.Timeout | null = null;
let retryAttempt = 0;
let stopRequested = false;
let stableUptimeTimer: NodeJS.Timeout | null = null;

// Terminal and owned process state.
let mcpTerminal: vscode.Terminal | null = null;
let executionGeneration = 0;
let mcpProcess: ChildProcess | null = null;

// ─── Init ──────────────────────────────────────────────────────────────────────

/**
 * Must be called once during extension activation with context.extensionPath.
 * Resolves the path to mcp-server/dist/index.js inside the extension root.
 *
 * This is still preferred, but startMcpServer() can recover if this function
 * was not called by falling back to resolveMcpDistPath().
 */
export function initMcpServerPath(extensionPath: string): void {
    mcpDistPath = path.join(extensionPath, 'mcp-server', 'dist', 'index.js');
}

/**
 * Returns the best-known MCP dist path.
 *
 * Resolution order:
 *   1) explicit path set by initMcpServerPath
 *   2) fallback derived from compiled module location
 */
function resolveMcpDistPath(): string {
    if (mcpDistPath) {
        return mcpDistPath;
    }

    // Fallback for cases where initMcpServerPath was not called by activation code.
    // In compiled output this file lives at out/features, so two levels up is
    // the extension root where mcp-server/dist/index.js lives.
    return path.join(__dirname, '..', '..', 'mcp-server', 'dist', 'index.js');
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Starts the MCP server process. Idempotent — does nothing if already running.
 * Emits 'up' status when started; 'down' when process exits or errors.
 *
 * Note: status transitions are ultimately finalized inside runMcpInTerminal()
 * after shell execution end events are observed.
 */
export function startMcpServer(): void {
    // If our owned process is still alive, just reflect that — don't spawn again.
    if (isMcpProcessAlive()) {
        setStatus('up');
        return;
    }

    if (mcpStatus === 'up') { setStatus('down'); } // stale state — reset

    // A manual start cancels any prior stop intent and pending retry timer.
    stopRequested = false;
    clearRetryTimer();
    clearStableTimer();

    const resolvedDistPath = resolveMcpDistPath();
    if (!fs.existsSync(resolvedDistPath)) {
        const reason = `dist not found: ${resolvedDistPath} — run cvs.mcp.build first.`;
        setStatus('down');
        logError(`MCP dist not found: ${resolvedDistPath} — run cvs.mcp.build first`, '', FEATURE);
        scheduleRetry(reason);
        return;
    }

    mcpDistPath = resolvedDistPath;

    runMcpProcess();
}

/** Kills the MCP server process and emits 'down'. */
export function stopMcpServer(): void {
    stopRequested = true;
    retryAttempt = 0;
    executionGeneration += 1;
    clearRetryTimer();
    clearStableTimer();

    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
    }
    ptyWrite = null;
    if (mcpTerminal) {
        mcpTerminal.dispose();
        mcpTerminal = null;
    }

    mcpStatus  = 'down';
    notifyListeners();
}

// ─── Status ────────────────────────────────────────────────────────────────────

export function getMcpServerStatus(): 'up' | 'down' {
    return mcpStatus;
}

/**
 * Register a listener for status changes.
 *
 * Listener contract:
 *   - callback receives only 'up' or 'down'
 *   - callbacks run synchronously when state changes
 */
export function onMcpServerStatusChange(listener: (status: 'up' | 'down') => void): void {
    statusListeners.push(listener);
}

/** Unregister a previously registered listener. */
export function offMcpServerStatusChange(listener: (status: 'up' | 'down') => void): void {
    const idx = statusListeners.indexOf(listener);
    if (idx !== -1) { statusListeners.splice(idx, 1); }
}

/** Broadcast current status to all listeners. */
function notifyListeners(): void {
    for (const listener of statusListeners) {
        listener(mcpStatus);
    }
}

/** Clear scheduled retry timer if present. */
function clearRetryTimer(): void {
    if (!retryTimer) { return; }
    clearTimeout(retryTimer);
    retryTimer = null;
}

/** Clear stable-uptime reset timer if present. */
function clearStableTimer(): void {
    if (!stableUptimeTimer) { return; }
    clearTimeout(stableUptimeTimer);
    stableUptimeTimer = null;
}

/**
 * Centralized state transition helper.
 *
 * Prevents duplicate listener notifications when the status value is unchanged.
 */
function setStatus(status: 'up' | 'down'): void {
    if (mcpStatus === status) { return; }
    mcpStatus = status;
    notifyListeners();
}

/** Returns true if our owned process is still running. */
function isMcpProcessAlive(): boolean {
    return !!(mcpProcess && !mcpProcess.killed && mcpProcess.exitCode === null);
}

/**
 * Writes a line directly to the pty emitter, if the terminal is still open.
 * ptyWrite is set/cleared alongside mcpTerminal.
 */
let ptyWrite: ((data: string) => void) | null = null;

function terminalWriteLine(message: string): void {
    if (ptyWrite) {
        ptyWrite(`\r\n\x1b[90m${message}\x1b[0m\r\n`);
    }
}

function trimTail(value: string): string {
    if (value.length <= DIAG_TAIL_MAX_CHARS) { return value; }
    return value.slice(value.length - DIAG_TAIL_MAX_CHARS);
}

function appendTail(existing: string, chunk: Buffer): string {
    return trimTail(existing + chunk.toString());
}

function buildMcpLaunchConfig(attemptNumber: number): { args: string[]; env: NodeJS.ProcessEnv; traceMode: boolean } {
    const traceMode = attemptNumber >= DIAG_ESCALATION_ATTEMPT;
    const args = traceMode
        ? ['--trace-uncaught', '--trace-warnings', mcpDistPath]
        : [mcpDistPath];

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (traceMode) {
        // Escalated diagnostics after repeated failures: module + network debug traces.
        const existingDebug = env['NODE_DEBUG'] ? `${env['NODE_DEBUG']},` : '';
        env['NODE_DEBUG'] = `${existingDebug}module,http,net,tls`;
    }

    return { args, env, traceMode };
}

function writeMcpCrashDiagnostics(params: {
    attemptNumber: number;
    reason: string;
    traceMode: boolean;
    args: string[];
    stdoutTail: string;
    stderrTail: string;
}): string | null {
    try {
        fs.mkdirSync(MCP_DIAG_DIR, { recursive: true });
        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(MCP_DIAG_DIR, `mcp-crash-${stamp}-attempt-${params.attemptNumber}.log`);

        const body = [
            `timestamp=${now.toISOString()}`,
            `endpoint=${getMcpServerUrl()}`,
            `reason=${params.reason}`,
            `attempt=${params.attemptNumber}`,
            `traceMode=${params.traceMode}`,
            `nodeArgs=${JSON.stringify(params.args)}`,
            '',
            '--- stderr tail ---',
            params.stderrTail || '(empty)',
            '',
            '--- stdout tail ---',
            params.stdoutTail || '(empty)',
            '',
        ].join('\n');

        fs.writeFileSync(filePath, body, 'utf8');
        return filePath;
    } catch {
        return null;
    }
}

/**
 * Spawns MCP via child_process, piping stdout/stderr into a Pseudoterminal
 * so output is visible in the "CieloVista MCP" terminal panel.
 * No shell integration required — we own the PID.
 */
function runMcpProcess(): void {
    try {
    const generation = ++executionGeneration;

    // Reuse existing terminal or create one backed by a Pseudoterminal.
    if (!mcpTerminal || !vscode.window.terminals.includes(mcpTerminal)) {
        const writeEmitter = new vscode.EventEmitter<string>();
        ptyWrite = (data: string) => writeEmitter.fire(data);

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            open: () => { writeEmitter.fire(`\x1b[1mCieloVista MCP\x1b[0m — output below\r\n\x1b[90mEndpoint: ${getMcpServerUrl()}\x1b[0m\r\n`); },
            close: () => {
                if (mcpProcess && !mcpProcess.killed) {
                    mcpProcess.kill();
                }
            },
        };
        mcpTerminal = vscode.window.createTerminal({ name: MCP_TERMINAL_NAME, pty });
        mcpTerminal.show(false);
    } else {
        mcpTerminal.show(false);
    }

    if (generation !== executionGeneration || stopRequested) { return; }

    const attemptNumber = retryAttempt + 1;
    const launch = buildMcpLaunchConfig(attemptNumber);

    terminalWriteLine(`[CVT MCP] Starting attempt ${attemptNumber}.`);
    if (launch.traceMode) {
        terminalWriteLine('[CVT MCP] Diagnostics escalated: --trace-uncaught --trace-warnings + NODE_DEBUG=module,http,net,tls');
    }
    log(FEATURE, `Starting MCP process attempt ${attemptNumber}`);

    const child = spawn('node', launch.args, {
        env: launch.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    mcpProcess = child;

    let stdoutTail = '';
    let stderrTail = '';

    child.stdout?.on('data', (chunk: Buffer) => {
        stdoutTail = appendTail(stdoutTail, chunk);
        if (ptyWrite) { ptyWrite(chunk.toString().replace(/\n/g, '\r\n')); }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = appendTail(stderrTail, chunk);
        if (ptyWrite) { ptyWrite(chunk.toString().replace(/\n/g, '\r\n')); }
    });

    setStatus('up');
    clearStableTimer();
    stableUptimeTimer = setTimeout(() => {
        retryAttempt = 0;
        stableUptimeTimer = null;
    }, STABLE_UPTIME_MS);

    child.on('exit', (code, signal) => {
        if (generation !== executionGeneration) { return; }
        if (mcpProcess === child) { mcpProcess = null; }

        clearStableTimer();
        setStatus('down');

        if (stopRequested) {
            log(FEATURE, 'MCP stopped intentionally');
            return;
        }

        const reason = signal
            ? `process killed by signal ${signal}`
            : `process exited with code ${code ?? '?'}`;
        terminalWriteLine(`[CVT MCP] ${reason}.`);

        const diagPath = writeMcpCrashDiagnostics({
            attemptNumber,
            reason,
            traceMode: launch.traceMode,
            args: launch.args,
            stdoutTail,
            stderrTail,
        });
        if (diagPath) {
            terminalWriteLine(`[CVT MCP] Crash diagnostics written: ${diagPath}`);
        }

        // Issues #59 / #63 / #64 / #60 — auto-filed APP_ERROR cluster.
        // Error logging was firing on every MCP shutdown, including SIGTERM
        // (sent by VS Code on window reload or extension deactivate) and
        // exit code 0 (clean self-shutdown). Neither is a bug. The
        // stopRequested guard above only catches our own stopMcpServer()
        // path; OS-driven signals arrive without it set. Filter both out
        // before the crash-dump + logError + retry path.
        const isExpectedTermSignal = signal === 'SIGTERM' || signal === 'SIGINT';
        const isCleanExit          = !signal && code === 0;
        if (isExpectedTermSignal || isCleanExit) {
            log(FEATURE, `MCP ${reason} — expected lifecycle event, not retrying`);
            return;
        }

        logError(`MCP process exited unexpectedly: ${reason}`, '', FEATURE);
        scheduleRetry(reason);
    });

    child.on('error', (err) => {
        if (generation !== executionGeneration) { return; }
        if (mcpProcess === child) { mcpProcess = null; }

        clearStableTimer();
        setStatus('down');
        const reason = `spawn error: ${err.message}`;
        terminalWriteLine(`[CVT MCP] ${reason}.`);

        const diagPath = writeMcpCrashDiagnostics({
            attemptNumber,
            reason,
            traceMode: launch.traceMode,
            args: launch.args,
            stdoutTail,
            stderrTail,
        });
        if (diagPath) {
            terminalWriteLine(`[CVT MCP] Crash diagnostics written: ${diagPath}`);
        }

        logError('MCP process spawn error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        scheduleRetry(reason);
    });
    } catch (err) {
        setStatus('down');
        const reason = `internal start error: ${err instanceof Error ? err.message : String(err)}`;
        logError('MCP internal start error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        scheduleRetry(reason);
    }
}

/**
 * Schedules the next restart attempt using bounded exponential backoff.
 */
function scheduleRetry(reason: string): void {
    if (stopRequested) { return; }

    const delay = RETRY_BACKOFF_MS[retryAttempt] ?? RETRY_STEADY_MS;
    retryAttempt += 1;
    clearRetryTimer();

    terminalWriteLine(`[CVT MCP] ${reason}; retrying in ${delay}ms (attempt ${retryAttempt}).`);
    log(FEATURE, `${reason}; retrying in ${delay}ms (attempt ${retryAttempt})`);

    retryTimer = setTimeout(() => {
        retryTimer = null;
        if (stopRequested) { return; }
        runMcpProcess();
    }, delay);
}

/** @internal — exported for unit testing only */
export const _test = {
    getMcpServerStatus,
    onMcpServerStatusChange,
    notifyListeners,
    buildMcpLaunchConfig,
    writeMcpCrashDiagnostics,
    trimTail,
    appendTail,
    DIAG_ESCALATION_ATTEMPT,
    DIAG_TAIL_MAX_CHARS,
    MCP_DIAG_DIR,
};
