---
title: CLAUDE.md — cielovista-tools
description: 1. Call listalloweddirectories to confirm MCP access 2. Read docs/today/CURRENT-STATUS.md — current project state and parking lot 3. Use recentchat…
project: cielovista-tools
category: 000 — Meta / Session / Status
relativePath: CLAUDE.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [claude, claudemd, cielovistatools]
---

# CLAUDE.md — cielovista-tools

## Session Start (DO THIS FIRST)

1. Call `list_allowed_directories` to confirm MCP access
2. Read `docs/_today/CURRENT-STATUS.md` — current project state and parking lot
3. Use `recent_chats` — continue from last session, never start blind
4. Start working — no questions, no fumbling

## End of Session

Update the **🅿️ PARKING LOT** at the top of `docs/_today/CURRENT-STATUS.md`:
- **Task:** what we were doing
- **Files touched:** exact full paths
- **Last action:** the last thing changed
- **Next step:** exactly what to do next
- **Open questions:** anything unresolved

---

## Project

**Name:** cielovista-tools
**Type:** VS Code Insiders extension
**Location:** `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools`
**Owner:** John Peters — Cielo Vista Software

One extension, one install. All CieloVistaSoftware developer tools consolidated.

---

## Global Standards

These apply to ALL CieloVista projects. Read them when relevant:

| Document | Location |
|---|---|
| Copilot Rules | `C:\Users\jwpmi\Downloads\CieloVistaStandards\copilot-rules.md` |
| JavaScript Standards | `C:\Users\jwpmi\Downloads\CieloVistaStandards\javascript_standards.md` |
| Git Workflow | `C:\Users\jwpmi\Downloads\CieloVistaStandards\git_workflow.md` |
| Web Component Guide | `C:\Users\jwpmi\Downloads\CieloVistaStandards\web_component_guide.md` |
| Project Registry | `C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json` |

---

## Architecture Rules

These are absolute. Never violate them.

- One job per file — each feature file registers commands for exactly one feature
- No duplicate code — shared logic goes in `src/shared/`, never copy-pasted
- `shared/` files export pure functions only — no command registrations
- One OutputChannel — all logging through `shared/output-channel.ts`
- `extension.ts` is wiring only — no business logic
- ES modules only — never CommonJS
- Always type annotations in TypeScript
- Copyright header on every `.ts` file

---

## Build

One command does everything — compile, package, install:

```powershell
npm run rebuild
```

TypeScript compile only (no install):

```powershell
npm run compile
```

Uses `.\node_modules\.bin\tsc` — never `npx tsc` (picks up wrong global package).

---

## Project Structure

```
src/
  extension.ts          ← wiring only — imports all features, calls activate()
  features/             ← one file per feature, each with a .README.md
  shared/               ← pure utility functions used by 2+ features
    output-channel.ts
    terminal-utils.ts
    copilot-rules-utils.ts
    webview-utils.ts
    error-log-utils.ts
install.js              ← finds VS Code Insiders CLI and installs the VSIX
package.json            ← all commands, settings, keybindings — NO comments
LICENSE                 ← CieloVista Software proprietary license
```

---

## Adding a New Feature

1. Create `src/features/my-feature.ts` — export `activate(context)` and `deactivate()`
2. Create `src/features/my-feature.README.md` — document commands, settings, test steps
3. Add command entries to `contributes.commands` in `package.json` — prefix `cvs.`
4. Add two lines to `src/extension.ts` — import and call in activate/deactivate
5. Run `npm run rebuild`

If the feature needs a shared utility → add it to `src/shared/`, never inline it.

---

## What NOT To Do

- Never ask John to upload files — MCP filesystem access is always available
- Never put comments in `package.json` — strict JSON only
- Never use `npx tsc` — use `.\node_modules\.bin\tsc`
- Never duplicate logic between feature files — shared/ exists for a reason
- Never create a second OutputChannel
