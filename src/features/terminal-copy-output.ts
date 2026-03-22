// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * terminal-copy-output.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Captures the output of the most recently executed terminal command and either
 * copies it to the clipboard (wrapped in a Markdown fenced code block) or sends
 * it directly into the Copilot Chat input panel.
 *
 * How it works:
 *   1. The VS Code terminal shell integration API tracks command boundaries.
 *      We use `selectToPreviousCommand` to highlight only the last command and
 *      its output — this avoids pulling in the entire scrollback buffer which
 *      contains corrupted rendering artifacts, duplicate prompt lines, and
 *      "History restored" noise.
 *   2. The selected text is copied to the system clipboard via
 *      `workbench.action.terminal.copySelection`.
 *   3. A sanitisation pipeline strips common terminal noise:
 *      - "History restored" banners from VS Code
 *      - Empty continuation prompt lines (bare ">" characters)
 *      - Consecutive duplicate lines (e.g. an error repeated 30×)
 *      - Garbled/corrupted lines from terminal re-rendering
 *      - Partial PS prompt fragments that aren't valid prompts
 *      - Excessive blank lines
 *   4. The cleaned text is optionally wrapped in ```bash``` fencing and placed
 *      back on the clipboard, or forwarded to Copilot Chat.
 *
 * Commands registered:
 *   cvs.terminal.copyOutputClipboard — copy last command output to clipboard
 *   cvs.terminal.pasteOutputToChat   — copy last command output to Copilot chat
 *
 * Keybinding:
 *   Ctrl+Shift+C (when terminal is focused) → cvs.terminal.copyOutputClipboard
 *
 * Dependencies:
 *   - ../shared/output-channel (log, logError) — extension output channel
 *   - VS Code shell integration (enabled by default since VS Code 1.85)
 * ──────────────────────────────────────────────────────────────────────────────
 */
import * as vscode from 'vscode';
import { log, logError } from '../shared/output-channel';

/** Feature identifier used in log messages and error reports. */
const FEATURE: string = 'terminal-copy-output';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Options controlling how terminal output is captured and delivered.
 *
 * @property formatAsMarkdown - When true, wraps the output in a ```bash```
 *           fenced code block and strips trailing PS prompts. The formatted
 *           text is written back to the clipboard so it's ready to paste
 *           into any Markdown-aware surface.
 * @property pasteToChat - When true, attempts to send the captured output
 *           directly into the Copilot Chat input panel via sendToCopilotChat().
 */
interface CopyOptions {
    formatAsMarkdown?: boolean;
    pasteToChat?: boolean;
}

// ─── Copilot Chat integration ────────────────────────────────────────────────

/**
 * Attempts to send captured terminal content into the Copilot Chat input.
 *
 * Multiple strategies are attempted because the Chat API has changed across
 * VS Code and Copilot Chat releases:
 *
 *   Strategy 1 (preferred): `workbench.action.chat.open` with a structured
 *   payload `{ query, mode }`. This pre-fills the chat input without sending.
 *   Available in recent VS Code Insiders builds.
 *
 *   Strategy 2 (compat): Same command with a raw string argument. Works in
 *   older Copilot Chat releases that accept a plain string instead of an
 *   object payload.
 *
 *   Strategy 3 (fallback): Focus the chat panel via `github.copilot.chat.focus`,
 *   write content to the clipboard, and return false so the caller can show a
 *   "press Ctrl+V" message. We cannot programmatically paste into the chat
 *   input widget because `editor.action.clipboardPasteAction` only works in
 *   TextEditor instances, not in the chat widget's custom input control.
 *
 * @param content - The sanitised terminal output (may include Markdown fencing).
 * @returns true if content was successfully placed in the chat input,
 *          false if only the clipboard fallback was used.
 */
async function sendToCopilotChat(content: string): Promise<boolean> {
    // Strategy 1 — structured query payload (most reliable)
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: content,
            mode: 'ask',
        });
        return true;
    } catch {
        // Not supported in this version — try next strategy.
    }

    // Strategy 2 — raw string payload (older Copilot builds)
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', content);
        return true;
    } catch {
        // Not supported in this version — try next strategy.
    }

    // Strategy 3 — focus chat + clipboard (best-effort fallback)
    // The user will need to Ctrl+V manually since we can't paste into the
    // chat widget programmatically.
    try {
        await vscode.commands.executeCommand('github.copilot.chat.focus');
        await delay(500);
        await vscode.env.clipboard.writeText(content);
        return false;
    } catch {
        // Could not focus chat at all — give up entirely.
    }

    return false;
}

// ─── Core copy logic ─────────────────────────────────────────────────────────

/**
 * Main entry point: captures the last terminal command's output, sanitises it,
 * and delivers it to the requested destination(s).
 *
 * Terminal capture flow:
 *   1. Ensure an active terminal exists and bring it into view.
 *   2. Save the current clipboard contents so we can detect whether the
 *      copy command actually wrote new data.
 *   3. Use `selectToPreviousCommand` (shell integration) to select only the
 *      last command and its output — NOT the entire scrollback buffer.
 *   4. Copy the selection to the clipboard with `copySelection`.
 *   5. Compare clipboard to the saved original to confirm new data arrived.
 *   6. Clear the terminal selection highlight.
 *   7. Run the sanitisation pipeline to remove terminal noise.
 *   8. Optionally wrap in Markdown fencing and/or send to Copilot Chat.
 *
 * Why we don't use selectAll:
 *   The terminal scrollback buffer contains corrupted rendering artifacts,
 *   duplicate prompt lines, "History restored" banners, and garbled text from
 *   terminal re-rendering. selectToPreviousCommand avoids all of this by only
 *   selecting the last command boundary.
 *
 * @param opts - Controls output format and destination. See CopyOptions.
 * @returns true if content was successfully captured and delivered.
 */
async function copyTerminalOutput(opts: CopyOptions = {}): Promise<boolean> {
    const terminal: vscode.Terminal | undefined = vscode.window.activeTerminal;
    if (!terminal) {
        vscode.window.showWarningMessage('No active terminal.');
        return false;
    }

    // Bring terminal into view. The preserveFocus=true parameter keeps
    // the terminal panel visible without stealing keyboard focus.
    terminal.show(true);

    // Wait for the terminal to stabilise after show(). Without this delay
    // the selection commands can fire before the terminal is ready.
    await delay(500);

    // Save current clipboard so we can detect if copySelection writes new data.
    // If the clipboard content doesn't change, we know the copy failed.
    const originalClip: string = await vscode.env.clipboard.readText();
    let copied: boolean = false;

    // Use selectToPreviousCommand to select ONLY the last command's output.
    // This requires shell integration (enabled by default since VS Code 1.85).
    // If shell integration isn't available, the command will throw and we
    // catch it gracefully, showing an instruction to select text manually.
    try {
        await vscode.commands.executeCommand('workbench.action.terminal.selectToPreviousCommand');
        await delay(400);  // Wait for selection to complete
        await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
        await delay(200);  // Wait for clipboard write to complete
        const text: string = await vscode.env.clipboard.readText();
        if (text && text !== originalClip) { copied = true; }
    } catch { /* shell integration not available */ }

    if (!copied) {
        vscode.window.showWarningMessage(
            'Could not capture last command output. Try selecting the text manually, then run this command again.'
        );
        return false;
    }

    await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');

    let content: string = await vscode.env.clipboard.readText();

    if (!content?.trim()) {
        vscode.window.showWarningMessage('No terminal content was captured.');
        return false;
    }

    // Sanitise raw terminal capture — remove shell noise.
    content = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove "History restored" lines injected by VS Code terminal
        .replace(/^\s*\*\s*History restored\s*\n?/gm, '')
        // Remove lines that are only ">" prompts (empty continuation lines)
        .replace(/^>\s*$/gm, '')
        // Deduplicate consecutive identical lines (keep first occurrence)
        .replace(/^(.+)(\n\1)+$/gm, '$1')
        // Remove corrupted lines with repeated fragments (garbled rendering)
        .replace(/^.*(.{4,})\1{2,}.*$/gm, '')
        // Remove corrupted PS prompt fragments (keep only full prompts ending with ">")
        .replace(/^PS [a-zA-Z]:[\\\/].*$/gm, (match: string): string => {
            return />\s*$/.test(match) ? match : '';
        })
        // Remove lines that are only whitespace
        .replace(/^\s+$/gm, '')
        // Collapse blank-line runs (3+ → 1)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (opts.formatAsMarkdown) {
        // Strip trailing PS prompt at end of output
        content = content
            .replace(/\n+PS [a-zA-Z]:[\\\/][^\n]*>\s*$/g, '')
            .trim();
        content = `\`\`\`bash\n${content}\n\`\`\``;
        await vscode.env.clipboard.writeText(content);
    }

    const lines: number = content.split('\n').length;
    vscode.window.showInformationMessage(`Terminal output copied (${lines} lines).`);
    log(FEATURE, `Copied ${lines} lines from terminal`);

    if (opts.pasteToChat) {
        try {
            const pasted: boolean = await sendToCopilotChat(content);
            if (!pasted) {
                throw new Error('No chat insertion strategy succeeded.');
            }
            vscode.window.showInformationMessage('Terminal output pasted to Copilot chat.');
        } catch (err) {
            logError(FEATURE, 'Failed to paste to Copilot chat', err);
            vscode.window.showWarningMessage(
                'Could not send to chat — content is on your clipboard. Press Ctrl+V in the chat input.'
            );
        }
    }

    return true;
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.terminal.copyOutputClipboard', () => copyTerminalOutput({ formatAsMarkdown: true })),
        vscode.commands.registerCommand('cvs.terminal.pasteOutputToChat',   () => copyTerminalOutput({ pasteToChat: true, formatAsMarkdown: true })),
    );
}

export function deactivate(): void { /* nothing to clean up */ }

// ─── Utility ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve: () => void) => setTimeout(resolve, ms));
}
