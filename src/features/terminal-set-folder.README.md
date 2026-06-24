# feature: terminal-set-folder.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.terminal.setFolder` | Terminal: Set Working Directory | — |

## What it does

Right-click any folder in the VS Code Explorer and immediately `cd` the active terminal to that folder. No typing the path, no drag and drop.

---
| [`cvs.terminal.setFolder`](command: cvs.terminal.setFolder) | Terminal: Set Working Directory | Explorer context menu (folders only) |
Appears in the Explorer right-click menu when the selected item is a folder (`"when": explorerResourceIsFolder"`). Placed in the `navigation` group at priority 100 so it appears near the top.
2. Select "Terminal: Set Working Directory".
docid: 150.1.terminal-set-folder-readme
id: feature-terminal-set-folderts
title: feature: terminal-set-folder.ts
project: cielovista-tools
description: Right-click any folder in the VS Code Explorer and immediately cd the active terminal to that folder. No typing the path, no drag and drop.
status: active
tags: [cvs.terminal.setFolder, folder, set, terminal]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/terminal-set-folder.README.md
---