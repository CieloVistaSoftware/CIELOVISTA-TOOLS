// Copyright (c) 2025 CieloVista Software. All rights reserved.
/**
 * anthropic-client.ts
 *
 * Shared AI client for CieloVista tools. Calls AI providers in order:
 *   1. Anthropic (claude-sonnet) — if cielovistaTools.anthropic.apiKey is set
 *   2. OpenAI (gpt-4o)          — if cielovistaTools.openai.apiKey is set
 *   3. GitHub Copilot           — via VS Code's built-in language model API (no key needed)
 *
 * If all providers fail the error from the last attempt is thrown.
 * Callers just call callClaude(prompt) — provider selection is automatic.
 */
import * as vscode from 'vscode';

// ─── Config helpers ───────────────────────────────────────────────────────────

function getAnthropicKey(): string | undefined {
    return vscode.workspace.getConfiguration('cielovistaTools.anthropic').get<string>('apiKey')?.trim() || undefined;
}

function getOpenAiKey(): string | undefined {
    return vscode.workspace.getConfiguration('cielovistaTools.openai').get<string>('apiKey')?.trim() || undefined;
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function callAnthropic(prompt: string, maxTokens: number, key: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
            'Content-Type':      'application/json',
            'x-api-key':         key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            messages:   [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (!text) { throw new Error('Anthropic returned empty response'); }
    return text;
}

async function callOpenAi(prompt: string, maxTokens: number, key: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
            model:      'gpt-4o',
            max_tokens: maxTokens,
            messages:   [{ role: 'user', content: prompt }],
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) { throw new Error('OpenAI returned empty response'); }
    return text;
}

async function callCopilot(prompt: string, maxTokens: number): Promise<string> {
    // VS Code exposes Copilot and other chat models via the language model API.
    // We pick the most capable available model.
    const models = await vscode.lm.selectChatModels({
        vendor:  'copilot',
        family:  'gpt-4o',
    });

    // Fall back to any available model if gpt-4o isn't present
    const fallback = models.length === 0
        ? await vscode.lm.selectChatModels()
        : models;

    if (!fallback.length) {
        throw new Error('No Copilot / VS Code language models available. Sign into GitHub Copilot.');
    }

    const model = fallback[0];
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const request = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    let text = '';
    for await (const chunk of request.text) {
        text += chunk;
    }

    if (!text.trim()) { throw new Error('Copilot returned empty response'); }
    return text.trim();
}

// ─── Key prompt helpers ───────────────────────────────────────────────────────

export async function promptForAnthropicKey(): Promise<string | undefined> {
    const key = await vscode.window.showInputBox({
        prompt:         'Enter your Anthropic API key (saved to User settings)',
        placeHolder:    'sk-ant-...',
        password:       true,
        ignoreFocusOut: true,
    });
    if (!key?.trim()) { return undefined; }
    await vscode.workspace.getConfiguration('cielovistaTools.anthropic').update(
        'apiKey', key.trim(), vscode.ConfigurationTarget.Global
    );
    return key.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calls AI providers in order: Anthropic → OpenAI → GitHub Copilot.
 * Each failure is logged and the next provider is tried.
 * Throws if ALL providers fail.
 */
export async function callClaude(prompt: string, maxTokens = 2000): Promise<string> {
    const errors: string[] = [];

    // 1 — Anthropic
    const anthropicKey = getAnthropicKey();
    if (anthropicKey) {
        try {
            const result = await callAnthropic(prompt, maxTokens, anthropicKey);
            return result;
        } catch (err) {
            errors.push(`Anthropic: ${err}`);
        }
    } else {
        errors.push('Anthropic: no API key configured');
    }

    // 2 — OpenAI
    const openAiKey = getOpenAiKey();
    if (openAiKey) {
        try {
            const result = await callOpenAi(prompt, maxTokens, openAiKey);
            vscode.window.showInformationMessage('ℹ️ Used OpenAI as fallback (Anthropic unavailable)');
            return result;
        } catch (err) {
            errors.push(`OpenAI: ${err}`);
        }
    } else {
        errors.push('OpenAI: no API key configured');
    }

    // 3 — GitHub Copilot (no key needed — uses VS Code auth)
    try {
        const result = await callCopilot(prompt, maxTokens);
        vscode.window.showInformationMessage('ℹ️ Used GitHub Copilot as fallback');
        return result;
    } catch (err) {
        errors.push(`Copilot: ${err}`);
    }

    // All failed
    const summary = errors.join('\n');
    const action = await vscode.window.showErrorMessage(
        'All AI providers failed. Set an API key in settings.',
        'Set Anthropic Key', 'Set OpenAI Key', 'Open Settings'
    );

    if (action === 'Set Anthropic Key') {
        const key = await promptForAnthropicKey();
        if (key) { return callClaude(prompt, maxTokens); }
    }
    if (action === 'Set OpenAI Key') {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your OpenAI API key', placeHolder: 'sk-...', password: true
        });
        if (key?.trim()) {
            await vscode.workspace.getConfiguration('cielovistaTools.openai').update(
                'apiKey', key.trim(), vscode.ConfigurationTarget.Global
            );
            return callClaude(prompt, maxTokens);
        }
    }
    if (action === 'Open Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'cielovistaTools');
    }

    throw new Error(`All AI providers failed:\n${summary}`);
}

/**
 * Returns which provider is currently active (for display purposes).
 */
export function getActiveProvider(): string {
    if (getAnthropicKey()) { return 'Anthropic (claude-sonnet)'; }
    if (getOpenAiKey())    { return 'OpenAI (gpt-4o)'; }
    return 'GitHub Copilot';
}
