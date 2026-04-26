# feature: docs-broken-refs.ts

## What it does

Scans markdown docs across all registered projects and reports broken image and markdown links. The report includes likely candidate files by filename so reviewers can approve manual fixes quickly.

## Commands

| Command ID | Title | Keybinding |
|---|---|---|
| `cvs.docs.scanBrokenRefs` | Docs: Scan Broken References | — |

## Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `cielovistaTools.features.docsBrokenRefs` | boolean | `true` | Enables the broken references scanner command. |

## Internal architecture

```text
activate()
  -> register cvs.docs.scanBrokenRefs
scanBrokenRefs()
  -> load registry
  -> walk markdown files
  -> parse markdown refs
  -> detect missing targets + filename candidates
  -> render grouped webview report with clickable source/candidate paths
```

## Manual test

1. Run `cvs.docs.scanBrokenRefs`.
2. Verify a Broken References webview opens with grouped findings by project.
3. Confirm each finding shows file path, line number, target, and optional candidates.
