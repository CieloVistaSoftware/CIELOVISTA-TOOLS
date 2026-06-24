# feature: terminal-copy-output.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.terminal.pasteOutputToChat` | Terminal: Paste Output to Chat | — |
| `cvs.terminal.pasteLastCommandToChat` | Terminal: Paste Last Command to Chat | — |

## What it does

Captures the output of the most recently executed terminal command. Uses VS Code's shell integration (`selectToPreviousCommand`) to select only the last command boundary — avoiding the entire scrollback buffer which contains corrupted rendering, duplicate prompts, and noise. The captured text is sanitised and delivered to the clipboard (Markdown-formatted) or directly into the Copilot Chat input panel.

---
| [`cvs.terminal.copyOutputClipboard`](command: cvs.terminal.copyOutputClipboard) | Terminal: Copy Output to Clipboard | `Ctrl+Shift+C` (terminal focused) |
| [`cvs.terminal.pasteOutputToChat`](command: cvs.terminal.pasteOutputToChat) | Terminal: Paste Output to Chat | — |
├── Strategy 1: chat.open({ query, mode })   — structured payload
├── Strategy 2: chat.open(string)            — raw string compat
└── Strategy 3: copilot.chat.focus + clipboard — manual Ctrl+V
| Consecutive duplicates | Same line repeated N times → 1 | `Unknown command: ASDF"` ×30 |
| Corrupted PS prompts | `PS C: \Us` (incomplete prompt fragments) | Terminal re-rendering artifacts |
When `formatAsMarkdown` is true, an additional step strips the trailing `PS C: \path>` prompt and wraps the result in a ` ```bash ``` ` fenced code block.
1. **Structured payload** — `workbench.action.chat.open` with `{ query, mode: ask' }`. Pre-fills the chat input. Most reliable in recent VS Code Insiders.
4. Run `Terminal: Paste Output to Chat` from the Command Palette — the output should appear in the Copilot Chat input.
docid: 150.1.terminal-copy-output-readme
id: feature-terminal-copy-outputts
title: feature: terminal-copy-output.ts
project: cielovista-tools
description: Captures the output of the most recently executed terminal command. Uses VS Code's shell integration (selectToPreviousCommand) to select only the l…
status: active
tags: [copy, cvs.terminal.copyOutputClipboard, cvs.terminal.pasteOutputToChat, output, terminal]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/terminal-copy-output.README.md
---