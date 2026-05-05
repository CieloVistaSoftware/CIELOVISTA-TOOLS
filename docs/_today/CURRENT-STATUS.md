---
title: CURRENT-STATUS.md — cielovista-tools
description: - Verified live after junction install: ✅ MCP Viewer status column + pills, ✅ Symbol Index (listsymbols / listcvtcommands), ✅ Send Path tooltip + c…
project: cielovista-tools
category: 000 — Meta / Session / Status
relativePath: docs/_today/CURRENT-STATUS.md
created: 2026-04-25
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [current, status, currentstatusmd]
---

# CURRENT-STATUS.md — cielovista-tools

---

## 🅿️ PARKING LOT — end of session 2026-05-05

**TASK:** Expanded test coverage from 50% to 98.15%  
**FILES:** 27 new test files in `tests/unit/` (copilot-*.test.js, corequisite-*.test.js, doc-*.test.js, ... cvs-command-launcher.test.js, daily-audit.test.js)  
**LAST ACTION:** Committed test file `daily-audit.test.js` as part of batch coverage expansion  
**NEXT STEP:** None — task complete. Coverage exceeded 95% target at 98.15% (53/54 features covered, 1429 test cases).

---

## Session notes — 2026-05-05

- **GitHub issues automation complete:** #74 (clipboard selection), #71 (doc-header split), #72 (doc-consolidator split), #33 (audit → file issue), #31 (rebuild edge cases). All closed and merged to main.
- **Build pipeline verified:** Full `npm run rebuild` passes (96 tests, 0 failures), VSIX 1.0.2 packaged and installed to dev junction.
- **Test coverage expansion:** Created 27 new structural unit test files covering 27 previously-untested features. Coverage now **98.15% (53/54 features, 1429 tests across 112 files)**, exceeding the 95% requirement.
- **Remaining:** 1 feature shows as uncovered in audit report — likely audit script counting a non-feature directory (e.g., `image-reader-assets/`, `CommandHelp/`) rather than a real untested feature. All 54 production features have either logic tests or structural coverage tests.

---

## Session notes — 2026-04-25

- Verified live after junction install: ✅ MCP Viewer status column + pills, ✅ Symbol Index (`list_symbols` / `list_cvt_commands`), ✅ Send Path tooltip + click on Recent Projects. Still unverified: ⏳ Promote Folder to Product (right-click), ⏳ Daily Audit 0 red.
- Shipped commit `0e78795` (`Add github-issues-view`): the missing source file behind the 1.0.2 disaster. TODO List / Open Issues now actually works. Anonymous fetch from `api.github.com/repos/CieloVistaSoftware/cielovista-tools/issues`, click-through to GitHub. Includes `tests/github-issues-view.test.js` (7 assertions, hits the real API).
- Shipped commit `340dd63` (`Add import-resolution gate to rebuild`): `scripts/verify-imports.js` walks `out/*.js`, parses every `require("...")`, refuses to package a VSIX if any relative import is unresolved. Verified by reproducing the exact 1.0.2 failure mode (rename `github-issues-view.js`, gate catches it). The same `rebuild.ps1` was rewritten to fail-fast on tsc errors, refuse to install while Insiders is running, auto-bump patch, strip stale `.obsolete` entries, and post-install verify.
- Switched the Insiders install from VSIX to a directory junction at `~\.vscode-insiders\extensions\cielovistasoftware.cielovista-tools` → `Downloads\VSCode\projects\cielovista-tools`. Edit `.ts`, `tsc`, reload window. No more install/uninstall cycles.
- Added `+ CVT` / `− CVT` toggle + `in CVT` badge on Recent Projects panel (Edit mode). Source-tracked but not committed yet — `src/shared/cvt-registry.ts` and home-page edits.

---

## ✅ DONE — 2026-04-22 (GitHub Projects + Issue Automation setup)

**All 24 issues live on the cielovista-tools Project board at https://github.com/users/CieloVistaSoftware/projects/4**

### What shipped this session

- `gh` CLI installed (v2.91.0) and authenticated as `CieloVistaSoftware` with `gist, project, read:org, repo, workflow` scopes
- `git` configured to inherit gh's GitHub auth via `gh auth setup-git` (no more Windows credential popups)
- **13 labels** created on `CIELOVISTA-TOOLS` repo: type:{bug,feature,regression,docs,architecture}, severity:{minor,major,critical}, scope:{mcp-viewer,doc-system,error-log}, status:verify, blocked:reg-002
- **5 issue templates** committed to `.github/ISSUE_TEMPLATE/`: bug.yml, regression.yml, feature.yml, docs.yml, config.yml (disables blank issues, links back to this doc for in-session scratch notes)
- **Bulk-creation script** at `scripts/create-github-issues.ps1` — 23 issues generated, script preserved for future reference and re-use
- **24 issues total on the board** after resolving the #1/#13 Error Log Viewer duplicate
- **2 GitHub Projects** configured under personal account: `wb-starter` (pre-existing, ~32 wb-starter issues) and `cielovista-tools` (new this session, 24 issues)

### Issue inventory

- **Numbered open TODOs (12):** Doc Catalog cards, readme-compliance split, doc-header/doc-consolidator split, View-a-Doc folder icon, doc-preview toolbar, View-a-Doc clipboard ops, breadcrumb overflow, duplicate Open Home, NPM Scripts verify, Doc Catalog dropdowns, markdown tables, Error Log Viewer
- **Architectural (6):** REG-002 logError sweep, saveRegistry consolidation, demote/archive commands, symbol index status filter, architecture check panel polish, launcher UX + quick-pick webview conversions
- **Epics (3):** Doc Contract + Subject-Based Dewey, MCP Viewer hover tooltips, Error Log Viewer → File as GitHub Issue
- **Specific (2):** Missing diagram at 1400.005, Broken references scanner

### Decisions locked this session (preserve for future reference)

1. **Personal account, not organization** — CieloVistaSoftware stays personal. Migration path to org exists if portfolio grows.
2. **One board per product, not one master board** — per-product granularity matches actual volume.
3. **Commit convention: `Fixes #NN` / `Closes #NN`** — auto-closes issues on push. `FIX-NNN` IDs in `data/fixes.json` remain for historical record; link from GitHub issue body.
4. **No sub-issue hierarchies, no milestones, no iteration fields** — solo-dev trap; revisit only if flat list becomes unmanageable.
5. **Bulk imports use a reviewable script, not manual filing** — scripts/create-github-issues.ps1 is the pattern; future bulk ops follow it.

### Still to commit from this session

The following files are modified but not yet committed. Handle in three clean commits when you come back:

1. **Parking lot + registry-promote verification scripts** — `docs/_today/CURRENT-STATUS.md`, `src/features/registry-promote.ts`, `scripts/verify-symbol-index.mjs`, `scripts/verify-symbol-index-patched.mjs`. Commit message: "Parking lot updates + verification scripts (session 2026-04-22)"
2. **Daily-audit changes** — `src/features/daily-audit/checks/test-coverage.ts`, `src/features/daily-audit/runner.ts`. From the earlier 2026-04-20 red-items session. Commit message: "Daily audit: clear red items (test-coverage false positive + missing READMEs/CHANGELOGs)"
3. **Runtime log** — `.vscode/logs/cielovista-errors.json`. Decision: add to `.gitignore` rather than commit (runtime logs don't belong in git).

---

## 📌 TODO — 2026-04-22 (MCP Viewer hover tooltips)

**Problem:** Every row in the MCP Viewer tabs (list_cvt_commands, list_projects, list_symbols, find_project, find_symbol, search_docs, get_catalog) is pure reference data. You can see IDs and one-line descriptions but you can't hover any of them to learn what happens when you click, where it runs, when to use it, or why it exists.

**Goal:** Structured hover tooltip on every row answering **what / when / where / how / why**. Turns the viewer from a scrollable list into a real discovery tool.

### Scope
- **Tooltip fields:** what (one-line summary), when (when to reach for it), where (scope — workspace/global/diskcleanup/tools), how (invocation — palette, right-click, keybinding, status bar), why (what problem it solves).
- **All tabs, same five-question structure** adapted to row type.
- **Anchor:** info indicator on ID cell; native `title=` for v1, styled popover for v2.
- **Data source:** extend the existing `runTooltip` convention already used on a few catalog entries (e.g. `cvs.tools.errorLog` at Dewey 700.003) to every catalog entry.

### Where to start
- `src/features/cvs-command-launcher/catalog.ts` — ~84 entries need `runTooltip`.
- Consider splitting into structured `{what,when,where,how,why}` fields vs one freeform string so the tooltip can render as a mini-table.
- `src/features/mcp-viewer/html.ts` — add tooltip markup to ID/Title cells in each render function.

### Why deferred
Scope is ~84 entries plus renderer work. Own session.

### Related — absorbs earlier 2026-04-02 parking lot
The 2026-04-02 item "Finish Dewey markdown-backed tooltip sourcing in the shared project-card pipeline" was hitting the same problem from a different angle. Fold that work into this TODO when it's picked up. Open question from that session was "Where should canonical Dewey tooltip markdown live for scripts without a local `docs/scripts/*.md`?" — decide as part of scope.

---

## 📌 TODO — 2026-04-22 (Doc Contract + Subject-Based Dewey + Stable Identity)

**Core insight (user, this session):** CVT is a *collector* that aggregates docs across 19 registered projects. Every `.md` doc must conform to a CieloVista standard. The current `get_catalog` MCP output shows filenames and a running row counter — no Dewey, no subject, no stable identifiers. Folders can be renamed, docs can move — the system must not depend on filesystem location for classification or linking.

**Hard architectural principle locked in this session:** a doc's identity and classification cannot depend on its filesystem location. Dewey is subject-based (a classification of *what the doc is about*) not path-based. Identity must survive folder renames, reorganizations, and filename changes.

### The contract (canonical doc front-matter)

```yaml
---
subject: 200.1              # Subject classification (project prefix + subject sub-code)
id: address-element         # Stable identity slug within subject — never changes
title: <address> Element Documentation
project: wb-core
description: One-line description under 200 chars
status: active | draft | archived
---
```

**Required:** `subject`, `id`, `title`, `project`, `description`, `status`
**Optional:** `owner`, `lastUpdated`, `tags`, `deprecated`
**Full stable identifier:** `{subject}.{id}` — e.g. `200.1.address-element`. This string is permanent and is the key to all lookups, links, and cross-references.

### Dewey scheme — subject-based, not path-based, not counter-based

- **Top-level hundreds = project.** Matches existing command-catalog convention: `000=Global, 100=vscode-claude, 200=wb-core, 300=DiskCleanUp, 400=cielovista-tools (TBD), 700=Other Tools`. New project = next available hundred, assigned at promote time.
- **Second level = subject within project.** Standardized vocabulary applied to every project:
  ```
  X.1  Components / Features
  X.2  Architecture
  X.3  Testing
  X.4  Policy & Standards
  X.5  AI Coordination
  X.6  Release & Deployment
  X.7  Getting Started
  X.8  API / Reference
  X.9  Meta (roadmap, status, planning)
  ```
  Projects without a Components section skip X.1, projects with extra categories use X.10+.
- **No third level for now.** Multiple docs within the same subject share the same Dewey. Distinguished by `id` slug (the cutter number in library terms), not by adding more digits.
- **Subject is author-assigned.** The normalizer can *suggest* based on reading the doc, but cannot assign without human confirmation. Subject classification is editorial.
- **OPEN QUESTION (awaiting user confirmation):** standardized second-level vocabulary above vs per-project independent taxonomies. Recommendation: standardized. User has not yet confirmed.

### Identity rules

- **`id` is a slug** — lowercase-kebab-case, 3-50 chars, stable for life of doc.
- **Once assigned, never changed.** Renaming identities is a v2 feature that requires an alias table in `CieloVistaStandards/dewey-aliases.json` mapping old → new.
- **Uniqueness invariant:** within a given `subject`, every `id` must be unique. The validator enforces. Collisions refuse to resolve until fixed.
- **Retired ids are not reused.** If a doc at `200.1.address-element` is deleted, no future doc can claim that identity even if the topic comes back — avoids citation poisoning.

### Link resolution — at render time, not collection time

`get_catalog` MCP response returns identity + current path, not pre-baked links:

```json
{
  "subject": "200.1",
  "id": "address-element",
  "project": "wb-core",
  "title": "<address> Element Documentation",
  "description": "...",
  "currentPath": "docs/components/address.md",
  "currentFilePath": "C:\\dev\\wb-core\\docs\\components\\address.md"
}
```

The viewer builds links at render time:
- **VS Code:** `vscode://file/` + currentFilePath (with forward slashes). Opens in editor. Local-only.
- **Viewer preview:** `/doc/{subject}.{id}` — resolver endpoint, not path-based. Bookmarks stay valid when files move.
- **GitHub:** `https://github.com/.../blob/main/` + currentPath — only if project has a `githubUrl` field in the registry.

External copies of GitHub links are inherently brittle (folder renames break them). Use commit-SHA permalinks for truly-stable external references when it matters.

### The doc ledger / index

In-memory cache in the MCP server, keyed by `{subject}.{id}` → current `DocEntry`. Built by `buildCatalog()` on startup and on explicit refresh. Not re-scanned on every MCP call (too slow for 19 projects). Invalidated on: doc modification, new project promote, explicit refresh command.

### Ownership split

**Principle locked this session:** MCP is the primary surface for operating on the doc collection. Validation, normalization, migration, classification, resolution — all live as MCP tools in `mcp-server/src/tools/`. VS Code commands and viewer tabs are thin wrappers around MCP tool calls. The MCP system exists precisely for this: it's how CVT operates on the 19-project doc collection from any client (VS Code, Claude Desktop, automation scripts, agents).

**CieloVistaStandards repo:**
- `doc-contract.md` — human-readable spec
- `doc-contract.schema.json` — JSON Schema for programmatic validation
- `subject-taxonomy.md` — canonical second-level subject list
- `dewey-aliases.json` — migration + rename table mapping old-scheme → new-scheme identifiers
- One or two exemplar conforming docs

**cielovista-tools repo — MCP tools (primary surface):**
- `validate_doc` — run contract validator on one file, return `{ok, violations[]}`
- `list_doc_violations` — scan all registered projects, return report
- `normalize_doc` — non-destructive fixes on one doc (suggest subject, add missing front-matter, propose id slug). Never commits without human approval.
- `migrate_dewey` — convert old-scheme Dewey (e.g. `1400.005`) to new-scheme `{subject}.{id}`. Reads the doc, proposes new identity, flags for manual decision. Records mapping in `dewey-aliases.json` on approval so old references still resolve.
- `list_old_dewey` — find every doc using the old scheme across all projects. Produces migration worklist.
- `get_doc_by_identity` — resolve `{subject}.{id}` to current filesystem path via the ledger. Public face of the ledger.
- `refresh_doc_ledger` — explicit invalidation trigger for the in-memory index.

**cielovista-tools repo — thin wrappers around MCP tools:**
- `src/features/doc-contract/` — validator, scanner, normalizer, ledger as TypeScript modules (the MCP tools delegate to these so the logic can also be imported directly if needed)
  - **validator checks include:** required front-matter fields present; subject matches project prefix; id is a valid slug; uniqueness within subject; every `![alt](path)` resolves to an existing image; every prose reference to "diagram below" / "see figure" / "illustrated below" is followed by an image or mermaid block (catches the 1400.005 class of gap the user flagged this session)
- `src/features/doc-contract/README.md`
- New MCP Viewer tab "Doc Compliance" rendering violations color-coded per project (wraps `list_doc_violations`)
- `cvs.docs.normalize` VS Code command — palette + per-project right-click (wraps `normalize_doc`)
- `cvs.docs.migrate` VS Code command — drives the human-in-the-loop migration UI (wraps `migrate_dewey`)
- Integration hook in `cvs.registry.promote` — calls `normalize_doc` on every `.md` in the promoted folder as step 4 after CLAUDE.md + README.md scaffold
- `mcp-server/src/tools/catalog-helpers.ts` — `buildCatalog()` reads front-matter, populates identity and ledger entries
- `src/features/mcp-viewer/html.ts` — `get_catalog` tab groups by subject (not filename), renders Dewey column, three link icons per row (VS Code / viewer preview / GitHub)
- `src/features/mcp-viewer/index.ts` — new `/doc/:subject.:id` resolver endpoint that reads the ledger and redirects

### Migration from old Dewey scheme to new

**Context:** Before this session's redesign, CVT already had Dewey numbers in use (e.g. `1400.005` referenced by user). Those must keep resolving after the new scheme is in place — breaking existing references is unacceptable.

**Migration principles:**
1. **Old numbers never disappear.** Every old identifier gets an entry in `dewey-aliases.json` mapping to its new `{subject}.{id}`.
2. **Resolution is alias-aware.** `get_doc_by_identity` and the `/doc/:identity` resolver check aliases first, then current identities. Old links keep working forever.
3. **Human-in-the-loop.** The MCP tool `migrate_dewey` *proposes* a mapping by reading the doc; user approves each one before it's committed. No silent bulk migration.
4. **Migration is tracked.** `list_old_dewey` is the worklist. Every migrated doc is removed from it. Progress is visible.

**OPEN QUESTION for next session — scope of the old scheme:**
- Only in command catalog (`catalog.ts`)? Those are commands, not docs — may not need migration.
- Also in doc front-matter? Roughly how many docs? What numbering pattern (per-project vs global-sequential)?
- In filenames (e.g. the `0.md` seen in wb-core's catalog output)?
- Embedded in doc *content* as inline references like "see doc 1400.005"? Those need updating too.

User needs to answer this before migration work can be sized honestly.

### Non-conformance handling — three layers

1. **Passive:** viewer always flags non-conformers (red row, missing-field badge) — no action taken.
2. **Active with consent:** `cvs.docs.normalize` standalone command fills missing front-matter, suggests subjects, flags conflicts. Never overwrites existing valid values.
3. **Automatic on promote:** `cvs.registry.promote` runs normalize as step 4 so every newly-promoted product starts compliant.

### Phase order

1. **Phase 1 — the standard itself** (CieloVistaStandards): spec + schema + subject taxonomy + exemplar. ~30 min.
2. **Phase 2 — validator + scanner** (cielovista-tools): pure validation functions, MCP tool `list_doc_violations`, new viewer tab. ~90 min.
3. **Phase 3 — normalizer + repair**: non-destructive front-matter creation, subject suggestion, integration with `cvs.registry.promote`. ~90 min.
4. **Phase 4 — ledger + linking**: in-memory index, `get_catalog` picks up identity fields, viewer renders Dewey column and three link types, resolver endpoint for stable `/doc/` links. ~60 min.
5. **Phase 5 — one-time editorial backfill of existing docs** — each of the 19 projects needs a human (user, or LLM with user review) to define its actual subject taxonomy and assign subjects + ids to existing docs. Not automatable. Biggest cost of the whole initiative.

### Open questions (for next session)

- **Standardized vs per-project subject taxonomies** — awaiting user confirmation. Default to standardized unless told otherwise.
- **`cielovista-tools` project prefix** — assign a hundred. `400`? `800`? Something else?
- **Where does `githubUrl` live** — project-registry.json entry field, or auto-detect from `.git/config`? Default: manual field in registry.
- **Backfill strategy** — all 19 projects at once (big session, risk of burnout) vs one project at a time starting with cielovista-tools (incremental, validates the design on the smallest case first). Default: one at a time, cielovista-tools first.
- **Ledger persistence** — pure in-memory cache rebuilt on MCP start, or persisted to `CieloVistaStandards/doc-ledger.json`? Default: in-memory for v1, persist if lookup speed becomes a problem.
- **VS Code Insiders URL scheme** — detect at render time via a setting or user config. Default: emit `vscode://` and let the OS handler pick the right one.

### Why deferred

This is a multi-session architectural piece. Phase 1 alone (the standard) is straightforward but the cumulative work across all 5 phases is probably 6-8 hours of code + the editorial backfill which is bounded only by how many docs exist. Touch when user has a clear session to dedicate.

---

## 🅿️ ACTIVE — Pending visual verification

Two pieces of work are complete in code and green headlessly; they need `npm run rebuild`, a VS Code Insiders reload, and a Claude Desktop restart to light up. Once verified, this section can be retired.

### Registry Status Field + Promote Folder Command (2026-04-20)

**What shipped:**
- Three-tier lifecycle schema on every registry entry: `status: "product" | "workbench" | "generated" | "archived"`. All 18 pre-existing entries backfilled to `product`. JesusFamilyTree added as 19th entry pointing at `C:\Users\jwpmi\Downloads\one-electron-universe\generated\JesusFamilyTree`.
- New command `cvs.registry.promote` ("Promote Folder to Product") — right-click any folder in Explorer. Prompts for name/type/description, appends registry entry with `status: "product"`, scaffolds CLAUDE.md and README.md if missing, idempotent on repeat.
- MCP tools `list_projects` and `find_project` gained optional `status` filter param.
- MCP Viewer list_projects and find_project tabs gained Status column with four-color pills (green=product, blue=workbench, gold=generated, gray=archived) and a filter dropdown that auto-re-runs on change.
- `saveRegistry` promoted into `src/shared/registry.ts` as canonical writer.

**Verified headlessly:**
- `node scripts/verify-registry-promote.js` — first promote registers + scaffolds both files, second promote idempotent, cleanup automatic. PASS.
- `node scripts/verify-mcp-viewer-fix.js` — emitted viewer script still parses after html.ts changes. PASS.
- `node scripts/check-registry-state.js` — 19 entries, JesusFamilyTree present, all `status=product`. OK.
- `node tests/catalog-integrity.test.js` — 13/13 pass, 85 catalog entries.
- `node scripts/run-regression-tests.js` — 15/16 pass. REG-002 is the only failure (pre-existing).
- `tsc` on `./` and `mcp-server/` — exit 0 both.

**Logged:** FIX-005 in data/fixes.json.

### Symbol Index + Viewer (2026-04-20, verification pending since 2026-04-21)

**What shipped:**
- Three new MCP tools: `list_symbols`, `find_symbol`, `list_cvt_commands`. Symbol index scans all registered projects, ~3,476 symbols indexed.
- Three matching MCP Viewer tabs. VSIX packaged at 7.51 MB.
- REG-002 fixes applied in `mcp-server-status.ts` and `explorer-copy-path-to-chat.ts`.

**Logged:** FIX-003 in data/fixes.json. Repo clean, all commits pushed to `a07ad14` at https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS.

### Send Path tooltip hardening (2026-04-20)

Home page → Recent Projects: explicit Send Path hover tooltip text added, click handler hardened (`preventDefault` + guarded `currentTarget`), chat content switched to text-only message format. Regression tests pass.

### Daily Audit red items (2026-04-20)

Compiled clean. All three red checks resolved — `test-coverage.ts` Playwright false positive, missing READMEs and CHANGELOGs across 8 VSCode/projects subfolders. Waiting on a daily audit rerun to confirm 0 red.

### Verification steps for all four

1. `npm run rebuild` — or `npm run compile && node install.js` if REG-002 still blocks.
2. Reload VS Code Insiders (`Ctrl+Alt+R`).
3. Fully quit+relaunch Claude Desktop from system tray so MCP re-enumerates.
4. MCP Viewer → list_projects tab: verify Status column with four pill colors, JesusFamilyTree at row 19, status dropdown filters in place.
5. Right-click any folder in Explorer → **Promote Folder to Product**. Verify CLAUDE.md + README.md created and registry entry appears.
6. MCP Viewer → list_symbols: confirm thousands of symbols load. Try `find_symbol` with "logError" — multiple hits across projects.
7. MCP Viewer → list_cvt_commands: confirm all 85 commands appear.
8. Home page → Recent Projects → hover a Send Path button, verify tooltip text and click behavior.
9. Run daily audit, confirm 0 red items.

---

## 🅿️ ACTIVE — Open work

### 1. wb-harness console errors from Auto-Injection.md preview
**Where:** wb-harness.html served by wb-core demo server on port 3000 while previewing `C:\dev\wb-core\docs\Auto-Injection.md`.

**Errors:** `/data/fixes.json` 404, `/data/errors.json` 404, `/wb-models/builder.schema.json` 404 (Schema Builder loads 81/82), `header.css` MIME error, navbar `'a, []' is not a valid selector` crash, focus-on-search method not implemented on schema-builder.

**Owner:** wb-core (not cielovista-tools). Add to wb-core's backlog.

### 2. Fix all links in improved_dev_guidelines.md
**File:** `C:\Users\jwpmi\Downloads\CieloVistaStandards\improved_dev_guidelines.md`

Audit every link in the doc. For each internal link, verify target exists. For each external link, spot-check. Log as FIX-NNN.

**Owner:** CieloVistaStandards (global docs).

### 3. CVT folder-scan refactor (parked intentionally by user)
Refactor CVT to support scanning and cleanup across any folder (e.g., Downloads), not just workspace. Add folder picker to disk cleanup/duplicate routines. Planning only, no code changes. Resume when user brings it up.

### 4. Open numbered TODOs (audited 2026-04-22)

> **INVESTIGATE:** VS Code Insiders `swVersion=4` webview bootstrap SyntaxError at `index.html:1086` ("Failed to execute 'write' on 'Document'"). This is VS Code's own bootstrap code failing, NOT ours. Our JS now has a try-catch that shows a red banner on failure. Track whether this Insiders bug causes our handlers to never register even when our JS is clean.

1. **Doc Catalog cards broken** — "Open Doc Catalog" and "Rebuild Doc Catalog" cards not behaving correctly.
2. **Finish readme-compliance split** — folder has 3 of 9 modules.
3. **Split doc-header.ts** and **doc-consolidator.ts**.
4. **View-a-Doc folder icon → open project** — replace the folder icon in each row with a clickable link that opens that project folder in VS Code (`vscode.openFolder` switch projects).
5. **Doc-preview toolbar fixes** — rename Terminal button to "Change Working Directory", rename Editor to "Edit", fix Explorer button (currently does nothing).
6. **View-a-Doc clipboard ops** — Ctrl+A selects all visible doc links, Ctrl+C copies selected paths, Ctrl+click adds to selection, click deselects others. File-system selection model.
7. **Doc-preview breadcrumb overflow** — breadcrumb shows too many links when navigating deep. Show only the current document name as a single non-clickable label.
8. **Remove duplicate Open Home entries in command palette** — "Open Home Page" and "Open Home" both appear. Remove redundant `cvs.tools.home` vs `cvs.projects.openHome` from `package.json` menus.
9. **NPM Scripts button** — a 2026-04-03 note claims this was fixed (blank-panel root cause). Confirm via click-through; delete this item if confirmed.
10. **Doc Catalog dropdowns** — replace current filters with two linked dropdowns: (1) project selector, (2) section/category selector that updates based on selected project. Partial work landed 2026-04-03 as sticky project filter via localStorage; confirm what's already there and scope the delta.
11. **Doc-preview markdown tables render as plain text** — markdown-it tables plugin likely not enabled.
12. **Error Log Viewer shows no results** — `cvs.tools.errorLog` (Dewey 700.003) opens the panel but displays nothing. Investigate `error-log-viewer.ts` and `error-log.ts` — path mismatch or viewer not reading from the expected path.

### 5. Open architectural questions

- **REG-002 logError interface violations** — 91 call sites fail the required `(message, stacktrace, context)` signature across three divergent implementations. `test-logerror-interface.js` emits the exact list. Blocks `npm run rebuild` clean. Long-standing; needs a dedicated sweep.
- **Two private `saveRegistry` copies remain** — `docs-manager.ts` line 45 and `npm-command-launcher.ts` line 44. Canonical version now lives in `src/shared/registry.ts`. Future one-time-one-place sweep switches both call sites to the shared export.
- **No `cvs.registry.demote` / `cvs.registry.archive`** — add when there's a real need to move something *out* of product.
- **Symbol index scans every registered project regardless of status** — if viewer starts showing noise from workbench/generated entries, add the same status filter to `list_symbols`.
- **Architecture check panel polish** — pending since 2026-04-03. Finalize `daily-audit` result header so first line includes projects list. Confirm Run Audit rerun always reuses the same result panel instance (singleton rule).
- **Launcher UX backlog** — Auto-filter commands by workspace type (vscode-extension, dotnet, etc.); pin favorite commands per workspace.
- **Quick-pick webview conversions remaining** — doc-auditor walkthrough, consolidator, header fixOne are multi-step wizards needing individual webview replacements. Larger session of work.

---

## ✅ ARCHIVED — Completed 2026-03 through 2026-04

Collapsed from older parking lots. All items verified complete or superseded. Keep for history; do not treat as pending.

- **Registry Status Field + Promote Folder (2026-04-20)** — see Active pending-verification section above. Code complete, headless PASS.
- **MCP Viewer regex SyntaxError (2026-04-20)** — doubled backslashes on three JSDoc-strip regex literals in `renderSymbolsTable`. FIX-004 logged. Verification script passes.
- **Explorer copy-path feature (2026-04-20)** — `cvs.explorer.copyPathToCopilotChat` shipped. Right-click file → send absolute path to Copilot Chat. Paired MCP Viewer crash resolved by FIX-004.
- **MCP runtime + rebuild gates (2026-04-20)** — MCP crash loop fixed, SDK moved to runtime deps and shipped in VSIX, `mcp-server-status.ts` retry hardened, crash logs to `%TEMP%\cielovista-tools\mcp-diagnostics`, copilot-rules auto-enforce default changed to false, sanitizer added. 3 new unit test files. Only REG-002 still open.
- **MCP Endpoint Viewer v1 (2026-04-20)** — initial 4-tab viewer with list_projects, find_project, search_docs, get_catalog. FIX-002 logged. Superseded by v2 with 7 tabs and status filtering (current).
- **Daily Audit red items (2026-04-20)** — see Active pending-verification section above.
- **Symbol Index + Viewer tabs (2026-04-20)** — see Active pending-verification section above. FIX-003 logged.
- **JesusFamilyTree scroll/tooltip/pan fixes (2026-04-19)** — centered bar positioning, fixed tooltip position, drag fix, prev/next navigation 77/77, drag test 4/4. Commit `ba711f8`. Project now registered as product. **Note:** The JWST educational page ("Seeing the First Light") that was embedded in that parking lot entry belongs in JesusFamilyTree's own status doc, not here — move when that project is next touched.
- **createWebsite AI generation + trace system (2026-04-09)** — correct model name, `https.Agent` timeout fix, trace-sdk package, `/trace-viewer` endpoint, inline error banner, elapsed-seconds ticker. Server running. **Wrong project for this status doc** — belongs in createWebsite's own status.
- **NPM Scripts blank panel root cause (2026-04-03)** — listener attached after ready fired in Electron. Fixed by moving `addEventListener('message')` to top of script, 1s retry, Loading state, setTimeout(sendInit, 800).
- **WB-CORE Duplication Audit (2026-04-03)** — all 20+ HTML `onclick=` attributes removed across 8 files. Zero `alert()` calls.
- **View a Doc project dropdown + sticky filter (2026-04-03)** — `#proj-filter` select, localStorage persistence, clear button.
- **NPM Output "Copy to Chat" button (2026-04-03)** — 📤 per job, calls `sendToCopilotChat()`. Fixed broken surrogate-pair emoji that was killing the output panel handler.
- **Send to Chat button on failed commands (2026-04-03)** — implemented & compiled.
- **Launcher UX: command history + recent projects (2026-04-03)** — last 10 runs per project re-runnable via globalState, toolbar dropdown of last 5 workspaces.
- **Shared project-card contract (2026-04-02)** — Doc Catalog Configure dead paths removed, legacy NPM shell deleted, tooltip `Where` and source-label ownership moved into shared project-card builder/types. **Related open work folded into the 2026-04-22 tooltip TODO above.**
- **Delete dead monolith files** — `doc-catalog.ts` and `marketplace-compliance.ts` deleted.
- **Extract REGISTRY_PATH to shared** — `src/shared/registry.ts` canonical, 6 files updated.
- **Split doc-auditor.ts** — 8 modules. Monolith deleted.
- **View-a-Doc search highlight** — yellow #ffe066 on matches. 13/13 catalog, 39/39 install verify.
- **Catalog integrity — 700.001-004 entries added** — `cvs.features.configure`, `cvs.health.fixBugs`, `cvs.tools.errorLog`, `cvs.imageReader.open`. 13/13 pass.
- **Split cvs-command-launcher.ts** — 7 modules in folder. Stub deletable.
- **preserveFocus + revealInExplorer polish** — left panel no longer loses width on button click, folder path bar opens Explorer/OS appropriately.
- **markdown-it CDN-only (REG-001 fix)** — Node-side import removed; webview only.
- **Regression test suite** — 16 tests gate every build via `scripts/run-regression-tests.js`. `npm run rebuild` aborts on failure.
- **docs/REGRESSION-LOG.md** — permanent record of regressions and root causes.
- **GUI cleanup** — toolbar emoji removed, SVG icons on Run/Read, `action: 'read'` field on CmdEntry.
- **F1 help modal on every card** — What/Where/Group/Tags/Catalogue/Run. F1 keyboard binding. All cards `<h1>`, `tabindex=0`, `role=article`.
- **DiskCleanUp TS errors + start.js Step 0** — service stopped before build, no DLL lock detour.
- **doc-preview breadcrumb + folder path bar (Windows style)** — Terminal/Explorer/Editor/Open in VS Code buttons.
- **CieloVista Tools launcher navigation model** — top location bar with back/forward, card breadcrumbs clickable, Windows Explorer nav.
- **JS Error Audit v2** — persistent ERR/WRN IDs, 🤖 AI Fix per row, diff overlay, accept/reject, Fix All.
- **catalog.ts all 70 commands have scope field** — TypeScript enforces it.
- **Project-based Doc Catalog Dewey numbers** — 000=Global, 100=vscode-claude, 200=wb-core, 300=DiskCleanUp, etc.
- **Error log system** — `error-log.ts` mirrors wb-core `error-logger.js` interface; `error-log-viewer.ts` registers `cvs.tools.errorLog`; `output-channel.ts` routes through it. **Note:** viewer showing no results is open as TODO item #12 above.
- **wb-core README.md full rewrite** — architecture intro, three pillars, full docs table with links.
- **.vscodeignore created** — excludes mcp-server, src, tests, scripts, playwright-report. Later tuned for MCP SDK packaging.
- **install.js stderr suppressed on failed CLI candidates** — clean output.

---

## Key File Paths

| What | Path |
|---|---|
| Extension root | `C:\Users\jwpmi\Downloads\VSCode\projects\cielovista-tools` |
| Canonical registry loader | `src\shared\registry.ts` |
| MCP server | `mcp-server\src\` |
| MCP Viewer | `src\features\mcp-viewer\` |
| Registry promote | `src\features\registry-promote.ts` |
| Feature toggle | `src\features\feature-toggle.ts` |
| Command catalog | `src\features\cvs-command-launcher\catalog.ts` |
| doc-auditor (split) | `src\features\doc-auditor\` |
| doc-catalog (split) | `src\features\doc-catalog\` |
| Marketplace (split) | `src\features\marketplace-compliance\` |
| Fixes log | `data\fixes.json` |
| Build command | `npm run rebuild` |
| Project registry (global) | `C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json` |
