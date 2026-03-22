# Feature: NPM Command Launcher

## What it does

Adds a `NPM Cmds` button to the VS Code status bar. When clicked, it discovers every npm script across all workspace `package.json` files and lets you pick one to run immediately in the terminal. Supports custom per-script descriptions so the picker is self-documenting.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.npm.showAndRunScripts`](command:cvs.npm.showAndRunScripts) | NPM Scripts: Show and Run |
| [`cvs.npm.addScriptDescription`](command:cvs.npm.addScriptDescription) | NPM Scripts: Add/Edit Description |

---

## Behavior

- Scans `**/package.json` and excludes `**/node_modules/**`.
- Reads `scripts` entries from each package.
- Shows script name, custom description (if configured), source package path, and script command.
- Runs selected script by `cd`-ing into that package folder and executing `npm run <script>`.

---

## Custom descriptions

- Use [`cvs.npm.addScriptDescription`](command:cvs.npm.addScriptDescription) to add or edit a description from the UI.
- Leave the input empty to remove an existing description.
- Descriptions are stored in workspace setting `cielovistaTools.npmScriptDescriptions`.

---

## Error handling

- Warns when no workspace folder is open.
- Warns when no npm scripts are found.
- Logs parse failures for invalid `package.json` files and continues scanning others.

---

## Internal architecture

```
activate()
  └── createStatusBarItem('NPM Cmds') → command: cvs.npm.showAndRunScripts
  └── registers 2 commands

showAndRunScripts()
  └── findFiles('**/package.json', '**/node_modules/**')
  └── forEach file: readFileSync → JSON.parse → extract scripts{}
  └── merge with saved descriptions (cielovistaTools.npmScriptDescriptions)
  └── showQuickPick(scriptItems)
       label:       script name
       description: custom description if set
       detail:      package path + raw npm command
  └── getActiveOrCreateTerminal()
  └── terminal.sendText('cd "packageDir" && npm run scriptName')

addScriptDescription()
  └── showAndRunScripts() → pick script (no run)
  └── showInputBox(current description)
  └── workspace.getConfiguration().update(npmScriptDescriptions)
```

---

## Manual test

1. Open a workspace that has a `package.json` with at least one script. Click `NPM Cmds` in the status bar — the QuickPick should list all scripts with their commands as detail text.
2. Select a script — a terminal should open, `cd` to the package folder, and run `npm run <script>`.
3. Run [`cvs.npm.addScriptDescription`](command:cvs.npm.addScriptDescription), pick a script, type a description. Open the picker again — the description should now appear under the script name.
