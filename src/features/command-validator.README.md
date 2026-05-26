---
docid: 150.1.command-validator
id: feature-command-validator
title: "Feature: Command Validator"
project: cielovista-tools
description: "Command Validator — 3 command(s). Auto-generated stub: fill in What it does and Manual test."
status: active
tags: [command, validator]
category: 150.1 — Components / Features
created: 2026-05-25
updated: 2026-05-25
version: 1.0.0
author: CieloVista Software
relativepath: src/features/command-validator.README.md
---
# Feature: Command Validator

## What it does

<!-- TODO: describe what this feature does in 2–4 sentences -->
_Auto-generated stub. Replace this with a human description of the feature._

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.commands.validate`](command:cvs.commands.validate) | Commands: Validate |
| [`cvs.commands.syncTags`](command:cvs.commands.syncTags) | Commands: SyncTags |
| [`cvs.commands.syncTagsDry`](command:cvs.commands.syncTagsDry) | Commands: SyncTagsDry |

---

## Internal architecture

```
activate(context)
  └── registers 3 command(s)
  └── Commands: Validate → cvs.commands.validate
  └── Commands: SyncTags → cvs.commands.syncTags
  └── Commands: SyncTagsDry → cvs.commands.syncTagsDry
```

**Key internal functions:**
- `extractCommandIds()`
- `loadPackageCommandIds()`
- `isRegisteredInSource()`
- `scanDirForString()`
- `findReadmeFiles()`
- `parseFmBlock()`
- `parseFrontmatter()`
- `serializeFm()`
- `runValidation()`
- `syncTagsForFile()`
- `runTagSync()`
- `buildValidationHtml()`
- `buildTagSyncHtml()`
- `getRoot()`
- `cmdValidate()`
- `cmdSyncTags()`

---

## Manual test

1. Open the Command Palette and run **Commands: Validate** (`cvs.commands.validate`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
2. Open the Command Palette and run **Commands: SyncTags** (`cvs.commands.syncTags`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
3. Open the Command Palette and run **Commands: SyncTagsDry** (`cvs.commands.syncTagsDry`).
   Verify the expected output/panel opens with no errors in the CieloVista Tools output channel.
