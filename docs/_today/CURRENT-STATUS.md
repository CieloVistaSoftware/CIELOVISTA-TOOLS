# CURRENT-STATUS.md — cielovista-tools

---

## 🅿️ PARKING LOT

**Last session:** 2026-03-18 (Session 8 continued)
**Last action:** Built and installed. All regression tests pass (11/11).
**Next step:** Reload Window in VS Code to activate latest VSIX.

### What was done this continuation

- `preserveFocus: true` on all panel reveals — left panel never loses width when a button is clicked
- `revealInExplorer` / `revealFileInOS` for folder path bar clicks — shows folder in VS Code Explorer sidebar when in workspace, OS explorer when outside
- markdown-it switched from Node-side import to CDN-only in webview (REG-001 regression fixed)
- Regression test suite added: `scripts/run-regression-tests.js` — 11 tests run before EVERY build
- `npm run rebuild` now aborts if any regression test fails
- `docs/REGRESSION-LOG.md` — permanent record of all regressions, root causes, rules
- GUI cleanup: all emoji removed from toolbar/group buttons, SVG icons on Run/Read buttons
- `action: 'read'` field added to CmdEntry type — 10 catalog entries marked as readers
- Card buttons now show **Read** (doc-page SVG, muted style) vs **Run** (play triangle, primary blue)
- F1 help modal on every card — What / Where / Group / Tags / Catalogue number / Run now
- F1 keyboard: press F1 while a card is focused to open its modal
- Every card has `<h1>` for its title, `tabindex=0`, `role=article`
- `cvs.docs.openGlobal` and `cvs.docs.openProject` now redirect to View a Doc webview (no more quick picks)
- `data/fixes.json` — FIX-001 logged (markdown-it regression)

### Open questions
- Remaining quick picks in doc-auditor walkthrough, consolidator, header fixOne are multi-step wizards (step 2+), need individual webview replacements — larger session of work

### Completed this session

- DiskCleanUp TS errors fixed (pubsub, section-vm, layout, error-logger, validator, api-fetch, large-unified)
- start.js: Step 0 stops Windows Service before build — no more DLL lock / bin/Fresh detour
- npm-command-launcher: webview panel replaces quick pick, local folder first, folder.scriptName labels
- View a Doc: webview table (folder | docs) replaces quick pick, priority docs first, green active row + link
- doc-preview.ts: breadcrumb nav trail, folder path bar (Windows style), Terminal / Explorer / Editor / Open in VS Code buttons
- CieloVista Tools launcher: top location bar (Windows path, back/forward ← →), card breadcrumbs (Windows style, clickable), Windows Explorer navigation model (clicking any segment changes visible cards)
- View a Doc: narrow panel reflows to single column at 600px

### Key files changed

| File | Change |
|---|---|
| `src/shared/doc-preview.ts` | Breadcrumb nav, folder path bar, 4 action buttons |
| `src/features/cvs-command-launcher/html.ts` | Location bar, card breadcrumbs, nav model |
| `src/features/cvs-command-launcher/index.ts` | openFolder handler, wsPath passed to HTML |
| `src/features/doc-catalog/commands.ts` | View a Doc webview, priority sort, green active, narrow CSS |
| `src/features/npm-command-launcher.ts` | Webview panel, folder grouping |
| `src/features/docs-manager.ts` | openDocPreview source labels |
| `C:\Users\jwpmi\source\repos\DiskCleanUp\scripts\start.js` | Step 0 service stop |

**Completed this session:**
- JS Error Audit rebuilt: persistent ERR/WRN IDs, 🤖 AI Fix per row, diff overlay, accept/reject workflow, Fix All button, warnings Open-only
- catalog.ts: all 70 commands now have scope field — TypeScript enforces it
- Doc Catalog Dewey numbers: project-based (000=Global, 100=vscode-claude, 200=wb-core, 300=DiskCleanUp...) — cards show 300.001 etc
- Error log system: error-log.ts (mirrors wb-core error-logger.js interface), error-log-viewer.ts (cvs.tools.errorLog command), output-channel.ts routes through it
- test-coverage-auditor.ts: proper error handling — script existence check, stdout/stderr capture, JSON parse with offending content in error
- wb-core README.md: full rewrite with architecture intro, three pillars, full docs table with links
- .vscodeignore: created — excludes mcp-server, src, tests, scripts, playwright-report
- install.js: stderr suppressed on failed CLI candidates — clean output

**Open questions:** None.

---

## ✅ TODO — Priority Order

1. ✅ ~~Delete dead monolith files~~ — `doc-catalog.ts` and `marketplace-compliance.ts` deleted
2. ✅ ~~Extract REGISTRY_PATH to shared~~ — `src/shared/registry.ts` is canonical, all 6 files updated, inline copies removed
3. ✅ ~~Split doc-auditor.ts~~ — 8 modules: types, scanner, analyzer, runner, html, actions, report, walkthrough, index. Monolith deleted.
4. **Split cvs-command-launcher.ts** — next
5. **Finish readme-compliance split** — folder has 3 of 9 modules
6. **Split doc-header.ts** and **doc-consolidator.ts**

---

## Key File Paths

| What | Path |
|---|---|
| Extension root | `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools` |
| Canonical registry | `src\shared\registry.ts` |
| doc-auditor (split) | `src\features\doc-auditor\` |
| doc-catalog (split) | `src\features\doc-catalog\` |
| Marketplace (split) | `src\features\marketplace-compliance\` |
| Build command | `npm run rebuild` |
