# feature: docs-manager.ts — Advanced Developer Guide

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.docs.openGlobal` | Docs: Open Global Standards Doc | — |
| `cvs.docs.openProject` | Docs: Open Project Doc | — |
| `cvs.docs.searchAll` | Docs: Search All Docs | — |
| `cvs.docs.newGlobal` | Docs: New Global Standards Doc | — |
| `cvs.docs.newProjectDoc` | Docs: New Project Doc | — |
| `cvs.docs.syncCheck` | Docs: Sync Check (missing CLAUDE.md etc) | — |
| `cvs.docs.openRegistry` | Docs: Open Project Registry | — |
| `cvs.docs.addProject` | Docs: Add Project to Registry | — |
| `cvs.readme.scan` | README: Scan Compliance | — |
| `cvs.readme.fix` | README: Fix a Non-Compliant README | — |
| `cvs.readme.fixAll` | README: Fix All Non-Compliant READMEs | — |
| `cvs.readme.new` | README: New Compliant README from Template | — |
| `cvs.readme.viewStandard` | README: View README Standard | — |
| `cvs.readme.generate.scan` | README: Scan for Missing READMEs | — |
| `cvs.readme.generate.run` | README: Generate All Missing READMEs (AI) | — |
| `cvs.readme.generate.single` | README: Generate Single README (AI) | — |
| `cvs.license.sync` | License: Sync All Projects | — |

## Overview
The docs-manager is the central orchestrator for all documentation operations across CieloVista projects. It provides a unified, discoverable interface for:
- Opening, creating, and searching docs in any project or the global standards folder
- Ensuring every project is compliant with documentation standards
- Managing the master project registry

All commands are registered with the `cvs.docs.*` prefix and are accessible via the VS Code command palette.

---
- **Registry: ** All project metadata is stored in a single JSON file (`project-registry.json`). This is the source of truth for project locations and types.
- **Doc Discovery: ** Markdown files are discovered in project roots and key subfolders (`docs/`, `docs/_today/`, `docs/claude/`).
- **UI: ** All user interaction is via VS Code's QuickPick, InputBox, and Webview APIs. No custom webviews are used except for the sync check panel.
- **Logging: ** All actions and errors are logged through `shared/output-channel.ts`.
### 1. Open a Global Doc ([`cvs.docs.openGlobal`](command: cvs.docs.openGlobal))
### 2. Open a Project Doc ([`cvs.docs.openProject`](command: cvs.docs.openProject))
### 3. Create a Global Doc ([`cvs.docs.newGlobal`](command: cvs.docs.newGlobal))
### 4. Create a Project Doc ([`cvs.docs.newProjectDoc`](command: cvs.docs.newProjectDoc))
### 5. Search All Docs ([`cvs.docs.searchAll`](command: cvs.docs.searchAll))
### 6. Sync Check ([`cvs.docs.syncCheck`](command: cvs.docs.syncCheck))
### 7. Open Registry ([`cvs.docs.openRegistry`](command: cvs.docs.openRegistry))
### 8. Add Project ([`cvs.docs.addProject`](command: cvs.docs.addProject))
- **ProjectEntry: ** `{ name, path, type, description }`
- **ProjectRegistry: ** `{ globalDocsPath, projects: ProjectEntry[] }`
- **Onboarding: ** Add a new project and immediately create required docs.
- **Audit: ** Run sync check after a migration to ensure all links and standards are correct.
- **Bulk Search: ** Find every mention of a deprecated term across all projects in seconds.
└── forEach project: buildSyncIssues() → SyncResult[]
└── checks: hasClaude, referencesGlobal, hasDocsFolder
1. Run [`cvs.docs.openGlobal`](command: cvs.docs.openGlobal) — QuickPick should list all `.md` files in `CieloVistaStandards/`. Selecting one opens it to the right of the current tab.
2. Run [`cvs.docs.searchAll`](command: cvs.docs.searchAll), type `CLAUDE` — results should list every matching line across all registered projects with filename and line number. Selecting a result opens the file and jumps to that line.
3. Run [`cvs.docs.syncCheck`](command: cvs.docs.syncCheck) — panel opens beside the editor. Find a project showing 🔴 `Missing CLAUDE.md`. Click `🔧 Create CLAUDE.md` — file should be created and opened with the Global Standards table already included.
_TODO: one paragraph describing the single responsibility of this file._
docid: 150.1.docs-manager-readme
id: feature-docs-managerts-advanced-developer-guide
title: feature: docs-manager.ts — Advanced Developer Guide
project: cielovista-tools
description: The docs-manager is the central orchestrator for all documentation operations across CieloVista projects. It provides a unified, discoverable inter…
status: active
tags: [cvs.docs., cvs.docs.addProject, cvs.docs.newGlobal, cvs.docs.newProjectDoc, cvs.docs.openGlobal, cvs.docs.openProject, cvs.docs.openRegistry, cvs.docs.searchAll, cvs.docs.syncCheck, docs, manager, readme]
category: 150.1 — Components / Features
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: src/features/docs-manager.README.md
---