# feature: copilot-open-suggested-file.ts

## What it does

When Copilot mentions a file path in its response (e.g. "see `src/utils.ts` for the implementation"), this command extracts that path and opens the file directly in the editor. Saves copying, switching to Explorer, and navigating manually.

---

## Commands

| Command ID | Title |
|---|---|
| [`cvs.copilot.openSuggestedFile`](command:cvs.copilot.openSuggestedFile) | Copilot: Open Suggested File |

---

## Internal architecture

```
activate()
  └── registerCommand('cvs.copilot.openSuggestedFile')
       └── showInputBox() → user pastes Copilot message or path
       └── extractFilePath(input)
            └── Strategy 1: quoted path pattern  "file.ts" or 'file.tsx'
            └── Strategy 2: plain path with known extension
       └── resolveInWorkspace(extracted)
            └── try path.join(workspaceFolder, extracted) for each folder
            └── fallback: try as absolute path
       └── openFileAtLine(resolved)  [from shared/terminal-utils]
```

### Path extraction patterns

| Pattern | Example match |
|---|---|
| Quoted path | `"src/utils.ts"`, `'components/Button.tsx'` |
| Plain path with extension | `src/utils.ts`, `components\Button.tsx` |

Supported extensions: `ts tsx js jsx css html json md cs py`

---

## Known limitations

- Requires the user to paste the Copilot message or path manually — VS Code does not yet expose Copilot chat response events programmatically.
- Only resolves relative paths against workspace roots. Absolute paths outside the workspace are tried as-is.
- Does not handle multiple file paths in a single paste — only the first match is used.

---

## Future enhancement

When the VS Code extension API exposes Copilot chat response events, this feature can be upgraded to automatically detect and offer to open mentioned files without any user input.

---

## Manual test

1. Run `Copilot: Open Suggested File`.
2. Paste a Copilot message like: `"See src/extension.ts for the entry point."`.
3. The file should open in the editor.
4. Try pasting just a bare path like `src/shared/terminal-utils.ts` — should also work.
5. Paste something with no recognisable path — should show a clear warning.
