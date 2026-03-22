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
 * css-class-hover.ts
 * Hover over a CSS class name in HTML/JSX/TSX and see the class definition
 * inline without leaving the file.  Resolves CSS imports relative to the
 * document to find the actual definition.
 *
 * Supported languages: html, javascript, javascriptreact, typescript, typescriptreact
 *
 * Commands registered:
 *   cvs.cssClassHover.enable  — register the hover provider (on by default)
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'css-class-hover';
const SUPPORTED_LANGUAGES = ['html', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
// ─── CSS resolution ───────────────────────────────────────────────────────────
/** Reads all CSS files imported in the document and concatenates them. */
function resolveCssFromImports(document) {
    const text = document.getText();
    const importRe = /import\s+['"]([^'"]*\.css)['"]/g;
    const docDir = path.dirname(document.uri.fsPath);
    let css = '';
    let match;
    while ((match = importRe.exec(text)) !== null) {
        const full = path.resolve(docDir, match[1]);
        try {
            if (fs.existsSync(full)) {
                css += fs.readFileSync(full, 'utf8') + '\n';
            }
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Could not read CSS file: ${full}`, err);
        }
    }
    return css;
}
/** Finds all CSS rule blocks matching .className in the given CSS string. */
function findCssRule(css, className) {
    const re = new RegExp(`\\.${className}\\s*\\{[^}]*\\}`, 'g');
    const matches = css.match(re);
    return matches?.length ? matches.join('\n\n') : null;
}
// ─── Hover provider ───────────────────────────────────────────────────────────
const hoverProvider = {
    provideHover(document, position) {
        const line = document.lineAt(position.line).text;
        const classRe = /className=["']([^"']*)["']/g;
        let match;
        while ((match = classRe.exec(line)) !== null) {
            const valueStart = match.index + 'className="'.length;
            const valueEnd = match.index + match[0].length - 1;
            if (position.character < valueStart || position.character > valueEnd) {
                continue;
            }
            // Find which class name the cursor is over
            const classes = match[1].split(/\s+/);
            let pos = valueStart;
            for (const cls of classes) {
                if (!cls) {
                    continue;
                }
                if (position.character >= pos && position.character <= pos + cls.length) {
                    const css = resolveCssFromImports(document);
                    const rule = findCssRule(css, cls);
                    (0, output_channel_1.log)(FEATURE, `Hover on .${cls}`);
                    return new vscode.Hover(rule
                        ? new vscode.MarkdownString(`**CSS for \`.${cls}\`:**\n\`\`\`css\n${rule}\n\`\`\``)
                        : new vscode.MarkdownString(`No CSS rule found for \`.${cls}\``));
                }
                pos += cls.length + 1; // +1 for space
            }
        }
        return null;
    }
};
// ─── Activate ────────────────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, hoverProvider));
    context.subscriptions.push(vscode.commands.registerCommand('cvs.cssClassHover.enable', () => {
        const start = Date.now();
        const duration = Date.now() - start;
        // Use showResultWebview to display feedback
        // Import at top: import { showResultWebview } from '../shared/show-result-webview';
        // (If not present, add the import)
        // Show a webview result
        require('../shared/show-result-webview').showResultWebview('CSS Class Hover', 'Enable CSS Class Hover', duration, 'CSS Class Hover is now <b>active</b>.');
    }));
}
function deactivate() { }
//# sourceMappingURL=css-class-hover.js.map