## ✅ TODO (audited 2026-04-13)

### Open tasks — priority order

#### 1. Finish readme-compliance split — ~45 min
Monolith `src/features/readme-compliance.ts` is still fully active (~600 lines). Folder has 6 modules already.
**Method:** Create `html.ts`, `commands.ts`, `ai-fixer.ts`, `index.ts` in the folder. Move code from monolith, wire index.ts as entry point, update `extension.ts` import, delete monolith. Build + test + install.

#### 2. Split doc-header.ts — ~30 min
Monolith, no folder exists yet. Also check if `doc-header-scan.ts` is a partial split to merge in.
**Method:** Create `src/features/doc-header/` with `types.ts`, `scanner.ts`, `fixer.ts`, `html.ts`, `index.ts`. Move code, update `extension.ts`, delete monolith. Verify all 5 `cvs.headers.*` commands work.

#### 3. Split doc-consolidator.ts — ~30 min
Monolith, no folder exists yet. Check if `src/shared/consolidation-plan-webview.ts` should move into the folder.
**Method:** Create `src/features/doc-consolidator/` with `types.ts`, `scanner.ts`, `merger.ts`, `html.ts`, `index.ts`. Move code, update `extension.ts`, delete monolith. Verify all 4 `cvs.consolidate.*` commands work.

#### 4. View-a-Doc prefix grouping — ~30 min
When multiple doc titles in the same project share a prefix (e.g. `feature:`, `FIX-`), group them under a category header.
**Method:** In `src/features/doc-catalog/commands.ts`, extract prefix (text before first `:`, `-`, or `.`), group when 2+ docs share it, render `<h3>` headers for groups, ungrouped docs after. Add CSS for `.doc-group-hd`.

#### 5. View-a-Doc clipboard ops — ~60 min
File-system-style selection: click selects one, Ctrl+click toggles, Ctrl+A selects all visible, Ctrl+C copies file paths, Escape clears.
**Method:** In `src/features/doc-catalog/commands.ts`, add `selectedPaths` set, click/keyboard handlers, `.selected` CSS class, postMessage to extension host for `vscode.env.clipboard.writeText()`.

#### 6. Doc Catalog cards broken — ~15 min (manual test first)
"Open Doc Catalog" and "Rebuild Doc Catalog" cards may not be working. Needs a click test to confirm — may already be fixed.

#### 7. View-a-Doc folder icon → open project — ~20 min (manual test first)
Check if clickable project-switch link already exists on catalog rows. If not, add one that calls `vscode.openFolder`.

#### 8. Error Log Viewer shows no results — ~10 min (manual test first)
Code reads `data/tools-errors.json` correctly. Probably just an empty log. Trigger a real error and confirm it populates.

#### 9. Remove two Open Home links — ~5 min (verify first)
`cvs.tools.home` opens CVT dashboard, `cvs.project.openHome` opens configured home folder. These are different features — may not be redundant. Verify before removing.

**Total estimated: ~4 hrs 15 min**

---

### Cleanup (quick wins, do anytime)
- Delete dead stub `src/features/cvs-command-launcher.ts`
- Delete misleading `// FILE REMOVED BY REQUEST` comments from active files

---

### Completed
1. ~~Delete dead monolith files~~
2. ~~Extract REGISTRY_PATH to shared~~
3. ~~Split doc-auditor.ts~~
4. ~~View-a-Doc search highlight~~
5. ~~Catalog integrity~~
6. ~~Split cvs-command-launcher.ts~~
7. ~~Doc-preview toolbar fixes~~
8. ~~Doc-preview breadcrumb overflow~~
9. ~~NPM Scripts button missing~~
10. ~~Doc Catalog dropdowns~~
11. ~~Markdown tables render as plain text~~

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
