// REG-105 — Launcher: panel-context, ViewColumn.Beside, toast interception (#497-#500)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const LAUNCHER    = src('src/features/cvs-command-launcher/index.ts');
const CTX         = src('src/shared/panel-context.ts');
const FRONTMATTER = src('src/features/frontmatter-viewer.ts');
const ERRLOG      = src('src/features/error-log-viewer.ts');
const REGLOG      = src('src/features/regression-log-viewer.ts');
const TESTCOV     = src('src/features/test-coverage-auditor.ts');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── panel-context.ts ─────────────────────────────────────────────────────────

check('panel-context exports setLauncherTargetColumn',
    CTX.includes('export function setLauncherTargetColumn'));

check('panel-context exports getLauncherTargetColumn',
    CTX.includes('export function getLauncherTargetColumn'));

check('getLauncherTargetColumn defaults to ViewColumn.One',
    CTX.includes('ViewColumn.One'));

// ── launcher: sets target column before direct-panel commands (#499) ──────────

check('launcher imports setLauncherTargetColumn from panel-context',
    LAUNCHER.includes("from '../../shared/panel-context'") &&
    LAUNCHER.includes('setLauncherTargetColumn'));

check('launcher sets ViewColumn.Beside before executing direct-panel command',
    LAUNCHER.includes('setLauncherTargetColumn(vscode.ViewColumn.Beside)'));

check('launcher clears target column in finally block',
    LAUNCHER.includes('setLauncherTargetColumn(undefined)'));

// ── launcher: regression-log-viewer added to DIRECT_PANEL_COMMANDS (#498) ────

check('cvs.tools.regressionLog in DIRECT_PANEL_COMMANDS (#498)',
    LAUNCHER.includes("'cvs.tools.regressionLog'"));

// ── launcher: toast interception (#500) ──────────────────────────────────────

check('launcher intercepts showInformationMessage',
    LAUNCHER.includes('showInformationMessage') &&
    LAUNCHER.includes('_origInfo') &&
    LAUNCHER.includes("stream(`ℹ"));

check('launcher intercepts showWarningMessage',
    LAUNCHER.includes('_origWarn') &&
    LAUNCHER.includes("stream(`⚠"));

check('launcher intercepts showErrorMessage',
    LAUNCHER.includes('_origError') &&
    LAUNCHER.includes("stream(`✗"));

check('launcher restores all three toast APIs in finally',
    LAUNCHER.includes('vscode.window as any).showInformationMessage = _origInfo') &&
    LAUNCHER.includes('vscode.window as any).showWarningMessage     = _origWarn') &&
    LAUNCHER.includes('vscode.window as any).showErrorMessage       = _origError'));

// ── feature files: use getLauncherTargetColumn() at panel creation (#499) ────

check('frontmatter-viewer imports getLauncherTargetColumn',
    FRONTMATTER.includes("getLauncherTargetColumn") &&
    FRONTMATTER.includes("from '../shared/panel-context'"));

check('frontmatter-viewer createWebviewPanel uses getLauncherTargetColumn()',
    FRONTMATTER.includes('getLauncherTargetColumn()'));

check('frontmatter-viewer reveal uses _panel.viewColumn (not forced to One)',
    FRONTMATTER.includes('_panel.reveal(_panel.viewColumn'));

check('error-log-viewer imports getLauncherTargetColumn',
    ERRLOG.includes("getLauncherTargetColumn") &&
    ERRLOG.includes("from '../shared/panel-context'"));

check('error-log-viewer createWebviewPanel uses getLauncherTargetColumn()',
    ERRLOG.includes('getLauncherTargetColumn()'));

check('regression-log-viewer imports getLauncherTargetColumn',
    REGLOG.includes("getLauncherTargetColumn") &&
    REGLOG.includes("from '../shared/panel-context'"));

check('regression-log-viewer createWebviewPanel uses getLauncherTargetColumn()',
    REGLOG.includes('getLauncherTargetColumn()'));

check('test-coverage-auditor imports getLauncherTargetColumn',
    TESTCOV.includes("getLauncherTargetColumn") &&
    TESTCOV.includes("from '../shared/panel-context'"));

check('test-coverage-auditor createWebviewPanel uses getLauncherTargetColumn()',
    TESTCOV.includes('getLauncherTargetColumn()'));

check('test-coverage-auditor reveal uses currentWebviewPanel.viewColumn (not forced to One)',
    TESTCOV.includes('currentWebviewPanel.reveal(currentWebviewPanel.viewColumn)'));

console.log(`\nREG-105: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
