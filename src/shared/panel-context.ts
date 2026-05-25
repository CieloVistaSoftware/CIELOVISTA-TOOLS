// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * panel-context.ts
 *
 * Stores the preferred ViewColumn for feature panels that are opened via the
 * CVS Launcher. When the Launcher executes a direct-panel command it calls
 * setLauncherTargetColumn(ViewColumn.Beside) so that the feature opens beside
 * the launcher rather than in column 1. The column is cleared after execution.
 *
 * This avoids the need to thread a column parameter through every VS Code
 * command — features simply call getLauncherTargetColumn() at panel-creation time.
 */

import * as vscode from 'vscode';

let _targetColumn: vscode.ViewColumn | undefined;

/**
 * Set by the Launcher immediately before executing a direct-panel command.
 * Pass `undefined` to clear (restore default behaviour).
 */
export function setLauncherTargetColumn(col: vscode.ViewColumn | undefined): void {
    _targetColumn = col;
}

/**
 * Returns the Launcher-requested column, or `ViewColumn.One` as the default.
 * Feature panels call this once at creation time.
 */
export function getLauncherTargetColumn(): vscode.ViewColumn {
    return _targetColumn ?? vscode.ViewColumn.One;
}
