---
id: release-guide
title: Cutting a release
description: Version bump, changelog, packaging and install verification.
---

# Release Guide — cielovista-tools

Use this guide when you want to know what was fixed in a release and what to do to see the change in VS Code.

## How to see a release

1. Run `npm run rebuild` from the repository root.
2. Reload the VS Code Insiders window after install so the newly packaged VSIX is active.
3. Open the feature or workflow that changed and verify the behavior there.

## Release history

| Release | What was fixed or added | How to see the change |
|---|---|---|
| Unreleased (2026-04-20) | Daily Audit now recognizes `.test.js` / `.test.mjs` files; workspace-level README and CHANGELOG stubs were added; Home page Send Path tooltip and click handling were hardened. | Run `npm run rebuild`, reload VS Code Insiders, then open Daily Audit and Home page features to confirm the updated behavior. |
| 1.0.0 (2026-03-19) | Initial release. | Install the VSIX, reload VS Code Insiders, then open the home page and the command palette to confirm the base extension is active. |

## Where to look next

- `CHANGELOG.md` lists the release notes themselves.
- `docs/_today/CURRENT-STATUS.md` tracks the current session's release-blocking questions and the last validation step.
- `README.md` explains the rebuild-and-reload flow for seeing changes in the editor.

