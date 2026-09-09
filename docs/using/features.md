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

- [Bg Health Runner](../../src/features/background-health-runner.README.md)
- [Claude Process Monitor](../../src/features/claude-process-monitor.README.md)
- [Code Auditor](../../src/features/code-auditor.README.md)
- [Code Highlight Audit](../../src/features/code-highlight-audit.README.md)
- [Codebase Auditor](../../src/features/codebase-auditor.README.md)
- [Command Registry Viewer](../../src/features/command-registry-viewer.README.md)
- [Command Validator](../../src/features/command-validator.README.md)
- [Config Editor](../../src/features/config-editor.README.md)
- [copilot-open-suggested-file.ts](../../src/features/copilot-open-suggested-file.README.md)
- [copilot-rules-enforcer.ts](../../src/features/copilot-rules-enforcer.README.md)
- [Corequisite Checker](../../src/features/corequisite-checker.README.md)
- [css-class-hover.ts](../../src/features/css-class-hover.README.md)
- [Disk Cleanup Dashboard](../../src/features/disk-cleanup-dashboard.README.md)
- [Doc Header Scan](../../src/features/doc-header-scan.README.md)
- [docs-broken-refs.ts](../../src/features/docs-broken-refs.README.md)
- [docs-manager.ts — Advanced Developer Guide](../../src/features/docs-manager.README.md)
- [Error Log Viewer](../../src/features/error-log-viewer.README.md)
- [Explorer Copy Path to Copilot Chat](../../src/features/explorer-copy-path-to-chat.README.md)
- [Feature Toggle](../../src/features/feature-toggle.README.md)
- [FileList — Sortable Alternative File Browser](../../src/features/file-list-viewer.README.md)
- [Frontmatter Viewer](../../src/features/frontmatter-viewer.README.md)
- [Home Page](../../src/features/home-page.README.md)
- [html-template-downloader.ts](../../src/features/html-template-downloader.README.md)
- [Image Reader Feature](../../src/features/image-reader.README.md)
- [Js Error Audit](../../src/features/js-error-audit.README.md)
- [Json Copy To Chat](../../src/features/json-copy-to-chat.README.md)
- [License Sync](../../src/features/license-sync.README.md)
- [Link Integrity Checker](../../src/features/link-integrity-checker.README.md)
- [Mcp Build](../../src/features/mcp-build.README.md)
- [Mcp Server Scaffolder](../../src/features/mcp-server-scaffolder.README.md)
- [Mcp Server Status](../../src/features/mcp-server-status.README.md)
- [Notify Server](../../src/features/notify-server.README.md)
- [Npm Scripts Tree](../../src/features/npm-scripts-tree.README.md)
- [Open Folder As Root](../../src/features/open-folder-as-root.README.md)
- [openai-chat.ts](../../src/features/openai-chat.README.md)
- [Playwright Check](../../src/features/playwright-check.README.md)
- [Playwright Runner](../../src/features/playwright-runner.README.md)
- [Project Home Opener](../../src/features/project-home-opener.README.md)
- [python-runner.ts](../../src/features/python-runner.README.md)
- [Readme Compliance](../../src/features/readme-compliance.README.md)
- [Readme Generator](../../src/features/readme-generator.README.md)
- [registry-promote](../../src/features/registry-promote.README.md)
- [Regression Log Viewer](../../src/features/regression-log-viewer.README.md)
- [Running Tasks](../../src/features/running-tasks.README.md)
- [Script Runner](../../src/features/script-runner.README.md)
- [Session Activity Dashboard](../../src/features/session-activity.README.md)
- [Tags Enrichment](../../src/features/tags-enrichment.README.md)
- [terminal-copy-output.ts](../../src/features/terminal-copy-output.README.md)
- [terminal-folder-tracker.ts](../../src/features/terminal-folder-tracker.README.md)
- [terminal-prompt-shortener.ts](../../src/features/terminal-prompt-shortener.README.md)
- [terminal-set-folder.ts](../../src/features/terminal-set-folder.README.md)
- [test-coverage-auditor](../../src/features/test-coverage-auditor.README.md)
- [Worktree Cleaner](../../src/features/worktree-cleaner.README.md)

<!-- docs-sync:end -->

## Special Integrations
- Issue Viewer: `showGithubIssues` from `src/shared/github-issues-view.ts`

---

For details on each feature, see the corresponding file or folder in `src/features/`.