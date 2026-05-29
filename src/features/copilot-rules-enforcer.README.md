# feature: copilot-rules-enforcer.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.copilotRules.enable` | Copilot Rules: Enable | — |
| `cvs.copilotRules.disable` | Copilot Rules: Disable | — |
| `cvs.copilotRules.reload` | Copilot Rules: Reload from File | — |
| `cvs.copilotRules.view` | Copilot Rules: View Current | — |

## What it does

Injects your custom Copilot instruction rules into the workspace (or user) settings on startup. Rules are read from `copilot-rules.md` in the workspace root. Provides commands to enable, disable, reload, and view rules. Shows a status bar item with the current state.

All file I/O and settings logic lives in `shared/copilot-rules-utils.ts` — this file owns only command registration and UI.

---
| [`cvs.copilotRules.enable`](command: cvs.copilotRules.enable) | Copilot Rules: Enable |
| [`cvs.copilotRules.disable`](command: cvs.copilotRules.disable) | Copilot Rules: Disable |
| [`cvs.copilotRules.reload`](command: cvs.copilotRules.reload) | Copilot Rules: Reload from File |
| [`cvs.copilotRules.view`](command: cvs.copilotRules.view) | Copilot Rules: View Current |
`copilot-rules.md` lives in the workspace root. Edit it directly to change what Copilot follows. Run `Copilot Rules: Reload from File` after editing to refresh the webview.
└── creates StatusBarItem (command: cvs.copilotRules.view)
4. Run `Copilot Rules: View Current` — webview should open showing your rules.
5. Edit `copilot-rules.md`, run `Copilot Rules: Reload from File` — webview should update.
docid: 150.1.copilot-rules-enforcer-readme
id: feature-copilot-rules-enforcerts
title: feature: copilot-rules-enforcer.ts
project: cielovista-tools
description: Injects your custom Copilot instruction rules into the workspace (or user) settings on startup. Rules are read from copilot-rules.md in the workspa…
status: active
tags: [copilot, cvs.copilotRules.disable, cvs.copilotRules.enable, cvs.copilotRules.reload, cvs.copilotRules.view, enforcer, rules]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/copilot-rules-enforcer.README.md
---