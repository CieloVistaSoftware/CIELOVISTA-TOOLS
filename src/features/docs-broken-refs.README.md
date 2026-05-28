# feature: docs-broken-refs.ts

## What it does

Scans markdown docs across all registered projects and reports broken image and markdown links. The report includes likely candidate files by filename so reviewers can approve manual fixes quickly.

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.docs.scanBrokenRefs` | Docs: Scan Broken References | — |

## Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `cielovistaTools.features.docsBrokenRefs` | boolean | `true` | Enables the broken references scanner command. |

## Internal architecture

```text
activate()
  -> register cvs.docs.scanBrokenRefs
scanBrokenRefs()
  -> load registry
  -> walk markdown files
  -> parse markdown refs
  -> detect missing targets + filename candidates
  -> render grouped webview report with clickable source/candidate paths
```

## Manual test

1. Run `cvs.docs.scanBrokenRefs`.
2. Verify a Broken References webview opens with grouped findings by project.
3. Confirm each finding shows file path, line number, target, and optional candidates.

---
docid: 150.1.docs-broken-refs-readme
id: feature-docs-broken-refsts
title: "feature: docs-broken-refs.ts"
project: cielovista-tools
description: Scans markdown docs across all registered projects and reports broken image and markdown links. The report includes likely candidate files by filen…
status: active
tags: [docs, broken, refs]
category: 150.1 — Components / Features
created: 2026-04-24
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/docs-broken-refs.README.md
---
