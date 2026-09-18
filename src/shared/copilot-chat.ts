// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * copilot-chat.ts
 * Shared helper that places text in the Copilot Chat input.
 *
 * Rule: every feature (and shared module) that sends text to Copilot Chat
 * imports it from here. It used to live in features/terminal-copy-output.ts,
 * which made shared/ depend on features/ (#751).
 */
import * as vscode from 'vscode';

/**
 * Attempts to send content into the Copilot Chat input.
 *
 * Multiple strategies are attempted because the Chat API has changed across
 * VS Code and Copilot Chat releases:
 *
 *   Strategy 1 (preferred): `workbench.action.chat.open` with a structured
 *   payload `{ query }`. This pre-fills the chat input without sending.
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
 * @param content - The text to place in the chat input (may include Markdown).
 * @returns true if content was successfully placed in the chat input,
 *          false if only the clipboard fallback was used.
 */
export async function sendToCopilotChat(content: string): Promise<boolean> {
    // Strategy 1 — query-only payload (no mode — mode:'ask' causes attachment errors)
    try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: content,
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

    // Strategy 3 — focus chat + write to clipboard so user can Ctrl+V
    await vscode.env.clipboard.writeText(content);
    try {
        await vscode.commands.executeCommand('github.copilot.chat.focus');
    } catch {
        // Chat panel not available — clipboard still has the content.
    }
    return false;
}
