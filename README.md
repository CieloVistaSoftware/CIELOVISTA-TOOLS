https://cielovistasoftware.github.io/CIELOVISTA-TOOLS/

# CieloVista Tools
One VS Code extension. One install. Your folder of projects — unified.

CieloVista Tools turns your multi‑project workspace into a single, intelligent development environment. It routes commands, docs, audits, and AI actions across all the projects in your folder so you can work faster, switch context less, and keep everything organized.

If you work across multiple repos inside one folder, this extension makes the whole environment feel like one product.

📋 **[See what's new in the latest release →](CHANGELOG.md)**

## ✨ Key Features
**Unified Workspace**
- Treats your folder of projects as one routed ecosystem
- Automatically sends commands, scripts, and AI actions to the correct project
- No more hunting for terminals, scripts, or docs

**Home Dashboard**
- Central launch surface for everything
- Recent projects, commands, tools, and status cards in one place

**Smart Project Launchers**
- Run build/start/rebuild/tray/stop actions without opening each repo
- NPM script runner with cross‑project awareness
- Quick‑pick launchers for common workflows

**Documentation Intelligence**
- Cross‑project doc catalog
- README generator
- Broken‑reference scanner
- Doc header and structure audits
- Doc Consolidator — finds duplicate docs across all your projects (by filename or content similarity) and merges them into one authoritative copy, updating every reference
- Makes large doc sets discoverable and consistent

**Developer Ergonomics**
- FileList — a sortable, filterable file browser as an alternative to the Explorer tree, with multi‑select and quick actions
- Copy terminal output to clipboard or Copilot Chat
- Jump terminals to folders instantly
- Python runner
- CSS class hover
- HTML template downloader
- Image helpers
- File‑to‑chat path utilities

**AI‑Powered Development**
- Built‑in MCP server exposes your entire project folder to AI assistants
- Symbol index, doc catalog, command listing, and project metadata
- Copilot rules enforcement
- OpenAI chat actions (explain, refactor, docstring, etc.)

**Quality & Operational Tooling**
- Test coverage audits
- Daily codebase audits
- License sync
- Error log viewer
- Marketplace compliance checks
- Session Activity Dashboard — live rollup of current focus, active work, deploy‑branch pushes, CI status, and open issues

## 🚀 Why It Matters
CieloVista Tools is more than a collection of commands — it’s a control plane for your entire folder of projects.

It understands your workspace structure, knows where everything lives, and routes every action (human or AI) to the right place automatically. You stay focused on building instead of navigating.

## 🧠 MCP Server Included
The extension ships with a standalone MCP server that gives AI assistants structured access to your project folder:

- Cross‑project scanning
- Symbol indexing
- Documentation cataloging
- Command discovery
- Project metadata access

Add a project to your own `project-registry.json` (a personal file you create at `C:\Users\<you>\Downloads\CieloVistaStandards\project-registry.json` — see [FRESH-INSTALL-GUIDE.md](FRESH-INSTALL-GUIDE.md) for its format) and it becomes available instantly — no rebuild required.

## 📦 Quick Start
```powershell
npm install
npm run rebuild
```
Reload VS Code Insiders to activate the extension.

## ⚙️ Configuration
All settings live under `cielovistaTools.*`.

| Setting | Default | Description |
|---|---|---|
| `cielovistaTools.copilotRulesEnforcer.autoEnforce` | `true` | Apply rules on workspace open |
| `cielovistaTools.openai.apiKey` | `""` | OpenAI API key |
| `cielovistaTools.openai.model` | `gpt-4o` | Default model |


## 🛠️ Add a New Feature
1. Create a feature file
2. Add its README
3. Register commands in `package.json`
4. Wire it into `extension.ts`
5. Run `npm run rebuild`

## 📘 What It Does (Marketplace Summary)
CieloVista Tools turns your folder of projects into a unified, intelligent workspace. It centralizes navigation, documentation, automation, AI assistance, and quality checks so you can move faster across multiple repos without losing context. If your day involves jumping between projects, this extension makes the entire environment feel seamless.

