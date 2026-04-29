---
title: feature: shared/terminal-utils.ts
description: Reusable terminal and file-navigation helpers shared across all features that involve terminals or opening files/folders. The rule is simple: if tw…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/shared/terminal-utils.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [terminal, utils, readme]
---

# feature: shared/terminal-utils.ts

## Purpose

Reusable terminal and file-navigation helpers shared across all features that involve terminals or opening files/folders. The rule is simple: if two features need the same terminal operation, it lives here — never duplicated.

---

## API

### `getActiveOrCreateTerminal(name?: string): vscode.Terminal`

Returns the currently active terminal. If no terminal is open, creates one named `name` (default: `'CieloVista'`).

```typescript
import { getActiveOrCreateTerminal } from '../shared/terminal-utils';
const t = getActiveOrCreateTerminal();
t.show();
t.sendText('npm run build');
 ```
---

### `cdToFolder(folderPath: string, reveal?: boolean): void`

Sends a `cd "path"` command to the active (or new) terminal. `reveal` defaults to `true`, which makes the terminal panel visible.

```typescript
import { cdToFolder } from '../shared/terminal-utils';
cdToFolder('C:\\dev\\myproject');
 ```
---

### `cdToFolderFromUri(uri?: vscode.Uri): Promise<void>`

Higher-level helper for Explorer context-menu commands. If `uri` is supplied (from a right-click), cds to that folder. If not, falls back to the active editor's directory, and finally shows a folder picker dialog.

Shows an information message confirming the new directory.

```typescript
import { cdToFolderFromUri } from '../shared/terminal-utils';
vscode.commands.registerCommand('myFeature.setFolder', (uri) => cdToFolderFromUri(uri));
 ```
---

### `openFolderInVSCode(uri?: vscode.Uri): Promise<void>`

Opens a folder in VS Code, replacing the current workspace. If `uri` is omitted, shows a folder picker. **Note:** VS Code reloads the window after this call, so any code after `await openFolderInVSCode()` will not run.

---

### `openFolderInNewWindow(uri: vscode.Uri): Promise<void>`

Opens a folder in a brand-new VS Code window. The current window stays open.

---

### `openFileAtLine(filePath: string, line?: number): Promise<void>`

Opens a file in the editor. If `line` is provided (1-based), the cursor is placed at that line. Used by features like `copilot-open-suggested-file`.

```typescript
import { openFileAtLine } from '../shared/terminal-utils';
await openFileAtLine('C:\\dev\\project\\src\\utils.ts', 42);
 ```
---

### `getAppDataPath(): string`

Returns the user's AppData directory (`%APPDATA%` on Windows, `$HOME` on macOS/Linux). Used for persisting per-user state files that should survive workspace changes — e.g. the last known terminal folder.

---

## What does NOT belong here

- Any VS Code command registration — that stays in the feature file
- Copilot-specific logic — that goes in `copilot-rules-utils.ts`
- Webview HTML — that goes in `webview-utils.ts`

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
