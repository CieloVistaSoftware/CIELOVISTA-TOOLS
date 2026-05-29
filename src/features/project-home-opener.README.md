# Feature: Project Home Opener

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.project.openHome` | Open Home Project Folder | — |

## What it does

Adds a single command that opens your configured CieloVista home project root in VS Code from any workspace. Useful when you need to jump back to the main cielovista-tools folder without using the file menu.

---
| [`cvs.project.openHome`](command: cvs.project.openHome) | Project: Open Home |
Set `cielovistaTools.homeProjectPath` in VS Code User Settings to the full path of your CieloVista project root (e.g. `C: \Users\jwpmi\Downloads\VSCode\projects\cielovista-tools`).
If the configured path cannot be used, a clear error message is shown: [**Not configured** — setting is empty or missing, **Does not exist** — path not found on disk, **Not a directory** — path points to a file]
└── validate: truthy → exists on disk → is a directory
{ forceNewWindow: false }
2. Open any other workspace. Run [`cvs.project.openHome`](command: cvs.project.openHome) — VS Code should switch to the configured folder as the workspace root.
docid: 150.1.project-home-opener-readme
id: feature-project-home-opener
title: Feature: Project Home Opener
project: cielovista-tools
description: Adds a single command that opens your configured CieloVista home project root in VS Code from any workspace. Useful when you need to jump back to t…
status: active
tags: [cvs.project.openHome, home, opener, project]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/project-home-opener.README.md
---