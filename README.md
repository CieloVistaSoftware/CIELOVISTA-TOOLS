---
title: CieloVista Tools
description: One VS Code extension. One install. All CieloVistaSoftware developer tools in one place. CieloVista Tools is the developer toolchain for the entire…
project: cielovista-tools
category: 700 — Project Docs
relativePath: README.md
created: 2026-03-13
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [readme, cielovista, tools]
permalink: /
---

# CieloVista Tools

**One VS Code extension. One install. All CieloVistaSoftware developer tools in one place.**

CieloVista Tools is the developer toolchain for the entire CieloVista Software ecosystem. It combines a VS Code extension with an MCP (Model Context Protocol) server that gives AI assistants runtime access to every registered project. The extension consolidates daily developer commands into a single install.

Its primary mission is to act as a router across one or more complex project folders, not just a bag of isolated commands. It reads `CieloVistaStandards/project-registry.json`, treats those registered paths as a single working ecosystem, and routes commands, docs, scans, quick-picks, audits, and AI-facing tools to the right project at the right time. In practice that means you can point CieloVista Tools at one large product folder or several related project roots and use one extension to navigate, inspect, launch, audit, and automate the whole set without manually reconfiguring each workspace.

That routing model is what ties the product together:

- The extension routes developer actions from VS Code into the correct local project, terminal, file, or webview.
- The MCP server routes AI and automation requests across every registry-listed codebase.
- The doc and catalog features route you to the right documentation, symbols, commands, and project metadata without needing to remember where each item lives on disk.

---

## What's included

### Cross-project routing and launch surfaces

These features are the core of the extension. They turn multiple registered folders into one routable tool surface inside VS Code.

| Feature | What it includes | Commands |
|---|---|---|
| Home Dashboard | Central entry surface for the extension. Aggregates command launchers, recent projects, feature cards, and status-style navigation into one place instead of forcing you to remember individual commands. | `cvs.tools.home` |
| Project Launcher | Launches known projects using fixed commands and dynamic discovery from project metadata and `package.json` scripts. Intended for jumping into common build, start, rebuild, tray, and stop actions without opening each repo manually first. | `cvs.launch.*`, `cvs.launch.pick` |
| CVS Command Launcher | Unified launcher for CieloVista commands with history, recent-project awareness, catalog metadata, and quick-run paths. | `cvs.commands.showAll`, `cvs.commands.quickRun` |
| NPM Command Launcher | Scans and presents npm scripts as routable actions instead of forcing manual terminal navigation. Useful when several related projects live under one ecosystem and each has its own script surface. | `cvs.npm.showAndRunScripts`, `cvs.npm.addScriptDescription` |
| Project Home Opener | Opens the configured home project quickly so the "main" working repo is always one command away. | `cvs.project.openHome` |
| Open Folder as Root | Promotes an Explorer folder into the active root workspace, which is useful when the extension helps you discover the right project and you then want to pivot the editor directly into it. | Explorer context menu |
| Registry Promote | Adds a folder into the broader routed ecosystem so it can participate in cataloging, launch flows, and other registry-driven tooling. | Registry promote commands |

### Documentation and codebase intelligence

This part of the extension treats documentation and project metadata as first-class navigable assets across the whole registered environment.

| Feature | What it includes | Commands |
|---|---|---|
| Doc Catalog | Builds a browsable catalog across registered projects so docs are discoverable by content and project context rather than buried in folder trees. | Doc catalog commands and webview |
| Docs Manager | Provides document-oriented project tooling from inside the extension rather than requiring a separate doc workflow. | Docs manager commands |
| Doc Intelligence | Cross-project doc analysis and higher-level documentation utilities for understanding what exists, what is missing, and how docs connect. | Doc intelligence commands |
| README Compliance | Checks README quality and consistency so project entry docs follow the expected standard across the ecosystem. | README compliance commands |
| README Generator | Scans registry-listed projects for missing READMEs and generates project-specific drafts from local context such as `CLAUDE.md`, `package.json`, `.csproj`, and top-level structure. | `cvs.readme.generate.*` |
| Docs Broken References Scanner | Finds broken internal documentation references so large doc collections stay navigable as projects evolve. | Docs broken refs commands |
| Doc Header Scan | Scans document front matter and headers to enforce structure and improve catalog quality. | Doc header scan commands |
| File List Viewer | Exposes project file listings in a more navigable form when you need to inspect content at the repo level. | File list viewer commands |

### Terminal, file, and day-to-day developer helpers

These are the thin, fast commands used constantly while moving between projects.

| Feature | What it includes | Commands |
|---|---|---|
| Terminal Copy Output | Captures the most recent terminal output, cleans it up, and routes it to the clipboard or Copilot Chat. Useful for error triage, bug reports, and fast prompt building. | `cvs.terminal.copyOutputClipboard`, `cvs.terminal.pasteOutputToChat`, `cvs.terminal.pasteLastCommandToChat` |
| Terminal Set Folder | Right-click a folder to route the active terminal directly into that directory. | Explorer context menu |
| Terminal Folder Tracker | Remembers the last folder you changed into and lets you recover it after restart. | `cvs.terminal.jumpToLastFolder` |
| Terminal Prompt Shortener | Switches between a verbose PowerShell prompt and a compact prompt when you want more room for command output. | `cvs.terminal.togglePromptLength` |
| Python Runner | Runs Python files directly from Explorer or the active editor using the configured interpreter. | `cvs.python.runFile` |
| Explorer Copy Path to Chat | Takes a file or folder path from Explorer and pushes it into Copilot Chat, which is especially useful when AI needs exact local context. | Explorer context menu |
| Copilot Open Suggested File | Opens a file path Copilot mentioned, reducing friction between AI suggestions and the actual editor surface. | `cvs.copilot.openSuggestedFile` |
| CSS Class Hover | Shows CSS definitions inline at the point of use for quicker frontend inspection. | Automatic on hover |
| HTML Template Downloader | Pulls starter templates into the local workflow without switching out to the browser or GitHub manually. | `cvs.htmlTemplates.download` |
| Image Reader | Adds image-oriented helper workflows inside the extension for assets and screenshot-driven work. | Image reader commands |

### AI, auditing, and operational tooling

These features make the extension useful as an orchestration layer for AI-assisted development and quality checks across many repos.

| Feature | What it includes | Commands |
|---|---|---|
| Copilot Rules Enforcer | Injects and manages custom Copilot rules at workspace open so AI assistance follows the local development contract. | `cvs.copilotRules.enable`, `cvs.copilotRules.disable`, `cvs.copilotRules.reload`, `cvs.copilotRules.view` |
| OpenAI Chat | Adds AI actions such as explain, refactor, and docstring support directly in-editor. | `Ctrl+I`, `Ctrl+Alt+D` |
| MCP Server Status and Viewer | Starts, monitors, and exposes MCP-backed tools so AI clients can browse commands, docs, symbols, projects, and other registry-backed data through one consistent surface. | MCP status and viewer commands |
| MCP Build | Builds the MCP server from inside the extension and reports results back into VS Code. | `cvs.mcp.build`, `cvs.mcp.build.stop` |
| MCP Server Scaffolder | Generates MCP server scaffolding so new MCP-capable workflows can be added without rebuilding the same boilerplate each time. | MCP scaffolder commands |
| Test Coverage Auditor | Audits test coverage, missing tiers, and recommendations using the repo's coverage scripts and presents the results in a webview. | `cvs.audit.testCoverage*` |
| Daily Audit and Codebase Audits | Runs recurring quality checks so the routed project set stays maintainable over time instead of drifting silently. | Audit commands |
| Marketplace, License, Error, and Health utilities | Includes supporting operational tools such as license sync, error-log viewing, JS error auditing, background health checks, and marketplace compliance checks. | Various `cvs.*` maintenance commands |

### What this means in practice

If you have one large root folder with many related projects, or two major product folders that you move between all day, CieloVista Tools is designed to sit above them as the router and control plane. Instead of switching mental models every time you move from docs to scripts to symbols to audits to AI tools, the extension keeps those actions centralized and registry-driven.

---

## MCP Server

The `mcp-server/` folder contains a standalone MCP server that exposes project-wide tools to AI assistants (Copilot, Claude, etc.).

**What it enables:**
- **Cross-project scanning** — reads `project-registry.json` to locate every CieloVista project on the local machine
- **Symbol index** — find reusable functions, classes, and exports across all projects
- **Doc catalog** — browse and search documentation across all registered projects
- **Command listing** — list all `cvs.*` commands available in the extension

The MCP server reads `CieloVistaStandards/project-registry.json` at runtime. Every project listed there becomes available for scanning. To add a new project to the ecosystem, add it to the registry — the MCP server picks it up automatically without any code changes.

> Currently, tools only scan registry-listed paths. The underlying logic is plain filesystem traversal and can be extended to accept arbitrary folder paths if needed.

---

## Quick Start

```powershell
cd C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools
npm install
npm run rebuild
```

`npm run rebuild` compiles TypeScript, packages the `.vsix`, and installs it in one shot.

---

## Common Commands

```powershell
npm run rebuild       # compile + package + install (use this)
npm run compile       # TypeScript only
npm run package       # produce .vsix without installing
```

---

## Install from VSIX

```powershell
code --install-extension cielovista-tools-1.0.0.vsix
```

Or in VS Code: **Extensions** → `...` menu → **Install from VSIX**.

---

## Configuration

All settings are under the `cielovistaTools` namespace in VS Code settings.

| Setting | Default | Description |
|---|---|---|
| `cielovistaTools.copilotRulesEnforcer.autoEnforce` | `true` | Apply rules on workspace open |
| `cielovistaTools.openai.apiKey` | `""` | OpenAI API key (store in User settings, not workspace) |
| `cielovistaTools.openai.model` | `gpt-4o` | OpenAI model |

---

## Project structure

```
cielovista-tools/
  package.json              <- all command declarations, settings, keybindings
  tsconfig.json             <- TypeScript config
  src/
    extension.ts            <- entry point - wires all features together
    shared/
      output-channel.ts     <- single shared OutputChannel for all features
      terminal-utils.ts     <- terminal helpers, folder/file open
      copilot-rules-utils.ts <- read/apply/remove Copilot instruction rules
      webview-utils.ts      <- HTML/Markdown webview builders
      error-log-utils.ts    <- persistent error tracking to JSON
    features/
      copilot-rules-enforcer.ts
      copilot-open-suggested-file.ts
      terminal-copy-output.ts
      terminal-set-folder.ts
      terminal-folder-tracker.ts
      terminal-prompt-shortener.ts
      css-class-hover.ts
      python-runner.ts
      html-template-downloader.ts
      openai-chat.ts
  mcp-server/               <- standalone MCP server for AI assistant integration
```

Each feature `.ts` file has a matching `.README.md` covering internals, API, and manual test steps.

---

## Architecture rules

**One job per file.** Each feature file registers commands for exactly one feature and nothing else.

**No duplicate code.** If two features need the same function, it lives in `shared/` and both import it.

**Shared files have no command registrations.** `shared/` files contain pure functions only.

**One OutputChannel.** All logging goes through `shared/output-channel.ts`.

**extension.ts is wiring only.** It imports every feature's `activate()` and calls it. No business logic.

---

## Adding a new feature

1. Create `src/features/my-feature-name.ts` — export `activate(context)` and `deactivate()`.
2. Create `src/features/my-feature-name.README.md` — document commands, settings, internals, and manual test steps.
3. Add command entries to `contributes.commands` in `package.json`. Prefix all command IDs with `cvs.`.
4. Add two lines to `src/extension.ts`:
   - import and call in activate/deactivate
5. Run `npm run rebuild`.

---

## Output panel

All extension activity is logged to the **CieloVista Tools** output channel.

**View > Output > CieloVista Tools**

---

## Error log

Errors are tracked in `{workspace}/.vscode/logs/cielovista-errors.json`. Accumulates across sessions, counts repeats, stores solutions. See `shared/error-log-utils.README.md` for details.

---

## Prerequisites

- Node.js 18+
- VS Code Insiders
- `CieloVistaStandards/project-registry.json` populated with project paths

---

## License

Copyright (c) 2026 CieloVista Software
