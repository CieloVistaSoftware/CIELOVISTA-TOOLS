# Feature: CVS Command Launcher

## What it does
Adds a bottom status bar button labeled **CVS Cmds**.

When clicked, it opens a picker containing all commands contributed by this extension whose command id starts with `cvs.`. Selecting any item executes that command immediately.

## Command
- `cvs.commands.showAll`

## UX behavior
- Status bar button is always visible after extension activation.
- Picker supports searching by command title, category, and command id.
- The launcher command itself is hidden from the picker to avoid recursion.

## Technical notes
- Command discovery is manifest-driven using the extension's own `package.json` `contributes.commands` list.
- No hardcoded command list is maintained in code.

---

## Internal architecture

```
activate()
  └── TODO: describe call flow
```

---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
