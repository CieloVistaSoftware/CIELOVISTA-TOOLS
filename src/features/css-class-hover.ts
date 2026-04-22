// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
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
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'css-class-hover';

const SUPPORTED_LANGUAGES = ['html', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

// ─── CSS resolution ───────────────────────────────────────────────────────────

/** Extracts inline CSS from <style> blocks in an HTML document. */
function extractInlineCss(document: vscode.TextDocument): string {
    const text    = document.getText();
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let   css     = '';
    let   match: RegExpExecArray | null;
    while ((match = styleRe.exec(text)) !== null) {
        css += match[1] + '\n';
    }
    return css;
}

/** Reads all CSS files linked via <link rel="stylesheet"> or import() in the document. */
function resolveCssFromImports(document: vscode.TextDocument): string {
    const text      = document.getText();
    const docDir    = path.dirname(document.uri.fsPath);
    let   css       = '';

    // ES module imports:  import './foo.css'
    const importRe  = /import\s+['"]([^'"]*\.css)['"]/g;
    let   match: RegExpExecArray | null;
    while ((match = importRe.exec(text)) !== null) {
        const full = path.resolve(docDir, match[1]);
        try { if (fs.existsSync(full)) { css += fs.readFileSync(full, 'utf8') + '\n'; } }
        catch (err) { logError(`Could not read CSS file: ${full}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    }

    // HTML <link rel="stylesheet" href="...">  
    const linkRe    = /<link[^>]+href=['"]([^'"]*\.css)['"][^>]*>/gi;
    while ((match = linkRe.exec(text)) !== null) {
        const full = path.resolve(docDir, match[1]);
        try { if (fs.existsSync(full)) { css += fs.readFileSync(full, 'utf8') + '\n'; } }
        catch (err) { logError(`Could not read linked CSS file: ${full}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE); }
    }

    return css;
}

/** Finds all CSS rule blocks matching .className in the given CSS string. */
function findCssRule(css: string, className: string): string | null {
    const re      = new RegExp(`\\.${className}\\s*\\{[^}]*\\}`, 'g');
    const matches = css.match(re);
    return matches?.length ? matches.join('\n\n') : null;
}

// ─── Hover provider ───────────────────────────────────────────────────────────

const hoverProvider: vscode.HoverProvider = {
    provideHover(document, position) {
        const line = document.lineAt(position.line).text;

        // Match both HTML class="..." and JSX className="..."
        const classRe = /(?:class|className)=["']([^"']*)["']/g;
        let   match: RegExpExecArray | null;

        while ((match = classRe.exec(line)) !== null) {
            const attrName   = match[0].startsWith('className') ? 'className' : 'class';
            const valueStart = match.index + attrName.length + 2; // +2 for ="
            const valueEnd   = match.index + match[0].length - 1;

            if (position.character < valueStart || position.character > valueEnd) { continue; }

            // Find which class name the cursor is over
            const classes = match[1].split(/\s+/);
            let pos = valueStart;
            for (const cls of classes) {
                if (!cls) { continue; }
                if (position.character >= pos && position.character <= pos + cls.length) {
                    // Combine inline <style> blocks + linked/imported CSS files
                    const css  = extractInlineCss(document) + resolveCssFromImports(document);
                    const rule = findCssRule(css, cls);
                    log(FEATURE, `Hover on .${cls}`);
                    return new vscode.Hover(
                        rule
                            ? new vscode.MarkdownString(`**CSS for \`.${cls}\`:**\n\`\`\`css\n${rule}\n\`\`\``)
                            : new vscode.MarkdownString(`No CSS rule found for \`.${cls}\``)
                    );
                }
                pos += cls.length + 1; // +1 for space
            }
        }
        return null;
    }
};

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, hoverProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.cssClassHover.enable', () => {
            const start = Date.now();
            const duration = Date.now() - start;
            // Use showResultWebview to display feedback
            // Import at top: import { showResultWebview } from '../shared/show-result-webview';
            // (If not present, add the import)
            // Show a webview result
            require('../shared/show-result-webview').showResultWebview(
                'CSS Class Hover',
                'Enable CSS Class Hover',
                duration,
                'CSS Class Hover is now <b>active</b>.'
            );
        })
    );
}

export function deactivate(): void { /* nothing to clean up */ }
