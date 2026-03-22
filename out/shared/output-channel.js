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
exports.getChannel = getChannel;
exports.log = log;
exports.logError = logError;
exports.disposeChannel = disposeChannel;
/**
 * output-channel.ts
 * ONE shared OutputChannel for the entire CieloVista Tools extension.
 *
 * Rule: every feature writes here. Nobody creates their own OutputChannel.
 * This keeps all extension output consolidated under one panel in VS Code.
 */
const vscode = __importStar(require("vscode"));
let _channel;
/**
 * Returns the single shared output channel, creating it on first call.
 * All features call this — never instantiate OutputChannel directly.
 */
function getChannel() {
    if (!_channel) {
        _channel = vscode.window.createOutputChannel('CieloVista Tools');
    }
    return _channel;
}
/**
 * Write a log line prefixed with the feature name and timestamp.
 * @param feature  Short name, e.g. 'copilot-rules-enforcer'
 * @param message  The message to log
 */
function log(feature, message) {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    getChannel().appendLine(`[${ts}] [${feature}] ${message}`);
}
/**
 * Write an error line to the channel and optionally show it.
 * @param feature     Short name of the calling feature
 * @param message     Human-readable description
 * @param error       The caught error object (optional)
 * @param showPanel   If true, brings the Output panel into view
 */
function logError(feature, message, error, showPanel = false) {
    // Import lazily to avoid circular dependency at module load time
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { logError: persistError } = require('./error-log');
        persistError(`[${feature}]`, error ?? new Error(message), { context: message });
    }
    catch {
        // Fallback: just write to output channel if error-log module isn't ready
        const detail = error instanceof Error ? error.message : String(error ?? '');
        log(feature, `ERROR: ${message}${detail ? ' — ' + detail : ''}`);
    }
    if (showPanel) {
        getChannel().show(true);
    }
}
/**
 * Dispose the channel. Called from the root extension deactivate().
 */
function disposeChannel() {
    _channel?.dispose();
    _channel = undefined;
}
//# sourceMappingURL=output-channel.js.map