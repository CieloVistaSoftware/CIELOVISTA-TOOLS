# feature: terminal-set-folder.ts

## What it does

Right-click any folder in the VS Code Explorer and immediately `cd` the active terminal to that folder. No typing the path, no drag and drop.

---

## Commands

| Command ID | Title | Menu |
|---|---|---|
| [`cvs.terminal.setFolder`](command:cvs.terminal.setFolder) | Terminal: Set Working Directory | Explorer context menu (folders only) |

---

## Menu contribution

Appears in the Explorer right-click menu when the selected item is a folder (`"when": "explorerResourceIsFolder"`). Placed in the `navigation` group at priority 100 so it appears near the top.

---

## Internal architecture

```
activate()
  └── registerCommand('cvs.terminal.setFolder')
       └── cdToFolderFromUri(uri)  [from shared/terminal-utils]
            └── if uri supplied → cdToFolder(uri.fsPath)
            └── if no uri → try active editor's dir
            └── if no editor → showOpenDialog (folder picker)
            └── cdToFolder(chosen path)
                 └── getActiveOrCreateTerminal()
                 └── terminal.sendText('cd "path"')
```

This feature contains no logic of its own beyond registering the command — all work is delegated to `shared/terminal-utils.cdToFolderFromUri()`.

---

## Manual test

1. In the Explorer, right-click any folder.
2. Select "Terminal: Set Working Directory".
3. The terminal should open (or focus) and show `cd "path"` — verify the directory changed.
4. Run the command from the command palette with no folder selected — a folder picker should appear.
