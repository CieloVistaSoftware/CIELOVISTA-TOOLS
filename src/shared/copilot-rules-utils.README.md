---
title: feature: shared/copilot-rules-utils.ts
description: All business logic for reading, applying, and removing Copilot instruction rules. Three different extensions originally duplicated this logic (Rule…
project: cielovista-tools
category: 600 — Tools & Extensions
relativePath: src/shared/copilot-rules-utils.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [copilot, rules, utils]
---

# feature: shared/copilot-rules-utils.ts

## Purpose

All business logic for reading, applying, and removing Copilot instruction rules. Three different extensions originally duplicated this logic (`RulesEnforcer`, `CoPilotRulesProvider`, `copilot-rules-injector`, `suggestions`). It now lives in exactly one place.

Features that need to touch Copilot rules import from here. They never implement their own file I/O or settings writes.

---

## How Copilot rules work in VS Code

Copilot reads instructions from the VS Code setting:

```json
"github.copilot.chat.codeGeneration.instructions": [
  { "file": "copilot-rules.md" },
  { "text": "Always use TypeScript." }
]
 ```
Each entry is either a `file` path (relative to workspace root) or inline `text`. This utility manages both, but defaults to the file-based approach so rules are version-controllable.

---

## API

### `readRulesFile(workspacePath: string): string`

Reads `copilot-rules.md` from the workspace root. If the file doesn't exist, creates it with `DEFAULT_RULES` and returns that content.

```typescript
import { readRulesFile } from '../shared/copilot-rules-utils';
const rules = readRulesFile(workspaceFolders[0].uri.fsPath);
 ```
---

### `getCurrentRules(): string`

Returns the currently active rules as a formatted string. Reads from `.vscode/settings.json` first, falls back to `DEFAULT_RULES`.

---

### `formatRulesForDisplay(rules, workspacePath): string`

Converts the raw `github.copilot.chat.codeGeneration.instructions` array into human-readable Markdown. File-based rules are read from disk and inlined.

---

### `applyWorkspaceRules(workspacePath: string): void`

Writes/updates `.vscode/settings.json` to point Copilot at `copilot-rules.md`. Creates the `.vscode` directory and the rules file if needed.

---

### `applyUserRules(): void`

Applies inline `DEFAULT_RULES` at the global (user) VS Code settings level. Used when no workspace is open.

---

### `removeWorkspaceRules(workspacePath: string): void`

Removes `github.copilot.chat.codeGeneration.instructions` from `.vscode/settings.json`. Does nothing if the settings file doesn't exist.

---

### `removeUserRules(): void`

Clears the global user-level Copilot instructions setting.

---

### `applyRules(): void` ← **Use this one**

Smart wrapper — applies to workspace if one is open, otherwise applies at user level. This is the single function most features should call.

```typescript
import { applyRules } from '../shared/copilot-rules-utils';
vscode.commands.registerCommand('cvs.copilotRules.enable', applyRules);
 ```
---

### `removeRules(): void` ← **Use this one**

Smart wrapper — removes from workspace if one is open, otherwise removes at user level.

---

## Constants

### `DEFAULT_RULES: string`

The default rule content written to `copilot-rules.md` when no file exists. Reflects CieloVistaSoftware coding standards.

---

## File locations

| File | Purpose |
|---|---|
| `{workspace}/copilot-rules.md` | Human-editable rules file |
| `{workspace}/.vscode/settings.json` | VS Code settings (pointer to rules file) |

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

 ```
activate()
  └── TODO: describe call flow
 ```
---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
