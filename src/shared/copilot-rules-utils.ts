// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * copilot-rules-utils.ts
 * All logic for reading, applying, and removing Copilot instruction rules.
 *
 * Rule: copilot-rules-enforcer, copilot-rules-provider, and any future
 * rules-related feature all import from here. The actual VS Code command
 * registration stays in each feature file — only the shared business logic
 * lives here.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from './output-channel';

const FEATURE = 'copilot-rules-utils';

/** VS Code settings key for Copilot code-generation instructions. */
const COPILOT_INSTRUCTIONS_KEY = 'github.copilot.chat.codeGeneration.instructions';

/** Default rules file name written into the workspace root. */
const RULES_FILE_NAME = 'copilot-rules.md';

/** Default rule content used when no rules file exists. */
export const DEFAULT_RULES = `# CieloVista Code Suggestion Guidelines

## Rules for Code Suggestions

1. Always include the full file path in every suggestion.
2. Format suggestions as JSON objects with line numbers.
3. Be friendly, concise, and focus on readability.
4. Never show shell (sh) commands — use PowerShell or TypeScript.
5. Always include type annotations in TypeScript.
6. Point out potential bugs and anti-patterns.
`;

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Reads the rules file from the workspace root.
 * If no file exists, creates one with DEFAULT_RULES and returns that.
 *
 * @param workspacePath  Absolute path to the workspace root
 * @returns              The rules content as a string
 */
export function readRulesFile(workspacePath: string): string {
    const rulesPath = path.join(workspacePath, RULES_FILE_NAME);
    if (!fs.existsSync(rulesPath)) {
        fs.writeFileSync(rulesPath, DEFAULT_RULES, 'utf8');
        log(FEATURE, `Created default rules file at ${rulesPath}`);
    }
    return fs.readFileSync(rulesPath, 'utf8');
}

/**
 * Returns the currently active Copilot rules as a formatted string.
 * Checks workspace settings first, falls back to DEFAULT_RULES.
 */
export function getCurrentRules(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
        const settingsPath = path.join(folders[0].uri.fsPath, '.vscode', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                const rules = settings[COPILOT_INSTRUCTIONS_KEY];
                if (Array.isArray(rules) && rules.length > 0) {
                    return formatRulesForDisplay(rules, folders[0].uri.fsPath);
                }
            } catch (err) {
                logError(FEATURE, 'Failed to read workspace settings', err);
            }
        }
    }
    return DEFAULT_RULES;
}

/**
 * Formats a Copilot instructions array (from settings.json) into readable text.
 *
 * @param rules         Array of { text?: string; file?: string } objects
 * @param workspacePath Needed to resolve file-based rules
 */
export function formatRulesForDisplay(rules: Array<{ text?: string; file?: string }>, workspacePath: string): string {
    let output = '# Current Copilot Rules\n\n';
    for (const rule of rules) {
        if (rule.text) {
            output += `## Inline Rule\n\n${rule.text}\n\n`;
        } else if (rule.file) {
            const filePath = path.join(workspacePath, rule.file);
            output += `## From file: ${rule.file}\n\n`;
            output += fs.existsSync(filePath)
                ? fs.readFileSync(filePath, 'utf8') + '\n\n'
                : `_(File not found: ${rule.file})_\n\n`;
        }
    }
    return output;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

/**
 * Applies rules at the workspace level by writing/updating .vscode/settings.json.
 * Points Copilot at the rules file in the workspace root.
 *
 * @param workspacePath  Absolute path to the workspace root
 */
export function applyWorkspaceRules(workspacePath: string): void {
    const vscodePath = path.join(workspacePath, '.vscode');
    const settingsPath = path.join(vscodePath, 'settings.json');

    if (!fs.existsSync(vscodePath)) { fs.mkdirSync(vscodePath, { recursive: true }); }

    // Ensure rules file exists
    readRulesFile(workspacePath);

    // Merge into existing settings
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
        try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
        catch { /* corrupt settings — start fresh */ }
    }

    settings[COPILOT_INSTRUCTIONS_KEY] = [{ file: RULES_FILE_NAME }];
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    log(FEATURE, `Applied workspace rules → ${settingsPath}`);
    vscode.window.showInformationMessage(`Copilot rules applied to workspace.`);
}

/**
 * Applies rules at the global (user) level via VS Code configuration API.
 * Use when there is no workspace open.
 */
export function applyUserRules(): void {
    vscode.workspace.getConfiguration().update(
        COPILOT_INSTRUCTIONS_KEY,
        [{ text: DEFAULT_RULES }],
        vscode.ConfigurationTarget.Global
    );
    log(FEATURE, 'Applied user-level rules');
    vscode.window.showInformationMessage('Copilot rules applied at user level.');
}

// ─── Remove ──────────────────────────────────────────────────────────────────

/**
 * Removes Copilot instruction rules from workspace settings.json.
 *
 * @param workspacePath  Absolute path to the workspace root
 */
export function removeWorkspaceRules(workspacePath: string): void {
    const settingsPath = path.join(workspacePath, '.vscode', 'settings.json');
    if (!fs.existsSync(settingsPath)) { return; }
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        delete settings[COPILOT_INSTRUCTIONS_KEY];
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        log(FEATURE, 'Removed workspace rules');
        vscode.window.showInformationMessage('Copilot rules removed from workspace.');
    } catch (err) {
        logError(FEATURE, 'removeWorkspaceRules failed', err);
    }
}

/**
 * Removes Copilot instruction rules from global user settings.
 */
export function removeUserRules(): void {
    vscode.workspace.getConfiguration().update(
        COPILOT_INSTRUCTIONS_KEY,
        undefined,
        vscode.ConfigurationTarget.Global
    );
    log(FEATURE, 'Removed user-level rules');
    vscode.window.showInformationMessage('Copilot rules removed from user settings.');
}

// ─── Smart apply (workspace or user) ─────────────────────────────────────────

/**
 * Applies rules to the workspace if one is open, otherwise applies at user level.
 * This is the single entry point most features should call.
 */
export function applyRules(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
        applyWorkspaceRules(folders[0].uri.fsPath);
    } else {
        applyUserRules();
    }
}

/**
 * Removes rules from the workspace if one is open, otherwise removes at user level.
 */
export function removeRules(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length) {
        removeWorkspaceRules(folders[0].uri.fsPath);
    } else {
        removeUserRules();
    }
}
