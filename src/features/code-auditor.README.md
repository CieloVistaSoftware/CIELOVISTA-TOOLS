# Feature: Code Auditor

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.tools.codeAuditor` | Tools: Code Auditor | — |

## What it does

Runs `scripts/code-auditor.js --json` to detect duplicate code clusters (exact, near-duplicate, and pattern-based) across the codebase. Renders a clickable webview report with cluster type, similarity percentage, file locations, and a suggested shared path. Individual clusters can be filed as GitHub issues directly from the panel.

---
| [`cvs.tools.codeAuditor`](command: cvs.tools.codeAuditor) | Tools: CodeAuditor |
└── Tools: CodeAuditor → cvs.tools.codeAuditor
**Key internal functions: **
1. Open the Command Palette and run **Tools: CodeAuditor** (`cvs.tools.codeAuditor`).
docid: 150.1.code-auditor
id: feature-code-auditor
title: Feature: Code Auditor
project: cielovista-tools
description: Code Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
status: active
tags: [auditor, code, cvs.tools.codeAuditor]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/code-auditor.README.md
---