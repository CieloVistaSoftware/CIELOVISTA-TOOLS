# feature: terminal-prompt-shortener.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.terminal.togglePromptLength` | Terminal: Toggle Prompt Length | — |

## What it does

Toggles the PowerShell terminal prompt between its full path form (`PS C:\very\long\nested\path>`) and a minimal single-character form (`>`). Useful when deep directory paths consume the entire input line.

---
| [`cvs.terminal.togglePromptLength`](command: cvs.terminal.togglePromptLength) | Terminal: Toggle Prompt Length |
**Short prompt: **
**Full prompt (restore): **
1. Open a PowerShell terminal — note the full path prompt (e.g. `PS C: \Users\jwpmi>`).
2. Run [`cvs.terminal.togglePromptLength`](command: cvs.terminal.togglePromptLength) — prompt should immediately change to `>`.
docid: 150.1.terminal-prompt-shortener-readme
id: feature-terminal-prompt-shortenerts
title: feature: terminal-prompt-shortener.ts
project: cielovista-tools
description: Toggles the PowerShell terminal prompt between its full path form (PS C:\very\long\nested\path>) and a minimal single-character form (>). Useful wh…
status: active
tags: [cvs.terminal.togglePromptLength, prompt, shortener, terminal]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/terminal-prompt-shortener.README.md
---