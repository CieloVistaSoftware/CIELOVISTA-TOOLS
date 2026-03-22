# Regression Log — CieloVista Tools

Every regression that has ever happened in this project is documented here.
Read this at the start of every session before touching any code.

---

## REG-001 — All audit tools broken on activation
**Date:** 2026-03-18  
**Severity:** Critical — 100% of commands unavailable  
**Status:** Fixed + automated test added (REG-001a/b/c)

### What broke
Every single command in the extension stopped working. Clicking any card in the launcher did nothing.

### Root cause
`import MarkdownIt from 'markdown-it'` was added to `src/shared/doc-preview.ts` as a Node-side module import. The extension packages with `vsce package --no-dependencies` which intentionally excludes `node_modules` from the VSIX. At runtime, `require('markdown-it')` threw `MODULE_NOT_FOUND`, crashing the entire extension host before any commands were registered.

### Contributing factor
A wrong-directory `npm install @types/markdown-it --save-dev` ran in the DiskCleanUp directory instead of cielovista-tools (see REG-002). Recovery installed markdown-it into `dependencies` instead of `devDependencies`, making it appear like a runtime dep.

### Fix
- Removed `import MarkdownIt` from doc-preview.ts entirely
- markdown-it now loaded from cdnjs in the webview HTML (same pattern as highlight.js)
- Rendering is client-side via `window.markdownit()`
- `dependencies` block in package.json cleared to `{}`

### The rule this establishes
**NEVER import a runtime npm package in extension host code.**  
All rendering/utility libraries must be loaded via CDN in the webview HTML.  
The extension host may only use:
- `vscode` (provided by VS Code)
- Node.js built-ins (`fs`, `path`, `os`, `child_process`, etc.)
- Code compiled directly into the extension's `out/` directory

---

## REG-002 — Wrong-directory npm install wiped 303 packages
**Date:** 2026-03-18  
**Severity:** High — broke local development environment  
**Status:** Fixed

### What broke
`node_modules` in cielovista-tools was reduced from ~308 packages to 4 packages. TypeScript compilation failed. The extension could not be built.

### Root cause
`npm install @types/markdown-it --save-dev` was executed with the PowerShell working directory set to the DiskCleanUp project root. npm read DiskCleanUp's `package.json`, saw no `@types/markdown-it` listed there, and ran a clean install that removed the 303 packages not in DiskCleanUp's manifest.

### Fix
Ran `npm install markdown-it @types/markdown-it` with explicit `Push-Location` to cielovista-tools directory. This restored all 308 packages.

### The rule this establishes
**Always verify the working directory before running `npm install`.**  
Use `Push-Location "C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools"` before any npm command, never rely on inherited cwd. The diskcleanup-runner PowerShell tool always runs in the DiskCleanUp directory — never use it for cielovista-tools npm operations.

---

## REG-003 — Panel width collapsing on command run (recurring)
**Date:** 2026-03-18  
**Severity:** Medium — UX degradation  
**Status:** Fixed + permanent fix in place

### What broke
Clicking Run on any card caused the launcher panel to collapse/resize. The user's carefully set panel width was lost.

### Root cause
When `vscode.commands.executeCommand()` ran a command that opened a new webview panel in `ViewColumn.One`, VS Code shifted focus to the new panel and recalculated column widths. The launcher had no mechanism to re-assert its position after the command completed.

### Fix
Added `panel.reveal(vscode.ViewColumn.One, true)` in a `finally` block in the launcher's message handler. This runs after every command, success or failure, and re-pins the launcher to Column 1 with `preserveFocus: true` so it doesn't steal focus but maintains its width.

All sub-panels (doc preview, view a doc, npm scripts) use `reveal(column, true)` — the second argument is `preserveFocus`.

### The rule this establishes
**All panel reveal/create calls must use preserveFocus: true.**  
The launcher always re-pins itself after any command via `finally { panel.reveal(ViewColumn.One, true); }`.  
Sub-panels always open with `ViewColumn.Beside`.

---

## REG-011 — Cannot find module 'diff' / extension fails activation silently
**Date:** 2026-03-22  
**Severity:** Critical — 100% of commands unavailable, extension dead on load  
**Status:** Fixed + automated test added (REG-011)

### Error signature
```
Cannot find module 'diff'
Require stack:
  - c:\...\cielovista-tools\out\features\js-error-audit.js
```
Extension host crashes before any command is registered. All CVT commands missing from palette.

### Root cause — two gates both had to fail

The `diff` npm package is required by `js-error-audit.ts` in the extension host at runtime. Two separate configuration errors combined to prevent it from ever reaching the VSIX:

**Gate 1 — wrong package.json section:**  
`diff` was listed in `devDependencies` instead of `dependencies`. vsce treats `devDependencies` as build-time only and excludes them from the bundle.

**Gate 2 — .vscodeignore excluded all of node_modules:**  
`.vscodeignore` contained `node_modules/**` which explicitly strips the entire `node_modules` folder from the VSIX. Even after moving `diff` to `dependencies`, Gate 2 silently discarded it.

**Gate 3 (historical) — `--no-dependencies` flag:**  
The `package` script was `vsce package --no-dependencies` which is a third, independent instruction to vsce to skip bundling node_modules entirely. This was later removed.

All three gates needed to be addressed before `diff` made it into the VSIX.

### Fix applied (2026-03-22)
1. Moved `diff` from `devDependencies` → `dependencies` in `package.json`
2. Removed `--no-dependencies` flag from the `package` script
3. Added negation rules to `.vscodeignore` **before** the `node_modules/**` exclusion:
   ```
   !node_modules/diff/**
   !node_modules/highlight.js/**
   !node_modules/markdown-it/**
   node_modules/**
   ```
   Order is critical — negations must precede the wildcard exclusion.

### The rule this establishes
**Any npm package used in extension host code (anything under `src/`) must be in `dependencies` AND explicitly re-included in `.vscodeignore` via a `!node_modules/<pkg>/**` negation line placed ABOVE the `node_modules/**` exclusion.**

Checklist when adding a new runtime npm dependency:
- [ ] Add to `dependencies` (not `devDependencies`) in `package.json`
- [ ] Add `!node_modules/<pkg>/**` to `.vscodeignore` above the `node_modules/**` line
- [ ] Verify VSIX file listing shows `node_modules/<pkg>/` after `npm run rebuild`
- [ ] `Cannot find module` error gone after Developer: Reload Window

### Packages currently bundled in VSIX
| Package | Used in | Bundled via .vscodeignore |
|---------|---------|---------------------------|
| `diff` | `js-error-audit.ts` (extension host) | `!node_modules/diff/**` |
| `highlight.js` | webview CDN fallback | `!node_modules/highlight.js/**` |
| `markdown-it` | webview CDN fallback | `!node_modules/markdown-it/**` |

---

## How to add a new regression entry

When a bug is found and fixed:
1. Add an entry here with date, severity, what broke, root cause, fix, and the rule it establishes
2. Add a corresponding test in `scripts/run-regression-tests.js`
3. The test ID (REG-NNN) must match between this log and the test file
4. Append to `data/fixes.json` with the same REG-NNN id

---

## Automated regression tests

Run: `npm run test:regression`  
These run automatically before every `npm run rebuild` — the build will abort if any test fails.

| Test   | What it checks |
|--------|----------------|
| REG-001a | `dependencies` block in package.json is empty |
| REG-001b | No source file imports a package from `dependencies` |
| REG-001c | No `require()` of external packages in extension host |
| REG-003  | TypeScript compiles with zero errors |
| REG-004  | Every catalog ID has a `registerCommand()` call |
| REG-005  | No duplicate command IDs in catalog |
| REG-006  | package.json `contributes.commands` covers all catalog IDs |
| REG-007  | extension.ts activates all feature modules |
| REG-008  | No bare `console.log` in shipped source (warning only) |
| REG-009  | `data/` is in `.gitignore` |
| REG-010  | All packages in `devDependencies`, not `dependencies` |
| REG-011  | Every `dependencies` package has `!node_modules/<pkg>/**` in `.vscodeignore` |
