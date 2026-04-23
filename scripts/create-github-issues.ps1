# create-github-issues.ps1
#
# One-shot bulk issue creation for the cielovista-tools project board.
#
# WHAT THIS DOES
# --------------
# 1. Creates ~25 GitHub issues in CieloVistaSoftware/CIELOVISTA-TOOLS
# 2. Labels each issue with type, severity, and scope as appropriate
# 3. Adds each issue to the cielovista-tools Project board (project number 4)
#
# WHAT THIS DOES NOT DO
# ---------------------
# - Does not duplicate-check. If you run it twice you get 50 issues. One-shot only.
# - Does not touch wb-starter or CieloVistaStandards. Those get their own scripts.
# - Does not set milestones, assignees, or project field values beyond the defaults.
#
# USAGE
# -----
# Dry run (see what would be created, no API calls):
#   .\create-github-issues.ps1 -WhatIf
#
# Real run:
#   .\create-github-issues.ps1
#
# If you cancel mid-run (Ctrl+C), issues already created stay. The script
# does not resume. Delete partial issues manually on GitHub if needed.
#
# PREREQUISITES
# -------------
# - gh CLI authenticated (gh auth status shows github.com with project + repo scopes)
# - git working directory does not matter; the script targets CIELOVISTA-TOOLS by name
#
# AUTHORSHIP
# ----------
# Generated 2026-04-22 during GitHub Projects setup session. Issue bodies drawn
# from docs/_today/CURRENT-STATUS.md open items, architectural questions, and
# the Doc Contract / Tooltips / File-as-Issue design work from the same session.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $Repo          = "CieloVistaSoftware/CIELOVISTA-TOOLS",
    [string] $ProjectOwner  = "CieloVistaSoftware",
    [int]    $ProjectNumber = 4
)

$ErrorActionPreference = "Stop"

# Helper to create one issue and add it to the project board.
function New-CvtIssue {
    param(
        [string]   $Title,
        [string[]] $Labels,
        [string]   $Body
    )

    # Build the gh issue create args. Use a temp file for the body so multi-line
    # markdown with quotes and backticks survives PowerShell intact.
    $tmpFile = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -Path $tmpFile -Value $Body -Encoding UTF8 -NoNewline

        $labelArgs = @()
        foreach ($lbl in $Labels) { $labelArgs += @("--label", $lbl) }

        if ($PSCmdlet.ShouldProcess($Title, "Create issue")) {
            Write-Host ""
            Write-Host "Creating: $Title" -ForegroundColor Cyan

            $url = & gh issue create `
                --repo $Repo `
                --title $Title `
                --body-file $tmpFile `
                @labelArgs 2>&1 | Select-Object -Last 1

            if ($LASTEXITCODE -ne 0) {
                Write-Warning "  gh issue create FAILED for: $Title"
                return
            }

            Write-Host "  Created: $url" -ForegroundColor Green

            # Add to project board
            & gh project item-add $ProjectNumber --owner $ProjectOwner --url $url | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "  gh project item-add FAILED for: $url"
            } else {
                Write-Host "  Added to board (project $ProjectNumber)" -ForegroundColor Green
            }
        }
    }
    finally {
        Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "=============================================================" -ForegroundColor Yellow
Write-Host " Bulk issue creation for $Repo"                                 -ForegroundColor Yellow
Write-Host " Target project: $ProjectOwner/projects/$ProjectNumber"         -ForegroundColor Yellow
if ($WhatIfPreference) {
    Write-Host " DRY RUN — no issues will actually be created"              -ForegroundColor Yellow
}
Write-Host "=============================================================" -ForegroundColor Yellow

# ============================================================================
# SECTION 1 — Open numbered TODOs from CURRENT-STATUS.md (12 items)
# ============================================================================

New-CvtIssue `
    -Title "Doc Catalog cards broken — Open Doc Catalog and Rebuild Doc Catalog cards not behaving correctly" `
    -Labels @("type:bug", "severity:major", "scope:doc-system") `
    -Body @"
## Symptom

The ``Open Doc Catalog`` and ``Rebuild Doc Catalog`` cards on the CVS command launcher do not behave correctly. Exact failure mode TBD — needs reproduction and investigation.

## Where to look

- ``src/features/cvs-command-launcher/`` — the card handlers for these two commands
- ``src/features/doc-catalog/commands.ts``
- ``src/features/doc-catalog/projects.ts``

## Repro

1. Open CieloVista Tools launcher
2. Click ``Open Doc Catalog`` card — observe behavior vs expected
3. Click ``Rebuild Doc Catalog`` card — observe behavior vs expected

## Acceptance

- Both cards perform their advertised actions
- Any errors surfaced as a red banner, not silently swallowed
- Manual test scripted as a regression check in ``scripts/run-regression-tests.js``
"@

New-CvtIssue `
    -Title "Finish readme-compliance split — folder has 3 of 9 modules" `
    -Labels @("type:architecture", "severity:minor") `
    -Body @"
## What

``src/features/readme-compliance/`` was split from a monolith into a folder of modules. The split is incomplete — only 3 of 9 modules have been extracted. The remainder still live in the original file.

## Why it matters

One-time-one-place rule: duplicate implementations lead to drift. Finishing the split consolidates ownership and makes the feature testable in units.

## Acceptance

- All 9 modules extracted into separate files in ``src/features/readme-compliance/``
- Original monolith deleted
- Index file exports the same public API as before
- ``npm run rebuild`` stays green through the transition
"@

New-CvtIssue `
    -Title "Split doc-header.ts and doc-consolidator.ts into module folders" `
    -Labels @("type:architecture", "severity:minor") `
    -Body @"
## What

Two monolith files remain that should be split into module folders following the established pattern:

- ``src/features/doc-header.ts``
- ``src/features/doc-consolidator.ts``

## Why

Consistency with other features that have already been split (``doc-auditor/``, ``doc-catalog/``, ``marketplace-compliance/``, ``cvs-command-launcher/``).

## Acceptance

- Each file becomes a folder with ``index.ts`` + submodules
- Public API unchanged
- Monolith files deleted
- Regression suite stays green
"@

New-CvtIssue `
    -Title "View-a-Doc folder icon → open project" `
    -Labels @("type:feature", "severity:minor", "scope:doc-system") `
    -Body @"
## Motivation

The View-a-Doc panel has a folder icon in each row that currently does nothing useful. Clicking it should open the project folder that owns the doc in VS Code, switching workspaces if needed.

## Proposal

Replace the inert folder icon with a clickable link that calls ``vscode.openFolder`` with the project's root path from the registry.

## Acceptance

- Folder icon is clearly clickable (hover state, cursor change)
- Click opens the project folder in VS Code
- Works from both the in-extension panel and the browser viewer
- Current workspace is preserved if already open on the target project

## Not in scope

- Opening the specific doc file within the project (that's the doc-preview's job)
- Switching between VS Code and Insiders
"@

New-CvtIssue `
    -Title "Doc-preview toolbar fixes — rename Terminal/Editor, fix Explorer button" `
    -Labels @("type:bug", "severity:minor", "scope:doc-system") `
    -Body @"
## What

The doc-preview toolbar has three button issues:

1. ``Terminal`` button label is confusing — should say ``Change Working Directory``
2. ``Editor`` button label is confusing — should say ``Edit``
3. ``Explorer`` button currently does nothing — should open the doc's folder in OS file explorer

## Files

- ``src/shared/doc-preview.ts`` (toolbar rendering and handlers)

## Acceptance

- All three buttons have clear, accurate labels
- Explorer button calls ``revealFileInOS`` with the doc's folder
- Manual click-through verified after ``npm run rebuild``
"@

New-CvtIssue `
    -Title "View-a-Doc clipboard ops — Ctrl+A/Ctrl+C/Ctrl+click selection model" `
    -Labels @("type:feature", "severity:minor", "scope:doc-system") `
    -Body @"
## Motivation

View-a-Doc currently has no keyboard selection model. Real file-explorer mental models (Ctrl+A, Ctrl+C, Ctrl+click) don't work. Users expect them to.

## Proposal

Implement a file-system selection model in the View-a-Doc table:

- ``Ctrl+A`` selects all visible doc rows
- ``Ctrl+C`` copies selected file paths to the clipboard (newline-separated)
- ``Ctrl+click`` adds a row to the selection
- ``Click`` (no modifier) deselects others and selects only the clicked row
- ``Shift+click`` selects a range

## Acceptance

- All five interactions work per the spec above
- Selected rows have a visible highlight
- Clipboard text format is ``absolute\path\to\file1.md\nabsolute\path\to\file2.md``
- Works in the VS Code webview panel and in the browser viewer

## Not in scope

- Keyboard-only navigation (arrow keys) — separate issue if needed
- Drag-and-drop selection box
"@

New-CvtIssue `
    -Title "Doc-preview breadcrumb overflow — show only current doc name" `
    -Labels @("type:bug", "severity:minor", "scope:doc-system") `
    -Body @"
## Symptom

When navigating deep into the doc tree, the breadcrumb shows too many links and overflows the header area.

## Expected

Show only the current document name as a single non-clickable label. No full history trail.

## Files

- ``src/shared/doc-preview.ts`` (breadcrumb rendering)

## Acceptance

- Breadcrumb shows only the current doc filename
- No overflow at any viewport width
- Back navigation still works via browser back button or a dedicated back button
"@

New-CvtIssue `
    -Title "Remove duplicate Open Home entries in command palette" `
    -Labels @("type:bug", "severity:minor") `
    -Body @"
## Symptom

``Open Home Page`` and ``Open Home`` both appear in the VS Code command palette. Redundant and confusing.

## Investigation

Likely both ``cvs.tools.home`` and ``cvs.projects.openHome`` (or similar) are registered in ``package.json`` contributes.menus.

## Acceptance

- Only one ``Open Home`` entry appears in the palette
- Keybindings and shortcuts still resolve to the kept command
- Any catalog.ts entries referring to the removed command are cleaned up
"@

New-CvtIssue `
    -Title "NPM Scripts button — verify blank-panel fix from 2026-04-03 is still working" `
    -Labels @("type:bug", "severity:minor") `
    -Body @"
## Context

A 2026-04-03 note in CURRENT-STATUS.md claims the NPM Scripts blank-panel root cause was fixed (listener attached after ready fired in Electron — fixed by moving ``addEventListener('message')`` to top of script, adding 1-second retry, Loading state, and ``setTimeout(sendInit, 800)``).

But a later TODO list item #15 says ``NPM Scripts button missing`` — contradictory. Needs verification.

## Task

1. Click the NPM Scripts button from the Home page
2. Confirm the panel opens and populates correctly
3. If it works, close this issue
4. If it doesn't, file a new bug with exact symptoms and close this verification issue

## Acceptance

- Definitive answer: works or doesn't
- If works, verification added to ``scripts/run-regression-tests.js``
"@

New-CvtIssue `
    -Title "Doc Catalog dropdowns — linked project/section selectors" `
    -Labels @("type:feature", "severity:minor", "scope:doc-system") `
    -Body @"
## Motivation

Doc Catalog filters are basic. Two linked dropdowns would make navigation through 19 projects and hundreds of docs much faster.

## Proposal

Replace current filters with two linked dropdowns:

1. **Project selector** — lists all 19 registered projects
2. **Section/category selector** — updates based on selected project

Selecting a project filters to that project's docs. Selecting a section further filters to that section within the project.

## Partial work already landed

A sticky project filter via ``localStorage`` was added 2026-04-03. Confirm what's already there and scope the delta.

## Files

- ``src/features/doc-catalog/catalog.html``
- ``src/features/doc-catalog/commands.ts``

## Related

When the Doc Contract epic lands, the section taxonomy becomes the standardized X.1/X.2/X.3 subject vocabulary. Consider whether to land this feature before or after that.
"@

New-CvtIssue `
    -Title "Doc-preview markdown tables render as plain text" `
    -Labels @("type:bug", "severity:major", "scope:doc-system") `
    -Body @"
## Symptom

In the doc-preview, markdown tables render as plain inline paragraphs instead of proper HTML tables. Columns collapse into a single run of text.

## Likely cause

markdown-it tables plugin not enabled in the CDN-loaded markdown-it configuration.

## Files

- ``src/shared/doc-preview.ts`` (markdown-it setup)

## Acceptance

- Pipe-syntax tables render as ``<table>`` with ``<thead>`` and ``<tbody>``
- Column alignment (``:---``, ``:---:``, ``---:``) honored
- Works in both the VS Code webview and the browser viewer
- Regression test checking a known table doc
"@

New-CvtIssue `
    -Title "Error Log Viewer shows no results" `
    -Labels @("type:bug", "severity:major", "scope:error-log") `
    -Body @"
## Symptom

``cvs.tools.errorLog`` (Dewey 700.003) opens the panel but displays nothing even though errors are being written to the log file.

## Investigation needed

- ``src/features/error-log-viewer.ts`` — is it reading from the right path?
- ``src/features/error-log.ts`` — where exactly is it writing?
- Is there a path mismatch between writer and reader?
- Is the log file being created at all?

## Acceptance

- Errors written via ``logError()`` are visible in the viewer within 1s of being written
- Viewer handles empty-log case gracefully (not a blank panel — shows "No errors logged")
- Viewer refreshes automatically or has a clear manual refresh button

## Related

This is the feature the GitHub-issue-automation work (separate issue) depends on — if the viewer can't show errors, there's nothing to turn into issues.
"@

# ============================================================================
# SECTION 2 — Architectural questions (6 items)
# ============================================================================

New-CvtIssue `
    -Title "REG-002 logError interface sweep — 91 call sites across 3 divergent signatures" `
    -Labels @("type:regression", "severity:critical", "blocked:reg-002") `
    -Body @"
## REG-002 identifier

``REG-002`` — tracked in ``scripts/run-regression-tests.js`` and ``data/fixes.json``.

## Failing test

``node scripts/test-logerror-interface.js`` — emits exact call-site list.

## Current state

Three divergent ``logError`` implementations exist with incompatible signatures:

- ``src/shared/error-log-utils.ts`` line 91 — ``(message, stacktrace, context)``
- ``src/shared/output-channel.ts`` line 53 — ``(message, stacktrace, context, showPanel?)``
- ``src/shared/error-log.ts`` line 143 — ``(prefix, error, options?)`` — old wb-core style

~91 call sites across ``src/features/`` don't match any one of them consistently.

## Required signature (canonical)

``logError(message: string, stacktrace: string, context: string): void`` — all three args required.

## Impact

Blocks ``npm run rebuild`` from running clean. Has been blocking since early April 2026.

## Acceptance

- All 91 call sites converted to canonical signature
- Two non-canonical implementations either adapted to canonical or deleted
- ``node scripts/test-logerror-interface.js`` exits 0
- ``npm run rebuild`` runs clean without REG-002 failures
- This issue's fix commit references ``Fixes #NN``

## Scope

Dedicated session. Not a fit-in-between-other-work task. Needs ~3-4 hours.
"@

New-CvtIssue `
    -Title "Consolidate two private saveRegistry copies into shared/registry.ts" `
    -Labels @("type:architecture", "severity:minor") `
    -Body @"
## What

Two private ``saveRegistry`` copies exist:

- ``src/features/docs-manager.ts`` line 45
- ``src/features/npm-command-launcher.ts`` line 44

The canonical version was moved into ``src/shared/registry.ts`` during the 2026-04-20 registry-status session.

## Task

Switch both call sites to import ``saveRegistry`` from ``shared/registry.ts``. Delete the private copies. Verify no regressions.

## Acceptance

- Both call sites import from ``../shared/registry``
- Private copies deleted
- ``npm run rebuild`` stays green
- Grep across codebase confirms no other copies
"@

New-CvtIssue `
    -Title "Add cvs.registry.demote and cvs.registry.archive commands" `
    -Labels @("type:feature", "severity:minor") `
    -Body @"
## Motivation

``cvs.registry.promote`` exists (promotes folder to ``status: product``). The reverse operations don't.

When do you need them?

- **Demote**: product was registered prematurely, belongs in workbench
- **Archive**: product retired, keep registry entry for history but exclude from active queries

## Proposal

- ``cvs.registry.demote`` — right-click project, set ``status: workbench``
- ``cvs.registry.archive`` — right-click project, set ``status: archived``

Both are idempotent. No file scaffolding. No deletion.

## Priority

Low — add when there is a real need. This issue is a placeholder to capture the decision context.
"@

New-CvtIssue `
    -Title "Symbol index status filter — exclude workbench/generated when they add noise" `
    -Labels @("type:feature", "severity:minor", "scope:mcp-viewer") `
    -Body @"
## Motivation

The MCP ``list_symbols`` tool scans every registered project regardless of ``status``. If ``workbench`` or ``generated`` projects end up on the registry, their symbols will pollute the index.

Currently not a problem (all 19 projects are ``status: product``). Becomes a problem the first time you register something not yet cooked.

## Proposal

``list_symbols`` and ``find_symbol`` gain an optional ``status`` filter parameter, same pattern as ``list_projects`` / ``find_project``. Default: include only ``product`` entries.

## Acceptance

- New ``status`` param on both tools
- Viewer gains a status dropdown on the list_symbols tab
- When filter is omitted, default behavior is unchanged (avoids breaking existing callers)
- Test coverage in ``tests/``
"@

New-CvtIssue `
    -Title "Architecture check panel polish — projects list in header, singleton rerun" `
    -Labels @("type:feature", "severity:minor") `
    -Body @"
## Motivation

Pending since 2026-04-03.

- ``daily-audit`` result header's first line does not include the project list
- Run Audit rerun behavior needs verification — should reuse the same result panel instance per singleton rule

## Acceptance

- First line of audit result header lists the projects that were audited
- Running Audit multiple times reuses the same panel (no stacking)
- Regression test for the singleton behavior
"@

New-CvtIssue `
    -Title "Launcher UX backlog — auto-filter by workspace type, pin favorite commands" `
    -Labels @("type:feature", "severity:minor") `
    -Body @"
## Motivation

Two smaller UX improvements for the CieloVista Tools launcher:

1. **Auto-filter commands by workspace type** — when in a vscode-extension workspace, hide .NET-specific commands by default. In a dotnet workspace, hide VSCode-extension-specific ones.

2. **Pin favorite commands per workspace** — user can pin frequently-used commands to the top. Pinned state persists in globalState.

## Acceptance (auto-filter)

- Detected from workspace content (package.json, .sln, .csproj)
- User can override with a "Show all" toggle
- No commands hidden in an unknown workspace type

## Acceptance (pin favorites)

- Pin/unpin action on every command card
- Pinned commands sort to top within their group
- Persisted per workspace
"@

New-CvtIssue `
    -Title "Convert remaining quick-pick flows to webviews — doc-auditor walkthrough, consolidator, header fixOne" `
    -Labels @("type:architecture", "severity:minor") `
    -Body @"
## What

Three multi-step wizards still use quick-picks past step 1. Each needs a dedicated webview replacement:

- ``doc-auditor`` walkthrough
- ``doc-consolidator``
- ``doc-header`` fixOne flow

## Why

Quick-picks are single-step interactions. Multi-step wizards using them end up with state coupling that's hard to test and awkward for users.

## Scope

Larger session of work — each wizard is its own webview with state management. Not a fit-in-between task.
"@

# ============================================================================
# SECTION 3 — Epics (3 items)
# ============================================================================

New-CvtIssue `
    -Title "EPIC: Doc Contract + Subject-Based Dewey + Stable Identity" `
    -Labels @("type:architecture", "severity:major", "scope:doc-system") `
    -Body @"
## Core insight

CVT is a *collector* that aggregates docs across 19 registered projects. Every ``.md`` doc must conform to a CieloVista standard. The current ``get_catalog`` MCP output shows filenames and a running row counter — no Dewey, no subject, no stable identifiers. Folders can be renamed, docs can move — the system must not depend on filesystem location for classification or linking.

## Hard architectural principle

A doc's identity and classification cannot depend on its filesystem location. Dewey is **subject-based** (a classification of what the doc is about) not **path-based**. Identity must survive folder renames, reorganizations, and filename changes.

## The contract — required front-matter

``````yaml
---
subject: 200.1              # project prefix + subject sub-code
id: address-element         # stable slug within subject — never changes
title: <address> Element Documentation
project: wb-core
description: One-line description under 200 chars
status: active | draft | archived
---
``````

Full stable identifier: ``{subject}.{id}`` — e.g. ``200.1.address-element``.

## Dewey scheme

- **Top-level hundreds = project.** ``000=Global, 100=vscode-claude, 200=wb-core, 300=DiskCleanUp, 700=Other Tools``. New projects get next available hundred.
- **Second level = standardized subject.** Every project inherits: ``X.1 Components, X.2 Architecture, X.3 Testing, X.4 Policy, X.5 AI Coordination, X.6 Release, X.7 Getting Started, X.8 API Reference, X.9 Meta``.
- **Third level: not used.** Multiple docs within a subject share the Dewey. Distinguished by ``id`` slug.
- **Subject is author-assigned.** Normalizer suggests, never assigns without confirmation.

## Identity rules

- ``id`` is lowercase-kebab-case, 3-50 chars, stable for life of doc
- Once assigned, never changed. Renames require alias table entry
- Uniqueness within subject. Collisions refuse to resolve until fixed
- Retired ids are not reused

## Link resolution — at render time, not collection time

MCP response returns identity + current path. Viewer builds links at render:
- VS Code: ``vscode://file/`` + currentFilePath
- Viewer preview: ``/doc/{subject}.{id}`` — resolver endpoint, bookmarks survive moves
- GitHub: ``https://github.com/.../blob/main/`` + currentPath (only if project has ``githubUrl``)

## MCP-first architecture

Seven new MCP tools, primary surface for all doc operations:

1. ``validate_doc``
2. ``list_doc_violations``
3. ``normalize_doc``
4. ``migrate_dewey``
5. ``list_old_dewey``
6. ``get_doc_by_identity``
7. ``refresh_doc_ledger``

VS Code commands and viewer tabs are thin wrappers around these tools.

## Migration from old scheme

Old Dewey numbers (e.g. ``1400.005``) never disappear. Every old identifier gets an entry in ``CieloVistaStandards/dewey-aliases.json`` mapping to its new ``{subject}.{id}``. Resolution checks aliases first. Human-in-the-loop migration via ``migrate_dewey``.

## Phase order

1. **Standard** (CieloVistaStandards): spec + schema + subject taxonomy + exemplar. ~30 min.
2. **Validator + scanner** (cielovista-tools): pure validation, ``list_doc_violations`` MCP tool, viewer tab. ~90 min.
3. **Normalizer + repair**: non-destructive front-matter creation, subject suggestion, hook into ``cvs.registry.promote``. ~90 min.
4. **Ledger + linking**: in-memory index, ``get_catalog`` picks up identity, viewer renders Dewey column and three link types. ~60 min.
5. **Editorial backfill**: each of 19 projects needs a human to define its actual subject taxonomy and assign subjects + ids. Not automatable. Biggest cost.

## Sub-issues

Sub-issues should be created for each phase once this epic is picked up for active work. Track here until then.

## Full design

``docs/_today/CURRENT-STATUS.md`` has the full design with open questions (standardized vs per-project taxonomies, cielovista-tools project prefix, githubUrl location, backfill strategy, ledger persistence, VS Code Insiders URL scheme).

## Related

- #tooltips-issue — a simpler version of the same problem (tooltip text from Dewey-classified docs)
- 1400.005 missing diagram — concrete example that drove the validator check for ``diagram below``-style prose references
- Broken references scanner — adjacent feature that detects missing image files and dead markdown links; integrates with Phase 2 validator
"@

New-CvtIssue `
    -Title "MCP Viewer hover tooltips — structured what/when/where/how/why on every row" `
    -Labels @("type:feature", "severity:minor", "scope:mcp-viewer") `
    -Body @"
## Motivation

Every row in the MCP Viewer tabs (``list_cvt_commands``, ``list_projects``, ``list_symbols``, ``find_project``, ``find_symbol``, ``search_docs``, ``get_catalog``) is pure reference data. You can see IDs and one-line descriptions but you can't hover any of them to learn what happens when you click, where it runs, when to use it, or why it exists.

## Goal

Structured hover tooltip on every row answering **what / when / where / how / why**. Turns the viewer from a scrollable list into a real discovery tool.

## Scope

- **Tooltip fields:** what (one-line summary), when (when to reach for it), where (scope — workspace/global/diskcleanup/tools), how (invocation — palette, right-click, keybinding, status bar), why (what problem it solves)
- **All tabs, same structure** adapted to row type
- **Anchor:** info indicator on ID cell; native ``title=`` for v1, styled popover for v2
- **Data source:** extend existing ``runTooltip`` convention (used on e.g. ``cvs.tools.errorLog`` at 700.003) to every catalog entry

## Where to start

- ``src/features/cvs-command-launcher/catalog.ts`` — ~84 entries need ``runTooltip``
- Consider structured ``{what, when, where, how, why}`` fields vs one freeform string
- ``src/features/mcp-viewer/html.ts`` — add tooltip markup to ID/Title cells per render function

## Acceptance

- Every row in every tab has a tooltip
- Tooltips render on hover with the five-question structure
- Catalog integrity test checks every entry has required tooltip fields
- No performance regression on tab load

## Related

- Doc Contract epic — downstream source of tooltip content for doc rows specifically
- Earlier 2026-04-02 parking-lot item ``Finish Dewey markdown-backed tooltip sourcing in the shared project-card pipeline`` is absorbed by this issue
"@

New-CvtIssue `
    -Title "Error Log Viewer → File as GitHub Issue button — automation for the error-to-issue workflow" `
    -Labels @("type:feature", "severity:major", "scope:error-log") `
    -Body @"
## Motivation

When CVT's Error Log Viewer surfaces a real bug, the flow to file it on GitHub is manual — copy the stack trace, switch to browser, click New Issue, paste, label, assign to project. Friction kills the practice. Automation closes the loop.

## Proposal

One-click ``File as GitHub Issue`` button on every row in the Error Log Viewer. Pre-populates title, body, labels, and routes to the correct repo based on the file path.

## Design decisions locked in 2026-04-22 session

- **Trigger:** both manual and automatic. Manual default; automatic only for critical+rare patterns (MCP server crash, uncaught exceptions in extension host, brand-new regression-test failures).
- **Routing:** via symbol index. File path → owning project → that project's repo. Fallback to cielovista-tools.
- **Deduplication:** hash first 3 lines of stack trace. If an open issue already has that hash in a hidden marker, increment count comment on existing issue.
- **Auth:** reuse VS Code's GitHub auth provider, fall back to ``gh`` CLI.

## Phase order

1. **Phase 1 — manual button only.** ~2 hours.
2. **Phase 2 — deduplication by stack hash.** ~1 hour.
3. **Phase 3 — auto-file for critical patterns.** Deferred until Phase 1+2 prove themselves.

## Acceptance (Phase 1)

- Button appears on every Error Log Viewer row
- Click opens modal with pre-filled title, body, labels
- Body includes stack trace, timestamp, file:line
- Repo selected automatically from file path via symbol index
- Submit creates real GitHub issue, returns URL
- Failure surfaces visible error, not silent no-op

## Dependencies

- #error-log-viewer-no-results — if the viewer can't show errors, there's nothing to turn into issues

## Not in this pass

- Phase 2 and 3 (separate issues when time comes)
- Integration with non-GitHub trackers
"@

# ============================================================================
# SECTION 4 — Smaller items from this session (3 items)
# ============================================================================

New-CvtIssue `
    -Title "Missing diagram at 1400.005 — WebSocket relay architecture" `
    -Labels @("type:docs", "severity:minor", "scope:doc-system") `
    -Body @"
## What

Doc referenced as ``1400.005`` describes WebSocket relay architecture between VS Code and web browsers, with the prose line "The diagram below illustrates the communication architecture using an external WebSocket server as a relay between VS Code and web browsers" — but the diagram itself is missing.

## Context

The old Dewey number ``1400.005`` is from the pre-redesign scheme. This doc will be one of the first migrated under the new Doc Contract epic.

## Tasks

1. Locate the doc (old scheme, file path not yet known — use ``get_catalog`` or grep for the prose line)
2. Create or commission the missing architecture diagram
3. Embed as ``![alt](path)`` with relative path that survives folder moves
4. Under the new scheme, this doc gets a proper ``subject`` + ``id`` in its front-matter

## Meta-value

This specific gap is the reason the Doc Contract validator will check for "prose references to 'diagram below' / 'see figure' / 'illustrated below' followed by an image." Fixing this one doc is narrow; the validator check prevents the whole class of gap. See also the broken-references scanner issue for detecting missing image files specifically.

## Related

- Doc Contract epic — the validator check that catches this
- Broken references scanner — detects missing image files across all docs
"@

New-CvtIssue `
    -Title "Broken references scanner — detect missing images and dead markdown links across all docs" `
    -Labels @("type:feature", "severity:major", "scope:doc-system") `
    -Body @"
## Motivation

Docs across 19 projects reference images and other docs via markdown. Folder renames, file moves, and plain typos produce broken references that render as broken-image icons or dead links. No existing tool detects them. The 1400.005 missing diagram is one instance; there are certainly others.

## Scope of detection

All broken references in ``.md`` files under every registered project:

- Image references: ``![alt](path.svg|.png|.jpg|.gif|.webp)``
- Relative markdown links: ``[text](../other-doc.md)``, ``[text](./subfolder/doc.md)``
- Cross-project doc links (once Doc Contract lands): ``[text](/doc/{subject}.{id})``

## Locate strategy

When a reference is broken, the scanner attempts to find the target file elsewhere:

1. Fuzzy filename match within the current project's directory tree
2. If not found, fuzzy match across all 19 registered projects' directory trees
3. Report each candidate with its current path and distance from the referenced path

The scanner never auto-fixes broken references. It only reports candidates. Human decides whether to update the markdown, move the file, or both.

## Optional placeholder generation (behind a flag)

When a reference is broken, no candidate found, and the user explicitly passes ``--create-placeholder``, the scanner generates a simple SVG placeholder at the referenced path with alt-text inside a rectangle. This is opt-in per run, never default. Placeholders are visibly wrong so they don't get forgotten.

- Default: report only, no generation
- ``--create-placeholder``: generate placeholder SVGs for missing image refs where no candidate was located
- Never generates replacements for ``.png``, ``.jpg`` etc — only ``.svg`` (text-based, hand-editable)

## MCP-first architecture

Fits the same pattern as the rest of the doc-system tools:

- **New MCP tool:** ``list_broken_refs`` — scan all registered projects, return report grouped by project and by reference type
- **New MCP tool:** ``repair_broken_refs`` — takes a list of approved changes (usually from the report output) and applies them; can also create placeholders when ``createPlaceholder: true`` is passed per-ref
- **VS Code wrapper command:** ``cvs.docs.scanBrokenRefs`` — opens viewer tab with report
- **Viewer tab:** ``Broken References`` — color-coded per project, per reference type (image vs doc link), clickable candidates so approvals happen in the UI

## Report format

```
Project: wb-core (200)
  docs/components/address.md:23
    MISSING image: ./diagrams/address-flow.svg
    Candidate: docs/architecture/diagrams/address-flow.svg (2 folders away)
  docs/components/aside.md:45
    DEAD link: ../deprecated/old-aside.md
    No candidates found. Consider removing the reference.

Project: cielovista-tools (400)
  src/features/mcp-viewer/README.md:12
    MISSING image: ./architecture.svg
    No candidates found. Passes --create-placeholder would create a stub SVG here.

Summary: 47 broken references across 12 docs in 5 projects
  Candidates available: 31 (review and approve)
  No candidates: 16 (manual fix or --create-placeholder)
```

## Acceptance

- Scanner walks all registered projects
- Detects every broken image reference and every broken relative markdown link
- Fuzzy-matches filenames across current project then all projects
- Produces a grouped, readable report (MCP JSON + viewer table)
- Human approval required for every change — no auto-fixing
- ``--create-placeholder`` flag works and generates valid SVG with visible alt-text for missing SVG references only
- Regression test using a known-broken fixture doc

## Not in scope

- Fixing broken external URLs (``https://...``) — separate concern, different tooling (HTTP HEAD requests, rate limits, caching)
- Auto-generating PNG, JPG, or other raster images
- AI-generated SVG diagrams — can come later as a separate feature if the placeholder workflow proves insufficient

## Related

- Doc Contract epic — this scanner integrates with Phase 2 (validator + scanner) as an additional validator check
- Missing diagram at 1400.005 — concrete example; the scanner would have caught it
- Fix all links in improved_dev_guidelines.md — subsumed by this scanner once it's live (CieloVistaStandards repo audit becomes ``list_broken_refs`` with project filter)
"@

# ============================================================================
# Done
# ============================================================================

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Yellow
if ($WhatIfPreference) {
    Write-Host " Dry run complete. No issues were created."                 -ForegroundColor Yellow
    Write-Host " Re-run without -WhatIf to create issues for real."         -ForegroundColor Yellow
} else {
    Write-Host " Done. Issues created. Check the board at:"                 -ForegroundColor Green
    Write-Host " https://github.com/users/$ProjectOwner/projects/$ProjectNumber" -ForegroundColor Cyan
}
Write-Host "=============================================================" -ForegroundColor Yellow
