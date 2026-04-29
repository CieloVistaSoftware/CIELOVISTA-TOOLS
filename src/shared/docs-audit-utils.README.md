---
title: feature: docs-audit-utils.ts — Developer Guide
description: Shared pure utility functions and types for scanning, analyzing, and recommending actions for documentation health across all CieloVista projects a…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/shared/docs-audit-utils.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [docs, audit, utils]
---

# feature: docs-audit-utils.ts — Developer Guide

## Purpose
Shared pure utility functions and types for scanning, analyzing, and recommending actions for documentation health across all CieloVista projects and the global standards folder. This module is the foundation for the unified audit/recommend/fix workflow in docs-manager.

---

## Key Responsibilities
- Recursively collect all markdown docs in a project or global folder
- Normalize content for similarity analysis
- Provide type definitions for doc files, audit issues, and audit reports
- (Planned) Analyze for duplicates, near-matches, move candidates, orphans, missing standards, and broken references
- (Planned) Generate actionable recommendations for each issue

---

## Architecture & Usage
- All functions are pure and have no side effects except for reading files
- No VS Code APIs are used — this module is framework-agnostic
- Used by docs-manager and any feature that needs to audit or analyze documentation

---

## Types
- `ProjectEntry` — project metadata
- `ProjectRegistry` — global docs registry
- `DocFile` — normalized doc file info
- `AuditIssue` — detected issue with recommendation and rationale
- `AuditReport` — full audit result (issues, all docs, summary)

---

## Example Usage
```ts
import { collectDocs, DocFile } from './docs-audit-utils';

const docs: DocFile[] = collectDocs('/path/to/project', 'my-project');
// docs now contains all .md files with normalized content for analysis
 ```
---

## Extending
- Add new analysis functions (e.g., findDuplicates, findNearMatches, findOrphans)
- Add recommendation logic for each issue type
- Keep all logic pure and reusable

---

## Implementation Notes
- Skips system/build folders (node_modules, .git, out, dist, .vscode, reports)
- Normalizes content for robust similarity checks
- Designed for use in both CLI and VS Code extension contexts

---

*See code comments in docs-audit-utils.ts for implementation details and extension points.*

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
