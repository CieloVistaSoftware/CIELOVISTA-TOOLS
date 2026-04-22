# CieloVista Tools

**One VS Code extension. One install. All CieloVistaSoftware developer tools in one place.**

CieloVista Tools is the developer toolchain for the entire CieloVista Software ecosystem. It combines a VS Code extension with an MCP (Model Context Protocol) server that gives AI assistants runtime access to every registered project. The extension consolidates daily developer commands into a single install. The MCP server reads `CieloVistaStandards/project-registry.json` to discover all projects, enabling cross-project symbol search, doc catalog, command listing, and reusable-code discovery without manual configuration.

---

## What's included

| Feature | What it does | Commands |
|---|---|---|
| Copilot Rules Enforcer | Injects your custom rules into Copilot on every workspace open | `cvs.copilotRules.enable / disable / reload / view` |
| Copilot Open Suggested File | Opens a file path that Copilot mentioned in its response | `cvs.copilot.openSuggestedFile` |
| Terminal Copy Output | Copies terminal output since last command — clipboard, markdown, or Copilot chat | `Ctrl+Shift+C` in terminal |
| Terminal Set Folder | Right-click a folder in Explorer to immediately cd the terminal there | Explorer context menu |
| Terminal Folder Tracker | Tracks last `cd` directory, lets you jump back to it after restart | `cvs.terminal.jumpToLastFolder` |
| Terminal Prompt Shortener | Toggles PowerShell prompt between full path and single `>` | `cvs.terminal.togglePromptLength` |
| CSS Class Hover | Hover over a CSS class name to see its definition inline | Automatic on hover |
| Python Runner | Right-click any `.py` file to run it in the terminal | Explorer context menu |
| HTML Template Downloader | Download HTML starter templates from CieloVistaSoftware GitHub | `cvs.htmlTemplates.download` |
| OpenAI Chat | Explain, refactor, generate docstrings, or open a full chat panel | `Ctrl+I`, `Ctrl+Alt+D` |

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
