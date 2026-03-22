# feature: terminal-prompt-shortener.ts

## What it does

Toggles the PowerShell terminal prompt between its full path form (`PS C:\very\long\nested\path>`) and a minimal single-character form (`>`). Useful when deep directory paths consume the entire input line.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.terminal.togglePromptLength`](command:cvs.terminal.togglePromptLength) | Terminal: Toggle Prompt Length |

---

## How it works

Sends a PowerShell `function prompt { ... }` definition to the active terminal. PowerShell respects this override immediately for the current session.

**Short prompt:**
```powershell
function prompt { '> ' }
```

**Full prompt (restore):**
```powershell
function prompt { "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) " }
```

The toggle state (`_isShort`) is tracked in module scope. Each call flips it and sends the appropriate definition.

---

## Limitations

- Only works with PowerShell. Bash, cmd, and zsh prompts are controlled differently and are not supported.
- The override is session-scoped — it resets when the terminal is closed or when a new terminal is opened.
- If the terminal is not PowerShell, the sent text may appear as a syntax error.

---

## Internal architecture

```
activate()
  └── registers cvs.terminal.togglePromptLength

let _isShort = false   [module-level toggle state]

togglePromptLength()
  └── getActiveOrCreateTerminal()  [from shared/terminal-utils]
  └── _isShort = !_isShort
  └── if _isShort:
        terminal.sendText("function prompt { '> ' }")
  └── else:
        terminal.sendText("function prompt { \"PS $($executionContext...)\" }")
```

---

## Manual test

1. Open a PowerShell terminal — note the full path prompt (e.g. `PS C:\Users\jwpmi>`).
2. Run [`cvs.terminal.togglePromptLength`](command:cvs.terminal.togglePromptLength) — prompt should immediately change to `>`.
3. Run the command again — prompt should restore to the full path format.
4. Close the terminal and open a new one — new terminal starts with the default full prompt regardless of the last toggle state.
