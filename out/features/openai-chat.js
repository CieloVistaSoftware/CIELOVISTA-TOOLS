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
 * openai-chat.ts
 * Adds OpenAI-powered commands directly into VS Code:
 *   - Explain selected code
 *   - Refactor selected code
 *   - Generate a JSDoc/docstring for the selected function
 *   - Open a persistent OpenAI chat panel
 *
 * The API key is read from VS Code settings (never hard-coded).
 * All OpenAI calls go through the single callOpenAI() helper so
 * there is no duplicated fetch logic.
 *
 * Commands registered:
 *   cvs.openai.explain          — explain selected code (Ctrl+I)
 *   cvs.openai.refactor         — suggest refactoring for selected code
 *   cvs.openai.generateDocstring — generate JSDoc comment (Ctrl+Alt+D)
 *   cvs.openai.openChat         — open persistent chat panel
 *
 * Settings:
 *   cielovistaTools.openai.apiKey  — your OpenAI API key
 *   cielovistaTools.openai.model   — model name (default: gpt-4o)
 */
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const output_channel_1 = require("../shared/output-channel");
const webview_utils_1 = require("../shared/webview-utils");
const FEATURE = 'openai-chat';
const CFG = 'cielovistaTools.openai';
let _chatPanel;
// ─── Config helpers ───────────────────────────────────────────────────────────
function getApiKey() {
    return vscode.workspace.getConfiguration(CFG).get('apiKey', '');
}
function getModel() {
    return vscode.workspace.getConfiguration(CFG).get('model', 'gpt-4o');
}
function callOpenAI(messages) {
    return new Promise((resolve, reject) => {
        const apiKey = getApiKey();
        if (!apiKey) {
            reject(new Error('No API key configured. Set cielovistaTools.openai.apiKey in settings.'));
            return;
        }
        const body = JSON.stringify({ model: getModel(), messages, max_tokens: 1024 });
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body),
            },
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message));
                        return;
                    }
                    resolve(parsed.choices?.[0]?.message?.content ?? '');
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
// ─── Selection helper ─────────────────────────────────────────────────────────
function getSelectedText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return undefined;
    }
    const text = editor.document.getText(editor.selection);
    return text.trim() || undefined;
}
// ─── Commands ─────────────────────────────────────────────────────────────────
async function explainCode() {
    const code = getSelectedText();
    if (!code) {
        vscode.window.showWarningMessage('Select some code first.');
        return;
    }
    await runWithProgress('Explaining…', [
        { role: 'system', content: 'You are a helpful coding assistant. Explain the code clearly and concisely.' },
        { role: 'user', content: `Explain this code:\n\n\`\`\`\n${code}\n\`\`\`` },
    ]);
}
async function refactorCode() {
    const code = getSelectedText();
    if (!code) {
        vscode.window.showWarningMessage('Select some code first.');
        return;
    }
    await runWithProgress('Refactoring…', [
        { role: 'system', content: 'You are a senior engineer. Suggest clean, idiomatic refactoring.' },
        { role: 'user', content: `Suggest refactoring for:\n\n\`\`\`\n${code}\n\`\`\`` },
    ]);
}
async function generateDocstring() {
    const code = getSelectedText();
    if (!code) {
        vscode.window.showWarningMessage('Select a function first.');
        return;
    }
    await runWithProgress('Generating docstring…', [
        { role: 'system', content: 'Generate a JSDoc comment for the following function. Return only the comment block, nothing else.' },
        { role: 'user', content: code },
    ]);
}
async function runWithProgress(title, messages) {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, async () => {
        try {
            const result = await callOpenAI(messages);
            (0, output_channel_1.log)(FEATURE, `${title} — done`);
            showResultPanel(title.replace('…', ''), result);
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `${title} failed`, err);
            vscode.window.showErrorMessage(`OpenAI error: ${err}`);
        }
    });
}
// ─── Result panel ─────────────────────────────────────────────────────────────
function showResultPanel(title, content) {
    const panel = vscode.window.createWebviewPanel('openaiResult', `OpenAI: ${title}`, vscode.ViewColumn.Beside, { enableScripts: false });
    panel.webview.html = (0, webview_utils_1.buildWebviewPage)({
        title,
        bodyHtml: `<h2>${(0, webview_utils_1.escapeHtml)(title)}</h2><pre>${(0, webview_utils_1.escapeHtml)(content)}</pre>`,
    });
}
// ─── Chat panel ───────────────────────────────────────────────────────────────
function openChatPanel() {
    if (_chatPanel) {
        _chatPanel.reveal();
        return;
    }
    _chatPanel = vscode.window.createWebviewPanel('openaiChat', 'OpenAI Chat', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    const history = [
        { role: 'system', content: 'You are a helpful VS Code development assistant for CieloVistaSoftware.' }
    ];
    _chatPanel.webview.html = buildChatHtml([]);
    _chatPanel.onDidDispose(() => { _chatPanel = undefined; });
    _chatPanel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command !== 'send' || !msg.text?.trim()) {
            return;
        }
        history.push({ role: 'user', content: msg.text });
        try {
            const reply = await callOpenAI(history);
            history.push({ role: 'assistant', content: reply });
            _chatPanel?.webview.postMessage({ command: 'reply', text: reply });
        }
        catch (err) {
            _chatPanel?.webview.postMessage({ command: 'error', text: String(err) });
        }
    });
}
function buildChatHtml(messages) {
    return (0, webview_utils_1.buildWebviewPage)({
        title: 'OpenAI Chat',
        bodyHtml: `
            <h2>OpenAI Chat</h2>
            <div id="messages" style="height:60vh;overflow-y:auto;border:1px solid var(--vscode-panel-border);padding:10px;margin-bottom:10px;border-radius:4px;"></div>
            <div style="display:flex;gap:8px;">
                <input id="input" type="text" placeholder="Ask OpenAI…"
                       style="flex:1;padding:6px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:2px;">
                <button id="sendBtn">Send</button>
            </div>`,
        scripts: `
            const vscode = acquireVsCodeApi();
            const msgs   = document.getElementById('messages');
            const input  = document.getElementById('input');

            function addMessage(role, text) {
                const div = document.createElement('div');
                div.style.cssText = 'margin-bottom:10px;padding:8px;border-radius:4px;background:' +
                    (role === 'user' ? 'var(--vscode-inputOption-activeBackground)' : 'var(--vscode-editor-background)');
                div.innerHTML = '<strong>' + role + ':</strong> <pre style="white-space:pre-wrap;margin:4px 0 0">' + text + '</pre>';
                msgs.appendChild(div);
                msgs.scrollTop = msgs.scrollHeight;
            }

            document.getElementById('sendBtn').addEventListener('click', () => {
                const text = input.value.trim();
                if (!text) return;
                addMessage('You', text);
                input.value = '';
                vscode.postMessage({ command: 'send', text });
            });

            input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('sendBtn').click(); });

            window.addEventListener('message', e => {
                const msg = e.data;
                if (msg.command === 'reply') addMessage('Assistant', msg.text);
                if (msg.command === 'error') addMessage('Error', msg.text);
            });
        `,
    });
}
// ─── Activate ────────────────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    context.subscriptions.push(vscode.commands.registerCommand('cvs.openai.explain', explainCode), vscode.commands.registerCommand('cvs.openai.refactor', refactorCode), vscode.commands.registerCommand('cvs.openai.generateDocstring', generateDocstring), vscode.commands.registerCommand('cvs.openai.openChat', openChatPanel));
}
function deactivate() {
    _chatPanel?.dispose();
    _chatPanel = undefined;
}
//# sourceMappingURL=openai-chat.js.map