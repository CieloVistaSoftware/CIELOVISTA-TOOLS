# feature: terminal-folder-tracker.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.terminal.jumpToLastFolder` | Terminal: Jump to Last Known Folder | — |

## What it does

Monitors every terminal's `sendText` calls for `cd` commands and saves the last known directory to a file in AppData. A single command lets you jump back to that directory instantly — even after VS Code restarts.

---
| [`cvs.terminal.jumpToLastFolder`](command: cvs.terminal.jumpToLastFolder) | Terminal: Jump to Last Known Folder |
1. Use `Terminal: Set Working Directory` to cd to a project folder.
3. Run `Terminal: Jump to Last Known Folder` — terminal should cd back to the saved folder.
docid: 150.1.terminal-folder-tracker-readme
id: feature-terminal-folder-trackerts
title: feature: terminal-folder-tracker.ts
project: cielovista-tools
description: Monitors every terminal's sendText calls for cd commands and saves the last known directory to a file in AppData. A single command lets you jump ba…
status: active
tags: [cvs.terminal.jumpToLastFolder, folder, terminal, tracker]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/terminal-folder-tracker.README.md
---