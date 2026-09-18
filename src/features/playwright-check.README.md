---
id: feature-playwright-check
title: "Feature: Playwright Test Setup"
description: "Checks every registered project for a working Playwright setup and fixes each gap with one click."
---

# Feature: Playwright Test Setup

## What it does

Checks every project in the project registry for the four parts of a Playwright setup: a `tests/` folder with real tests in it, a `test` script that runs `playwright test`, a `playwright.config.ts`, and `@playwright/test` in the dependencies. Each gap gets its own fix button, and **Fix All** fixes every gap in one project. A project whose tests are only placeholders gets a **Generate Tests** button, which asks the AI provider to write a first spec file from the project's source.

Only project types that need Playwright are checked (`vscode-extension`, `component-library`, `website`). Every other project is listed as skipped, with the reason.

This is where the daily audit's **Playwright Test Setup** check sends you: its **Fix Now** button and the launcher's **Fix Playwright Setup** button both open this panel.

It is a different tool from **Audit: Test Coverage Dashboard** (`cvs.audit.testCoverage`, `test-coverage-auditor.ts`), which reports the test tiers of the open workspace.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.audit.playwrightSetup`](command:cvs.audit.playwrightSetup) | Audit: Playwright Test Setup |

---

## Internal architecture

```text
activate(context)
  └── registers 1 command(s)
  └── Audit: Playwright Test Setup → cvs.audit.playwrightSetup → runPlaywrightCheck()
        └── checkTestCoverage() per registry project (daily-audit/checks/test-coverage.ts)
        └── webview panel (one at a time; running the command again refreshes it)
              └── fix buttons → runFix(action, projPath, projName, projType)
```

**Key internal functions:**
- `runPlaywrightCheck()` opens or refreshes the panel
- `runFix()` dispatches one fix: `createTests`, `fixScript`, `createConfig`, `addDep`, `generateTests`, `fixAll`
- `generateTestsWithAI()` writes `tests/<project>.spec.ts` from a source excerpt
- `buildHtml()` renders the table

The fixes write into the checked project: `fixScript` and `addDep` rewrite its `package.json` (`addDep` also removes Jest packages), `createTests` and `createConfig` add files.

---

## Manual test

1. Open the Command Palette and run **Audit: Playwright Test Setup** (`cvs.audit.playwrightSetup`).
   A panel titled "Playwright Test Setup" opens with one row per registered project.
2. Projects of other types show "Skipped:" with the reason. None has a fix button.
3. On a checked project with a gap, click its fix button. The status bar at the bottom reports the result and the row is rescanned.
4. Run the daily audit (`cvs.audit.runDaily`). On the launcher, open the Playwright Test Setup status dot and click **Fix Playwright Setup**. The same panel opens.
