---
title: feature: python-runner.ts
description: Right-click any .py file in the VS Code Explorer and run it in the terminal with a single click. Uses the Python interpreter configured in VS Code …
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/features/python-runner.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [python, runner, readme]
---

# feature: python-runner.ts

## What it does

Right-click any `.py` file in the VS Code Explorer and run it in the terminal with a single click. Uses the Python interpreter configured in VS Code settings, falling back to the system `python` command.

---

## Commands

| Command ID | Title | Menu |
|---|---|---|
| [`cvs.python.runFile`](command:cvs.python.runFile) | Python: Run File in Terminal | Explorer context menu (`.py` files only) |

---

## Menu contribution

Appears in the Explorer right-click menu when `resourceExtname == .py`. Also available from the command palette — falls back to the currently open file if no URI is provided.

---

## Python interpreter resolution

Reads `python.defaultInterpreterPath` from VS Code settings (set by the Python extension when you select an interpreter). Falls back to the bare `python` command if nothing is configured.

```typescript
function getPythonExecutable(): string {
    return vscode.workspace
        .getConfiguration('python')
        .get<string>('defaultInterpreterPath', 'python');
}
```

---

## Internal architecture

```
activate()
  └── registerCommand('cvs.python.runFile', (uri?) => ...)
       └── resolve target: uri → active editor → error
       └── validate .py extension
       └── getPythonExecutable()
       └── getActiveOrCreateTerminal()  [from shared/terminal-utils]
       └── terminal.sendText('python "path"')
```

---

## Manual test

1. Right-click any `.py` file in Explorer.
2. Select "Python: Run File in Terminal".
3. Terminal should open and execute `python "path/to/file.py"`.
4. Open a `.py` file in the editor, run from command palette — same result.
5. Try right-clicking a non-`.py` file — the menu item should not appear.
