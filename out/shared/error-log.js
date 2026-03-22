"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCurrentCommand = setCurrentCommand;
exports.clearCurrentCommand = clearCurrentCommand;
exports.logError = logError;
exports.getLogPath = getLogPath;
exports.getErrors = getErrors;
exports.clearErrors = clearErrors;
/**
 * error-log.ts
 *
 * Persistent error log for CieloVista Tools — VS Code equivalent of
 * wb-core/core/error-logger.js.
 *
 * Same interface: logError(prefix, error, options)
 * Same storage:   data/tools-errors.json (last 100 entries)
 * Same fields:    id, timestamp, type, prefix, context, message, stack,
 *                 filename, lineno, colno, command
 *
 * Differences from wb-core version:
 *   - No DOM/browser — writes to disk and VS Code Output channel
 *   - `command` field instead of `url` (the VS Code command that was running)
 *   - VS Code notification on first error in a session
 *
 * Command to view:  cvs.tools.errorLog
 * Log file:        <tools-root>/data/tools-errors.json
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const output_channel_1 = require("./output-channel");
// ─── Config ───────────────────────────────────────────────────────────────────
const TOOLS_ROOT = path.join(__dirname, '..', '..');
const LOG_PATH = path.join(TOOLS_ROOT, 'data', 'tools-errors.json');
const MAX_ERRORS = 100;
// Track whether we've shown the "errors occurred" notification this session
let _sessionNotified = false;
let _currentCommand = ''; // set by the launcher when running a command
/** Call this before executing a command so errors can reference it. */
function setCurrentCommand(id) { _currentCommand = id; }
function clearCurrentCommand() { _currentCommand = ''; }
// ─── Stack parser (mirrors wb-core parseStack) ────────────────────────────────
function parseStack(stack) {
    if (!stack) {
        return { filename: '', lineno: 0, colno: 0 };
    }
    // Match:  at SomeFn (C:\path\to\file.ts:42:7)  or  at C:\path\to\file.ts:42:7
    const match = stack.match(/(?:at\s+(?:\S+\s+)?)\(?(.+?):(\d+):(\d+)\)?/);
    return match
        ? { filename: path.basename(match[1]), lineno: parseInt(match[2], 10), colno: parseInt(match[3], 10) }
        : { filename: '', lineno: 0, colno: 0 };
}
// ─── Type inference (mirrors wb-core inferType) ───────────────────────────────
function inferType(error, override) {
    if (override) {
        return override;
    }
    const msg = String(error?.message || error).toLowerCase();
    if (msg.includes('json') || msg.includes('unexpected token') || msg.includes('not valid json')) {
        return 'JSON_PARSE_ERROR';
    }
    if (msg.includes('enoent') || msg.includes('no such file') || msg.includes('eacces')) {
        return 'FILE_IO_ERROR';
    }
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('econnrefused')) {
        return 'NETWORK_ERROR';
    }
    if (msg.includes('api') || msg.includes('anthropic') || msg.includes('openai')) {
        return 'AI_ERROR';
    }
    return 'APP_ERROR';
}
// ─── Hash (mirrors wb-core id generation) ────────────────────────────────────
function hashError(message, stack) {
    let h = 5381;
    const s = message + (stack.split('\n')[1] || '');
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return h >>> 0;
}
// ─── Load / save ──────────────────────────────────────────────────────────────
function loadLog() {
    try {
        if (fs.existsSync(LOG_PATH)) {
            return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
        }
    }
    catch { /* corrupt file — start fresh */ }
    return { lastUpdated: new Date().toISOString(), count: 0, errors: [] };
}
function saveLog(log) {
    try {
        const dir = path.dirname(LOG_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
    }
    catch (e) {
        // Can't log this or we'd recurse — just write to output channel
        (0, output_channel_1.getChannel)().appendLine(`[error-log] Could not write log file: ${e}`);
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Log an error persistently.
 *
 * Same interface as wb-core logError():
 *   logError('[test-coverage-auditor]', err)
 *   logError('[test-coverage-auditor]', err, { context: 'runAudit', type: 'JSON_PARSE_ERROR' })
 *   logError('[test-coverage-auditor]', 'Script not found', { context: 'findScript' })
 *
 * Automatically extracts: filename, lineno, colno from stack trace.
 * Automatically records:  current VS Code command, timestamp.
 */
function logError(prefix, error, options = {}) {
    const isErrorObj = error instanceof Error;
    const message = isErrorObj ? error.message : String(error);
    const stack = isErrorObj ? (error.stack || '') : '';
    const raw = String(error);
    const { filename, lineno, colno } = parseStack(stack);
    const entry = {
        id: hashError(message, stack),
        timestamp: new Date().toISOString(),
        type: inferType(error, options.type),
        prefix,
        context: options.context || '',
        command: options.command || _currentCommand,
        message,
        stack,
        filename,
        lineno,
        colno,
        raw,
    };
    // Write to VS Code output channel with full detail
    const ch = (0, output_channel_1.getChannel)();
    const ts = entry.timestamp.slice(11, 23);
    ch.appendLine(`[${ts}] ${prefix} ERROR [${entry.type}]${entry.context ? ' in ' + entry.context : ''}${entry.command ? ' (cmd: ' + entry.command + ')' : ''}`);
    ch.appendLine(`  Message:  ${entry.message}`);
    if (entry.filename) {
        ch.appendLine(`  Location: ${entry.filename}:${entry.lineno}:${entry.colno}`);
    }
    if (entry.stack) {
        const stackLines = entry.stack.split('\n').slice(1, 5); // first 4 frames
        stackLines.forEach(l => ch.appendLine(`  ${l.trim()}`));
    }
    // Persist to disk
    const log = loadLog();
    log.errors.push(entry);
    if (log.errors.length > MAX_ERRORS) {
        log.errors = log.errors.slice(-MAX_ERRORS);
    }
    log.count = log.errors.length;
    log.lastUpdated = entry.timestamp;
    saveLog(log);
    // Notify user once per session
    if (!_sessionNotified) {
        _sessionNotified = true;
        vscode.window.showWarningMessage(`CieloVista Tools: an error occurred in ${prefix}. Check the error log for details.`, 'View Error Log').then(action => {
            if (action === 'View Error Log') {
                vscode.commands.executeCommand('cvs.tools.errorLog');
            }
        });
    }
    return entry;
}
function getLogPath() { return LOG_PATH; }
function getErrors() { return loadLog().errors; }
async function clearErrors() {
    saveLog({ lastUpdated: new Date().toISOString(), count: 0, errors: [] });
    _sessionNotified = false;
}
//# sourceMappingURL=error-log.js.map