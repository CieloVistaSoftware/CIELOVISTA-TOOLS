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
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * terminal-set-folder.ts
 * Right-click a folder in the Explorer and immediately cd the active
 * terminal to that folder.
 *
 * Commands registered:
 *   cvs.terminal.setFolder  — Terminal: Set Working Directory (from Explorer context menu)
 *
 * Menu contributions:
 *   explorer/context  (when the selected item is a folder)
 */
const vscode = __importStar(require("vscode"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'terminal-set-folder';
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.terminal.setFolder', (uri) => {
        return (0, terminal_utils_1.cdToFolderFromUri)(uri);
    }));
}
function deactivate() { }
//# sourceMappingURL=terminal-set-folder.js.map