# CieloVista Tools

**One VS Code extension. One install. All CieloVistaSoftware developer tools in one place.**

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

## Install

### From source (development)

```powershell
cd C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools
npm install
npm run start
```text
`npm run start` compiles TypeScript, packages the `.vsix`, and installs it in the current VS Code instance in one shot.

### From a `.vsix` file

```powershell
code --install-extension cielovista-tools-1.0.0.vsix
```text
Or in VS Code: **Extensions** → `...` menu → **Install from VSIX**.

---

## Build

```powershell
npm run compile   # TypeScript only
npm run build     # alias for compile
npm run package   # produce .vsix without installing
npm run start     # compile + package + install
```text
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

```text
cielovista-tools/
  package.json              ← all command declarations, settings, keybindings
  tsconfig.json             ← TypeScript config
  README.md                 ← this file
  src/
    extension.ts            ← entry point — wires all features together
    shared/
      output-channel.ts     ← single shared OutputChannel for all features
      terminal-utils.ts     ← terminal helpers, folder/file open
      copilot-rules-utils.ts ← read/apply/remove Copilot instruction rules
      webview-utils.ts      ← HTML/Markdown webview builders
      error-log-utils.ts    ← persistent error tracking to JSON
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
```text
Each `.ts` file has a matching `.README.md` covering internals, API, and manual test steps.

---

## Architecture rules

These rules are enforced structurally — the folder layout makes violations visible immediately.

**One job per file.** Each feature file registers commands for exactly one feature and nothing else.

**No duplicate code.** If two features need the same function, it lives in `shared/` and both import it. Functions are never copy-pasted between files.

**Shared files have no command registrations.** `shared/` files contain pure functions only. VS Code API calls like `registerCommand`, `showInformationMessage`, and `createStatusBarItem` belong in feature files.

**One OutputChannel.** All logging goes through `shared/output-channel.ts`. No feature creates its own `OutputChannel`.

**extension.ts is wiring only.** It imports every feature's `activate()` and calls it. No business logic, no direct VS Code API calls beyond the imports.

---

## Adding a new feature

1. Create `src/features/my-feature-name.ts` — export `activate(context)` and `deactivate()`.
2. Create `src/features/my-feature-name.README.md` — document commands, settings, internals, and manual test steps.
3. Add command entries to `contributes.commands` in `package.json`. Prefix all command IDs with `cvs.`.
4. Add two lines to `src/extension.ts`:
   - `import { activate as myFeature, deactivate as deactivateMyFeature } from './features/my-feature-name';`
   - `myFeature(context);` in `activate()`, `deactivateMyFeature();` in `deactivate()`
5. Run `npm run start` to compile, package, and install.

If your feature needs a shared utility that doesn't exist yet, add it to the appropriate file in `shared/` and document it in that file's `.README.md`.

---

## Output panel

All extension activity is logged to the **CieloVista Tools** output channel. View it via:

**View → Output → CieloVista Tools**

Each log line is prefixed with a timestamp and the feature name:

```text
[14:32:01.456] [copilot-rules-enforcer] Applied workspace rules → C:\dev\myproject\.vscode\settings.json
[14:32:01.789] [css-class-hover] Hover on .container
```text
---

## Error log

Errors are tracked in `{workspace}/.vscode/logs/cielovista-errors.json`. This file accumulates across sessions, counts repeat occurrences, and stores solutions once you find them. See `shared/error-log-utils.README.md` for details.

---

## What it does

_TODO: 2–5 sentences describing what problem this project solves and who uses it._

---

## Quick Start

```powershell
# TODO: minimum commands to get running
```text
---

## Common Commands

```powershell
# TODO: the 5–10 commands developers run most often
```text
---

## Prerequisites

- TODO: list required tools and versions

---

## License

Copyright (c) 2026 CieloVista Software
