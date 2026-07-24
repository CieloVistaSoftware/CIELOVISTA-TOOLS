# Changelog — cielovista-tools

All notable changes to this project are documented here.

---

## [1.0.3] — 2026-07-23

### Added

**Session Activity Dashboard**
- New feature (`cvs.tools.sessionActivity`) — a webview rollup of current focus, active work, pushes to the deploy branch, CI status, and uncapped open issues for the current workspace's repo (#650)

**Daily Audit / Marketplace Compliance**
- Marketplace Compliance scan/review (`cvs.marketplace.scan`) now surfaces stale CHANGELOG.md files (30+ days untouched), not just missing ones — closes the gap where the daily-audit "Changelog Status" check reported a project yellow/red but the Auto-Fix/Review action showed nothing to act on for that project (#649, #648)
- Shared `src/shared/changelog-freshness.ts` — single source of truth for the changelog staleness threshold, used by both the daily-audit changelog check and the marketplace-compliance checker so the dashboard and the fix flow never disagree

**Marketplace page**
- "What's inside" now lists every feature group from the command catalog (121 commands, 13 groups) instead of 4 hardcoded cards, auto-regenerated on every `npm run rebuild` via a new `docs:marketplace` script (#644)
- Added a "What's new" section highlighting each release's changes
- `scripts/sync-doc-versions.js` keeps the VSIX filename/version label in the demo pages in sync with `package.json` automatically

### Fixed

- bg-health-runner reported false regression failures (8 REG checks, ×56 occurrences) from a transient race scanning an unsettled git worktree; now retries once before filing a bug (#641, #652)
- 2 untagged fenced code blocks in project docs tagged correctly (#645, #637)
- `bg-health.json` save failures hardened: atomic write (temp file + rename), exponential backoff after repeated failures, richer error logging (#651)
- MCP server silently discarded its own error message on a Windows-pipe exit race, surfacing only a bare "exited with code 1"; now flushes stderr before exit (#653)
- MCP server startup diagnostics added and native-dependency crash cause (#615, intermittent `STATUS_DLL_INIT_FAILED`) ruled out at the dependency-graph level — partial mitigation, issue remains open pending a reproducible recurrence
- Preview/Start button now cache-busts its dev-server URL on every click so edits show up without a manual hard-reload (#642)
- BYOK main model no longer errors on Copilot's internal utility-only models (#643)
- `home-page` Start button now actually executes its command; added a real button-execution regression test (#654, #655)
- Background health runner CI noise: SnapIt/DiskCleanUp path checks are now skipped under CI instead of failing (#656)
- Landing page mobile font sizes increased 75% for readability (#646, #647)
- `bg-health` output spam eliminated for real; CLAUDE.md and untagged-file checks are green again (#633, #634, #635, #636)
- Daily audit: auto-file-as-issue path, project-path fixes, bg-health integration, doc-catalog cleanup landed (#548, #555, #556, #557)
- Issue Viewer: state pill, corequisite-label fix, duplicate-images crash fix (#605, #601, #591, #602, #592)

---

## [1.0.2] — 2026-05

### Added

**Test Infrastructure**
- Test Results panel (`cvs.health.fixBugs`) now aggregates all sources: per-file results from `test-watch.json`, active health bugs from `bg-health.json`, and a Regression Log button — one panel, all results
- Background health runner runs full regression suite once per hour; failures surface as a bug card in the Test Results panel
- Background health runner: configurable check interval (`cvs.bgHealthRunner.intervalSeconds`), delta-only output, project-label check
- Background health runner: surfaces failed extension-launched terminal commands as bug cards (#487)
- 4 failing Playwright UI tests fixed: `debug-cards-screenshot`, `home-page`, `no-results-panel`, `npm-scripts-tooltips` — converted to source-level checks or skipped with instructions

**Issue Viewer**
- Auto-refresh every 60 seconds with countdown timer (`↺ 60s`) in toolbar (#531)
- Start Work button creates a branch and sets priority on GitHub
- Project column and project filter dropdown
- Status column excludes `project:*` labels (#525)
- Viewer file links open beside the panel with `preserveFocus` (#517)
- Dual-fetcher: `gh` CLI first, REST API fallback; paginated up to 500 issues (#224)

**Launcher & Commands**
- View Report button on launcher cards that produce output panels
- Launcher STATUS pill persists last run outcome across panel refreshes
- Launcher filters catalog against live registered commands at render time (#65)
- Launcher panels open beside the launcher panel (no focus steal)
- Duplicate command registrations removed: `project-launcher.ts` superseded by `cvs-command-launcher` (#522)

**Features**
- Link Integrity Checker — `cvs.links.check` scans all `.md` docs for broken links, produces clickable report (#484)
- Command Validator — `cvs.tools.commandValidator` validates and syncs command IDs across READMEs (#483)
- Component Registry Viewer — `cvs.registry.showComponents` shows all registered components (#456)
- Command Registry — `cvs.registry.showCommands` unified scanner, JSON registry, viewer (#455)
- Tags Enrichment — shared `CATEGORIES` constant; frontmatter description auto-generate (#480–#482)
- FileList: live search/filter input (#494)
- FileList: Reveal in FileList Explorer from VS Code Explorer context menu (#486)
- Doc Catalog: Finished Work queue tab (#468)
- Doc Catalog: frontmatter move-to-bottom command + dual-position YAML parser (#467)
- Marketplace Compliance: issue file references are clickable links to open in editor
- GitHub Issue Filer: clipboard fallback when GitHub API auth fails
- Home page: live CPU and memory gauge in header (#47)
- MCP Viewer: sortable column headers, click to toggle asc/desc
- Notify Server: HTTP bridge from MCP server → VS Code output channel
- NPM Scripts: Run button shows in-depth hover tooltip — script description, command, output destination, error indication (#485)

### Fixed

- NPM Scripts Run button reuses existing terminal instead of opening a new tab every press (#524)
- Code Auditor Abstract button: `withProgress` notification wraps the filing call; all errors surfaced (#530)
- YAML frontmatter moved to bottom of all 83 `.md` docs (previously at top, breaking doc-preview) (#527)
- `doc-contract.test.ts` `parseFrontmatter` updated to read from end of file after migration
- Code Highlight Audit: closing fence false-positive fixed; Fix button always visible (#495, #496)
- Code Highlight Audit: open handler registers once per activation, not per rescan (#39)
- Run buttons turn green immediately on click, red on non-zero exit (#511, #512)
- OpenAI commands show a warning message when no text is selected (#501)
- Claude Process Monitor panel opens beside the launcher (#502)
- FileList shows dotfile name as type instead of `NO-EXT` (#504)
- Doc Consolidator: panel opens in correct column, correct file exclusions, links open in new window (#507–#509)
- Worktree Cleaner uses workspace root, adds timeout and progress notification (#492)
- Playwright Runner uses relative paths and adds dialog title (#490)
- Feature Toggle: `acquireVsCodeApi()` called once (not per interaction) (#489)
- `scripts/` folder bundled in VSIX — was previously excluded and causing missing-script failures (#471)
- Doc Intelligence: eliminated subject-mismatch and AI-context-file duplicate false positives
- bg-health-runner: data directory now resolves to workspace `data/` so `bg-health.json` and `test-watch.json` share one location

---

## [1.0.1] — 2026-04

### Added

- FileList: sortable table-style file browser with Name / Date / Type / Size columns (#69)
- Regression Log Viewer — `cvs.tools.regressionLog` shows regression history with severity and fix tracking (#91)
- GitHub Issues viewer: dual-fetcher, copy-all, paginated REST fallback, auto-refresh on reopen (#224)
- Error Log Viewer: persist filed-issue state across sessions (#23)
- Background health runner: expanded unit test coverage, duplicate-bug dedup, `detectedAt` timestamps
- Doc preview: in-page anchor links with slugified heading IDs
- Doc preview: Explorer button opens the docs folder in OS file explorer (#6)
- Project card script tooltips include Output row; faster dropdown delay
- Home page: Send Path chat uses text-only message format
- Home TODO routes to GitHub Issues viewer
- Launcher: filters catalog against live registered commands — dead buttons no longer shown (#65)
- `validate:package-json` gate added to rebuild pipeline to catch corruption (#67, #88)
- NPM Output webview: always shows header, never empty — `(no output)` placeholder on done (#66)
- Daily audit: recognizes `.test.js` / `.test.mjs` alongside `.spec.ts` for test coverage check

### Fixed

- View-a-Doc folder icon opens the project folder in the current VS Code window (#76)
- Code Highlight Audit: handles longer fences (` ```` ` and more), adds Fix All button (#38)
- MCP lifecycle events (SIGTERM, exit 0) no longer logged as errors; auto-filer deduplicates (#90)
- Readme-compliance checker split into per-file checks; FileList no longer double-registers (#70, #84)
- bg-health-runner survives disposed-webview on cleanup; bug-to-issue filing hardened (#61, #86, #87)
- Command-not-found errors no longer auto-filed as GitHub issues (#225)
- Error Log Viewer reads from fixed path, not workspace-dependent path (#77)
- Removed all `// FILE REMOVED BY REQUEST` comments from source (#80)
- Suppressed VS Code `Canceled` exception in bg-health-runner checks (#58)

---

## [1.0.0] — 2026-03-19

### Added
- Initial release: all CieloVista developer tools consolidated into one extension
- VS Code Insiders extension with single install
- Background health runner, Fix Bugs panel, daily audit
- Doc preview, Doc catalog, Doc auditor, Doc intelligence
- GitHub Issues viewer, Issue filing
- Launcher panel with grouped command catalog
- MCP server integration
- Home page with quick-launch grid
- NPM Scripts tree panel

---

docid: 150.6
id: changelog-cielovista-tools
title: Changelog — cielovista-tools
project: cielovista-tools
description: All notable changes to this project are documented here.
status: active
tags: [all, changelog, changes, cielovista, cielovistatools, deployment, documented, here, notable, project, release, tools, unreleased]
category: 150.6 — Release & Deployment
created: 2026-04-22
updated: 2026-07-23
version: 1.0.3
author: CieloVista Software
relativepath: CHANGELOG.md
---
