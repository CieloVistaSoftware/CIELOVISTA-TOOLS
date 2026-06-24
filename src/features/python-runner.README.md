# feature: python-runner.ts

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.python.runFile` | Python: Run File in Terminal | — |

## What it does

Right-click any `.py` file in the VS Code Explorer and run it in the terminal with a single click. Uses the Python interpreter configured in VS Code settings, falling back to the system `python` command.

---
| [`cvs.python.runFile`](command: cvs.python.runFile) | Python: Run File in Terminal | Explorer context menu (`.py` files only) |
function getPythonExecutable(): string {
└── resolve target: uri → active editor → error
2. Select "Python: Run File in Terminal".
docid: 150.1.python-runner-readme
id: feature-python-runnerts
title: feature: python-runner.ts
project: cielovista-tools
description: Right-click any .py file in the VS Code Explorer and run it in the terminal with a single click. Uses the Python interpreter configured in VS Code …
status: active
tags: [cvs.python.runFile, python, readme, runner]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/python-runner.README.md
---