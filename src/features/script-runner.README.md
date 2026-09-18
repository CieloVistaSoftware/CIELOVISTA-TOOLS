---
id: feature-script-runner
title: "Feature: Script Runner"
description: "Script Runner — 1 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Script Runner

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.scripts.runScript`](command:cvs.scripts.runScript) | Scripts: RunScript |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Scripts: RunScript → cvs.scripts.runScript
```

---

## Manual test

1. Open the Command Palette and run **Scripts: RunScript** (`cvs.scripts.runScript`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
