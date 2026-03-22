# feature: docs-manager.ts — Advanced Developer Guide

## Overview
The docs-manager is the central orchestrator for all documentation operations across CieloVista projects. It provides a unified, discoverable interface for:
- Opening, creating, and searching docs in any project or the global standards folder
- Ensuring every project is compliant with documentation standards
- Managing the master project registry

All commands are registered with the `cvs.docs.*` prefix and are accessible via the VS Code command palette.

---

## Architecture & Data Flow
- **Registry:** All project metadata is stored in a single JSON file (`project-registry.json`). This is the source of truth for project locations and types.
- **Doc Discovery:** Markdown files are discovered in project roots and key subfolders (`docs/`, `docs/_today/`, `docs/claude/`).
- **UI:** All user interaction is via VS Code's QuickPick, InputBox, and Webview APIs. No custom webviews are used except for the sync check panel.
- **Logging:** All actions and errors are logged through `shared/output-channel.ts`.

---

## Command Flows & UX

### 1. Open a Global Doc ([`cvs.docs.openGlobal`](command:cvs.docs.openGlobal))
- Loads the registry, lists all `.md` files in the global standards folder.
- User picks a file from a QuickPick list (with icons and full paths).
- The doc opens in the editor, and the action is logged.

### 2. Open a Project Doc ([`cvs.docs.openProject`](command:cvs.docs.openProject))
- User selects a project from a QuickPick (shows name, type, path).
- Lists all docs in that project (root and docs folders).
- User picks a doc; it opens in the editor.

### 3. Create a Global Doc ([`cvs.docs.newGlobal`](command:cvs.docs.newGlobal))
- Prompts for a doc name (validates, uppercases, adds `.md`).
- If the file exists, offers to open it instead.
- Otherwise, creates a new file with a standard template and opens it.

### 4. Create a Project Doc ([`cvs.docs.newProjectDoc`](command:cvs.docs.newProjectDoc))
- User selects a project, then enters a doc name.
- Ensures the `docs/` folder exists, creates the file, and opens it.

### 5. Search All Docs ([`cvs.docs.searchAll`](command:cvs.docs.searchAll))
- Prompts for a search term.
- Scans all docs in all projects and the global folder for matches (case-insensitive, line-by-line).
- Presents results in a QuickPick (filename, line, snippet).
- Opens the selected result and jumps to the line.

### 6. Sync Check ([`cvs.docs.syncCheck`](command:cvs.docs.syncCheck))
- Scans all projects for missing or misconfigured docs (CLAUDE.md, copilot-rules references, docs folder).
- Presents a webview report with color-coded results and summary stats.
- Logs the check and provides direct links to the registry and global docs.

### 7. Open Registry ([`cvs.docs.openRegistry`](command:cvs.docs.openRegistry))
- Opens the project registry JSON for direct editing.

### 8. Add Project ([`cvs.docs.addProject`](command:cvs.docs.addProject))
- Prompts for project name, folder, type, and description.
- Updates the registry and logs the addition.

---

## Data Structures
- **ProjectEntry:** `{ name, path, type, description }`
- **ProjectRegistry:** `{ globalDocsPath, projects: ProjectEntry[] }`

---

## Error Handling & Logging
- All file operations are wrapped in try/catch; errors are logged and surfaced to the user.
- Registry and doc existence are always validated before use.
- All destructive actions (overwriting files, adding projects) require explicit user confirmation.

---

## Extending & Debugging
- To add new doc types or locations, update `listProjectDocs` and `listMarkdownFiles`.
- To add new compliance checks, extend `syncCheck`.
- All logic is pure and testable; UI is decoupled from file operations.
- Use the OutputChannel for all debugging — never use `console.log`.

---

## Real-World Scenarios
- **Onboarding:** Add a new project and immediately create required docs.
- **Audit:** Run sync check after a migration to ensure all links and standards are correct.
- **Bulk Search:** Find every mention of a deprecated term across all projects in seconds.

---

## Troubleshooting
- If a project is missing from the list, check the registry path and format.
- If docs are not found, verify folder structure and permissions.
- All errors are logged with context in the OutputChannel.

---

## Internal architecture

```text
activate()
  └── registers 8 commands via context.subscriptions.push()

openDoc(filePath)          [shared helper]
  └── openTextDocument() → showTextDocument(ViewColumn.Beside)

openGlobalDoc / openProjectDoc
  └── loadRegistry() → listMarkdownFiles() / listProjectDocs()
  └── showQuickPick() → openDoc()

searchAllDocs()
  └── collect all .md paths from global + every project
  └── readFileSync each → line-by-line toLowerCase().includes(term)
  └── showQuickPick(matches) → showTextDocument + revealRange

syncCheck()
  └── forEach project: buildSyncIssues() → SyncResult[]
       └── checks: hasClaude, referencesGlobal, hasDocsFolder
  └── buildSyncHtml(results) → createWebviewPanel [Beside, scripts]
  └── onDidReceiveMessage:
       createClaude  → write CLAUDE.md from template, open it
       addGlobalRef  → append Global Standards table to CLAUDE.md
       createDocsFolder → mkdir docs/_today, create CURRENT-STATUS.md
       fixAll        → run all three fixes for one project, rescan
       openRegistry  → openTextDocument(REGISTRY_PATH)
       rescan        → rebuild results, replace panel HTML
```text
---

## Manual test

1. Run [`cvs.docs.openGlobal`](command:cvs.docs.openGlobal) — QuickPick should list all `.md` files in `CieloVistaStandards/`. Selecting one opens it to the right of the current tab.
2. Run [`cvs.docs.searchAll`](command:cvs.docs.searchAll), type `CLAUDE` — results should list every matching line across all registered projects with filename and line number. Selecting a result opens the file and jumps to that line.
3. Run [`cvs.docs.syncCheck`](command:cvs.docs.syncCheck) — panel opens beside the editor. Find a project showing 🔴 `Missing CLAUDE.md`. Click `🔧 Create CLAUDE.md` — file should be created and opened with the Global Standards table already included.

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._
