---
id: feature-readme-compliance
title: "Feature: Readme Compliance"
description: "Readme Compliance — 0 command(s). Auto-generated stub: fill in What it does and Manual test."
---

# Feature: Readme Compliance

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.readme.fillTodos` | README: Fill README TODO Stubs (AI) | — |

---

## Internal architecture

```text
activate(context)
  └── registers 0 command(s)

```

---

## Manual test

1. Open a workspace with the CieloVista Tools extension active.
2. Verify Readme Compliance activates without errors in the Output channel.
3. Put a `_TODO:` stub line in any registered project's README and run **README: Fill README TODO Stubs (AI)**.
   Confirm the prompt, then check that the AI Batch Fix Review panel shows a diff for that README only.
   The file must be unchanged on disk until you approve it and press **Apply Approved** (#776).
