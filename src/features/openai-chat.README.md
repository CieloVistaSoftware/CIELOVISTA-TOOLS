# feature: openai-chat.ts

## What it does

Adds OpenAI-powered commands to VS Code: explain selected code, suggest refactoring, generate a JSDoc docstring, and open a persistent chat panel. All four commands share a single `callOpenAI()` helper — no duplicated fetch logic anywhere.

---

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| [`cvs.openai.explain`](command:cvs.openai.explain) | OpenAI: Explain Code | `Ctrl+I` (editor focused) |
| [`cvs.openai.refactor`](command:cvs.openai.refactor) | OpenAI: Refactor Code | — |
| [`cvs.openai.generateDocstring`](command:cvs.openai.generateDocstring) | OpenAI: Generate Docstring | `Ctrl+Alt+D` (editor focused) |
| [`cvs.openai.openChat`](command:cvs.openai.openChat) | OpenAI: Open Chat Panel | — |

---

## Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `cielovistaTools.openai.apiKey` | string | `""` | Your OpenAI API key — keep secret, never commit |
| `cielovistaTools.openai.model` | enum | `gpt-4o` | Model: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` |

---

## Internal architecture

```
callOpenAI(messages[])
  └── reads apiKey and model from settings
  └── https.request('api.openai.com/v1/chat/completions')
  └── returns response content string

explainCode / refactorCode / generateDocstring
  └── getSelectedText() → error if nothing selected
  └── runWithProgress(title, messages[])
       └── callOpenAI(messages)
       └── showResultPanel(title, result)
            └── buildWebviewPage()  [from shared/webview-utils]

openChatPanel()
  └── creates WebviewPanel (retained when hidden)
  └── maintains history[] array in closure
  └── webview posts { command: 'send', text }
  └── extension calls callOpenAI([...history])
  └── posts { command: 'reply', text } back to webview
```

### System prompts used

| Command | System prompt |
|---|---|
| explain | "You are a helpful coding assistant. Explain the code clearly and concisely." |
| refactor | "You are a senior engineer. Suggest clean, idiomatic refactoring." |
| docstring | "Generate a JSDoc comment for the following function. Return only the comment block." |
| chat | "You are a helpful VS Code development assistant for CieloVistaSoftware." |

---

## Chat panel conversation history

The chat panel maintains a `history: OpenAIMessage[]` array in the closure of `openChatPanel()`. Each user message is appended before calling the API; each assistant reply is appended after. This gives the model full conversation context for follow-up questions.

The history is reset when the panel is closed and reopened.

---

## Security note

The API key is read from VS Code settings at call time — never stored in module scope, never logged. Do not commit your API key to source control. Use VS Code's User settings (not Workspace settings) to store it so it never ends up in a project `.vscode/settings.json`.

---

## Manual test

1. Set `cielovistaTools.openai.apiKey` in User settings.
2. Open any TypeScript file, select a function, press `Ctrl+I`.
3. A result panel should open beside the editor with the explanation.
4. Run `OpenAI: Open Chat Panel`, type a question — reply should appear in the panel.
5. Remove the API key, run any command — should show a clear error message.
