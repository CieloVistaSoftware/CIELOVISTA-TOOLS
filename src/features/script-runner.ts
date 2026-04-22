// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * script-runner.ts
 * -----------------------------------------------------------------------------
 * Registers a command to pick and run any .js script from the scripts/ folder.
 * Runs the script using Node.js, captures stdout/stderr, and displays the output
 * in an interactive result webview (copy/rerun/close options).
 *
 * Command: cvs.scripts.runScript
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { showInteractiveResultWebview } from '../shared/show-interactive-result-webview';

const FEATURE = 'script-runner';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cvs.scripts.runScript', async () => {
      // Find all .js scripts in scripts/
      const scriptsDir = path.join(context.extensionPath, 'scripts');
      if (!fs.existsSync(scriptsDir)) {
        vscode.window.showWarningMessage('No scripts/ directory found.');
        return;
      }
      const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
      if (!files.length) {
        vscode.window.showWarningMessage('No .js scripts found in scripts/.');
        return;
      }
      // Prompt user to pick a script
      const picked = await vscode.window.showQuickPick(files, { placeHolder: 'Select a script to run' });
      if (!picked) return;
      const scriptPath = path.join(scriptsDir, picked);
      // Run the script with Node.js
      const start = Date.now();
      exec(`node "${scriptPath}"`, { cwd: scriptsDir }, (err, stdout, stderr) => {
        const duration = Date.now() - start;
        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += '\n[stderr]\n' + stderr;
        if (err) output += `\n[error]\n${err.message}`;
        showInteractiveResultWebview({
          title: `Script Output: ${picked}`,
          action: `node ${picked}`,
          output,
          durationMs: duration,
          failed: !!err,
          onRerun: () => {
            vscode.commands.executeCommand('cvs.scripts.runScript');
          },
        });
      });
    })
  );
}

export function deactivate() {}
// FILE REMOVED BY REQUEST
