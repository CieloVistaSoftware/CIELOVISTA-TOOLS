---
docid: 150.1.json-copy-to-chat
id: feature-json-copy-to-chat
title: "Feature: Json Copy To Chat"
project: cielovista-tools
description: "Json Copy To Chat — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [json, copy, to]
category: 150.1 — Components / Features
created: 2026-05-15
updated: 2026-05-15
version: 1.0.0
author: CieloVista Software
relativepath: src/features/json-copy-to-chat.README.md
---
# Feature: Json Copy To Chat

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.editor.copyJsonToCopilotChat`](command:cvs.editor.copyJsonToCopilotChat) | Editor: CopyJsonToCopilotChat |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Editor: CopyJsonToCopilotChat → cvs.editor.copyJsonToCopilotChat
```

**Key internal functions:**
- `resolveJsonUri()`

---

## Manual test

1. Open the Command Palette and run **Editor: CopyJsonToCopilotChat** (`cvs.editor.copyJsonToCopilotChat`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
