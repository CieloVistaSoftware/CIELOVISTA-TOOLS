---
title: feature: terminal-copy-output.ts
description: Captures the output of the most recently executed terminal command. Uses VS Code's shell integration (selectToPreviousCommand) to select only the l…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/terminal-copy-output.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [terminal, copy, output]
---

# feature: terminal-copy-output.ts

## What it does

Captures the output of the most recently executed terminal command. Uses VS Code's shell integration (`selectToPreviousCommand`) to select only the last command boundary — avoiding the entire scrollback buffer which contains corrupted rendering, duplicate prompts, and noise. The captured text is sanitised and delivered to the clipboard (Markdown-formatted) or directly into the Copilot Chat input panel.

---

## Commands

| Command ID | Title (in palette) | Keybinding |
|---|---|---|
| [`cvs.terminal.copyOutputClipboard`](command:cvs.terminal.copyOutputClipboard) | Terminal: Copy Output to Clipboard | `Ctrl+Shift+C` (terminal focused) |
| [`cvs.terminal.pasteOutputToChat`](command:cvs.terminal.pasteOutputToChat) | Terminal: Paste Output to Chat | — |

---

## Internal architecture

```
copyTerminalOutput(opts)
  ├── terminal.show(true)               — bring terminal into view
  ├── clipboard.readText()              — save original clipboard for comparison
  ├── selectToPreviousCommand           — select last command + output only
  ├── copySelection                     — copy selection to clipboard
  ├── clipboard comparison              — confirm new data was captured
  ├── clearSelection                    — remove blue highlight
  ├── sanitisation pipeline             — strip terminal noise (see below)
  ├── formatAsMarkdown?                 — wrap in ```bash``` fencing
  └── pasteToChat?
      └── sendToCopilotChat(content)
          ├── Strategy 1: chat.open({ query, mode })   — structured payload
          ├── Strategy 2: chat.open(string)            — raw string compat
          └── Strategy 3: copilot.chat.focus + clipboard — manual Ctrl+V
```

---

## Sanitisation pipeline

The captured terminal text passes through these filters in order:

| Step | What it removes | Example |
|---|---|---|
| Line ending normalisation | `\r\n` → `\n` | Windows line endings |
| History restored | `* History restored *` | VS Code terminal reconnect banner |
| Empty `>` lines | Lines with only `>` and whitespace | Multi-line command continuations |
| Consecutive duplicates | Same line repeated N times → 1 | `Unknown command: "ASDF"` ×30 |
| Garbled lines | Lines with 4+ char fragment repeated 3+ times | `UnknownUnknownUnknown...` |
| Corrupted PS prompts | `PS C:\Us` (incomplete prompt fragments) | Terminal re-rendering artifacts |
| Whitespace-only lines | Lines that are only spaces/tabs | Left behind by other filters |
| Blank line collapse | 3+ blank lines → 1 | Excessive vertical whitespace |

When `formatAsMarkdown` is true, an additional step strips the trailing `PS C:\path>` prompt and wraps the result in a ` ```bash ``` ` fenced code block.

---

## Copilot Chat delivery

Three strategies are attempted in order because the Chat API has changed across VS Code / Copilot Chat releases:

1. **Structured payload** — `workbench.action.chat.open` with `{ query, mode: 'ask' }`. Pre-fills the chat input. Most reliable in recent VS Code Insiders.
2. **Raw string** — Same command with a plain string. Works in older Copilot Chat releases.
3. **Focus + clipboard** — `github.copilot.chat.focus` then writes to clipboard. User must Ctrl+V manually. `editor.action.clipboardPasteAction` does NOT work in the chat widget.

---

## Known limitations

- `selectToPreviousCommand` requires VS Code shell integration (enabled by default since 1.85). If shell integration is disabled or unavailable, the command will show a warning asking the user to select text manually.
- The `selectAll` fallback was intentionally removed — it pulled in the entire terminal buffer with corrupted rendering artifacts, duplicate lines, and garbled text.
- Paste to Copilot Chat depends on the installed VS Code / Copilot Chat version. If no programmatic insertion works, content is left on the clipboard with a user notification.

---

## Manual test

1. Run a command in the terminal (e.g. `npm run build`).
2. Press `Ctrl+Shift+C` while terminal is focused.
3. Paste into a Markdown file — you should see a properly formatted ` ```bash ``` ` code block with only that command's output.
4. Run `Terminal: Paste Output to Chat` from the Command Palette — the output should appear in the Copilot Chat input.
