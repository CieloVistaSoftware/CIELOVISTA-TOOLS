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
exports.createErrorId = createErrorId;
exports.logError = logError;
exports.markErrorSolved = markErrorSolved;
exports.getAllErrors = getAllErrors;
/**
 * error-log-utils.ts
 * Persistent error tracking to a JSON file in the workspace.
 *
 * Errors are stored with a unique ID (hash of the message).
 * When the same error recurs, its count is incremented.
 * A solution string can be attached once a fix is known.
 *
 * Rule: any feature that wants to track errors over time imports from here.
 * Nobody rolls their own error-to-JSON mechanism.
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("./output-channel");
const FEATURE = 'error-log-utils';
// ─── File path helper ─────────────────────────────────────────────────────────
function getLogFilePath() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
        return undefined;
    }
    const logsDir = path.join(folders[0].uri.fsPath, '.vscode', 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    return path.join(logsDir, 'cielovista-errors.json');
}
function readLog(logFile) {
    if (!fs.existsSync(logFile)) {
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
    catch {
        return [];
    }
}
function writeLog(logFile, entries) {
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2), 'utf8');
}
// ─── ID generation ────────────────────────────────────────────────────────────
/**
 * Creates a deterministic short ID from an error message string.
 * Same message always produces the same ID, enabling deduplication.
 */
function createErrorId(message) {
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) - hash) + message.charCodeAt(i);
        hash |= 0; // to 32-bit int
    }
    return 'err_' + Math.abs(hash).toString(16);
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Logs an error to the workspace JSON log.
 * If this error has been seen before and has a solution, returns that solution.
 *
 * @param error    The caught error (Error object or any value)
 * @param context  Short name of the calling feature/function
 * @returns        The solution string if one exists, otherwise undefined
 */
function logError(error, context) {
    const logFile = getLogFilePath();
    if (!logFile) {
        return undefined;
    }
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const stack = error instanceof Error ? error.stack : undefined;
    const id = createErrorId(message);
    const now = new Date().toISOString();
    const entries = readLog(logFile);
    const idx = entries.findIndex(e => e.id === id);
    if (idx >= 0) {
        entries[idx].count++;
        entries[idx].lastOccurred = now;
        if (stack && !entries[idx].stack) {
            entries[idx].stack = stack;
        }
        writeLog(logFile, entries);
        (0, output_channel_1.log)(FEATURE, `Known error #${id} (×${entries[idx].count}): ${message}`);
        return entries[idx].solved ? entries[idx].solution : undefined;
    }
    entries.push({ id, timestamp: now, lastOccurred: now, count: 1, message, stack, context, solved: false });
    writeLog(logFile, entries);
    (0, output_channel_1.log)(FEATURE, `New error #${id} in [${context}]: ${message}`);
    return undefined;
}
/**
 * Marks all errors whose message contains the given substring as solved
 * and records the provided solution.
 *
 * @param messageSubstring  Part of the error message that identifies it
 * @param solution          Brief description of how to fix it
 * @returns                 true if at least one error was updated
 */
function markErrorSolved(messageSubstring, solution) {
    const logFile = getLogFilePath();
    if (!logFile) {
        return false;
    }
    const entries = readLog(logFile);
    let updated = false;
    for (const entry of entries) {
        if (entry.message.includes(messageSubstring)) {
            entry.solved = true;
            entry.solution = solution;
            updated = true;
        }
    }
    if (updated) {
        writeLog(logFile, entries);
        (0, output_channel_1.log)(FEATURE, `Marked errors matching "${messageSubstring}" as solved`);
    }
    return updated;
}
/**
 * Returns all logged errors.
 * Useful for a diagnostics panel or status report.
 */
function getAllErrors() {
    const logFile = getLogFilePath();
    return logFile ? readLog(logFile) : [];
}
//# sourceMappingURL=error-log-utils.js.map