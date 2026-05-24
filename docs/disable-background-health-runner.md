# Disabling the Background Health Runner

The Background Health Runner is a feature in CieloVista Tools that runs health checks automatically in the background when the extension starts. If you want to disable it, follow these steps:

## Option 1: VS Code Settings (Recommended)

1. Open your VS Code settings (File → Preferences → Settings or `Ctrl+,`).
2. Search for `cielovistaTools.features.bgHealthRunner`.
3. Set it to `false`.
   - If you do not see a UI toggle, open your `settings.json` directly and add:
     ```json
     "cielovistaTools.features.bgHealthRunner": false
     ```
4. Reload VS Code.

## Option 2: Remove from Extension Code

1. Open `src/extension.ts`.
2. Comment out or remove the line:
   ```ts
   activateIfEnabled('bgHealthRunner', 'Background Health Runner', bgHealthRunner, context);
   ```
3. Rebuild and reload the extension.

---

## Adding a Menu Button to Toggle the Health Runner

To make this easier, you can add a command to the CieloVista Tools main menu that toggles the Background Health Runner on or off:

1. Register a new command in your extension (e.g., `cvs.features.toggleBgHealthRunner`).
2. In the command handler, toggle the `cielovistaTools.features.bgHealthRunner` setting.
3. Add the command to your extension's menu (e.g., the main webview or status bar).

### Example Command Registration

```ts
vscode.commands.registerCommand('cvs.features.toggleBgHealthRunner', async () => {
  const config = vscode.workspace.getConfiguration();
  const current = config.get('cielovistaTools.features.bgHealthRunner', true);
  await config.update('cielovistaTools.features.bgHealthRunner', !current, vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage(`Background Health Runner is now ${!current ? 'enabled' : 'disabled'}. Reload window to apply changes.`);
});
```

---

For a full UI button, add this command to your main menu or webview. See `feature-toggle.ts` for examples of toggling features via the UI.
