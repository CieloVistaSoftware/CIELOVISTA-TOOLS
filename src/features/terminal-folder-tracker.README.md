# feature: terminal-folder-tracker.ts

## What it does

Monitors every terminal's `sendText` calls for `cd` commands and saves the last known directory to a file in AppData. A single command lets you jump back to that directory instantly — even after VS Code restarts.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.terminal.jumpToLastFolder`](command:cvs.terminal.jumpToLastFolder) | Terminal: Jump to Last Known Folder |

---

## Persistence

The last folder is saved to:

```
%APPDATA%\cielovista-last-folder.txt
```

This is outside any workspace so it persists across projects and VS Code restarts.

---

## Internal architecture

```
activate()
  └── onDidOpenTerminal → hookTerminal(terminal)
       └── monkey-patches terminal.sendText
            └── intercepts 'cd "path"' pattern
            └── if path exists on disk → saveLastFolder(path)
  └── registerCommand('cvs.terminal.jumpToLastFolder')
       └── readLastFolder()
       └── getActiveOrCreateTerminal()
       └── terminal.sendText('cd "path"')
```

### Why monkey-patch `sendText`?

VS Code does not expose a terminal input event. The only way to observe what is typed or sent programmatically is to intercept `sendText`. The original method is preserved and called — the patch is purely additive.

---

## Known limitations

- Only tracks `cd` commands issued via `terminal.sendText()` (programmatic) or the `cvs.terminal.setFolder` command. Directories typed manually by the user in the terminal are not tracked — VS Code does not expose raw terminal input.
- The last folder is a single value — it doesn't maintain a history stack.

---

## Manual test

1. Use `Terminal: Set Working Directory` to cd to a project folder.
2. Close and reopen VS Code.
3. Run `Terminal: Jump to Last Known Folder` — terminal should cd back to the saved folder.
