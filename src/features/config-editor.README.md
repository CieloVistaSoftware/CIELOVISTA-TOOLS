---
id: feature-config-editor
title: "Feature: Config Editor"
description: "Config Editor — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Config Editor

## What it does

Provides a webview UI for editing the extension's `config.json` with documented per-key descriptions. The editor is currently a placeholder pending full implementation.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.config.edit`](command:cvs.config.edit) | Config: Edit |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Config: Edit → cvs.config.edit
```

---

## Manual test

1. Open the Command Palette and run **Config: Edit** (`cvs.config.edit`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
