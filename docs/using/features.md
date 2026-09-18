---
id: features
title: Feature catalogue
description: Every feature in the extension and the commands it registers.
---

# CieloVista Tools Features

This document lists all major features registered and activated in `src/extension.ts`.
Each feature is implemented in its own file or folder under `src/features/` and follows the `activate()`/`deactivate()` pattern.


## Feature List

<!-- docs-sync:begin -->

- [Bg Health Runner](../../src/features/background-health-runner.README.md) — Bg Health Runner — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Claude Process Monitor](../../src/features/claude-process-monitor.README.md) — Claude Process Monitor — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Code Auditor](../../src/features/code-auditor.README.md) — Code Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Code Highlight Audit](../../src/features/code-highlight-audit.README.md) — Code Highlight Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Codebase Auditor](../../src/features/codebase-auditor.README.md) — Codebase Auditor — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Command Registry Viewer](../../src/features/command-registry-viewer.README.md) — Command Registry Viewer — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Command Validator](../../src/features/command-validator.README.md) — Command Validator — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [copilot-open-suggested-file.ts](../../src/features/copilot-open-suggested-file.README.md) — When Copilot mentions a file path in its response (e.g. 'see src/utils.ts for the implementation'), this command extracts that path and opens the f…
- [copilot-rules-enforcer.ts](../../src/features/copilot-rules-enforcer.README.md) — Injects your custom Copilot instruction rules into the workspace (or user) settings on startup. Rules are read from copilot-rules.md in the workspa…
- [Corequisite Checker](../../src/features/corequisite-checker.README.md) — Corequisite Checker — 2 command(s). Auto-generated stub: fill in What it does and Manual test.
- [css-class-hover.ts](../../src/features/css-class-hover.README.md) — Hover over a CSS class name in HTML, JSX, or TSX and instantly see the CSS rule definition in a hover popup — without switching files. Resolves imp…
- [Cvs Command Launcher](../../src/features/cvs-command-launcher/README.md) — Cvs Command Launcher — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Daily Audit](../../src/features/daily-audit/README.md) — Daily Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Disk Cleanup Dashboard](../../src/features/disk-cleanup-dashboard.README.md) — Disk Cleanup Dashboard — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Doc Auditor](../../src/features/doc-auditor/README.md) — Doc Auditor — 9 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Doc Catalog](../../src/features/doc-catalog/README.md) — Doc Catalog — 4 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Doc Consolidator](../../src/features/doc-consolidator/README.md) — Doc Consolidator — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Doc Header](../../src/features/doc-header/README.md) — Gives documentation files the three-field header (id, title, description at the top) across all registered projects, keeping every body intact.
- [Doc Header Scan](../../src/features/doc-header-scan.README.md) — Checks every doc header in the registered projects against the three-field contract, and can rewrite the non-compliant ones.
- [Doc Intelligence](../../src/features/doc-intelligence/README.md) — Doc Intelligence — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [docs-broken-refs.ts](../../src/features/docs-broken-refs.README.md) — Scans markdown docs across all registered projects and reports broken image and markdown links. The report includes likely candidate files by filen…
- [docs-manager.ts — Advanced Developer Guide](../../src/features/docs-manager.README.md) — The docs-manager is the central orchestrator for all documentation operations across CieloVista projects. It provides a unified, discoverable inter…
- [Error Log Viewer](../../src/features/error-log-viewer.README.md) — Error Log Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Explorer Copy Path to Copilot Chat](../../src/features/explorer-copy-path-to-chat.README.md) — Add an Explorer context-menu command for files that sends the selected file's absolute path into the GitHub Copilot Chat input.
- [Feature Toggle](../../src/features/feature-toggle.README.md) — Feature Toggle — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [FileList — Sortable Alternative File Browser](../../src/features/file-list-viewer.README.md) — Issue [#68](https://github.com/CieloVistaSoftware/CIELOVISTA-TOOLS/issues/68). A details-view file browser surfaced as a Quick Launch button on the…
- [Frontmatter Viewer](../../src/features/frontmatter-viewer.README.md) — Interactive table of every doc header in the project, judged by the three-field contract, with a Fix workflow per file.
- [GitHub Issues](../../src/features/github-issues/README.md) — GitHub Issues — 2 command(s). The Issue Viewer panel, plus command palette entry points for it and for filing a new issue.
- [Home Page](../../src/features/home-page.README.md) — Home Page — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [html-template-downloader.ts](../../src/features/html-template-downloader.README.md) — Downloads HTML starter templates from the CieloVistaSoftware GitHub repository into your workspace. Also provides a utility to open any path curren…
- [Image Reader Feature](../../src/features/image-reader.README.md) — This feature provides an image reader webview panel using HTML, CSS, and JS assets migrated from CodePilot-Wake-Monitor.
- [Js Error Audit](../../src/features/js-error-audit.README.md) — Js Error Audit — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Json Copy To Chat](../../src/features/json-copy-to-chat.README.md) — Json Copy To Chat — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [License Sync](../../src/features/license-sync.README.md) — License Sync — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Link Integrity Checker](../../src/features/link-integrity-checker.README.md) — Link Integrity Checker — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Marketplace Compliance](../../src/features/marketplace-compliance/README.md) — Marketplace Compliance — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Mcp Build](../../src/features/mcp-build.README.md) — Mcp Build — 2 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Mcp Server Scaffolder](../../src/features/mcp-server-scaffolder.README.md) — Mcp Server Scaffolder — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Mcp Server Status](../../src/features/mcp-server-status.README.md) — Mcp Server Status — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Mcp Viewer](../../src/features/mcp-viewer/README.md) — Mcp Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Notify Server](../../src/features/notify-server.README.md) — Notify Server — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Npm Scripts Tree](../../src/features/npm-scripts-tree.README.md) — Npm Scripts Tree — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Open Folder As Root](../../src/features/open-folder-as-root.README.md) — Open Folder As Root — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [openai-chat.ts](../../src/features/openai-chat.README.md) — Adds OpenAI-powered commands to VS Code: explain selected code, suggest refactoring, generate a JSDoc docstring, and open a persistent chat panel. …
- [Playwright Runner](../../src/features/playwright-runner.README.md) — Playwright Runner — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Project Home Opener](../../src/features/project-home-opener.README.md) — Adds a single command that opens your configured CieloVista home project root in VS Code from any workspace. Useful when you need to jump back to t…
- [python-runner.ts](../../src/features/python-runner.README.md) — Right-click any .py file in the VS Code Explorer and run it in the terminal with a single click. Uses the Python interpreter configured in VS Code …
- [Readme Compliance](../../src/features/readme-compliance/README.md) — Readme Compliance — 0 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Readme Generator](../../src/features/readme-generator.README.md) — Readme Generator — 3 command(s). Auto-generated stub: fill in What it does and Manual test.
- [registry-promote](../../src/features/registry-promote.README.md) — Register a folder as a CieloVista product. One-click alternative to hand-editing project-registry.json.
- [Regression Log Viewer](../../src/features/regression-log-viewer.README.md) — Regression Log Viewer — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Running Tasks](../../src/features/running-tasks.README.md) — Running Tasks — 1 command(s). Auto-generated stub: fill in What it does and Manual test.
- [Session Activity Dashboard](../../src/features/session-activity.README.md) — Session Activity Dashboard — live rollup of Current Focus, Current Batch, deploy-branch pushes, CI, and uncapped open issues for the current workspace's repo.
- [terminal-copy-output.ts](../../src/features/terminal-copy-output.README.md) — Captures the output of the most recently executed terminal command. Uses VS Code's shell integration (selectToPreviousCommand) to select only the l…
- [terminal-folder-tracker.ts](../../src/features/terminal-folder-tracker.README.md) — Monitors every terminal's sendText calls for cd commands and saves the last known directory to a file in AppData. A single command lets you jump ba…
- [terminal-prompt-shortener.ts](../../src/features/terminal-prompt-shortener.README.md) — Toggles the PowerShell terminal prompt between its full path form (PS C:\very\long\nested\path>) and a minimal single-character form (>). Useful wh…
- [terminal-set-folder.ts](../../src/features/terminal-set-folder.README.md) — Right-click any folder in the VS Code Explorer and immediately cd the active terminal to that folder. No typing the path, no drag and drop.
- [test-coverage-auditor.ts — Test Coverage Audit Dashboard](../../src/features/test-coverage-auditor.README.md) — The test coverage auditor integrates the tiered testing strategy directly into CieloVista Tools as an interactive webview panel. It provides: - Aud…
- [Worktree Cleaner](../../src/features/worktree-cleaner.README.md) — Worktree Cleaner — 1 command(s). Auto-generated stub: fill in What it does and Manual test.

<!-- docs-sync:end -->

## Special Integrations
- Issue Viewer: `showGithubIssues` from the `src/features/github-issues/` feature

---

For details on each feature, see the corresponding file or folder in `src/features/`.