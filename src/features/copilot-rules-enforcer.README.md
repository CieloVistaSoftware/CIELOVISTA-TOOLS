---
title: feature: copilot-rules-enforcer.ts
description: Injects your custom Copilot instruction rules into the workspace (or user) settings on startup. Rules are read from copilot-rules.md in the workspa…
project: cielovista-tools
category: 600 — Tools & Extensions
relativePath: src/features/copilot-rules-enforcer.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [copilot, rules, enforcer]
---

# feature: copilot-rules-enforcer.ts

## What it does

Injects your custom Copilot instruction rules into the workspace (or user) settings on startup. Rules are read from `copilot-rules.md` in the workspace root. Provides commands to enable, disable, reload, and view rules. Shows a status bar item with the current state.

All file I/O and settings logic lives in `shared/copilot-rules-utils.ts` — this file owns only command registration and UI.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.copilotRules.enable`](command:cvs.copilotRules.enable) | Copilot Rules: Enable |
| [`cvs.copilotRules.disable`](command:cvs.copilotRules.disable) | Copilot Rules: Disable |
| [`cvs.copilotRules.reload`](command:cvs.copilotRules.reload) | Copilot Rules: Reload from File |
| [`cvs.copilotRules.view`](command:cvs.copilotRules.view) | Copilot Rules: View Current |

---

## Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `cielovistaTools.copilotRulesEnforcer.autoEnforce` | boolean | `true` | Apply rules automatically on workspace open |

---

## Rules file

`copilot-rules.md` lives in the workspace root. Edit it directly to change what Copilot follows. Run `Copilot Rules: Reload from File` after editing to refresh the webview.

On first enable, if the file doesn't exist, it is created with the default CieloVistaSoftware rules from `shared/copilot-rules-utils.ts`.

---

## Internal architecture

```
activate()
  └── creates StatusBarItem (command: cvs.copilotRules.view)
  └── registers 4 commands
  └── calls applyRules() if autoEnforce is true
  └── updateStatusBar()

enable command  → applyRules()  [from shared] → updateStatusBar()
disable command → removeRules() [from shared] → updateStatusBar()
reload command  → readRulesFile() → refreshes webview if open
view command    → openOrRefreshPanel()
                    └── buildMarkdownPage() [from shared/webview-utils]
                    └── handles 'enable'/'disable' postMessages
```

---

## Webview

The rules viewer panel renders the current rules as Markdown using `shared/webview-utils.buildMarkdownPage()`. It has Enable and Disable buttons that post messages back to the extension host.

---

## Error tracking

Errors from `applyRules()` and the reload command are tracked via `shared/error-log-utils.logError()`. If the same error recurs and a solution has been recorded, the solution is surfaced in the notification.

---

## Manual test

1. Open a workspace.
2. Verify `copilot-rules.md` is created in the workspace root.
3. Verify `.vscode/settings.json` contains `github.copilot.chat.codeGeneration.instructions`.
4. Run `Copilot Rules: View Current` — webview should open showing your rules.
5. Edit `copilot-rules.md`, run `Copilot Rules: Reload from File` — webview should update.
